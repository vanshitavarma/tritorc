import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

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

const SYSTEM_INSTRUCTION = `You are a senior industrial tender analyst for Tritorc Equipment Pvt. Ltd., a manufacturer and provider of industrial bolting tools, hydraulic torque wrenches, bolt tensioners, and flange management services.
Analyze the provided tender document text and extract concise, professional, business-ready information.
Follow these non-negotiable rules:
1. Summarize concisely, do not copy long paragraphs verbatim.
2. Preserve exact technical numbers, ratings (e.g., 15000 Nm), dates, certifications (ISO, GST), and monetary thresholds.
3. If an item is genuinely absent from the document, return "Not Found".
4. Never invent or hallucinate tender details, deadlines, prices, or qualifications.
5. In "technicalQualification", summarize experience, certifications, and equipment rating requirements.
6. In "financialQualification", summarize minimum turnover or net worth; return "Not Found" if absent.
7. In "scopeOfWork", concisely summarize the work, equipment, and activities.
8. In "tenderSummary", write a 2-3 sentence executive summary explaining the project, authority, and Tritorc relevance.
9. In "tenderDescription", produce a concise project overview distinct from the summary.
10. In "tabName", provide an industrial work category (e.g., "Industrial Bolting", "Mechanical Works", "Civil Works", "Fasteners & Hydraulic Nuts", "Machining & Beveling Tools").
11. In "intelligentDocumentName", generate a concise human-readable title (e.g., "Authority – Item/Work Title").
12. Return ONLY a valid JSON object matching the requested schema.`;

/**
 * Invokes Gemini to produce grounded business summaries from tender document text.
 *
 * @param {string} text - Extracted document text
 * @param {Object} context - Deterministic metadata (Tender No, Authority, Item Category)
 * @returns {Promise<Object|null>}
 */
export const summarizeTenderWithGemini = async (text = '', context = {}) => {
  if (!env.aiEnabled && !env.geminiApiKey) {
    return null;
  }

  const ai = getGenAIClient();
  if (!ai) return null;

  try {
    // Provide up to first 12,000 characters which contains bid details, specs, ATC, and consignee
    const documentExcerpt = text.slice(0, 12000);

    const prompt = `Analyze this industrial tender document and produce a concise business-ready analysis for Tritorc.

Context metadata already verified:
- Authority: ${context.organisationName || 'Not Found'}
- Office: ${context.officeName || 'Not Found'}
- Item Category: ${context.itemCategory || 'Not Found'}
- Tender No: ${context.tenderNo || 'Not Found'}
- Location: ${context.location || 'Not Found'}

Tender Document Text:
"""
${documentExcerpt}
"""

Respond with a strictly formatted JSON object with these exact keys:
{
  "intelligentDocumentName": "Short descriptive title, e.g. Authority - Project / Equipment",
  "tabName": "Industrial category, e.g. Industrial Bolting, Mechanical Works, etc.",
  "technicalQualification": "Concise summary of experience, ratings, and certifications, or 'Not Found'",
  "financialQualification": "Concise summary of turnover / net worth requirements, or 'Not Found'",
  "scopeOfWork": "Concise summary of work to be performed, equipment, and services",
  "tenderSummary": "2-3 sentence executive summary of tender scope and Tritorc relevance",
  "tenderDescription": "Concise description of the project distinct from summary",
  "corrigendum": "Summary of addenda changes or 'Not Found'",
  "semanticAssessment": "High Bolting Relevance | Borderline Tooling | Unrelated Scope",
  "aiExplanation": "Why this tender is or is not relevant to Tritorc bolting and flange management",
  "keyOpportunities": "Specific tools or services applicable, or 'None identified'",
  "risksAndUnknowns": "Key delivery, eligibility, or specification risks",
  "recommendedFollowUp": "Actionable next steps for Tritorc bid team"
}`;

    const fullPrompt = `${SYSTEM_INSTRUCTION}

${prompt}`;

    const response = await ai.models.generateContent({
      model: env.geminiGenerationModel,
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1, // High determinism
      },
    });

    const responseText = response.text?.trim();
    if (!responseText) return null;

    // Clean JSON response (handling potential markdown fences)
    const jsonStr = responseText
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    logger.info(
      `Successfully generated Gemini AI tender summary for "${context.tenderNo || 'tender'}"`
    );
    return parsed;
  } catch (error) {
    logger.warn(`Gemini tender summarization fallback triggered: ${error.message}`);
    return null;
  }
};
