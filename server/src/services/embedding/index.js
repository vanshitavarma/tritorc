import { GoogleGenAIEmbeddingProvider } from './GoogleGenAIEmbeddingProvider.js';
import { MockEmbeddingProvider } from './MockEmbeddingProvider.js';
import { env } from '../../config/env.js';

export {
  EmbeddingProvider,
  EmbeddingProviderError,
  EmbeddingQuotaError,
} from './EmbeddingProvider.js';
export {
  GoogleGenAIEmbeddingProvider,
  redactSensitive,
  isTransientError,
} from './GoogleGenAIEmbeddingProvider.js';
export { MockEmbeddingProvider } from './MockEmbeddingProvider.js';

let activeProvider = null;

/**
 * Returns an instance of the configured EmbeddingProvider.
 * If AI is disabled or GEMINI_API_KEY is not set, or if useMock is true, returns MockEmbeddingProvider.
 * Otherwise returns GoogleGenAIEmbeddingProvider.
 *
 * @param {Object} [options]
 * @param {boolean} [options.useMock=false]
 * @param {boolean} [options.fresh=false]
 * @returns {import('./EmbeddingProvider.js').EmbeddingProvider}
 */
export const getEmbeddingProvider = (options = {}) => {
  if (options.provider) {
    return options.provider;
  }

  const shouldUseMock = options.useMock || (!env.aiEnabled && !env.geminiApiKey);

  if (shouldUseMock) {
    return new MockEmbeddingProvider(options);
  }

  if (!activeProvider || options.fresh) {
    activeProvider = new GoogleGenAIEmbeddingProvider(options);
  }

  return activeProvider;
};
