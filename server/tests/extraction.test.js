import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { extractText } from '../src/services/extraction/index.js';
import {
  UnsupportedFormatError,
  FileTooLargeError,
  CorruptFileError,
  TextlessDocumentError,
} from '../src/utils/AppError.js';

const currentDir = fileURLToPath(new URL('.', import.meta.url));

const getFixtureBuffer = (filename) => {
  const filePath = resolve(currentDir, 'fixtures', filename);
  return readFileSync(filePath);
};

describe('Document Extraction Service (extractText)', () => {
  describe('GeM PDF Fixtures', () => {
    it('extracts OPGC bid (GeM-Bidding-9563430.pdf) with 6 pages of text', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9563430.pdf');
      const result = await extractText({ buffer, originalName: 'GeM-Bidding-9563430.pdf' });

      expect(result.format).toBe('pdf');
      expect(result.pages).toHaveLength(6);
      expect(result.text.length).toBeGreaterThan(1000);
      expect(result.metadata.pageCount).toBe(6);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[0].text.length).toBeGreaterThan(50);
    });

    it('extracts BHEL bid (GeM-Bidding-9605104.pdf) with 8 pages of text', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9605104.pdf');
      const result = await extractText({ buffer, originalName: 'GeM-Bidding-9605104.pdf' });

      expect(result.format).toBe('pdf');
      expect(result.pages).toHaveLength(8);
      expect(result.text.length).toBeGreaterThan(1000);
      expect(result.metadata.pageCount).toBe(8);
      expect(result.text).toContain('Bharat Heavy Electricals Limited');
    });

    it('extracts SAIL bid (GeM-Bidding-9649647.pdf) with 11 pages and expected torque wrench phrase', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9649647.pdf');
      const result = await extractText({ buffer, originalName: 'GeM-Bidding-9649647.pdf' });

      expect(result.format).toBe('pdf');
      expect(result.pages).toHaveLength(11);
      expect(result.metadata.pageCount).toBe(11);
      expect(result.text).toMatch(/HYDRAULIC TORQUE WRENCH WITH POWER PACK/i);
    });
  });

  describe('Authored DOCX Fixtures', () => {
    it('extracts relevant_sow.docx preserving paragraph structure without fabricating pages', async () => {
      const buffer = getFixtureBuffer('relevant_sow.docx');
      const result = await extractText({ buffer, originalName: 'relevant_sow.docx' });

      expect(result.format).toBe('docx');
      expect(result.pages).toBeNull();
      expect(result.paragraphs).toHaveLength(5);
      expect(result.paragraphs[0].paragraphIndex).toBe(1);
      expect(result.paragraphs[0].text).toContain('FLANGE MANAGEMENT AND INDUSTRIAL BOLTING');
      expect(result.text).toContain('hydraulic torque wrench');
      expect(result.text).toContain('bolt tensioner');
    });

    it('extracts civil_works.docx preserving paragraph indices', async () => {
      const buffer = getFixtureBuffer('civil_works.docx');
      const result = await extractText({ buffer, originalName: 'civil_works.docx' });

      expect(result.format).toBe('docx');
      expect(result.pages).toBeNull();
      expect(result.paragraphs).toHaveLength(5);
      expect(result.paragraphs[0].paragraphIndex).toBe(1);
      expect(result.paragraphs[0].text).toContain('CIVIL FOUNDATION AND DRAINAGE');
      expect(result.text).toContain('piling foundation');
    });
  });

  describe('Error Handling and Boundary Validations', () => {
    it('rejects unsupported extensions with UnsupportedFormatError (415)', async () => {
      const fakeBuffer = Buffer.from('plain text file');
      await expect(extractText({ buffer: fakeBuffer, originalName: 'sample.txt' })).rejects.toThrow(
        UnsupportedFormatError
      );
    });

    it('rejects fake PDF files (renamed text file) with CorruptFileError (422)', async () => {
      const fakePdfBuffer = Buffer.from('This is a text file renamed to sample.pdf');
      await expect(
        extractText({ buffer: fakePdfBuffer, originalName: 'fake.pdf' })
      ).rejects.toThrow(CorruptFileError);
    });

    it('rejects fake DOCX files (renamed text file) with CorruptFileError (422)', async () => {
      const fakeDocxBuffer = Buffer.from('This is a text file renamed to fake.docx');
      await expect(
        extractText({ buffer: fakeDocxBuffer, originalName: 'fake.docx' })
      ).rejects.toThrow(CorruptFileError);
    });

    it('rejects truncated/corrupt PDF structure with CorruptFileError (422)', async () => {
      const corruptPdf = Buffer.from('%PDF-1.4 corrupt content that is definitely truncated');
      await expect(
        extractText({ buffer: corruptPdf, originalName: 'corrupt.pdf' })
      ).rejects.toThrow(CorruptFileError);
    });

    it('rejects files exceeding size limit with FileTooLargeError (413)', async () => {
      const buffer = Buffer.alloc(1024 * 1024 * 2);
      await expect(
        extractText({ buffer, originalName: 'large.pdf', maxUploadMb: 1 })
      ).rejects.toThrow(FileTooLargeError);
    });

    it('rejects empty buffers with CorruptFileError (422)', async () => {
      await expect(
        extractText({ buffer: Buffer.alloc(0), originalName: 'empty.pdf' })
      ).rejects.toThrow(CorruptFileError);
    });

    it('rejects textless / scanned PDF with TextlessDocumentError (422)', async () => {
      const minimalTextlessPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
      );
      await expect(
        extractText({ buffer: minimalTextlessPdf, originalName: 'scanned_scan.pdf' })
      ).rejects.toThrow(TextlessDocumentError);
    });
  });

  describe('Batch Isolation', () => {
    it('isolates single file failure without failing other files in a batch', async () => {
      const validPdfBuffer = getFixtureBuffer('GeM-Bidding-9649647.pdf');
      const corruptPdfBuffer = Buffer.from('%PDF-corrupt');
      const validDocxBuffer = getFixtureBuffer('relevant_sow.docx');

      const batchFiles = [
        { buffer: validPdfBuffer, originalName: 'valid.pdf' },
        { buffer: corruptPdfBuffer, originalName: 'broken.pdf' },
        { buffer: validDocxBuffer, originalName: 'valid.docx' },
      ];

      const batchResults = await Promise.allSettled(batchFiles.map((file) => extractText(file)));

      expect(batchResults[0].status).toBe('fulfilled');
      expect(batchResults[0].value.format).toBe('pdf');

      expect(batchResults[1].status).toBe('rejected');
      expect(batchResults[1].reason).toBeInstanceOf(CorruptFileError);

      expect(batchResults[2].status).toBe('fulfilled');
      expect(batchResults[2].value.format).toBe('docx');
    });
  });
});
