import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { scanStore } from '../src/services/scan/scanStore.js';

describe('Document and Scan Intelligence Endpoints', () => {
  const testScanId = 'scan-test-intelligence-123';
  const testDocId = 'doc-test-torque-456';

  beforeEach(() => {
    scanStore.clearAll();
    scanStore.saveScan(testScanId, {
      scanId: testScanId,
      scannedAt: new Date().toISOString(),
      totalFiles: 1,
      results: [
        {
          documentId: testDocId,
          documentName: 'Hydraulic Bolting Services Tender',
          originalFileName: 'tender_doc.pdf',
          documentType: 'TENDER',
          isValidTender: true,
          distinctCount: 4,
          totalHits: 15,
          relevance: 'Related',
          tenderFields: {
            'Tender Authority': 'SAIL Rourkela',
            'Tender No': 'GEM/2026/B/9649647',
            Location: 'Rourkela, Odisha',
          },
          aiAnalysis: {
            semanticAssessment: 'High Bolting Relevance',
          },
        },
      ],
    });
  });

  it('GET /api/scans returns paginated scan records', async () => {
    const res = await request(app).get('/api/scans').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.scans).toBeInstanceOf(Array);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.page).toBe(1);
  });

  it('GET /api/documents/:documentId returns document metadata', async () => {
    const res = await request(app).get(`/api/documents/${testDocId}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.documentName).toBe('Hydraulic Bolting Services Tender');
    expect(res.body.data.tenderFields.Location).toBe('Rourkela, Odisha');
  });

  it('POST /api/documents/:documentId/chat requires valid message', async () => {
    const res = await request(app)
      .post(`/api/documents/${testDocId}/chat`)
      .send({ message: '' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('POST /api/documents/:documentId/chat returns grounded response', async () => {
    const res = await request(app)
      .post(`/api/documents/${testDocId}/chat`)
      .send({ message: 'What equipment is required?' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeDefined();
    expect(res.body.data.citations).toBeInstanceOf(Array);
  });
});
