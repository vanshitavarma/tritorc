import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const errorHandler = (error, req, res, _next) => {
  if (error.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        status: 'error',
        code: 'FILE_TOO_LARGE',
        message: `File exceeds maximum allowed size of ${env.maxUploadMb}MB`,
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        status: 'error',
        code: 'TOO_MANY_FILES',
        message: `Maximum of ${env.maxFiles} files allowed per upload batch`,
      });
    }
    return res.status(400).json({
      status: 'error',
      code: error.code || 'UPLOAD_ERROR',
      message: error.message,
    });
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${error.stack || message}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} - ${statusCode}: ${message}`);
  }

  res.status(statusCode).json({
    status: 'error',
    code: error.code || 'INTERNAL_ERROR',
    message,
  });
};
