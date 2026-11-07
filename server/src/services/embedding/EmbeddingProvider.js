/**
 * Custom error thrown when an embedding provider fails.
 */
export class EmbeddingProviderError extends Error {
  constructor(
    message,
    { code = 'EMBEDDING_ERROR', status = 500, retryable = false, originalError = null } = {}
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.originalError = originalError;
  }
}

/**
 * Custom error thrown when embedding quota is exhausted (HTTP 429 RESOURCE_EXHAUSTED).
 */
export class EmbeddingQuotaError extends EmbeddingProviderError {
  constructor(message, { retryAfterSeconds = null, originalError = null } = {}) {
    super(message, {
      code: 'QUOTA_EXHAUSTED',
      status: 429,
      retryable: false,
      originalError,
    });
    this.name = 'EmbeddingQuotaError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Abstract Base Class for Embedding Providers.
 * Defines standard contract for embedding batches of documents and individual queries.
 */
export class EmbeddingProvider {
  /**
   * Embeds an array of document text strings.
   *
   * @param {string[]} texts - Array of text strings to embed
   * @param {Object} [options]
   * @returns {Promise<{ vectors: number[][], modelId: string, dimensions: number, usage?: Object }>}
   */
  async embedDocuments(_texts, _options = {}) {
    throw new Error('embedDocuments() must be implemented by subclass');
  }

  /**
   * Embeds a single search query string using the exact same model and dimensions.
   *
   * @param {string} query - Query string to embed
   * @param {Object} [options]
   * @returns {Promise<{ vector: number[], modelId: string, dimensions: number, usage?: Object }>}
   */
  async embedQuery(_query, _options = {}) {
    throw new Error('embedQuery() must be implemented by subclass');
  }

  /**
   * The exact identifier of the underlying model (e.g., 'text-embedding-004').
   * @returns {string}
   */
  get modelId() {
    throw new Error('modelId getter must be implemented by subclass');
  }

  /**
   * The exact number of dimensions output by this model (e.g., 768).
   * @returns {number}
   */
  get dimensions() {
    throw new Error('dimensions getter must be implemented by subclass');
  }
}
