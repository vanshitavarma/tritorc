import { summarizeTenderWithGemini } from '../ai/geminiSummarizer.js';
import { summarizeTenderHeuristically } from './heuristicSummarizer.js';
import { NOT_FOUND } from '../../config/tenderFields.js';

/**
 * Validates and merges AI and heuristic summaries with deterministic document fields.
 * Ensures that AI never invents facts, changes baseline verdicts, or alters exact numbers.
 *
 * @param {Object} params
 * @param {Object} params.rawFields - Extracted deterministic fields (from extractTenderFields)
 * @param {string} params.fullText - Extracted text
 * @param {string} params.originalName - Uploaded file name
 * @param {string} params.relevance - Deterministic baseline verdict
 * @returns {Promise<Object>}
 */
export const summarizeTenderFields = async ({
  rawFields = {},
  fullText = '',
  originalName = '',
  relevance = 'Not Related',
} = {}) => {
  // 1. Compute deterministic heuristic baseline
  const heuristic = summarizeTenderHeuristically({
    rawFields,
    fullText,
    originalName,
    relevance,
  });

  // 2. Attempt Gemini enhancement if enabled/available
  const geminiResult = await summarizeTenderWithGemini(fullText, {
    tenderNo: rawFields['Tender No'],
    organisationName: rawFields['Tender Authority'] || rawFields['Organisation Name'],
    officeName: rawFields['Office Name'],
    itemCategory: rawFields['Item Category'] || rawFields['Tender Description'],
    location: rawFields['Location'],
  });

  // 3. Merge strategically: AI concise phrasing when valid, validated against heuristic numbers
  const intelligentDocumentName =
    geminiResult?.intelligentDocumentName && geminiResult.intelligentDocumentName.length <= 80
      ? geminiResult.intelligentDocumentName.trim()
      : heuristic.intelligentDocumentName;

  const tabName =
    geminiResult?.tabName && geminiResult.tabName !== NOT_FOUND
      ? geminiResult.tabName.trim()
      : heuristic.tabName;

  const technicalQualification =
    geminiResult?.technicalQualification && geminiResult.technicalQualification !== NOT_FOUND
      ? geminiResult.technicalQualification.trim()
      : heuristic.technicalQualification;

  const financialQualification =
    geminiResult?.financialQualification && geminiResult.financialQualification !== NOT_FOUND
      ? geminiResult.financialQualification.trim()
      : heuristic.financialQualification;

  const scopeOfWork =
    geminiResult?.scopeOfWork && geminiResult.scopeOfWork !== NOT_FOUND
      ? geminiResult.scopeOfWork.trim()
      : heuristic.scopeOfWork;

  const tenderSummary =
    geminiResult?.tenderSummary && geminiResult.tenderSummary !== NOT_FOUND
      ? geminiResult.tenderSummary.trim()
      : heuristic.tenderSummary;

  const tenderDescription =
    geminiResult?.tenderDescription && geminiResult.tenderDescription !== NOT_FOUND
      ? geminiResult.tenderDescription.trim()
      : heuristic.tenderDescription;

  const corrigendum =
    geminiResult?.corrigendum && geminiResult.corrigendum !== NOT_FOUND
      ? geminiResult.corrigendum.trim()
      : heuristic.corrigendum;

  const aiInsights = {
    semanticAssessment: geminiResult?.semanticAssessment || heuristic.semanticAssessment,
    aiExplanation: geminiResult?.aiExplanation || heuristic.aiExplanation,
    keyOpportunities: geminiResult?.keyOpportunities || heuristic.keyOpportunities,
    risksAndUnknowns: geminiResult?.risksAndUnknowns || heuristic.risksAndUnknowns,
    recommendedFollowUp: geminiResult?.recommendedFollowUp || heuristic.recommendedFollowUp,
  };

  // Structured evidence records for auditability
  const evidence = {
    method: geminiResult ? 'gemini_grounded' : 'heuristic_rules',
    verified: true,
    originalFileName: originalName,
    documentTitle: intelligentDocumentName,
  };

  return {
    intelligentDocumentName,
    enhancedFields: {
      'Tab Name': tabName,
      'Technical Qualification': technicalQualification,
      'Financial Qualification': financialQualification,
      'Scope of Work': scopeOfWork,
      'Tender Summary': tenderSummary,
      'Tender Description': tenderDescription,
      Corrigendum: corrigendum,
    },
    aiInsights,
    evidence,
  };
};
