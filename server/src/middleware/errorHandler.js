import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const errorHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  let statusCode = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Internal server error';

  if (error.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      code = 'FILE_TOO_LARGE';
      message = `File exceeds maximum allowed size of ${env.maxUploadMb}MB`;
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      statusCode = 400;
      code = 'TOO_MANY_FILES';
      message = `Maximum of ${env.maxFiles} files allowed per upload batch`;
    } else {
      statusCode = 400;
      code = error.code || 'UPLOAD_ERROR';
      message = error.message || 'File upload error';
    }
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${error.stack || message}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} - ${statusCode}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    status: 'error',
    message,
    code,
    error: {
      code,
    },
  });
};
