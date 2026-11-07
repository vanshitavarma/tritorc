import { TenderDocument } from '../../models/TenderDocument.js';
import { AIAnalysis } from '../../models/AIAnalysis.js';
import { retrieveChunks } from '../vectorSearch/retrieveChunks.js';
import { calculateHybridScore } from '../relevance/hybridScorer.js';
import { GoogleGenAI } from '@google/genai';
import { getDatabaseStatus } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let genAIClient = null;

const getGenAIClient = () => {
  if (!genAIClient && env.geminiApiKey) {
    genAIClient = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      apiVersion: 'v1beta',
    });
  }
  return genAIClient;
};

/**
 * Conducts a comprehensive deep document AI analysis for an individual tender document:
 * 1. Intelligent Tender Summary with page citations
 * 2. Technical Qualification Analysis (distinguishing mandatory vs recommended)
 * 3. Financial Qualification Analysis
 * 4. Corrigendum & Amendments Detection
 * 5. Semantic Relevance Explanation & Verification Questions
 * 6. 100-Point Hybrid Relevance Score
 *
 * @param {Object} params
 * @param {string} params.documentId - Document ID to analyze
 * @param {import('../embedding/EmbeddingProvider.js').EmbeddingProvider} [params.provider] - Injected embedding provider
 * @returns {Promise<Object>} Complete AI analysis result
 */
