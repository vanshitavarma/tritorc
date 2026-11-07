const requiredEnvVars = ['PORT', 'CLIENT_ORIGIN', 'MAX_UPLOAD_MB'];

for (const variableName of requiredEnvVars) {
  if (!process.env[variableName] || process.env[variableName].trim() === '') {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }
}

const parsedPort = Number.parseInt(process.env.PORT, 10);
const parsedMaxUploadMb = Number.parseInt(process.env.MAX_UPLOAD_MB, 10);

if (Number.isNaN(parsedPort)) {
  throw new Error('PORT environment variable must be a valid integer');
}

if (Number.isNaN(parsedMaxUploadMb)) {
  throw new Error('MAX_UPLOAD_MB environment variable must be a valid integer');
}

export const env = Object.freeze({
  port: parsedPort,
  clientOrigin: process.env.CLIENT_ORIGIN,
  maxUploadMb: parsedMaxUploadMb,
});
