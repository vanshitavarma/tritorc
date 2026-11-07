import mammoth from 'mammoth';
import { CorruptFileError, TextlessDocumentError } from '../../utils/AppError.js';

export const extractDocxText = async ({ buffer, originalName = 'document.docx' }) => {
  try {
    const rawResult = await mammoth.extractRawText({ buffer });
    const rawText = (rawResult.value || '').trim();

    if (rawText.length < 20) {
      throw new TextlessDocumentError(originalName);
    }

    const paragraphs = rawText
      .split(/\r?\n\r?\n/)
      .map((paragraphText) => paragraphText.trim())
      .filter((paragraphText) => paragraphText.length > 0)
      .map((text, index) => ({
        paragraphIndex: index + 1,
        text,
      }));

    return {
      format: 'docx',
      text: rawResult.value,
      pages: null,
      paragraphs,
      metadata: {
        paragraphCount: paragraphs.length,
        characterCount: rawResult.value.length,
        originalName,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        messages: rawResult.messages || [],
      },
    };
  } catch (error) {
    if (error instanceof TextlessDocumentError || error instanceof CorruptFileError) {
      throw error;
    }
    throw new CorruptFileError(originalName, error.message);
  }
};
