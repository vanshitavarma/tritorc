import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const DOCUMENT_TYPES = Object.freeze({
  TENDER: 'TENDER',
  SCOPE_OF_WORK: 'SCOPE_OF_WORK',
  PROCUREMENT_DOCUMENT: 'PROCUREMENT_DOCUMENT',
  NON_TENDER: 'NON_TENDER',
  UNKNOWN: 'UNKNOWN',
});

export const CLASSIFICATION_STATUS = Object.freeze({
  VALID: 'valid',
  REJECTED: 'rejected',
  REVIEW_NEEDED: 'review_needed',
});

/**
 * High-precision negative indicator rules (educational, internship, hiring, take-home assignments, coding challenges).
 */
const NEGATIVE_RULES = [
  {
    name: 'Internship / Hiring Assignment',
    weight: 45,
    pattern:
      /\b(?:intern\s+evaluation|internship\s+evaluation|internship\s+assignment|take-home\s+assignment|full-stack\s+take-home|take-home\s+project|intern\s+candidate)\b/i,
    description: 'Contains internship or hiring candidate evaluation markings',
  },
  {
    name: 'Candidate Instructions',
    weight: 35,
    pattern:
      /\b(?:candidate\s+instructions|notes\s+for\s+candidates|instructions\s+for\s+candidates?|guidelines\s+for\s+candidates?)\b/i,
    description: 'Addressed to candidate applicants rather than commercial bidders',
  },
  {
    name: 'Evaluation Rubric & Marks',
    weight: 35,
    pattern:
      /(?:evaluation\s+criteria[\s\S]{0,120}(?:marks\b|scored\s+out\s+of|\bpoints\b)|scored\s+out\s+of\s+\d+|\bmarks\s*:\s*\d+|\bmarks\s+\d+|total\s+marks\s*[:\t ]*\d+)/i,
    description: 'Contains academic or interview scoring marks/rubrics',
  },
  {
    name: 'Estimated Completion Duration in Hours',
    weight: 30,
    pattern:
      /(?:estimated\s+time\s*:\s*\d+[\s–-]+hours|time\s+limit\s*:\s*\d+[\s–-]+hours|expected\s+duration\s*:\s*\d+[\s–-]+hours)/i,
    description: 'Specifies assignment completion time in hours (4–6 hours)',
  },
  {
    name: 'Software Stack / Coding Submission Requirements',
    weight: 40,
    pattern:
      /\b(?:required\s+stack|tech\s+stack\s+required|github\s+repo(?:\s+link)?|submit\s+your\s+code|ai_notes\.txt|deploy\.md|screen-recording)\b/i,
    description: 'Requires GitHub repository submission, code stack, or dev deliverables',
  },
  {
    name: 'Web Tech Stack Directives',
    weight: 30,
    pattern:
      /\b(?:mern\s+stack|react\s*[-–—]\s*frontend|node\.js\s*\+\s*express|full-stack\s+web\s+app)\b/i,
    description: 'Specifies full-stack web engineering assignment stack',
  },
  {
    name: 'Academic Coursework & Homework',
    weight: 40,
    pattern:
      /\b(?:course\s+syllabus|lecture\s+notes|homework\s+assignment|problem\s+set\s+\d+|midterm\s+exam|final\s+exam|course\s+code\s*:\s*[a-z0-9]+)\b/i,
    description: 'Identified as university coursework, homework, or syllabus',
  },
  {
    name: 'Candidate Curriculum Vitae / Resume',
    weight: 40,
    pattern:
      /\b(?:curriculum\s+vitae|resume\s+of\b|personal\s+portfolio|bachelor\s+of\s+technology|educational\s+qualifications?\s*:)/i,
    description: 'Identified as a candidate resume or curriculum vitae',
  },
];

/**
 * Positive indicator rules for Tenders, Scope of Work, and Procurement Documents.
 */
