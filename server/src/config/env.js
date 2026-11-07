const REQUIRED_ENV_VARS = ['PORT', 'CLIENT_ORIGIN', 'MAX_UPLOAD_MB', 'MAX_FILES', 'MONGODB_URI'];

const parsePositiveInteger = (value, variableName) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${variableName} environment variable must be a positive integer`);
  }
  return parsed;
};

export const parseAndValidateEnv = (source = process.env) => {
  for (const variableName of REQUIRED_ENV_VARS) {
    if (!source[variableName] || source[variableName].trim() === '') {
      throw new Error(`Missing required environment variable: ${variableName}`);
    }
  }

  const port = Number.parseInt(source.PORT, 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error('PORT environment variable must be a valid integer');
  }

  const maxUploadMb = parsePositiveInteger(source.MAX_UPLOAD_MB, 'MAX_UPLOAD_MB');
  const maxFiles = parsePositiveInteger(source.MAX_FILES, 'MAX_FILES');
  let mongodbUri = source.MONGODB_URI.trim();
  if (mongodbUri.startsWith('MONGODB_URI=')) {
    mongodbUri = mongodbUri.replace(/^MONGODB_URI=\s*/, '').trim();
  }

  if (!mongodbUri.startsWith('mongodb://') && !mongodbUri.startsWith('mongodb+srv://')) {
    throw new Error('MONGODB_URI must begin with mongodb:// or mongodb+srv://');
  }

  const aiEnabled = source.AI_ENABLED === 'true';
  const geminiApiKey = source.GEMINI_API_KEY ? source.GEMINI_API_KEY.trim() : '';

  if (aiEnabled && !geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required when AI_ENABLED is true');
  }

  const embeddingDimensions = source.EMBEDDING_DIMENSIONS
    ? parsePositiveInteger(source.EMBEDDING_DIMENSIONS, 'EMBEDDING_DIMENSIONS')
    : 768;

  return Object.freeze({
    port,
    clientOrigin: source.CLIENT_ORIGIN.trim(),
    maxUploadMb,
    maxFiles,
    mongodbUri,
    aiEnabled,
    geminiApiKey,
    geminiGenerationModel: (source.GEMINI_GENERATION_MODEL || 'gemini-2.5-flash').trim(),
    geminiEmbeddingModel: (source.GEMINI_EMBEDDING_MODEL || 'text-embedding-004').trim(),
    embeddingDimensions,
    vectorIndexName: (source.VECTOR_INDEX_NAME || 'tender_vector_index').trim(),
  });
};

export const env = parseAndValidateEnv(process.env);
