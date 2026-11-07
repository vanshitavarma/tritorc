import { randomUUID } from 'node:crypto';
import { extractText } from '../extraction/extractText.js';
import { scanText } from '../matching/scanText.js';
import { classifyRelevance } from '../relevance/classifyRelevance.js';
import { extractTenderFields } from '../tender/extractTenderFields.js';
import { summarizeTenderFields } from '../tender/summarizeTenderFields.js';
import { classifyDocumentType, DOCUMENT_TYPES } from '../classification/documentClassifier.js';
import { loadKeywords } from '../../config/keywords.js';
import { logger } from '../../utils/logger.js';

/**
 * Scans and produces intelligent business intelligence for a single document.
 */
export const scanSingleDocument = async (file, keywords) => {
  const originalFileName = file.originalname || 'document';
  const documentId = file.documentId || randomUUID();
  try {
    const extracted = await extractText({
      buffer: file.buffer,
      originalName: originalFileName,
      mimeType: file.mimetype,
    });

    // 1. Classify document type BEFORE keyword matching and metadata extraction
    const classification = await classifyDocumentType(extracted.text, {
      originalName: originalFileName,
      mimeType: file.mimetype,
    });

    // 2. Reject non-tender / invalid documents immediately
    if (!classification.isValidTender) {
      logger.info(
        `Document "${originalFileName}" excluded from tender scanning (${classification.documentType}): ${classification.rejectionReason || classification.message}`
      );
      return {
        documentId,
        documentName: originalFileName,
        originalFileName,
        fileName: originalFileName,
        documentType: classification.documentType,
        isValidTender: false,
        confidence: classification.confidence,
        status: classification.status, // 'rejected' or 'review_needed'
        message: classification.message,
        rejectionReason: classification.rejectionReason,
        reasons: classification.reasons,
        matches: [],
        distinctCount: 0,
        totalHits: 0,
        relevance: 'Not Assessed',
        tenderFields: {},
        aiAnalysis: null,
        evidence: null,
        metadata: extracted.metadata,
      };
    }

    // 3. Document is verified as TENDER, SCOPE_OF_WORK, or PROCUREMENT_DOCUMENT
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
      documentId,
      documentName: summaryResult.intelligentDocumentName,
      originalFileName,
      fileName: originalFileName,
      documentType: classification.documentType,
      isValidTender: true,
      confidence: classification.confidence,
      classificationReasons: classification.reasons,
      status: 'scanned',
      matches: scan.matches,
      distinctCount: scan.distinctCount,
      totalHits: scan.totalHits,
      relevance,
      tenderFields,
      text: extracted.text,
      aiAnalysis: summaryResult.aiInsights,
      evidence: summaryResult.evidence,
      metadata: extracted.metadata,
    };
  } catch (error) {
    logger.warn(`Scan error for file "${originalFileName}": ${error.message}`);
    return {
      documentId,
      documentName: originalFileName,
      originalFileName,
      fileName: originalFileName,
      documentType: DOCUMENT_TYPES.UNKNOWN,
      isValidTender: false,
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
      documentId: randomUUID(),
      documentName: originalFileName,
      originalFileName,
      fileName: originalFileName,
      documentType: DOCUMENT_TYPES.UNKNOWN,
      isValidTender: false,
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