export const analyzeTenderDocument = async ({ documentId, provider = null } = {}) => {
  if (!documentId) {
    throw new Error('documentId is required for tender analysis');
  }

  const tenderDoc = await TenderDocument.findOne({ documentId }).lean();
  if (!tenderDoc) {
    throw new Error(`Tender document with ID "${documentId}" was not found`);
  }

  // 1. Retrieve top passages across key domain queries for rich grounded evidence
  const queries = [
    'Scope of work and equipment required',
    'Technical qualification and experience criteria',
    'Financial turnover net worth and EMD detail',
    'Corrigendum addenda or amendment changes',
  ];

  const evidencePassages = [];
  let topSimilarity = 0;

  for (const q of queries) {
    try {
      const res = await retrieveChunks({
        documentId,
        query: q,
        topK: 3,
        minScore: 0.5,
        provider,
      });

      for (const p of res.passages) {
        evidencePassages.push(p);
        if (p.score > topSimilarity) {
          topSimilarity = p.score;
        }
      }
    } catch (err) {
      logger.warn(`Retrieval query "${q}" failed for document "${documentId}": ${err.message}`);
    }
  }

  // Deduplicate passages
  const uniquePassagesMap = new Map();
  for (const p of evidencePassages) {
    if (!uniquePassagesMap.has(p.chunkId)) {
      uniquePassagesMap.set(p.chunkId, p);
    }
  }
  const uniquePassages = Array.from(uniquePassagesMap.values());

  const tenderFields = tenderDoc.tenderFields || {};
  const baselineVerdict = tenderDoc.baselineVerdict || 'Not Related';
  const distinctCount = tenderDoc.distinctCount || 0;
  const totalHits = tenderDoc.totalHits || 0;

  // 2. Compute Hybrid Relevance Score
  const hybridScoreReport = calculateHybridScore({
    distinctCount,
    totalHits,
    topSimilarity,
    retrievedCount: uniquePassages.length,
    technicalText: tenderFields['Technical Qualification'] || '',
    scopeText: tenderFields['Scope of Work'] || '',
    tenderFields,
    isAiAvailable: Boolean(env.geminiApiKey),
  });

  // 3. Fallback / Default AI Insight Payload
  const defaultAnalysisResult = {
    documentId,
    scanId: tenderDoc.scanId,
    originalFileName: tenderDoc.originalFileName,
    documentName: tenderDoc.documentName,
    baselineVerdict,
    hybridScore: hybridScoreReport.score,
    hybridGrade: hybridScoreReport.grade,
    scoreBreakdown: hybridScoreReport.breakdown,
    summary: {
      overview:
        tenderFields['Tender Summary'] ||
        `Tender issued by ${tenderFields['Tender Authority'] || 'the buyer'} for ${tenderDoc.documentName}.`,
      authority: tenderFields['Tender Authority'] || 'Not Found',
      estimatedValue: tenderFields['Tender Amount'] || 'Not Found',
      scopeOfWork: tenderFields['Scope of Work'] || 'Not Found',
      requiredEquipment: tenderDoc.documentName.includes('Torque Wrench')
        ? 'Hydraulic torque wrench with power pack'
        : 'See tender specification sheet',
      technicalQualification: tenderFields['Technical Qualification'] || 'Not Found',
      financialQualification: tenderFields['Financial Qualification'] || 'Not Found',
      emdAndFees: `EMD: ${tenderFields['EMD'] || 'Not Found'}, Fee: ${tenderFields['Tender Fee'] || 'Not Found'}`,
      dates: `Opening: ${tenderFields['Opening Date'] || 'Not Found'}, Closing: ${tenderFields['Closing Date'] || 'Not Found'}`,
      corrigendum: tenderFields['Corrigendum'] || 'No corrigendum identified in initial document.',
      sourceCitations: uniquePassages.slice(0, 3).map((p) => ({
        chunkId: p.chunkId,
        page: p.pageStart,
        section: p.section,
      })),
    },
    technicalAnalysis: {
      mandatoryRequirements: [
        tenderFields['Technical Qualification'] !== 'Not Found'
          ? tenderFields['Technical Qualification']
          : 'Valid business license and technical capability credentials required.',
      ],
      recommendations: [
        'Submit OEM authorization or test certificates with technical bid submission.',
      ],
      certifications: ['ISO / OEM certificate or Govt verified credentials'],
      equipmentSpecs: tenderDoc.documentName,
    },
    financialAnalysis: {
      minimumTurnover: tenderFields['Financial Qualification'] || 'Not Found',
      emdAmount: tenderFields['EMD'] || 'Not Found',
      tenderFee: tenderFields['Tender Fee'] || 'Not Found',
      auditedStatementsRequired: 'Standard financial statement submission required per GeM ATC.',
      companyQualificationNote:
        'Company eligibility must be independently verified by Tritorc finance team against audited balance sheets.',
    },
    corrigendumAnalysis: {
      corrigendumIdentified:
        tenderFields['Corrigendum'] && tenderFields['Corrigendum'] !== 'Not Found',
      details:
        tenderFields['Corrigendum'] ||
        'No amendments or corrigendum detected in the primary tender upload.',
      submissionDeadlineAmended: false,
    },
    semanticExplanation: {
      potentialRelevance:
        hybridScoreReport.score >= 60
          ? 'High business alignment with Tritorc industrial bolting catalog.'
          : hybridScoreReport.score >= 40
            ? 'Borderline or ancillary tooling opportunity.'
            : 'Unrelated commercial scope.',
      supportingReasons: hybridScoreReport.evidence.keywordFactors.concat(
        hybridScoreReport.evidence.scopeFactors
      ),
      risksAndUnknowns: [
        'Delivery timelines and liquidated damages clauses in Buyer ATC.',
        'Site commissioning credentials requirement.',
      ],
      humanVerificationQuestions: [
        'Does Tritorc have required past credential quantities in this PSU?',
        'Is local MSE or Make-in-India preference mandatory for technical qualification?',
      ],
    },
    evidenceChunks: uniquePassages.slice(0, 5),
    aiProcessingStatus: 'completed',
  };

  // 4. If Gemini is available, produce enriched AI intelligence
  const ai = getGenAIClient();
  let finalResult = defaultAnalysisResult;

  if (ai && env.aiEnabled && uniquePassages.length > 0) {
    try {
      const excerptsText = uniquePassages
        .slice(0, 6)
        .map((p, idx) => `[EXCERPT ${idx + 1}] Page ${p.pageStart} (${p.section}):\n${p.text}`)
        .join('\n\n');

      const prompt = `You are a senior industrial tender analyst for Tritorc Equipment Pvt. Ltd. Analyze the tender document excerpts below and produce a structured, business-ready intelligence report.

Document: "${tenderDoc.documentName}"
Authority: "${tenderFields['Tender Authority'] || 'Not Found'}"

Tender Excerpts:
"""
${excerptsText}
"""

Return a JSON object conforming strictly to this format:
{
  "summaryOverview": "2-3 sentence executive overview of tender scope and Tritorc relevance",
  "technicalMandatory": ["List of mandatory technical criteria"],
  "technicalRecommended": ["List of recommended credentials"],
  "financialTurnover": "Turnover or net worth criteria, or 'Not Found'",
  "corrigendumFound": false,
  "corrigendumNotes": "Summary of corrigendum changes or 'No corrigendum detected'",
  "strategicFit": "High Bolting Relevance | Borderline Tooling | Unrelated",
  "keyRisks": ["Specific delivery or eligibility risks"],
  "verificationQuestions": ["Specific questions requiring Tritorc human verification"]
}`;

      const aiResponse = await ai.models.generateContent({
        model: env.geminiGenerationModel || 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const responseText = aiResponse.text?.trim();
      if (responseText) {
        const cleanJson = responseText
          .replace(/^```json\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsedAi = JSON.parse(cleanJson);

        finalResult = {
          ...defaultAnalysisResult,
          summary: {
            ...defaultAnalysisResult.summary,
            overview: parsedAi.summaryOverview || defaultAnalysisResult.summary.overview,
          },
          technicalAnalysis: {
            ...defaultAnalysisResult.technicalAnalysis,
            mandatoryRequirements:
              parsedAi.technicalMandatory || defaultAnalysisResult.technicalAnalysis.mandatoryRequirements,
            recommendations:
              parsedAi.technicalRecommended || defaultAnalysisResult.technicalAnalysis.recommendations,
          },
          financialAnalysis: {
            ...defaultAnalysisResult.financialAnalysis,
            minimumTurnover:
              parsedAi.financialTurnover || defaultAnalysisResult.financialAnalysis.minimumTurnover,
          },
          corrigendumAnalysis: {
            corrigendumIdentified: Boolean(parsedAi.corrigendumFound),
            details: parsedAi.corrigendumNotes || defaultAnalysisResult.corrigendumAnalysis.details,
            submissionDeadlineAmended: false,
          },
          semanticExplanation: {
            ...defaultAnalysisResult.semanticExplanation,
            potentialRelevance:
              parsedAi.strategicFit || defaultAnalysisResult.semanticExplanation.potentialRelevance,
            risksAndUnknowns:
              parsedAi.keyRisks || defaultAnalysisResult.semanticExplanation.risksAndUnknowns,
            humanVerificationQuestions:
              parsedAi.verificationQuestions ||
              defaultAnalysisResult.semanticExplanation.humanVerificationQuestions,
          },
        };
      }
    } catch (err) {
      logger.warn(`Gemini tender analysis generation failed: ${err.message}. Using structured grounded analysis.`);
    }
  }

  // 5. Persist analysis to AIAnalysis collection
  await AIAnalysis.findOneAndUpdate(
    { documentId, analysisType: 'summarization' },
    {
      documentId,
      scanId: tenderDoc.scanId,
      analysisType: 'summarization',
      model: env.geminiGenerationModel || 'gemini-2.5-flash',
      promptVersion: 'v2.0',
      result: finalResult,
      evidenceChunkIds: uniquePassages.map((p) => p.chunkId),
      status: 'completed',
    },
    { upsert: true, returnDocument: 'after' }
  );

  return finalResult;
};

/**
 * Retrieves the stored AI analysis and hybrid score for a document.
 *
 * @param {string} documentId
 * @returns {Promise<Object|null>}
 */
export const getDocumentInsights = async (documentId) => {
  if (!documentId) return null;
  const dbStatus = getDatabaseStatus();
  if (!dbStatus.isReady) return null;
  try {
    const analysis = await AIAnalysis.findOne({ documentId }).lean();
    return analysis?.result || null;
  } catch (err) {
    logger.warn(`Failed to fetch document insights for "${documentId}": ${err.message}`);
    return null;
  }
};
