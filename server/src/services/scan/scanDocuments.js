import { extractText } from '../extraction/extractText.js';
import { scanText } from '../matching/scanText.js';
import { classifyRelevance } from '../relevance/classifyRelevance.js';
import { extractTenderFields } from '../tender/extractTenderFields.js';
import { summarizeTenderFields } from '../tender/summarizeTenderFields.js';
import { loadKeywords } from '../../config/keywords.js';
import { logger } from '../../utils/logger.js';

/**
 * Scans and produces intelligent business intelligence for a single document.
 */
export const scanSingleDocument = async (file, keywords) => {
  const originalFileName = file.originalname || 'document';
  try {
    const extracted = await extractText({
      buffer: file.buffer,
      originalName: originalFileName,
      mimeType: file.mimetype,
    });

    const scan = scanText(extracted.text, keywords);
    const relevance = classifyRelevance(scan);
    const rawTenderFields = extractTenderFields(extracted.text);

    // Advanced tender intelligence summarization
    const summaryResult = await summarizeTenderFields({
      rawFields: rawTenderFields,
      fullText: extracted.text,
      originalName: originalFileName,
      relevance,
    });

    const tenderFields = {
      ...rawTenderFields,
      ...summaryResult.enhancedFields,
    };

    return {
      documentName: summaryResult.intelligentDocumentName,
      originalFileName,
      status: 'scanned',
      matches: scan.matches,
      distinctCount: scan.distinctCount,
      totalHits: scan.totalHits,
      relevance,
      tenderFields,
      aiAnalysis: summaryResult.aiInsights,
      evidence: summaryResult.evidence,
      metadata: extracted.metadata,
    };
  } catch (error) {
    logger.warn(`Scan error for file "${originalFileName}": ${error.message}`);
    return {
      documentName: originalFileName,
      originalFileName,
      status: 'failed',
      error: error.message,
      matches: [],
      distinctCount: 0,
      totalHits: 0,
      relevance: 'Not Assessed',
      tenderFields: {},
      aiAnalysis: null,
      evidence: null,
    };
  }
};

/**
 * Processes an array of uploaded files concurrently with isolated failure boundaries.
 *
 * @param {Array<{ originalname: string, buffer: Buffer, mimetype: string }>} files
 * @param {Array<string>} [customKeywords]
 * @returns {Promise<Array<Object>>}
 */
export const scanDocuments = async (files = [], customKeywords = null) => {
  const keywords = customKeywords || (await loadKeywords());

  const tasks = files.map((file) => scanSingleDocument(file, keywords));
  const settled = await Promise.allSettled(tasks);

  return settled.map((result, idx) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    const originalFileName = files[idx]?.originalname || 'document';
    return {
      documentName: originalFileName,
      originalFileName,
      status: 'failed',
      error: result.reason?.message || 'Processing error',
      matches: [],
      distinctCount: 0,
      totalHits: 0,
      relevance: 'Not Assessed',
      tenderFields: {},
      aiAnalysis: null,
      evidence: null,
    };
  });
};
