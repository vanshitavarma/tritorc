import { GoogleGenAI } from '@google/genai';
import {
  EmbeddingProvider,
  EmbeddingProviderError,
  EmbeddingQuotaError,
} from './EmbeddingProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Redacts API keys, credentials, and tokens from error messages or logs.
 *
 * @param {string} str
 * @param {string} [specificKey]
 * @returns {string} Safe string with credentials redacted
 */
export const redactSensitive = (str = '', specificKey = '') => {
  if (!str || typeof str !== 'string') return '';
  let safe = str;
  if (specificKey && specificKey.length > 5) {
    safe = safe.replaceAll(specificKey, '[REDACTED_API_KEY]');
  }
  // Redact standard Google API key patterns (AIzaSy...)
  safe = safe.replace(/AIzaSy[0-9A-Za-z_-]{33}/g, '[REDACTED_API_KEY]');
  // Redact auth tokens
  safe = safe.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');
  return safe;
};

/**
 * Checks whether an error is transient and eligible for retry with exponential backoff.
 *
 * @param {Error|Object} err
 * @returns {boolean}
 */
export const isTransientError = (err) => {
  if (!err) return false;
  if (err.retryable === false || err.code === 'DIMENSION_MISMATCH') {
    return false;
  }
  const status = err.status || err.code || err.statusCode;
  const msg = String(err.message || '').toLowerCase();

  // Non-retryable: Quota exhaustion for the day
  if (
    msg.includes('per day limit exceeded') ||
    msg.includes('quota exceeded for metric') ||
    msg.includes('generaterequestsperday')
  ) {
    return false;
  }

  // Retryable HTTP status codes
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  // Network level transient issues
  if (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('rate limit')
  ) {
    return true;
  }

  return false;
};

/**
 * Sleep helper for exponential backoff.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

/**
 * Production Embedding Provider for Google GenAI text-embedding-004.
 * Conforms to official Google GenAI SDK standards and documentation:
 * - Model ID: 'text-embedding-004' (verified from official docs)
 * - Returned dimensions: 768 (configured via outputDimensionality)
 * - Strict vector dimension isolation
 * - Bounded batches with retry and exponential backoff
 * - Never prints API keys or vectors in logs
 */
export class GoogleGenAIEmbeddingProvider extends EmbeddingProvider {
  /**
   * @param {Object} [config]
   * @param {string} [config.apiKey] - Google GenAI API Key
   * @param {string} [config.modelId='text-embedding-004'] - Verified embedding model ID
   * @param {number} [config.dimensions=768] - Exact embedding dimensions (768)
   * @param {number} [config.batchSize=16] - Bounded batch size for embedding calls
   * @param {number} [config.maxRetries=3] - Maximum retry attempts for transient errors
   * @param {number} [config.initialDelayMs=500] - Initial backoff delay in ms
   * @param {Object} [config.client] - Injected @google/genai client instance (for mocking)
   */
  constructor(config = {}) {
    super();
    this._apiKey = config.apiKey || env.geminiApiKey || '';
    this._modelId = (config.modelId || env.geminiEmbeddingModel || 'text-embedding-004').trim();
    this._dimensions = config.dimensions || env.embeddingDimensions || 768;
    this._batchSize = config.batchSize || env.embeddingBatchSize || 16;
    this._maxRetries = config.maxRetries ?? 3;
    this._initialDelayMs = config.initialDelayMs ?? 500;

    if (config.client) {
      this._client = config.client;
    } else if (this._apiKey) {
      this._client = new GoogleGenAI({
        apiKey: this._apiKey,
        apiVersion: 'v1beta',
      });
    } else {
      this._client = null;
    }
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

  /**
   * Embeds an array of document text chunks in bounded batches with retry/backoff.
   *
   * @param {string[]} texts - Array of document text chunks
   * @param {Object} [options]
   * @returns {Promise<{ vectors: number[][], modelId: string, dimensions: number, usage?: Object }>}
   */
  async embedDocuments(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return {
        vectors: [],
        modelId: this._modelId,
        dimensions: this._dimensions,
      };
    }

    if (!this._client) {
      throw new EmbeddingProviderError(
        'Google GenAI client is uninitialized. Ensure GEMINI_API_KEY is configured.',
        { code: 'CLIENT_NOT_INITIALIZED', status: 500, retryable: false }
      );
    }

    // Clean inputs: convert to non-empty strings
    const cleanTexts = texts.map((t) =>
      typeof t === 'string' ? t.trim() : String(t || '').trim()
    );
    const batchSize = options.batchSize || this._batchSize;
    const allVectors = [];
    const totalBatches = Math.ceil(cleanTexts.length / batchSize);

    for (let i = 0; i < cleanTexts.length; i += batchSize) {
      const batch = cleanTexts.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);

      const batchVectors = await this._embedBatchWithRetry(batch, batchIndex, totalBatches);
      allVectors.push(...batchVectors);
    }

