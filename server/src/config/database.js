import { URL } from 'node:url';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const sanitizeMongoUri = (uri) => {
  if (!uri) return '';
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return uri.replace(/\/\/[^@]+@/, '//***:***@');
  }
};

const CONNECTION_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export const getDatabaseStatus = () => {
  const readyState = mongoose.connection.readyState;
  const status = CONNECTION_STATES[readyState] || 'unknown';
  return {
    status,
    isReady: readyState === 1,
  };
};

export const connectDatabase = async (uri = env.mongodbUri, options = {}) => {
  if (getDatabaseStatus().isReady) {
    return;
  }

  const sanitizedUri = sanitizeMongoUri(uri);
  logger.info(`Connecting to MongoDB at ${sanitizedUri}...`);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    ...options,
  });

  logger.info(`Connected to MongoDB successfully at ${sanitizedUri}`);
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
};
