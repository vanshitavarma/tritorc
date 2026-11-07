import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { Scan, TenderDocument, DocumentChunk, AIAnalysis } from '../src/models/index.js';

async function getValidationError(doc) {
  try {
    await doc.validate();
    return null;
  } catch (err) {
    return err;
  }
}

describe('MongoDB Schema Definitions & Validation Rules', () => {
  describe('Scan Schema (models/Scan.js)', () => {
    it('validates a properly structured Scan document', async () => {
      const scan = new Scan({
        scanId: 'b7123456-1111-2222-3333-444455556666',
        status: 'completed',
        fileCounts: {
          total: 3,
          successful: 2,
          failed: 0,
          rejected: 1,
          reviewNeeded: 0,
        },
        configSnapshot: {
          keywordsCount: 20,
          aiEnabled: true,
          generationModel: 'gemini-2.5-flash',
          embeddingModel: 'text-embedding-004',
          embeddingDimensions: 768,
          vectorIndexName: 'tender_vector_index',
        },
      });

      const err = await getValidationError(scan);
      expect(err).toBeNull();
      expect(scan.status).toBe('completed');
      expect(scan.fileCounts.total).toBe(3);
      expect(scan.configSnapshot.embeddingDimensions).toBe(768);
      expect(scan.createdAt).toBeInstanceOf(Date);
    });

    it('rejects a Scan document missing required scanId', async () => {
      const scan = new Scan({
        fileCounts: { total: 1 },
      });
      const err = await getValidationError(scan);
      expect(err).toBeDefined();
      expect(err.errors.scanId).toBeDefined();
    });

    it('rejects an invalid scan status enum', async () => {
      const scan = new Scan({
        scanId: 'valid-id',
        status: 'invalid_status_enum',
        fileCounts: { total: 1 },
      });
      const err = await getValidationError(scan);
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it('rejects negative file counts', async () => {
      const scan = new Scan({
        scanId: 'valid-id',
        fileCounts: { total: -5 },
      });
      const err = await getValidationError(scan);
      expect(err).toBeDefined();
      expect(err.errors['fileCounts.total']).toBeDefined();
    });
  });

  describe('TenderDocument Schema (models/TenderDocument.js)', () => {
    it('validates a properly structured TenderDocument', async () => {
      const doc = new TenderDocument({
        documentId: 'doc-1234',
        scanId: 'scan-5678',
        originalFileName: 'GeM-Bidding-9649647.pdf',
        documentName: 'Rourkela Steel Plant – Torque Wrench',
        documentType: 'TENDER',
        isValidTender: true,
        fileMetadata: {
          mimeType: 'application/pdf',
          sizeBytes: 116635,
          pageCount: 11,
          characterCount: 26006,
          contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        extractionStatus: 'success',
        baselineMatches: [
          { keyword: 'Hydraulic torque wrench', hits: 6, firstIndex: 874 },
          { keyword: 'Torque wrench', hits: 15, firstIndex: 884 },
        ],
        distinctCount: 2,
        totalHits: 21,
        baselineVerdict: 'Related',
        tenderFields: {
          'Tender No': 'GEM/2026/B/7824594',
          'Tender Authority': 'Rourkela Steel Plant',
          Location: 'Rourkela, Odisha',
        },
        ingestionStatus: 'indexed',
      });

      const err = await getValidationError(doc);
      expect(err).toBeNull();
      expect(doc.documentType).toBe('TENDER');
      expect(doc.fileMetadata.contentHash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
      expect(doc.baselineVerdict).toBe('Related');
      expect(doc.distinctCount).toBe(2);
      expect(doc.tenderFields.get('Tender Authority')).toBe('Rourkela Steel Plant');
      expect(doc.toObject({ flattenMaps: true }).tenderFields['Tender Authority']).toBe(
        'Rourkela Steel Plant'
      );
    });

    it('ensures binary uploaded files are NOT stored on the document schema', async () => {
      const rawPayload = {
        documentId: 'doc-no-bin',
        scanId: 'scan-1',
        originalFileName: 'spec.pdf',
        documentName: 'Spec Document',
        fileMetadata: {
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          contentHash: 'abc123hash',
        },
        fileBuffer: Buffer.from('RAW_BINARY_PDF_DATA_HERE'),
        fileData: 'base64_data_here',
      };

      const doc = new TenderDocument(rawPayload);
      const err = await getValidationError(doc);
      expect(err).toBeNull();

      const obj = doc.toObject();
      expect(obj.fileBuffer).toBeUndefined();
      expect(obj.fileData).toBeUndefined();
      expect(obj.buffer).toBeUndefined();
    });

    it('rejects invalid documentType and baselineVerdict enums', async () => {
      const doc = new TenderDocument({
        documentId: 'doc-invalid-enums',
        scanId: 'scan-1',
        originalFileName: 'doc.pdf',
        documentName: 'Test Document',
        documentType: 'UNSUPPORTED_TYPE',
        baselineVerdict: 'SUPER_HOT_LEAD',
        fileMetadata: {
          mimeType: 'application/pdf',
          sizeBytes: 100,
          contentHash: 'hash',
        },
      });

      const err = await getValidationError(doc);
      expect(err).toBeDefined();
      expect(err.errors.documentType).toBeDefined();
      expect(err.errors.baselineVerdict).toBeDefined();
    });
  });

  describe('DocumentChunk Schema & Vector Model/Dimension Isolation (models/DocumentChunk.js)', () => {
    it('validates a text chunk without embedding', async () => {
      const chunk = new DocumentChunk({
        documentId: 'doc-1',
        scanId: 'scan-1',
        chunkIndex: 0,
        text: 'The contractor must provide calibration certificates for all hydraulic tensioners.',
        provenance: {
          pageStart: 3,
          pageEnd: 3,
        },
        section: 'Scope of Work',
        contentHash: 'chunk-sha256-hash-0',
      });

      const err = await getValidationError(chunk);
      expect(err).toBeNull();
      expect(chunk.chunkIndex).toBe(0);
      expect(chunk.section).toBe('Scope of Work');
    });

    it('validates an embedded chunk with strictly matching vector dimensions', async () => {
      const vector768 = new Array(768).fill(0.123);
      const chunk = new DocumentChunk({
        documentId: 'doc-1',
        scanId: 'scan-1',
        chunkIndex: 1,
        text: 'Mechanical torque tightening specifications.',
        embedding: vector768,
        embeddingModel: 'text-embedding-004',
        embeddingDimensions: 768,
        contentHash: 'hash-chunk-1',
        status: 'embedded',
      });

      const err = await getValidationError(chunk);
      expect(err).toBeNull();
      expect(chunk.embedding).toHaveLength(768);
      expect(chunk.status).toBe('embedded');
    });

    it('STRICT CONSTRAINT: rejects vector dimension mismatch to prevent mixing models/dimensions', async () => {
      // 512 dimensions passed into a 768 dimension model schema
      const vector512 = new Array(512).fill(0.456);
      const chunk = new DocumentChunk({
        documentId: 'doc-1',
        scanId: 'scan-1',
        chunkIndex: 2,
        text: 'Bolting tool specifications.',
        embedding: vector512,
        embeddingModel: 'text-embedding-004',
        embeddingDimensions: 768, // Declared 768 but passed 512
        contentHash: 'hash-chunk-2',
      });

      const err = await getValidationError(chunk);
      expect(err).toBeDefined();
      expect(err.errors.embedding).toBeDefined();
      expect(err.errors.embedding.message).toContain('Vector dimension mismatch');
    });

    it('rejects embedding when embeddingModel or embeddingDimensions is absent', async () => {
      const vector768 = new Array(768).fill(0.789);
      const chunk = new DocumentChunk({
        documentId: 'doc-1',
        scanId: 'scan-1',
        chunkIndex: 3,
        text: 'Text without model declared.',
        embedding: vector768,
        contentHash: 'hash-chunk-3',
      });

      const err = await getValidationError(chunk);
      expect(err).toBeDefined();
      expect(err.errors.embeddingModel).toBeDefined();
      expect(err.errors.embeddingDimensions).toBeDefined();
    });

    it('rejects embedding with NaN or infinite values', async () => {
      const badVector = new Array(768).fill(0.1);
      badVector[10] = NaN;

      const chunk = new DocumentChunk({
        documentId: 'doc-1',
        scanId: 'scan-1',
        chunkIndex: 4,
        text: 'Corrupt float vector.',
        embedding: badVector,
        embeddingModel: 'text-embedding-004',
        embeddingDimensions: 768,
        contentHash: 'hash-chunk-4',
      });

      const err = await getValidationError(chunk);
      expect(err).toBeDefined();
      const embeddingErr = err.errors.embedding || err.errors['embedding.10'];
      expect(embeddingErr).toBeDefined();

      // Test with infinite value
      const infiniteVector = new Array(768).fill(0.1);
      infiniteVector[20] = Infinity;
      const infChunk = new DocumentChunk({
        documentId: 'doc-1',
        scanId: 'scan-1',
        chunkIndex: 5,
        text: 'Infinite float vector.',
        embedding: infiniteVector,
        embeddingModel: 'text-embedding-004',
        embeddingDimensions: 768,
        contentHash: 'hash-chunk-5',
      });
      const infErr = await getValidationError(infChunk);
      expect(infErr).toBeDefined();
      expect(infErr.errors.embedding).toBeDefined();
    });
  });

  describe('AIAnalysis Schema (models/AIAnalysis.js)', () => {
    it('validates a properly structured AIAnalysis document', async () => {
      const analysis = new AIAnalysis({
        documentId: 'doc-1',
        scanId: 'scan-1',
        analysisType: 'summarization',
        model: 'gemini-2.5-flash',
        promptVersion: 'v1.0',
        result: {
          semanticAssessment: 'High Bolting Relevance',
          aiExplanation: 'Tender requests 15000 Nm hydraulic torque wrenches.',
          keyOpportunities: 'Supply of hydraulic torque tool sets.',
          risksAndUnknowns: 'Requires prior supply credentials.',
          recommendedFollowUp: 'Pursue bid submission.',
        },
        evidenceChunkIds: ['chunk-1', 'chunk-2'],
        status: 'completed',
        usageMetadata: {
          promptTokens: 450,
          candidatesTokens: 180,
          totalTokens: 630,
          latencyMs: 1250,
        },
      });

      const err = await getValidationError(analysis);
      expect(err).toBeNull();
      expect(analysis.analysisType).toBe('summarization');
      expect(analysis.result.semanticAssessment).toBe('High Bolting Relevance');
      expect(analysis.evidenceChunkIds).toHaveLength(2);
      expect(analysis.usageMetadata.latencyMs).toBe(1250);
    });

    it('rejects an invalid analysisType enum', async () => {
      const analysis = new AIAnalysis({
        documentId: 'doc-1',
        scanId: 'scan-1',
        analysisType: 'unsupported_analysis_type',
        model: 'gemini-2.5-flash',
        result: {},
      });

      const err = await getValidationError(analysis);
      expect(err).toBeDefined();
      expect(err.errors.analysisType).toBeDefined();
    });
  });
});
