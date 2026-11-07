export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(filename, reason = 'Only .pdf and .docx files are supported') {
    super(`Unsupported file format for "${filename}": ${reason}`, 415, 'UNSUPPORTED_FORMAT');
  }
}

export class FileTooLargeError extends AppError {
  constructor(filename, maxMb) {
    super(
      `File "${filename}" exceeds the maximum allowed upload size of ${maxMb}MB`,
      413,
      'FILE_TOO_LARGE'
    );
  }
}

export class CorruptFileError extends AppError {
  constructor(filename, details = 'File is damaged or invalid') {
    super(`Could not read "${filename}": ${details}`, 422, 'CORRUPT_DOCUMENT');
  }
}

export class EncryptedDocumentError extends AppError {
  constructor(filename) {
    super(
      `Could not read "${filename}": document is password protected or encrypted`,
      422,
      'ENCRYPTED_DOCUMENT'
    );
  }
}

export class TextlessDocumentError extends AppError {
  constructor(filename) {
    super(
      `No readable text found in "${filename}" (scanned PDF or empty document)`,
      422,
      'TEXTLESS_DOCUMENT'
    );
  }
}
