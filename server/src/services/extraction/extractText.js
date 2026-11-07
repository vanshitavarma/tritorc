import { extname } from 'node:path';
import { Buffer } from 'node:buffer';
import { env } from '../../config/env.js';
import { extractPdfText } from './pdfExtractor.js';
import { extractDocxText } from './docxExtractor.js';
import {
  UnsupportedFormatError,
  FileTooLargeError,
  CorruptFileError,
} from '../../utils/AppError.js';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

const hasMagicBytes = (buffer, magic) => {
  if (!buffer || buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
};

export const extractText = async ({
  buffer,
  originalName = 'unknown',
  _mimeType,
  maxUploadMb = env.maxUploadMb,
}) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new CorruptFileError(originalName, 'Uploaded file buffer is empty or invalid');
  }

  const maxBytes = maxUploadMb * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new FileTooLargeError(originalName, maxUploadMb);
  }

  const extension = extname(originalName).toLowerCase();

  if (extension === '.pdf') {
    if (!hasMagicBytes(buffer, PDF_MAGIC)) {
      throw new CorruptFileError(originalName, 'Invalid PDF signature');
    }
    return extractPdfText({ buffer, originalName });
  }

  if (extension === '.docx') {
    if (!hasMagicBytes(buffer, DOCX_MAGIC)) {
      throw new CorruptFileError(originalName, 'Invalid DOCX archive signature');
    }
    return extractDocxText({ buffer, originalName });
  }

  throw new UnsupportedFormatError(originalName);
};
