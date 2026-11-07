import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env.js';
import { UnsupportedFormatError } from '../utils/AppError.js';

const storage = multer.memoryStorage();

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new UnsupportedFormatError(file.originalname));
  }
  return cb(null, true);
};

export const uploadFiles = multer({
  storage,
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
    files: env.maxFiles,
  },
  fileFilter,
}).array('files', env.maxFiles);
