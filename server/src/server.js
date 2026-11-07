import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

let activeServer = null;

export const startServer = async () => {
  try {
    await connectDatabase();
    activeServer = app.listen(env.port, () => {
      logger.info(`Server listening on port ${env.port}`);
    });
    return activeServer;
  } catch (error) {
    logger.error(`Server failed to start: ${error.message}`);
    throw error;
  }
};

export const stopServer = async (signal = 'SHUTDOWN') => {
  logger.info(`Stopping server on signal ${signal}...`);
  if (activeServer) {
    await new Promise((resolve) => activeServer.close(resolve));
    logger.info('HTTP server closed');
    activeServer = null;
  }
  await disconnectDatabase();
};

const handleTermination = async (signal) => {
  try {
    await stopServer(signal);
    process.exit(0);
  } catch (error) {
    logger.error(`Error during ${signal} shutdown: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => handleTermination('SIGINT'));
process.on('SIGTERM', () => handleTermination('SIGTERM'));

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(() => {
    process.exit(1);
  });
}
