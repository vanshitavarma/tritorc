import { DocumentChunk } from '../../models/DocumentChunk.js';
import { TenderDocument } from '../../models/TenderDocument.js';
import { getEmbeddingProvider } from './index.js';
import { logger } from '../../utils/logger.js';

/**
 * Generates and stores vector embeddings for all unembedded chunks belonging to a document.
 *
 * @param {Object} params
 * @param {string} params.documentId - Document ID whose chunks need embedding
 * @param {string} [params.scanId] - Optional scan reference
 * @param {import('./EmbeddingProvider.js').EmbeddingProvider} [params.provider] - Injected embedding provider
 * @param {number} [params.batchSize] - Bounded batch size
 * @returns {Promise<{ documentId: string, embeddedCount: number, modelId: string, dimensions: number, status: string }>}
 */
export const embedDocumentChunks = async ({
  documentId,
  scanId,
  provider = null,
  batchSize = 16,
} = {}) => {
  if (!documentId || typeof documentId !== 'string') {
    throw new Error('documentId is required to embed document chunks');
  }

  const activeProvider = provider || getEmbeddingProvider();

  // Find chunks that haven't been embedded yet (or whose embedding is missing)
  const filter = {
    documentId,
    $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }, { status: 'unembedded' }],
  };
  if (scanId) filter.scanId = scanId;

  const chunks = await DocumentChunk.find(filter).sort({ chunkIndex: 1 });

  if (chunks.length === 0) {
    logger.info(`All chunks for document "${documentId}" are already embedded.`);
    return {
      documentId,
      embeddedCount: 0,
      modelId: activeProvider.modelId,
      dimensions: activeProvider.dimensions,
      status: 'already_embedded',
    };
  }

  logger.info(
    `Generating embeddings for ${chunks.length} chunks of document "${documentId}" using ${activeProvider.modelId} (${activeProvider.dimensions}d)...`
  );

  const texts = chunks.map((c) => c.text);
  const result = await activeProvider.embedDocuments(texts, { batchSize });

  if (!result.vectors || result.vectors.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: expected ${chunks.length} vectors but received ${result.vectors?.length || 0}`
    );
  }

  // Update chunks in MongoDB
  const bulkOps = chunks.map((chunk, idx) => ({
    updateOne: {
      filter: { _id: chunk._id },
      update: {
        $set: {
          embedding: result.vectors[idx],
          embeddingModel: result.modelId,
          embeddingDimensions: result.dimensions,
          status: 'embedded',
        },
      },
    },
  }));

  const bulkResult = await DocumentChunk.bulkWrite(bulkOps);

  // Update TenderDocument status to indexed
  await TenderDocument.updateOne({ documentId }, { $set: { ingestionStatus: 'indexed' } });

  logger.info(
    `Successfully saved ${bulkResult.modifiedCount} embedded vectors for document "${documentId}" to MongoDB Atlas.`
  );

  return {
    documentId,
    embeddedCount: bulkResult.modifiedCount,
    modelId: result.modelId,
    dimensions: result.dimensions,
    status: 'embedded',
  };
};

/**
 * Embeds all unembedded chunks across all active tender documents in MongoDB.
 *
 * @param {Object} [options]
 * @param {import('./EmbeddingProvider.js').EmbeddingProvider} [options.provider]
 * @returns {Promise<{ totalEmbedded: number, documentsProcessed: number }>}
 */
export const embedAllUnembeddedChunks = async ({ provider = null } = {}) => {
  const activeProvider = provider || getEmbeddingProvider();
  const distinctDocIds = await DocumentChunk.distinct('documentId', {
    $or: [{ status: 'unembedded' }, { embedding: { $exists: false } }],
  });

  logger.info(`Found ${distinctDocIds.length} documents with unembedded chunks.`);
  let totalEmbedded = 0;

  for (const docId of distinctDocIds) {
    try {
      const res = await embedDocumentChunks({ documentId: docId, provider: activeProvider });
      totalEmbedded += res.embeddedCount;
    } catch (err) {
      logger.warn(`Failed to embed chunks for document "${docId}": ${err.message}`);
    }
  }

  return {
    totalEmbedded,
    documentsProcessed: distinctDocIds.length,
  };
};
