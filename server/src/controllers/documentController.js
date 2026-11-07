import { TenderDocument } from '../models/TenderDocument.js';
import { scanStore } from '../services/scan/scanStore.js';
import { askTenderChat } from '../services/ai/tenderChatService.js';
import {
  analyzeTenderDocument,
  getDocumentInsights as fetchDocumentInsights,
} from '../services/ai/tenderAnalysisService.js';
import { getDatabaseStatus } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Controller to fetch a specific document by its documentId.
 */
export const getDocumentById = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!documentId) {
      throw new AppError('documentId parameter is required', 400, 'BAD_REQUEST');
    }

    let document = null;
    const dbStatus = getDatabaseStatus();
    if (dbStatus.isReady) {
      try {
        document = await TenderDocument.findOne({
          $or: [{ documentId }, { originalFileName: documentId }, { documentName: documentId }],
        }).lean();
      } catch (err) {
        logger.warn(`Database lookup for document ${documentId} failed: ${err.message}`);
      }
    }

    // Fallback: search in-memory scanStore if not yet in MongoDB
    if (!document) {
      const allScans = scanStore.getAllScans ? scanStore.getAllScans() : [];
      for (const scan of allScans) {
        const found = scan.results?.find(
          (r) =>
            r.documentId === documentId ||
            r.documentName === documentId ||
            r.originalFileName === documentId
        );
        if (found) {
          document = {
            documentId: found.documentId || documentId,
            scanId: scan.scanId,
            documentName: found.documentName,
            originalFileName: found.originalFileName,
            documentType: found.documentType,
            isValidTender: found.isValidTender,
            distinctCount: found.distinctCount,
            totalHits: found.totalHits,
            baselineVerdict: found.relevance,
            tenderFields: found.tenderFields,
            aiAnalysis: found.aiAnalysis,
          };
          break;
        }
      }
    }

    if (!document) {
      throw new AppError(`Document with ID "${documentId}" not found`, 404, 'NOT_FOUND');
    }

    // Attach existing AI analysis insights if available
    const insights = await fetchDocumentInsights(documentId);

    res.status(200).json({
      success: true,
      status: 'success',
      data: {
        ...document,
        insights,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller for grounded RAG conversational chat with an individual document.
 */
export const chatWithDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { message, conversationHistory = [] } = req.body || {};

    if (!documentId) {
      throw new AppError('documentId parameter is required', 400, 'BAD_REQUEST');
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new AppError('Message is required for chat', 400, 'BAD_REQUEST');
    }

    const chatResponse = await askTenderChat({
      documentId,
      message,
      conversationHistory,
    });

    res.status(200).json({
      success: true,
      status: 'success',
      data: chatResponse,
    });
  } catch (error) {
    logger.warn(`Document chat error for "${req.params?.documentId}": ${error.message}`);
    next(error);
  }
};

/**
 * Controller to trigger or retrieve deep AI analysis (summary, technical, financial, corrigendum, hybrid score).
 */
export const analyzeDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!documentId) {
      throw new AppError('documentId parameter is required', 400, 'BAD_REQUEST');
    }

    const analysis = await analyzeTenderDocument({ documentId });

    res.status(200).json({
      success: true,
      status: 'success',
      data: analysis,
    });
  } catch (error) {
    logger.warn(`Document analysis error for "${req.params?.documentId}": ${error.message}`);
    next(error);
  }
};

/**
 * Controller to fetch existing AI insights / hybrid score for a document.
 */
export const getDocumentInsights = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!documentId) {
      throw new AppError('documentId parameter is required', 400, 'BAD_REQUEST');
    }

    const insights = await fetchDocumentInsights(documentId);

    res.status(200).json({
      success: true,
      status: 'success',
      data: insights,
    });
  } catch (error) {
    next(error);
  }
};
