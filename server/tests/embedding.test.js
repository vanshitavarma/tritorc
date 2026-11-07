import { describe, it, expect, vi } from 'vitest';
import {
  GoogleGenAIEmbeddingProvider,
  MockEmbeddingProvider,
  getEmbeddingProvider,
  EmbeddingQuotaError,
  redactSensitive,
  isTransientError,
} from '../src/services/embedding/index.js';

describe('Embedding Provider Abstraction', () => {
  describe('Security & Redaction Utilities', () => {
    it('redacts Google API keys and bearer tokens from logs and error strings', () => {
      const sensitive =
        'Error at https://generativelanguage.googleapis.com?key=AIzaSyA1234567890abcdef1234567890ABCDEF with Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
      const safe = redactSensitive(sensitive, 'AIzaSyA1234567890abcdef1234567890ABCDEF');

      expect(safe).not.toContain('AIzaSyA1234567890abcdef1234567890ABCDEF');
      expect(safe).toContain('[REDACTED_API_KEY]');
      expect(safe).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('identifies retryable transient errors vs non-retryable daily quota exhaustion', () => {
      // Retryable 503
      expect(isTransientError({ status: 503, message: 'Service Unavailable' })).toBe(true);
      // Retryable network glitch
      expect(isTransientError({ message: 'fetch failed ECONNRESET' })).toBe(true);
      // Retryable transient rate limit
      expect(
        isTransientError({ status: 429, message: 'Too Many Requests, rate limit exceeded' })
      ).toBe(true);

      // NON-retryable daily quota exhaustion
      expect(
        isTransientError({
          status: 429,
          message: 'Generate content requests per day limit exceeded on Free Tier',
        })
      ).toBe(false);
      expect(
        isTransientError({
          status: 429,
          message:
            'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests',
        })
      ).toBe(false);
    });
  });

  describe('GoogleGenAIEmbeddingProvider with Mocked Client', () => {
    const fakeApiKey = 'AIzaSyFakeTestKeyForUnitTestingOnly123';
    const mockVector768 = new Array(768).fill(0.05);

    it('verifies exact model ID "text-embedding-004" and 768 dimensions', () => {
      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        modelId: 'text-embedding-004',
        dimensions: 768,
      });

      expect(provider.modelId).toBe('text-embedding-004');
      expect(provider.dimensions).toBe(768);
    });

    it('embeds documents in bounded batches using mocked embedContent API', async () => {
      let callCount = 0;
      const mockClient = {
        models: {
          embedContent: vi.fn().mockImplementation(async ({ model, contents, config }) => {
            callCount++;
            expect(model).toBe('text-embedding-004');
            expect(config.outputDimensionality).toBe(768);
            // Return one 768-d vector per content item
            return {
              embeddings: contents.map(() => ({ values: [...mockVector768] })),
            };
          }),
        },
      };

      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        modelId: 'text-embedding-004',
        dimensions: 768,
        batchSize: 2, // 5 documents / batchSize 2 = 3 batches
        client: mockClient,
      });

      const docs = [
        'Hydraulic torque wrench specifications',
        'Bolt tensioner calibration requirements',
        'Flange management SOP',
        'High pressure hydraulic pump 700 bar',
        'Heavy duty socket set',
      ];

      const result = await provider.embedDocuments(docs);

      expect(callCount).toBe(3);
      expect(result.vectors).toHaveLength(5);
      expect(result.modelId).toBe('text-embedding-004');
      expect(result.dimensions).toBe(768);
      expect(result.vectors[0]).toHaveLength(768);
    });

    it('embedQuery uses the EXACT SAME model and dimensions as embedDocuments', async () => {
      const mockClient = {
        models: {
          embedContent: vi.fn().mockImplementation(async ({ model, _contents, config }) => {
            expect(model).toBe('text-embedding-004');
            expect(config.outputDimensionality).toBe(768);
            return {
              embeddings: [{ values: [...mockVector768] }],
            };
          }),
        },
      };

      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        modelId: 'text-embedding-004',
        dimensions: 768,
        client: mockClient,
      });

      const queryResult = await provider.embedQuery('hydraulic torque wrench');

      expect(queryResult.modelId).toBe('text-embedding-004');
      expect(queryResult.dimensions).toBe(768);
      expect(queryResult.vector).toHaveLength(768);
      expect(Array.isArray(queryResult.vector)).toBe(true);
    });

    it('rejects empty query strings cleanly', async () => {
      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        client: { models: { embedContent: vi.fn() } },
      });

      await expect(provider.embedQuery('')).rejects.toThrow(
        'Search query must be a non-empty string'
      );
      await expect(provider.embedQuery('   ')).rejects.toThrow(
        'Search query must be a non-empty string'
      );
    });

    it('retries with exponential backoff on transient errors and succeeds on recovery', async () => {
      let attempts = 0;
      const mockClient = {
        models: {
          embedContent: vi.fn().mockImplementation(async ({ contents }) => {
            attempts++;
            if (attempts === 1) {
              const transientErr = new Error('503 Service Unavailable');
              transientErr.status = 503;
              throw transientErr;
            }
            return {
              embeddings: contents.map(() => ({ values: [...mockVector768] })),
            };
          }),
        },
      };

      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        client: mockClient,
        maxRetries: 2,
        initialDelayMs: 10, // Fast delay for unit tests
      });

      const res = await provider.embedDocuments(['Test retry document']);

      expect(attempts).toBe(2);
      expect(res.vectors).toHaveLength(1);
      expect(res.vectors[0]).toHaveLength(768);
    });

    it('immediately throws EmbeddingQuotaError when daily quota is exhausted without futile retries', async () => {
      let attempts = 0;
      const mockClient = {
        models: {
          embedContent: vi.fn().mockImplementation(async () => {
            attempts++;
            const quotaErr = new Error(
              'Generate content requests per day limit exceeded on Free Tier. Please retry in 20h.'
            );
            quotaErr.status = 429;
            throw quotaErr;
          }),
        },
      };

      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        client: mockClient,
        maxRetries: 3,
      });

      await expect(provider.embedDocuments(['Tender chunk'])).rejects.toThrow(EmbeddingQuotaError);
      // Quota exhaustion must NOT trigger redundant retries
      expect(attempts).toBe(1);
    });

    it('strictly enforces dimension check and rejects dimension mismatch from API', async () => {
      const wrongDimensionVector = new Array(512).fill(0.1); // Returned 512 when 768 configured
      const mockClient = {
        models: {
          embedContent: vi.fn().mockResolvedValue({
            embeddings: [{ values: wrongDimensionVector }],
          }),
        },
      };

      const provider = new GoogleGenAIEmbeddingProvider({
        apiKey: fakeApiKey,
        modelId: 'text-embedding-004',
        dimensions: 768,
        client: mockClient,
      });

      await expect(provider.embedDocuments(['Dimension test text'])).rejects.toThrow(
        /Vector dimension mismatch/
      );
    });
  });

  describe('MockEmbeddingProvider (Isolated / Offline Operation)', () => {
    it('generates deterministic 768-dimensional normalized vectors', async () => {
      const mockProvider = new MockEmbeddingProvider({
        modelId: 'text-embedding-004',
        dimensions: 768,
      });

      const resA = await mockProvider.embedDocuments(['Hydraulic torque wrench']);
      const resB = await mockProvider.embedDocuments(['Hydraulic torque wrench']);
      const resQuery = await mockProvider.embedQuery('Hydraulic torque wrench');

      expect(resA.dimensions).toBe(768);
      expect(resA.vectors[0]).toHaveLength(768);
      // Deterministic: same text yields same vector
      expect(resA.vectors[0]).toEqual(resB.vectors[0]);
      expect(resA.vectors[0]).toEqual(resQuery.vector);
    });

    it('simulates quota errors on demand', async () => {
      const mockProvider = new MockEmbeddingProvider({ simulateQuotaError: true });
      await expect(mockProvider.embedDocuments(['Text'])).rejects.toThrow(EmbeddingQuotaError);
    });

    it('getEmbeddingProvider returns MockEmbeddingProvider when AI is disabled', () => {
      const provider = getEmbeddingProvider({ useMock: true });
      expect(provider).toBeInstanceOf(MockEmbeddingProvider);
      expect(provider.dimensions).toBe(768);
      expect(provider.modelId).toBe('text-embedding-004');
    });
  });

  describe('Opt-In Live Integration Test (Google GenAI API)', () => {
    // Only runs when RUN_LIVE_GEMINI_TESTS=true AND GEMINI_API_KEY is present
    const shouldRunLiveTest =
      process.env.RUN_LIVE_GEMINI_TESTS === 'true' && Boolean(process.env.GEMINI_API_KEY);

    it.skipIf(!shouldRunLiveTest)(
      'LIVE TEST: verifies text-embedding-004 returns exact 768 dimensions via official GenAI SDK',
      async () => {
        const liveProvider = new GoogleGenAIEmbeddingProvider({
          apiKey: process.env.GEMINI_API_KEY,
          modelId: 'text-embedding-004',
          dimensions: 768,
        });

        const docResult = await liveProvider.embedDocuments([
          'Tritorc hydraulic torque wrenches provide precision tightening for high pressure flanges.',
        ]);

        expect(docResult.vectors).toHaveLength(1);
        expect(docResult.vectors[0]).toHaveLength(768);
        expect(docResult.modelId).toBe('text-embedding-004');
        expect(docResult.dimensions).toBe(768);

        const queryResult = await liveProvider.embedQuery('hydraulic torque wrench');
        expect(queryResult.vector).toHaveLength(768);
        expect(queryResult.modelId).toBe('text-embedding-004');
      }
    );
  });
});
