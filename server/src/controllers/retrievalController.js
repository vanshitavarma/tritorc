import { retrieveChunks, VectorSearchError } from '../services/vectorSearch/retrieveChunks.js';
import { AppError } from '../utils/AppError.js';

/**
 * Handles semantic vector retrieval requests for a specific tender document.
 * Enforces document-level isolation: queries strictly retrieve evidence from the requested tender.
 */
export const searchDocumentChunks = async (req, res, next) => {
  try {
    const documentId = req.params.documentId || req.body.documentId;
    const { query, scanId, topK, minScore } = req.body;

    if (!documentId) {
      throw new AppError(
        'documentId is required in URL or request body',
        400,
        'DOCUMENT_ID_REQUIRED'
      );
    }

    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new AppError('query is required and must be a non-empty string', 400, 'QUERY_REQUIRED');
    }

    const result = await retrieveChunks({
      documentId,
      scanId,
      query,
      topK,
      minScore,
    });

    res.status(200).json({
      success: true,
      status: 'success',
      data: result,
    });
  } catch (error) {
    if (error instanceof VectorSearchError) {
      return next(new AppError(error.message, error.status || 500, error.code));
    }
    next(error);
  }
};
