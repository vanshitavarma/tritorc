import crypto from 'node:crypto';
import {
  EmbeddingProvider,
  EmbeddingProviderError,
  EmbeddingQuotaError,
} from './EmbeddingProvider.js';

/**
 * Generates deterministic pseudo-vector of length `dimensions` based on text content.
 *
 * @param {string} text
 * @param {number} dimensions
 * @returns {number[]} Array of normalized floats
 */
export const generateDeterministicVector = (text = '', dimensions = 768) => {
  const hash = crypto.createHash('sha256').update(String(text)).digest('hex');
  const vector = new Array(dimensions);
  let seed = Number.parseInt(hash.slice(0, 8), 16);

  for (let i = 0; i < dimensions; i++) {
    // Simple LCG pseudo-random number generator seeded with content hash
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    vector[i] = Number(((seed / 4294967296) * 2 - 1).toFixed(6));
  }

  // Normalize vector to unit length
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map((val) => Number((val / norm).toFixed(6)));
};

/**
 * Mock Embedding Provider for isolated testing and offline operation.
 * Produces deterministic, unit-normed embeddings of configurable dimensions.
 */
export class MockEmbeddingProvider extends EmbeddingProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.modelId='text-embedding-004']
   * @param {number} [options.dimensions=768]
   * @param {number} [options.batchSize=16]
   * @param {boolean} [options.simulateQuotaError=false]
   * @param {number} [options.simulateTransientErrorCount=0]
   * @param {boolean} [options.simulateDimensionMismatch=false]
   */
  constructor(options = {}) {
    super();
    this._modelId = options.modelId || 'text-embedding-004';
    this._dimensions = options.dimensions || 768;
    this._batchSize = options.batchSize || 16;
    this.simulateQuotaError = options.simulateQuotaError || false;
    this.simulateTransientErrorCount = options.simulateTransientErrorCount || 0;
    this.simulateDimensionMismatch = options.simulateDimensionMismatch || false;
    this.transientErrorAttempts = 0;
    this.callLog = [];
  }

  get modelId() {
    return this._modelId;
  }

  get dimensions() {
    return this._dimensions;
  }

  get batchSize() {
    return this._batchSize;
  }

  async embedDocuments(texts, options = {}) {
    this.callLog.push({ type: 'documents', count: texts?.length, options });

    if (this.simulateQuotaError) {
      throw new EmbeddingQuotaError(
        `Gemini embedding daily quota exceeded for model "${this._modelId}" (Simulated Quota Error)`,
        { retryAfterSeconds: 3600 }
      );
    }

    if (
      this.simulateTransientErrorCount > 0 &&
      this.transientErrorAttempts < this.simulateTransientErrorCount
    ) {
      this.transientErrorAttempts++;
      throw new EmbeddingProviderError('Simulated 503 Service Unavailable', {
        code: 'TRANSIENT_ERROR',
        status: 503,
        retryable: true,
      });
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return {
        vectors: [],
        modelId: this._modelId,
        dimensions: this._dimensions,
      };
    }

    const outputDim = this.simulateDimensionMismatch ? this._dimensions - 256 : this._dimensions;
    const vectors = texts.map((t) => generateDeterministicVector(t, outputDim));

    return {
      vectors,
      modelId: this._modelId,
      dimensions: outputDim,
    };
  }

  async embedQuery(query, options = {}) {
    this.callLog.push({ type: 'query', query, options });

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new EmbeddingProviderError('Search query must be a non-empty string', {
        code: 'INVALID_QUERY',
        status: 400,
      });
    }

    const res = await this.embedDocuments([query], options);
    return {
      vector: res.vectors[0],
      modelId: this._modelId,
      dimensions: res.dimensions,
    };
  }
}