const POSITIVE_RULES = [
  // 1. GeM and Official Bidding Numbers
  {
    name: 'GeM Bid Number',
    type: DOCUMENT_TYPES.TENDER,
    weight: 35,
    pattern: /(?:Bid Number|बड सं[=?]या):\s*([A-Z0-9/]+)/i,
    description: 'Official GeM Bid Number identifier',
  },
  {
    name: 'Tender / NIT Reference Number',
    type: DOCUMENT_TYPES.TENDER,
    weight: 30,
    pattern:
      /\b(?:Tender\s+(?:No|Number|Ref|Reference)|Notice\s+Inviting\s+Tender|NIT\s+(?:No|Number)|RFP\s+(?:No|Number)|RFQ\s+(?:No|Number))\s*[:#-]?\s*([A-Z0-9/_-]+)/i,
    description: 'Official Tender or NIT reference number',
  },
  // 2. Procuring Authority / Employer
  {
    name: 'Procuring Organisation / Authority',
    type: DOCUMENT_TYPES.TENDER,
    weight: 20,
    pattern:
      /\b(?:Organisation\s+Name|Ministry\/State\s+Name|Department\s+Name|Office\s+Name|Procuring\s+Entity|Purchaser\s+Address)\s+([^\r\n]+)/i,
    description: 'Verified public sector or enterprise procurement authority',
  },
  // 3. Bid Schedule & Submission Dates
  {
    name: 'Bid Submission / Opening Schedule',
    type: DOCUMENT_TYPES.TENDER,
    weight: 20,
    pattern:
      /\b(?:Bid\s+Opening\s+Date|Bid\s+End\s+Date|Submission\s+Deadline|Due\s+Date\s+for\s+Submission|Tender\s+Opening\s+Date)\b/i,
    description: 'Formal bidding timeline and submission deadline',
  },
  // 4. Financial Bid Security / Value
  {
    name: 'Bid Value / EMD Security',
    type: DOCUMENT_TYPES.TENDER,
    weight: 20,
    pattern:
      /\b(?:Estimated\s+Bid\s+Value|EMD\s+Detail|Earnest\s+Money\s+Deposit|EMD\s+Amount|Tender\s+Fee|Document\s+Cost|Bid\s+Security)\b/i,
    description: 'Tender monetary threshold or EMD security deposit',
  },
  // 5. Commercial Bidding Terms
  {
    name: 'Bidding Framework & Preferences',
    type: DOCUMENT_TYPES.TENDER,
    weight: 15,
    pattern:
      /\b(?:Two\s+Packet\s+Bid|Single\s+Packet\s+Bid|Reverse\s+Auction|Option\s+Clause|MSE\s+Purchase\s+Preference|Make\s+in\s+India)\b/i,
    description: 'Public procurement commercial terms and preferences',
  },
  // 6. Scope of Work (SOW) Explicit Definitions
  {
    name: 'Scope of Work Header',
    type: DOCUMENT_TYPES.SCOPE_OF_WORK,
    weight: 35,
    pattern:
      /(?:^|\n)\s*(?:#+\s*)?(?:SCOPE\s+OF\s+WORK|STATEMENT\s+OF\s+WORK|TERMS\s+OF\s+REFERENCE|REQUIREMENT\s+DESCRIPTION)\s*[:–-]?/i,
    description: 'Explicit Scope of Work (SOW) section title',
  },
  {
    name: 'Contractor Work Obligations',
    type: DOCUMENT_TYPES.SCOPE_OF_WORK,
    weight: 25,
    pattern:
      /\b(?:The\s+contractor\s+shall|Contractor's\s+scope|Vendor\s+scope|Execution\s+of\s+works|Supply,\s+installation,\s+commissioning|Turnaround\s+maintenance|Manpower,\s+tooling,\s+and\s+supervision)\b/i,
    description: 'Contractor technical obligations and deliverables',
  },
  // 7. General Procurement & Requisition
  {
    name: 'Procurement Requisition',
    type: DOCUMENT_TYPES.PROCUREMENT_DOCUMENT,
    weight: 25,
    pattern:
      /\b(?:Purchase\s+Requisition|Request\s+for\s+Proposal|Request\s+for\s+Quotation|Material\s+Requisition|Bill\s+of\s+Quantities|Schedule\s+of\s+Requirements)\b/i,
    description: 'Procurement requisition or schedule of requirements',
  },
];

let genAIInstance = null;

const getGenAIClient = () => {
  if (!genAIInstance && env.geminiApiKey) {
    genAIInstance = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      apiVersion: 'v1beta',
    });
  }
  return genAIInstance;
};

/**
 * Classifies document text using structured Gemini LLM for ambiguous documents.
 *
 * @param {string} text
 * @param {Object} context
 * @returns {Promise<Object|null>}
 */
export const classifyDocumentWithGemini = async (text = '', context = {}) => {
  if (!env.geminiApiKey) return null;

  const ai = getGenAIClient();
  if (!ai) return null;

  try {
    const excerpt = text.slice(0, 6000);
    const prompt = `You are an expert document classifier for an industrial tender intelligence system.
Analyze the following document excerpt and classify its primary document type.

Allowed document types:
- "TENDER": An official commercial or government tender notice, bid document, NIT, or RFP.
- "SCOPE_OF_WORK": A technical scope of work, statement of work (SOW), or work package specification.
- "PROCUREMENT_DOCUMENT": A commercial procurement requisition, BOQ, or material purchase request.
- "NON_TENDER": An educational/internship assignment, coding challenge, candidate test, resume, academic paper, or general non-procurement document.
- "UNKNOWN": Insufficient or conflicting evidence to determine if it is a procurement document.

Document Name: "${context.originalName || 'unknown'}"
Document Excerpt:
"""
${excerpt}
"""

Respond with a strictly valid JSON object matching this schema:
{
  "documentType": "TENDER" | "SCOPE_OF_WORK" | "PROCUREMENT_DOCUMENT" | "NON_TENDER" | "UNKNOWN",
  "isValidTender": boolean,
  "confidence": number between 0 and 1,
  "reasons": ["Detailed reason 1", "Detailed reason 2"]
}`;

    const response = await ai.models.generateContent({
      model: env.geminiGenerationModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const responseText = response.text?.trim();
    if (!responseText) return null;

    const cleaned = responseText
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    const validTypes = Object.values(DOCUMENT_TYPES);
    if (!validTypes.includes(parsed.documentType)) {
      return null;
    }

    const isValidTender = [
      DOCUMENT_TYPES.TENDER,
      DOCUMENT_TYPES.SCOPE_OF_WORK,
      DOCUMENT_TYPES.PROCUREMENT_DOCUMENT,
    ].includes(parsed.documentType);

    return {
      documentType: parsed.documentType,
      isValidTender,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ['Classified by Gemini AI'],
    };
  } catch (err) {
    logger.warn(`Gemini document classification fallback: ${err.message}`);
    return null;
  }
};

/**
 * Deterministically evaluates contextual positive and negative signals in document text.
 *
 * @param {string} text
 * @returns {{ negativeScore: number, positiveScore: number, tenderScore: number, sowScore: number, procurementScore: number, negativeReasons: string[], positiveReasons: string[] }}
 */
export const evaluateDeterministicSignals = (text = '') => {
  if (!text || typeof text !== 'string') {
    return {
      negativeScore: 0,
      positiveScore: 0,
      tenderScore: 0,
      sowScore: 0,
      procurementScore: 0,
      negativeReasons: [],
      positiveReasons: [],
    };
  }

  const negativeReasons = [];
  let negativeScore = 0;

  for (const rule of NEGATIVE_RULES) {
    if (rule.pattern.test(text)) {
      negativeScore += rule.weight;
      negativeReasons.push(`${rule.name} (${rule.description})`);
    }
  }

  const positiveReasons = [];
  let positiveScore = 0;
  let tenderScore = 0;
  let sowScore = 0;
  let procurementScore = 0;

  for (const rule of POSITIVE_RULES) {
    if (rule.pattern.test(text)) {
      positiveScore += rule.weight;
      positiveReasons.push(`${rule.name} (${rule.description})`);

      if (rule.type === DOCUMENT_TYPES.TENDER) tenderScore += rule.weight;
      if (rule.type === DOCUMENT_TYPES.SCOPE_OF_WORK) sowScore += rule.weight;
      if (rule.type === DOCUMENT_TYPES.PROCUREMENT_DOCUMENT) procurementScore += rule.weight;
    }
  }

  return {
    negativeScore,
    positiveScore,
    tenderScore,
    sowScore,
    procurementScore,
    negativeReasons,
    positiveReasons,
  };
};

/**
 * Classifies an uploaded document before keyword scanning and metadata extraction.
 *
 * @param {string} text - Raw extracted document text
 * @param {Object} [options]
 * @param {string} [options.originalName]
 * @param {string} [options.mimeType]
 * @returns {Promise<{ documentType: string, isValidTender: boolean, status: string, confidence: number, reasons: string[], message: string, rejectionReason?: string, method: string }>}
 */
export const classifyDocumentType = async (text = '', options = {}) => {
  const originalName = options.originalName || 'document';
  const cleanText = text.trim();

  // Edge case: Empty or corrupt extraction
  if (cleanText.length < 40) {
    return {
      documentType: DOCUMENT_TYPES.UNKNOWN,
      isValidTender: false,
      status: CLASSIFICATION_STATUS.REVIEW_NEEDED,
      confidence: 0.2,
      reasons: ['Extracted text is empty or too short to identify document purpose'],
      rejectionReason: 'Insufficient text content extracted from document.',
      message: 'Document contains insufficient text to verify if it is a genuine tender.',
      method: 'deterministic_rules',
    };
  }

  const signals = evaluateDeterministicSignals(cleanText);

  // 1. High negative signals (e.g. Internship assignment, candidate instructions, grading rubric)
  // Even if assignment text mentions "Tender" or "Scope of Work" in its title/body,
  // negative signals indicate it is an assignment about tenders, NOT an actual tender.
  if (signals.negativeScore >= 35) {
    const reasons = signals.negativeReasons;
    const confidence = Math.min(
      0.99,
      Number((0.85 + (signals.negativeScore / 150) * 0.14).toFixed(2))
    );
    return {
      documentType: DOCUMENT_TYPES.NON_TENDER,
      isValidTender: false,
      status: CLASSIFICATION_STATUS.REJECTED,
      confidence,
      reasons,
      rejectionReason: `Non-tender document identified: ${reasons.slice(0, 2).join('; ')}`,
      message:
        'This document appears to be an internship assignment, candidate evaluation, or academic exercise, not a commercial tender.',
      method: 'deterministic_rules',
    };
  }

  // 2. High positive signals without conflicting negative indicators
  if (signals.negativeScore === 0) {
    if (signals.tenderScore >= 40) {
      const confidence = Math.min(
        0.99,
        Number((0.85 + (signals.tenderScore / 120) * 0.14).toFixed(2))
      );
      return {
        documentType: DOCUMENT_TYPES.TENDER,
        isValidTender: true,
        status: CLASSIFICATION_STATUS.VALID,
        confidence,
        reasons: signals.positiveReasons,
        message: 'Verified commercial tender document with formal bidding metadata.',
        method: 'deterministic_rules',
      };
    }

    if (signals.sowScore >= 30) {
      const confidence = Math.min(0.99, Number((0.85 + (signals.sowScore / 80) * 0.14).toFixed(2)));
      return {
        documentType: DOCUMENT_TYPES.SCOPE_OF_WORK,
        isValidTender: true,
        status: CLASSIFICATION_STATUS.VALID,
        confidence,
        reasons: signals.positiveReasons,
        message: 'Verified technical Scope of Work (SOW) specification document.',
        method: 'deterministic_rules',
      };
    }

    if (signals.procurementScore >= 25) {
      const confidence = Math.min(
        0.99,
        Number((0.8 + (signals.procurementScore / 80) * 0.19).toFixed(2))
      );
      return {
        documentType: DOCUMENT_TYPES.PROCUREMENT_DOCUMENT,
        isValidTender: true,
        status: CLASSIFICATION_STATUS.VALID,
        confidence,
        reasons: signals.positiveReasons,
        message: 'Verified commercial procurement or requisition document.',
        method: 'deterministic_rules',
      };
    }
  }

  // 3. Ambiguous document: Attempt hybrid Gemini classification
  if (env.geminiApiKey) {
    const geminiClassification = await classifyDocumentWithGemini(cleanText, { originalName });
    if (geminiClassification && geminiClassification.confidence >= 0.7) {
      const status = geminiClassification.isValidTender
        ? CLASSIFICATION_STATUS.VALID
        : geminiClassification.documentType === DOCUMENT_TYPES.NON_TENDER
          ? CLASSIFICATION_STATUS.REJECTED
          : CLASSIFICATION_STATUS.REVIEW_NEEDED;

      return {
        documentType: geminiClassification.documentType,
        isValidTender: geminiClassification.isValidTender,
        status,
        confidence: geminiClassification.confidence,
        reasons: geminiClassification.reasons,
        rejectionReason: !geminiClassification.isValidTender
          ? geminiClassification.reasons.join('; ')
          : undefined,
        message: geminiClassification.isValidTender
          ? 'Verified procurement document via semantic analysis.'
          : 'Document rejected: Not a legitimate procurement tender or SOW.',
        method: 'gemini_ai',
      };
    }
  }

  // 4. Fallback when ambiguous and unverified
  return {
    documentType: DOCUMENT_TYPES.UNKNOWN,
    isValidTender: false,
    status: CLASSIFICATION_STATUS.REVIEW_NEEDED,
    confidence: 0.5,
    reasons: [
      'Document lacks conclusive procurement, bidding, or Scope of Work evidence',
      'Requires manual review before tender processing',
    ],
    rejectionReason:
      'Classification uncertain; document does not exhibit verified tender or SOW patterns.',
    message:
      'Document classification uncertain; manual review is required before tender processing.',
    method: 'fallback_unknown',
  };
};
