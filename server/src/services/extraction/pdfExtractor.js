import { PDFParse, PasswordException, InvalidPDFException } from 'pdf-parse';
import {
  CorruptFileError,
  EncryptedDocumentError,
  TextlessDocumentError,
} from '../../utils/AppError.js';

export const extractPdfText = async ({ buffer, originalName = 'document.pdf' }) => {
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const rawText = (textResult.text || '').trim();

    if (rawText.length < 20) {
      throw new TextlessDocumentError(originalName);
    }

    let info = {};
    try {
      const infoResult = await parser.getInfo();
      info = infoResult?.info || {};
    } catch {
      // Non-critical metadata read failures do not abort text extraction
    }

    const pages = (textResult.pages || []).map((page, index) => ({
      pageNumber: page.num || index + 1,
      text: (page.text || '').trim(),
    }));

    return {
      format: 'pdf',
      text: textResult.text,
      pages,
      paragraphs: null,
      metadata: {
        pageCount: textResult.total || pages.length,
        characterCount: textResult.text.length,
        originalName,
        mimeType: 'application/pdf',
        info,
      },
    };
  } catch (error) {
    if (
      error instanceof TextlessDocumentError ||
      error instanceof EncryptedDocumentError ||
      error instanceof CorruptFileError
    ) {
      throw error;
    }
    if (error instanceof PasswordException || /password|encrypt/i.test(error.message)) {
      throw new EncryptedDocumentError(originalName);
    }
    if (error instanceof InvalidPDFException || /corrupt|invalid|header/i.test(error.message)) {
      throw new CorruptFileError(originalName, error.message);
    }
    throw new CorruptFileError(originalName, error.message);
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
};
