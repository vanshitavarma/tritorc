import { extractText } from '../extraction/extractText.js';
import { scanText } from '../matching/scanText.js';
import { classifyRelevance } from '../relevance/classifyRelevance.js';
import { extractTenderFields } from '../tender/extractTenderFields.js';
import { loadKeywords } from '../../config/keywords.js';
import { logger } from '../../utils/logger.js';

/**
 * Scans a single document buffer through the deterministic pipeline.
 */
export const scanSingleDocument = async (file, keywords) => {
  const documentName = file.originalname || 'document';
  try {
    const extracted = await extractText({
      buffer: file.buffer,
      originalName: documentName,
      mimeType: file.mimetype,
    });

    const scan = scanText(extracted.text, keywords);
    const relevance = classifyRelevance(scan);
    const tenderFields = extractTenderFields(extracted.text);

    return {
      documentName,
      status: 'scanned',
      matches: scan.matches,
      distinctCount: scan.distinctCount,
      totalHits: scan.totalHits,
      relevance,
      tenderFields,
      metadata: extracted.metadata,
    };
  } catch (error) {
    logger.warn(`Scan error for file "${documentName}": ${error.message}`);
    return {
      documentName,
      status: 'failed',
      error: error.message,
      matches: [],
      distinctCount: 0,
      totalHits: 0,
      relevance: 'Not Assessed',
      tenderFields: {},
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
    const documentName = files[idx]?.originalname || 'document';
    return {
      documentName,
      status: 'failed',
      error: result.reason?.message || 'Processing error',
      matches: [],
      distinctCount: 0,
      totalHits: 0,
      relevance: 'Not Assessed',
      tenderFields: {},
    };
  });
};
