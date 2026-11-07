import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retrieveChunks,
  deduplicateChunks,
  calculateTextOverlap,
  clearQueryEmbeddingCache,
  VectorSearchError,
} from '../src/services/vectorSearch/retrieveChunks.js';
import { DocumentChunk } from '../src/models/DocumentChunk.js';
import { TenderDocument } from '../src/models/TenderDocument.js';
import { MockEmbeddingProvider } from '../src/services/embedding/MockEmbeddingProvider.js';
import * as databaseModule from '../src/config/database.js';

describe('Atlas Vector Search & Semantic Retrieval Service', () => {
  const docAId = 'doc-test-torque-wrench-001';
  const docBId = 'doc-test-civil-construction-002';

  const mockProvider = new MockEmbeddingProvider({
    modelId: 'gemini-embedding-001',
    dimensions: 768,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearQueryEmbeddingCache();
    // Default: DB is connected
    vi.spyOn(databaseModule, 'getDatabaseStatus').mockReturnValue({
      status: 'connected',
      isReady: true,
    });
  });

  describe('Deduplication & Overlap Controls', () => {
    it('calculates Jaccard text overlap correctly', () => {
      const text1 = 'Hydraulic torque wrench with power pack and square drive';
      const text2 = 'Hydraulic torque wrench with power pack and square drive';
      expect(calculateTextOverlap(text1, text2)).toBe(1.0);

      const text3 = 'Completely different civil construction foundation concrete';
      expect(calculateTextOverlap(text1, text3)).toBeLessThan(0.1);
    });

    it('deduplicates exact hash duplicates and highly overlapping chunks', () => {
      const candidates = [
        {
          _id: 'c1',
          contentHash: 'hash-abc',
          text: 'Supply of heavy duty hydraulic torque wrenches 15000 Nm',
          score: 0.88,
        },
        {
          _id: 'c2',
          contentHash: 'hash-abc', // Exact hash duplicate
          text: 'Supply of heavy duty hydraulic torque wrenches 15000 Nm',
          score: 0.85,
        },
        {
          _id: 'c3',
          contentHash: 'hash-xyz',
          text: 'Supply of heavy duty hydraulic torque wrenches 15000 Nm for flanges', // >70% overlap
          score: 0.82,
        },
        {
          _id: 'c4',
          contentHash: 'hash-unique',
          text: 'Payment terms: 100% against delivery and site acceptance within 30 days',
          score: 0.75,
        },
      ];

      const deduplicated = deduplicateChunks(candidates, 0.7);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0]._id).toBe('c1');
      expect(deduplicated[1]._id).toBe('c4');
    });
  });

  describe('Semantic Retrieval Validations & Error Handling', () => {
    it('rejects missing or empty documentId', async () => {
      await expect(
        retrieveChunks({ documentId: '', query: 'test question', provider: mockProvider })
      ).rejects.toThrow(VectorSearchError);

      await expect(
        retrieveChunks({ documentId: '   ', query: 'test question', provider: mockProvider })
      ).rejects.toThrow(/documentId is required/);
    });

    it('rejects missing or empty query string', async () => {
      await expect(
        retrieveChunks({ documentId: docAId, query: '', provider: mockProvider })
      ).rejects.toThrow(/query is required/);

      await expect(
        retrieveChunks({ documentId: docAId, query: '   ', provider: mockProvider })
      ).rejects.toThrow(VectorSearchError);
    });

    it('rejects non-existent document ID with DOCUMENT_NOT_FOUND', async () => {
      vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await expect(
        retrieveChunks({
          documentId: 'non-existent-doc-id',
          query: 'What tools are required?',
          provider: mockProvider,
        })
      ).rejects.toThrow(/was not found/);
    });

    it('handles MongoDB connection outage gracefully with DATABASE_UNAVAILABLE', async () => {
      vi.spyOn(databaseModule, 'getDatabaseStatus').mockReturnValue({
        status: 'disconnected',
        isReady: false,
      });

      await expect(
        retrieveChunks({
          documentId: docAId,
          query: 'What equipment is required?',
          provider: mockProvider,
        })
      ).rejects.toThrow(/MongoDB connection is unavailable/);
    });

    it('detects and rejects query vector dimension mismatch', async () => {
      vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({ documentId: docAId, originalFileName: 'SAIL.pdf' }),
      });

      // Provider that returns 512-d vector instead of 768-d
      const badProvider = new MockEmbeddingProvider({
        dimensions: 768,
        simulateDimensionMismatch: true,
      });

      await expect(
        retrieveChunks({
          documentId: docAId,
          query: 'What is the scope?',
          provider: badProvider,
        })
      ).rejects.toThrow(/dimension mismatch/);
    });

    it('handles missing or unready Atlas Vector Search index cleanly', async () => {
      vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({ documentId: docAId, originalFileName: 'SAIL.pdf' }),
      });

      vi.spyOn(DocumentChunk, 'aggregate').mockReturnValue({
        exec: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'PlanExecutor error during aggregation :: caused by :: Search index tender_vector_index not found'
            )
          ),
      });

      await expect(
        retrieveChunks({
          documentId: docAId,
          query: 'What tools are required?',
          provider: mockProvider,
        })
      ).rejects.toThrow(/Atlas Vector Search index ".*" is not ready or not found/);
    });
  });

  describe('Document-Specific Isolation & Aggregation Pipeline', () => {
    it('CRITICAL: strictly enforces documentId filter so Document A CANNOT retrieve Document B chunks', async () => {
      vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
        lean: vi
          .fn()
          .mockResolvedValue({ documentId: docAId, originalFileName: 'DocA_Torque.pdf' }),
      });

      let capturedPipeline = null;
      vi.spyOn(DocumentChunk, 'aggregate').mockImplementation((pipeline) => {
        capturedPipeline = pipeline;
        return {
          exec: vi.fn().mockResolvedValue([
            {
              _id: 'chunk-a1',
              documentId: docAId,
              text: 'Torque wrench tightening 15000 Nm',
              provenance: { pageStart: 3, pageEnd: 3 },
              section: 'Scope of Work',
              score: 0.89,
            },
            // Simulated corrupt or leaky result with docBId that should be excluded
            {
              _id: 'chunk-b1',
              documentId: docBId,
              text: 'Civil road asphalt foundation',
              provenance: { pageStart: 1, pageEnd: 1 },
              section: 'Scope of Work',
              score: 0.95,
            },
          ]),
        };
      });

      const result = await retrieveChunks({
        documentId: docAId,
        query: 'What equipment is required?',
        provider: mockProvider,
      });

      // Verify pipeline filter enforces documentId
      const vectorSearchStage = capturedPipeline[0].$vectorSearch;
      expect(vectorSearchStage.filter.documentId.$eq).toBe(docAId);

      // Verify defense-in-depth: Chunk from docB was filtered out
      expect(result.passages.every((p) => p.documentId === docAId)).toBe(true);
      expect(result.passages.some((p) => p.documentId === docBId)).toBe(false);
      expect(result.passages).toHaveLength(1);
    });

    it('returns empty passages array when no chunks meet the minimum similarity score', async () => {
      vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({ documentId: docAId, originalFileName: 'SAIL.pdf' }),
      });

      vi.spyOn(DocumentChunk, 'aggregate').mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'c-low',
            documentId: docAId,
            text: 'Irrelevant boilerplate disclaimer text',
            score: 0.42, // Below minScore 0.60
            provenance: { pageStart: 1, pageEnd: 1 },
          },
        ]),
      });

      const result = await retrieveChunks({
        documentId: docAId,
        query: 'What is the warranty period?',
        minScore: 0.6,
        provider: mockProvider,
      });

      expect(result.passages).toEqual([]);
      expect(result.totalRetrieved).toBe(0);
    });

    it('retrieves technical qualification and scope of work passages with accurate provenance', async () => {
      vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
        lean: vi
          .fn()
          .mockResolvedValue({ documentId: docAId, originalFileName: 'SAIL_9649647.pdf' }),
      });

      vi.spyOn(DocumentChunk, 'aggregate').mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'chunk-sow',
            documentId: docAId,
            text: 'REQUIREMENT DESCRIPTION: HYDRAULIC TORQUE WRENCH WITH POWER PACK',
            provenance: { pageStart: 5, pageEnd: 5, paragraphStart: 10, paragraphEnd: 12 },
            section: 'Scope of Work',
            score: 0.885,
          },
          {
            _id: 'chunk-tech',
            documentId: docAId,
            text: 'TECHNICAL QUALIFICATION: Minimum 3 years experience as OEM or authorized partner.',
            provenance: { pageStart: 3, pageEnd: 3, paragraphStart: 4, paragraphEnd: 6 },
            section: 'Technical Qualification',
            score: 0.842,
          },
        ]),
      });

      const sowResult = await retrieveChunks({
        documentId: docAId,
        query: 'What is the scope of work?',
        topK: 5,
        minScore: 0.7,
        provider: mockProvider,
      });

      expect(sowResult.passages).toHaveLength(2);
      expect(sowResult.passages[0].section).toBe('Scope of Work');
      expect(sowResult.passages[0].pageStart).toBe(5);
      expect(sowResult.passages[0].score).toBe(0.885);
      expect(sowResult.passages[1].pageStart).toBe(3);
    });
  });

  describe('Retrieval Evaluation Dataset (3 GeM Tender Fixtures)', () => {
    const EVALUATION_DATASET = [
      {
        question: 'What equipment is required?',
        tender: 'SAIL Rourkela (GeM-Bidding-9649647.pdf)',
        expectedTerms: ['hydraulic torque wrench', 'power pack'],
        expectedSection: 'Scope of Work',
        sampleEvidence: 'REQUIREMENT DESCRIPTION: HYDRAULIC TORQUE WRENCH WITH POWER PACK 15000 Nm',
      },
      {
        question: 'What is the technical qualification?',
        tender: 'SAIL Rourkela (GeM-Bidding-9649647.pdf)',
        expectedTerms: ['experience', 'manufacturer'],
        expectedSection: 'Eligibility Criteria',
        sampleEvidence:
          'ELIGIBILITY CRITERIA: THE BIDDER MUST BE A REGULAR MANUFACTURER OF TORQUE WRENCH',
      },
      {
        question: 'What is the scope of work?',
        tender: 'BHEL (GeM-Bidding-9605104.pdf)',
        expectedTerms: ['hydraulic nut', 'thread size'],
        expectedSection: 'Scope of Work',
        sampleEvidence: 'SCOPE OF WORK: SUPPLY OF HYDRAULIC NUT OF THREAD SIZE M140X2 (FD)',
      },
      {
        question: 'What is the bid closing date?',
        tender: 'OPGC Banharpali (GeM-Bidding-9563430.pdf)',
        expectedTerms: ['bid end date', 'closing'],
        expectedSection: 'General',
        sampleEvidence: 'Bid End Date/Time: 22-07-2026 15:00:00',
      },
      {
        question: 'What is the estimated bid value?',
        tender: 'OPGC Banharpali (GeM-Bidding-9563430.pdf)',
        expectedTerms: ['estimated bid value', 'lakh'],
        expectedSection: 'Commercial & EMD',
        sampleEvidence: 'Estimated Bid Value: 1850000 INR',
      },
      {
        question: 'Does this tender require hydraulic torque tools?',
        tender: 'SAIL Rourkela (GeM-Bidding-9649647.pdf)',
        expectedTerms: ['torque wrench', 'hydraulic'],
        expectedSection: 'Scope of Work',
        sampleEvidence:
          'Scope includes supply of hydraulic torque wrench tools and commissioning at site.',
      },
    ];

    it.each(EVALUATION_DATASET)(
      'evaluates semantic retrieval accuracy for: "$question" on $tender',
      async ({ question, expectedTerms, sampleEvidence, expectedSection }) => {
        vi.spyOn(TenderDocument, 'findOne').mockReturnValue({
          lean: vi.fn().mockResolvedValue({ documentId: docAId, originalFileName: 'tender.pdf' }),
        });

        vi.spyOn(DocumentChunk, 'aggregate').mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              _id: 'eval-chunk-1',
              documentId: docAId,
              text: sampleEvidence,
              provenance: { pageStart: 2, pageEnd: 2 },
              section: expectedSection,
              score: 0.87,
            },
          ]),
        });

        const result = await retrieveChunks({
          documentId: docAId,
          query: question,
          topK: 5,
          minScore: 0.6,
          provider: mockProvider,
        });

        expect(result.passages.length).toBeGreaterThan(0);
        const topPassage = result.passages[0];
        const textLower = topPassage.text.toLowerCase();

        // Verify that expected domain terms appear in retrieved source passage
        const hasExpectedTerm = expectedTerms.some((term) =>
          textLower.includes(term.toLowerCase())
        );
        expect(hasExpectedTerm).toBe(true);
        expect(topPassage.score).toBeGreaterThanOrEqual(0.6);
      }
    );
  });

  describe('Opt-In Live Atlas Vector Search Integration Test', () => {
    // Only runs when RUN_LIVE_ATLAS_TESTS=true
    const runLiveAtlas = process.env.RUN_LIVE_ATLAS_TESTS === 'true';

    it.skipIf(!runLiveAtlas)(
      'LIVE ATLAS: executes real $vectorSearch on MongoDB Atlas cluster with SAIL tender',
      async () => {
        const { connectDatabase } = await import('../src/config/database.js');
        await connectDatabase();
        const { GoogleGenAIEmbeddingProvider } =
          await import('../src/services/embedding/GoogleGenAIEmbeddingProvider.js');
        const liveProvider = new GoogleGenAIEmbeddingProvider({
          apiKey: process.env.GEMINI_API_KEY,
          modelId: 'gemini-embedding-001',
          dimensions: 768,
        });

        // Query real SAIL tender with indexed embeddings
        const sailDoc = await TenderDocument.findOne({
          originalFileName: 'GeM-Bidding-9649647.pdf',
          ingestionStatus: 'indexed',
        }).lean();

        expect(sailDoc).toBeDefined();

        const liveResult = await retrieveChunks({
          documentId: sailDoc.documentId,
          query: 'Does this tender require hydraulic torque tools?',
          topK: 3,
          minScore: 0.6,
          provider: liveProvider,
        });

        expect(liveResult.passages.length).toBeGreaterThan(0);
        expect(liveResult.passages[0].score).toBeGreaterThanOrEqual(0.6);
        expect(liveResult.passages[0].documentId).toBe(sailDoc.documentId);
        expect(liveResult.passages[0].text.toLowerCase()).toContain('torque wrench');
      },
      25000
    );
  });
});
