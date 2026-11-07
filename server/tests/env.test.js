import { describe, it, expect } from 'vitest';
import { parseAndValidateEnv } from '../src/config/env.js';

describe('Environment Configuration (env.js)', () => {
  const baseValidEnv = {
    PORT: '5000',
    CLIENT_ORIGIN: 'http://localhost:5173',
    MAX_UPLOAD_MB: '10',
    MAX_FILES: '10',
    MONGODB_URI: 'mongodb://localhost:27017/tritorc_test',
    AI_ENABLED: 'false',
  };

  it('correctly parses and freezes a valid environment configuration', () => {
    const config = parseAndValidateEnv(baseValidEnv);

    expect(config.port).toBe(5000);
    expect(config.clientOrigin).toBe('http://localhost:5173');
    expect(config.maxUploadMb).toBe(10);
    expect(config.maxFiles).toBe(10);
    expect(config.mongodbUri).toBe('mongodb://localhost:27017/tritorc_test');
    expect(config.aiEnabled).toBe(false);
    expect(config.geminiGenerationModel).toBe('gemini-2.5-flash');
    expect(config.geminiEmbeddingModel).toBe('text-embedding-004');
    expect(config.embeddingDimensions).toBe(768);
    expect(config.vectorIndexName).toBe('tender_vector_index');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('throws an error if a required environment variable is missing', () => {
    const invalidEnv = { ...baseValidEnv, MONGODB_URI: '' };
    expect(() => parseAndValidateEnv(invalidEnv)).toThrow(
      'Missing required environment variable: MONGODB_URI'
    );
  });

  it('throws an error if MONGODB_URI does not use mongodb:// or mongodb+srv://', () => {
    const invalidEnv = { ...baseValidEnv, MONGODB_URI: 'http://localhost:27017' };
    expect(() => parseAndValidateEnv(invalidEnv)).toThrow(
      'MONGODB_URI must begin with mongodb:// or mongodb+srv://'
    );
  });

  it('throws an error if AI_ENABLED is true but GEMINI_API_KEY is empty', () => {
    const invalidEnv = { ...baseValidEnv, AI_ENABLED: 'true', GEMINI_API_KEY: ' ' };
    expect(() => parseAndValidateEnv(invalidEnv)).toThrow(
      'GEMINI_API_KEY is required when AI_ENABLED is true'
    );
  });

  it('allows overriding AI models and vector index parameters', () => {
    const customEnv = {
      ...baseValidEnv,
      AI_ENABLED: 'true',
      GEMINI_API_KEY: 'test-key',
      GEMINI_GENERATION_MODEL: 'gemini-1.5-pro',
      GEMINI_EMBEDDING_MODEL: 'custom-embed',
      EMBEDDING_DIMENSIONS: '1536',
      VECTOR_INDEX_NAME: 'custom_index',
    };
    const config = parseAndValidateEnv(customEnv);

    expect(config.aiEnabled).toBe(true);
    expect(config.geminiApiKey).toBe('test-key');
    expect(config.geminiGenerationModel).toBe('gemini-1.5-pro');
    expect(config.geminiEmbeddingModel).toBe('custom-embed');
    expect(config.embeddingDimensions).toBe(1536);
    expect(config.vectorIndexName).toBe('custom_index');
  });
});