    // Never log raw vectors or API keys
    logger.info(
      `Successfully generated ${allVectors.length} embeddings using model "${this._modelId}" (${this._dimensions}d)`
    );

    return {
      vectors: allVectors,
      modelId: this._modelId,
      dimensions: this._dimensions,
    };
  }

  /**
   * Embeds a single query string using the EXACT SAME configured model and dimensions.
   *
   * @param {string} query
   * @param {Object} [options]
   * @returns {Promise<{ vector: number[], modelId: string, dimensions: number, usage?: Object }>}
   */
  async embedQuery(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new EmbeddingProviderError('Search query must be a non-empty string', {
        code: 'INVALID_QUERY',
        status: 400,
        retryable: false,
      });
    }

    const result = await this.embedDocuments([query.trim()], options);
    if (!result.vectors || result.vectors.length === 0) {
      throw new EmbeddingProviderError('No embedding vector returned for search query', {
        code: 'EMPTY_EMBEDDING',
        status: 500,
      });
    }

    return {
      vector: result.vectors[0],
      modelId: this._modelId,
      dimensions: this._dimensions,
    };
  }

  /**
   * Internal helper: embeds a bounded batch with exponential backoff and clear quota handling.
   *
   * @private
   */
  async _embedBatchWithRetry(batch, batchIndex, totalBatches) {
    let attempt = 0;
    let delay = this._initialDelayMs;

    while (attempt <= this._maxRetries) {
      try {
        const response = await this._client.models.embedContent({
          model: this._modelId,
          contents: batch,
          config: {
            outputDimensionality: this._dimensions,
          },
        });

        // Parse vectors from GoogleGenAI SDK response
        const vectors = this._extractVectorsFromResponse(response, batch.length);

        // Strict verification: each vector must strictly match configured dimensions
        for (let vIdx = 0; vIdx < vectors.length; vIdx++) {
          const v = vectors[vIdx];
          if (!Array.isArray(v) || v.length !== this._dimensions) {
            throw new EmbeddingProviderError(
              `Vector dimension mismatch: expected ${this._dimensions} dimensions from model ${this._modelId}, but received ${v?.length || 0}`,
              { code: 'DIMENSION_MISMATCH', status: 500, retryable: false }
            );
          }
        }

        // Never log vectors in logs
        logger.info(
          `Embedded batch ${batchIndex + 1}/${totalBatches} (${batch.length} chunks) with model "${this._modelId}"`
        );

        return vectors;
      } catch (err) {
        const safeMessage = redactSensitive(err.message, this._apiKey);

        // Detect Daily Quota Exhaustion
        if (
          safeMessage.includes('limit exceeded') ||
          safeMessage.includes('RESOURCE_EXHAUSTED') ||
          safeMessage.includes('quota exceeded')
        ) {
          logger.warn(`Google GenAI embedding quota exhausted: ${safeMessage}`);
          throw new EmbeddingQuotaError(
            `Gemini embedding daily quota exceeded for model "${this._modelId}". ${safeMessage}`,
            { originalError: err }
          );
        }

        const retryable = isTransientError(err);
        attempt++;

        if (attempt <= this._maxRetries && retryable) {
          // Exponential backoff with jitter
          const jitter = Math.floor(Math.random() * 200);
          const backoffDelay = delay + jitter;
          logger.warn(
            `Transient error embedding batch ${batchIndex + 1}/${totalBatches} (attempt ${attempt}/${this._maxRetries}). Retrying in ${backoffDelay}ms. Details: ${safeMessage}`
          );
          await sleep(backoffDelay);
          delay = Math.min(delay * 2, 5000);
        } else {
          logger.warn(`Failed to embed batch ${batchIndex + 1}/${totalBatches}: ${safeMessage}`);
          throw new EmbeddingProviderError(
            `Failed to generate embeddings with model "${this._modelId}": ${safeMessage}`,
            {
              code: 'EMBEDDING_FAILED',
              status: err.status || 500,
              retryable: false,
              originalError: err,
            }
          );
        }
      }
    }
  }

  /**
   * Extracts float vectors from Google GenAI response safely.
   *
   * @private
   */
  _extractVectorsFromResponse(response, expectedCount) {
    if (!response) return [];

    // Format 1: response.embeddings array (standard batch response)
    if (Array.isArray(response.embeddings)) {
      return response.embeddings.map((item) => item?.values || item);
    }

    // Format 2: response.embedding object (single content response)
    if (response.embedding && Array.isArray(response.embedding.values)) {
      return [response.embedding.values];
    }

    // Format 3: raw array of vectors
    if (Array.isArray(response) && Array.isArray(response[0])) {
      return response;
    }

    throw new EmbeddingProviderError(
      `Unexpected response format from embedding API: missing embeddings array (expected ${expectedCount} vectors)`,
      { code: 'INVALID_RESPONSE_FORMAT', status: 500 }
    );
  }
}
