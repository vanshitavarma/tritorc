import { DocumentChunk } from '../../models/DocumentChunk.js';
import { TenderDocument } from '../../models/TenderDocument.js';
import { getEmbeddingProvider } from '../embedding/index.js';
import { getDatabaseStatus } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * In-memory LRU-style cache for query embeddings to avoid repeating expensive API calls
 * when the same question is asked repeatedly in a session.
 */
const queryEmbeddingCache = new Map();
const MAX_QUERY_CACHE_SIZE = 100;

export const clearQueryEmbeddingCache = () => {
  queryEmbeddingCache.clear();
};

/**
 * Custom Error Class for Vector Search Operations.
 */
export class VectorSearchError extends Error {
  constructor(message, { code = 'VECTOR_SEARCH_ERROR', status = 500, details = null } = {}) {
    super(message);
    this.name = 'VectorSearchError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Helper to calculate Jaccard word-overlap similarity between two text snippets for deduplication.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Value between 0.0 and 1.0
 */
export const calculateTextOverlap = (a = '', b = '') => {
  if (!a || !b) return 0;
  const setA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const setB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
};

/**
 * Deduplicates retrieved chunks by removing exact hash duplicates and highly overlapping passages (>70% overlap),
 * retaining only the highest-scoring candidate.
 *
 * @param {Array<Object>} candidates
 * @param {number} [overlapThreshold=0.70]
 * @returns {Array<Object>}
 */
export const deduplicateChunks = (candidates = [], overlapThreshold = 0.7) => {
  const unique = [];
  const seenHashes = new Set();

  for (const candidate of candidates) {
    // Exact hash deduplication
    if (candidate.contentHash && seenHashes.has(candidate.contentHash)) {
      continue;
    }

    // High semantic text overlap deduplication
    let isDuplicateOverlap = false;
    for (const accepted of unique) {
      const overlap = calculateTextOverlap(candidate.text, accepted.text);
      if (overlap >= overlapThreshold) {
        isDuplicateOverlap = true;
        break;
      }
    }

    if (!isDuplicateOverlap) {
      if (candidate.contentHash) seenHashes.add(candidate.contentHash);
      unique.push(candidate);
    }
  }

  return unique;
};

/**
 * Executes semantic vector retrieval using MongoDB Atlas Vector Search ($vectorSearch).
 * Enforces strict tender document isolation so queries against Document A NEVER return passages from Document B.
 *
 * @param {Object} params
 * @param {string} params.documentId - Selected tender document ID (MANDATORY for strict isolation)
 * @param {string} [params.scanId] - Optional scan session reference
 * @param {string} params.query - User question or search phrase
 * @param {number} [params.topK=5] - Number of top passages to return (default 5, max 10)
 * @param {number} [params.minScore=0.60] - Minimum cosine similarity threshold
 * @param {import('../embedding/EmbeddingProvider.js').EmbeddingProvider} [params.provider] - Injected embedding provider
 * @param {string} [params.vectorIndexName] - Override Atlas Vector Search index name
 * @returns {Promise<{ query: string, documentId: string, scanId?: string, originalFileName: string, totalRetrieved: number, passages: Array<Object> }>}
 */
export const retrieveChunks = async ({
  documentId,
  scanId,
  query,
  topK = 5,
  minScore = 0.6,
  provider = null,
  vectorIndexName = null,
} = {}) => {
  const startTime = Date.now();

  // 1. Validate documentId
  if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
    throw new VectorSearchError('documentId is required for document-specific semantic retrieval', {
      code: 'DOCUMENT_ID_REQUIRED',
      status: 400,
    });
  }
  const cleanDocId = documentId.trim();

  // 2. Validate query
  if (!query || typeof query !== 'string' || query.trim() === '') {
    throw new VectorSearchError('query is required for semantic retrieval', {
      code: 'QUERY_REQUIRED',
      status: 400,
    });
  }
  const cleanQuery = query.trim();

  // 3. Database connection readiness check
  const dbStatus = getDatabaseStatus();
  if (!dbStatus.isReady) {
    throw new VectorSearchError(
      `MongoDB connection is unavailable (${dbStatus.status}). Cannot execute vector search.`,
      { code: 'DATABASE_UNAVAILABLE', status: 503 }
    );
  }

  // 4. Validate that the selected document exists in MongoDB
  const tenderDoc = await TenderDocument.findOne({ documentId: cleanDocId }).lean();
  if (!tenderDoc) {
    throw new VectorSearchError(`Tender document with ID "${cleanDocId}" was not found`, {
      code: 'DOCUMENT_NOT_FOUND',
      status: 404,
    });
  }

  const resolvedScanId = scanId || tenderDoc.scanId;
  const originalFileName = tenderDoc.originalFileName || tenderDoc.documentName || 'tender';

  // 5. Bounds checking on topK
  const boundedTopK = Math.min(10, Math.max(1, Number(topK) || 5));
  const activeMinScore = Number(minScore) >= 0 ? Number(minScore) : 0.6;
  const indexName = vectorIndexName || env.vectorIndexName || 'tender_vector_index';

  // 6. Generate embedding for query using the configured embedding provider
  const activeProvider = provider || getEmbeddingProvider();
  const providerKey = activeProvider.constructor?.name || 'default';
  const cacheKey = `${providerKey}:${activeProvider.modelId}:${activeProvider.dimensions}:${cleanQuery.toLowerCase()}`;
  let queryVector = queryEmbeddingCache.get(cacheKey);

  if (!queryVector) {
    try {
      const embedResult = await activeProvider.embedQuery(cleanQuery);
      queryVector = embedResult.vector;

      // Update cache
      if (queryEmbeddingCache.size >= MAX_QUERY_CACHE_SIZE) {
        const oldestKey = queryEmbeddingCache.keys().next().value;
        queryEmbeddingCache.delete(oldestKey);
      }
      queryEmbeddingCache.set(cacheKey, queryVector);
    } catch (err) {
      throw new VectorSearchError(
        `Failed to generate query embedding using model "${activeProvider.modelId}": ${err.message}`,
        { code: 'EMBEDDING_API_FAILURE', status: 502, details: err }
      );
    }
  }

  // 7. Verify vector dimensions match expected dimensions
  if (!Array.isArray(queryVector) || queryVector.length !== activeProvider.dimensions) {
    throw new VectorSearchError(
      `Query vector dimension mismatch: expected ${activeProvider.dimensions} dimensions, but received ${queryVector?.length || 0}`,
      { code: 'DIMENSION_MISMATCH', status: 500 }
    );
  }

  // 8. Execute MongoDB Atlas Vector Search Aggregation Pipeline
  // Enforces documentId filter inside the Atlas Vector Search engine
  const filterClause = {
    documentId: { $eq: cleanDocId },
  };
  if (resolvedScanId) {
    filterClause.scanId = { $eq: resolvedScanId };
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: indexName,
        path: 'embedding',
        queryVector,
        numCandidates: Math.max(boundedTopK * 10, 50),
        limit: Math.max(boundedTopK * 3, 15), // Fetch extra candidates for deduplication & minScore filtering
        filter: filterClause,
      },
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
        scanId: 1,
        chunkIndex: 1,
        text: 1,
        provenance: 1,
        section: 1,
        contentHash: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  let rawResults = [];
  try {
    rawResults = await DocumentChunk.aggregate(pipeline).exec();
  } catch (err) {
    const msg = String(err.message || '');
    if (
      msg.includes('PlanExecutor error') ||
      msg.includes('index not found') ||
      msg.includes('VectorSearch') ||
      msg.includes('Search index')
    ) {
      logger.warn(`Atlas Vector Search index error: ${msg}`);
      throw new VectorSearchError(
        `Atlas Vector Search index "${indexName}" is not ready or not found on document_chunks collection.`,
        { code: 'VECTOR_INDEX_NOT_READY', status: 503, details: msg }
      );
    }
    throw new VectorSearchError(`Vector search aggregation failed: ${msg}`, {
      code: 'AGGREGATION_FAILED',
      status: 500,
      details: err,
    });
  }

  // 9. Strict Quality Controls:
  // - Ensure every candidate strictly belongs to cleanDocId (defense in depth)
  // - Filter by minimum similarity score
  const qualifiedCandidates = (rawResults || [])
    .filter((chunk) => chunk.documentId === cleanDocId)
    .filter((chunk) => typeof chunk.score === 'number' && chunk.score >= activeMinScore)
    .sort((a, b) => b.score - a.score);

  // 10. Deduplicate overlapping passages
  const deduplicated = deduplicateChunks(qualifiedCandidates);
  const finalPassages = deduplicated.slice(0, boundedTopK);

  // 11. Format final evidence passages with preserved provenance
  const formattedPassages = finalPassages.map((p) => ({
    chunkId: String(p._id),
    documentId: p.documentId,
    scanId: p.scanId,
    originalFileName,
    text: p.text, // Verbatim source text
    pageStart: p.provenance?.pageStart || 1,
    pageEnd: p.provenance?.pageEnd || p.provenance?.pageStart || 1,
    paragraphStart: p.provenance?.paragraphStart || null,
    paragraphEnd: p.provenance?.paragraphEnd || null,
    section: p.section || 'General',
    score: Number(p.score.toFixed(4)),
  }));

  const latencyMs = Date.now() - startTime;
  logger.info(
    `Vector search for doc "${cleanDocId}" query "${cleanQuery.slice(0, 40)}" returned ${formattedPassages.length} passages (${latencyMs}ms, minScore=${activeMinScore})`
  );

  return {
    query: cleanQuery,
    documentId: cleanDocId,
    scanId: resolvedScanId,
    originalFileName,
    totalRetrieved: formattedPassages.length,
    passages: formattedPassages,
  };
};
