import { randomUUID } from 'node:crypto';
import { getDatabaseStatus } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { Scan } from '../../models/Scan.js';
import { TenderDocument } from '../../models/TenderDocument.js';
import { DocumentChunk } from '../../models/DocumentChunk.js';
import { AIAnalysis } from '../../models/AIAnalysis.js';
import { chunkDocumentText, computeContentHash } from '../chunking/textChunker.js';
import { embedDocumentChunks } from '../embedding/embedChunksService.js';

/**
 * Persists an entire scan session including scan metadata, tender documents, chunks, and AI analyses.
 *
 * @param {Object} sessionData
 * @param {string} sessionData.scanId
 * @param {string} [sessionData.scannedAt]
 * @param {number} [sessionData.totalFiles]
 * @param {Array<Object>} sessionData.results
 * @param {Array<Object>} [sessionData.files]
 * @returns {Promise<{ persisted: boolean, scanId: string, documentsCount: number, chunksCount: number, aiAnalysesCount: number }>}
 */
export const persistScanSession = async (sessionData = {}) => {
  const { scanId, results = [] } = sessionData;

  if (!scanId) {
    throw new Error('scanId is required for MongoDB persistence');
  }

  // Graceful degradation when MongoDB is disconnected
  const dbStatus = getDatabaseStatus();
  if (!dbStatus.isReady) {
    logger.warn(
      `MongoDB is currently ${dbStatus.status}; skipping persistent write for scan "${scanId}". In-memory cache active.`
    );
    return {
      persisted: false,
      scanId,
      reason: `Database state: ${dbStatus.status}`,
      documentsCount: 0,
      chunksCount: 0,
      aiAnalysesCount: 0,
    };
  }

  try {
    const total = results.length;
    const successful = results.filter((r) => r.status === 'scanned').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const rejected = results.filter(
      (r) => r.status === 'rejected' || r.documentType === 'NON_TENDER'
    ).length;
    const reviewNeeded = results.filter(
      (r) => r.status === 'review_needed' || r.documentType === 'UNKNOWN'
    ).length;

    // 1. Create or update Scan master record
    await Scan.findOneAndUpdate(
      { scanId },
      {
        scanId,
        status: failed === total && total > 0 ? 'failed' : 'completed',
        fileCounts: {
          total,
          successful,
          failed,
          rejected,
          reviewNeeded,
        },
        configSnapshot: {
          aiEnabled: env.aiEnabled,
          generationModel: env.geminiGenerationModel,
          embeddingModel: env.geminiEmbeddingModel,
          embeddingDimensions: env.embeddingDimensions,
          vectorIndexName: env.vectorIndexName,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    let totalChunksSaved = 0;
    let totalAnalysesSaved = 0;

    // 2. Persist each TenderDocument, its text chunks, and AI analysis
    for (const doc of results) {
      const documentId = doc.documentId || randomUUID();
      doc.documentId = documentId;
      const originalFileName =
        doc.originalFileName || doc.fileName || doc.documentName || 'document';
      const documentName = doc.documentName || originalFileName;
      const documentType = doc.documentType || (doc.status === 'scanned' ? 'TENDER' : 'UNKNOWN');
      const isValidTender = doc.isValidTender !== false && doc.status !== 'rejected';

      const metadata = doc.metadata || {};
      const fullText = doc.text || doc.evidence?.fullText || '';
      const textHash = fullText.length > 0 ? computeContentHash(fullText) : undefined;

      const fileMetadata = {
        mimeType: metadata.mimeType || 'application/pdf',
        sizeBytes: metadata.sizeBytes || fullText.length * 2,
        pageCount: metadata.pageCount || 1,
        characterCount: metadata.characterCount || fullText.length,
        contentHash: textHash,
      };

      let extractionStatus = 'success';
      if (doc.status === 'rejected' || documentType === 'NON_TENDER') {
        extractionStatus = 'rejected';
      } else if (doc.status === 'review_needed' || documentType === 'UNKNOWN') {
        extractionStatus = 'review_needed';
      } else if (doc.status === 'failed') {
        extractionStatus = 'failed';
      }

      // Convert tenderFields to a plain Object/Map
      const tenderFieldsMap = {};
      if (doc.tenderFields && typeof doc.tenderFields === 'object') {
        for (const [k, v] of Object.entries(doc.tenderFields)) {
          if (v !== undefined) {
            tenderFieldsMap[k] = v;
          }
        }
      }

      const baselineMatches = (doc.matches || []).map((m) => ({
        keyword: typeof m === 'string' ? m : m.keyword,
        hits: typeof m === 'object' && typeof m.hits === 'number' ? m.hits : 1,
        firstIndex: typeof m === 'object' && typeof m.firstIndex === 'number' ? m.firstIndex : 0,
      }));

      // Upsert TenderDocument
      await TenderDocument.findOneAndUpdate(
        { documentId },
        {
          documentId,
          scanId,
          originalFileName,
          documentName,
          documentType,
          isValidTender,
          fileMetadata,
          extractionStatus,
          rejectionReason: doc.rejectionReason,
          classificationReasons: doc.reasons || doc.classificationReasons || [],
          baselineMatches,
          distinctCount: doc.distinctCount || 0,
          totalHits: doc.totalHits || 0,
          baselineVerdict: doc.relevance || 'Not Related',
          tenderFields: tenderFieldsMap,
          ingestionStatus: isValidTender ? 'indexed' : 'skipped',
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      // 3. Document Chunking & Persistence (only for valid documents with text)
      if (isValidTender && fullText.length > 0) {
        const chunks = chunkDocumentText(fullText, {
          pageCount: fileMetadata.pageCount,
        });

        if (chunks.length > 0) {
          const chunkDocs = chunks.map((c) => ({
            documentId,
            scanId,
            chunkIndex: c.chunkIndex,
            text: c.text,
            provenance: c.provenance,
            section: c.section,
            embeddingModel: env.geminiEmbeddingModel,
            embeddingDimensions: env.embeddingDimensions,
            contentHash: c.contentHash,
            status: 'unembedded',
          }));

          // Bulk upsert chunks by (documentId, chunkIndex)
          const bulkOps = chunkDocs.map((c) => ({
            updateOne: {
              filter: { documentId: c.documentId, chunkIndex: c.chunkIndex },
              update: { $set: c },
              upsert: true,
            },
          }));

          await DocumentChunk.bulkWrite(bulkOps);
          totalChunksSaved += chunks.length;

          // Asynchronously generate embeddings for this document's chunks in the background
          embedDocumentChunks({ documentId, scanId }).catch((embedErr) => {
            logger.warn(
              `Background embedding generation for document "${documentId}" failed: ${embedErr.message}`
            );
          });
        }
      }

      // 4. AI Analysis Persistence
      if (doc.aiAnalysis && typeof doc.aiAnalysis === 'object') {
        await AIAnalysis.findOneAndUpdate(
          { documentId, analysisType: 'summarization' },
          {
            documentId,
            scanId,
            analysisType: 'summarization',
            model: env.geminiGenerationModel,
            promptVersion: 'v1.0',
            result: doc.aiAnalysis,
            status: 'completed',
            usageMetadata: {
              promptTokens: 0,
              candidatesTokens: 0,
              totalTokens: 0,
            },
          },
          { upsert: true, returnDocument: 'after', runValidators: true }
        );
        totalAnalysesSaved++;
      }
    }

    logger.info(
      `Persisted scan "${scanId}" to MongoDB: ${results.length} documents, ${totalChunksSaved} chunks, ${totalAnalysesSaved} AI analyses.`
    );

    return {
      persisted: true,
      scanId,
      documentsCount: results.length,
      chunksCount: totalChunksSaved,
      aiAnalysesCount: totalAnalysesSaved,
    };
  } catch (error) {
    logger.warn(`Failed to persist scan session to MongoDB: ${error.message}`);
    return {
      persisted: false,
      scanId,
      error: error.message,
      documentsCount: 0,
      chunksCount: 0,
      aiAnalysesCount: 0,
    };
  }
};

/**
 * Retrieves a persisted scan session from MongoDB by scanId.
 *
 * @param {string} scanId
 * @returns {Promise<Object|null>}
 */
export const getPersistedScan = async (scanId) => {
  const dbStatus = getDatabaseStatus();
  if (!dbStatus.isReady) return null;

  try {
    const scan = await Scan.findOne({ scanId }).lean();
    if (!scan) return null;

    const documents = await TenderDocument.find({ scanId }).lean();
    const analyses = await AIAnalysis.find({ scanId }).lean();

    return {
      scan,
      documents,
      analyses,
    };
  } catch (error) {
    logger.warn(`Error querying persisted scan "${scanId}": ${error.message}`);
    return null;
  }
};
