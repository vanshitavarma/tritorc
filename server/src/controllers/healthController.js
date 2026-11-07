import { env } from '../config/env.js';
import { getDatabaseStatus } from '../config/database.js';

export const getLiveness = (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
  });
};

export const getReadiness = (_req, res) => {
  const dbStatus = getDatabaseStatus();

  if (!dbStatus.isReady) {
    return res.status(503).json({
      status: 'not_ready',
      services: {
        database: {
          status: dbStatus.status,
        },
      },
    });
  }

  return res.status(200).json({
    status: 'ready',
    services: {
      database: {
        status: dbStatus.status,
      },
    },
  });
};

export const getHealth = (_req, res) => {
  const dbStatus = getDatabaseStatus();

  res.status(200).json({
    status: dbStatus.isReady ? 'ok' : 'degraded',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbStatus.status,
      },
      ai: {
        enabled: env.aiEnabled,
        generationModel: env.geminiGenerationModel,
        embeddingModel: env.geminiEmbeddingModel,
        embeddingDimensions: env.embeddingDimensions,
      },
    },
  });
};
