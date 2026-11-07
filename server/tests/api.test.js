import { describe, it, expect } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import app from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('Scan REST API Integration Tests', () => {
  describe('GET /api/keywords', () => {
    it('returns the active default 20 keywords', async () => {
      const res = await request(app).get('/api/keywords');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.total).toBe(20);
      expect(res.body.data.keywords).toContain('Hydraulic torque wrench');
      expect(res.body.data.keywords).toContain('Bolt tensioner');
    });
  });

  describe('POST /api/scans', () => {
    it('returns 400 when no files are attached', async () => {
      const res = await request(app).post('/api/scans');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('NO_FILES');
      expect(res.body.error.code).toBe('NO_FILES');
    });

    it('rejects unsupported file formats (.txt) with an error', async () => {
      const res = await request(app)
        .post('/api/scans')
        .attach('files', Buffer.from('invalid file content'), 'sample.txt');

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('UNSUPPORTED_FORMAT');
      expect(res.body.error.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('scans multi-file batch with GeM PDFs and returns 201 with verdicts', async () => {
      const sailPath = path.join(fixturesDir, 'GeM-Bidding-9649647.pdf');
      const opgcPath = path.join(fixturesDir, 'GeM-Bidding-9563430.pdf');

      const res = await request(app)
        .post('/api/scans')
        .attach('files', sailPath)
        .attach('files', opgcPath);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Tender scan completed');
      expect(res.body.data.scanId).toBeDefined();
      expect(res.body.data.totalFiles).toBe(2);
      expect(res.body.data.summary).toEqual({ total: 2, successful: 2, failed: 0 });
      expect(res.body.data.results).toHaveLength(2);

      const sailResult = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('9649647')
      );
      expect(sailResult).toBeDefined();
      expect(sailResult.originalFileName).toContain('9649647');
      expect(sailResult.documentName).toContain('SAIL');
      expect(sailResult.relevance).toBe('Related');
      expect(sailResult.distinctCount).toBe(3);

      const opgcResult = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('9563430')
      );
      expect(opgcResult).toBeDefined();
      expect(opgcResult.originalFileName).toContain('9563430');
      expect(opgcResult.documentName).toContain('OPGC');
      expect(opgcResult.relevance).toBe('Not Related');
      expect(opgcResult.distinctCount).toBe(0);

      // Verify report URL is returned
      expect(res.body.data.reportUrl).toBe(`/api/scans/${res.body.data.scanId}/report`);
    });

    it('scans all three GeM PDFs simultaneously in a batch with independent results', async () => {
      const sailPath = path.join(fixturesDir, 'GeM-Bidding-9649647.pdf');
      const opgcPath = path.join(fixturesDir, 'GeM-Bidding-9563430.pdf');
      const bhelPath = path.join(fixturesDir, 'GeM-Bidding-9605104.pdf');

      const res = await request(app)
        .post('/api/scans')
        .attach('files', sailPath)
        .attach('files', opgcPath)
        .attach('files', bhelPath);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toEqual({ total: 3, successful: 3, failed: 0 });
      expect(res.body.data.results).toHaveLength(3);

      const sail = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('9649647')
      );
      const opgc = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('9563430')
      );
      const bhel = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('9605104')
      );

      expect(sail).toBeDefined();
      expect(sail.status).toBe('scanned');
      expect(sail.relevance).toBe('Related');

      expect(opgc).toBeDefined();
      expect(opgc.status).toBe('scanned');
      expect(opgc.relevance).toBe('Not Related');

      expect(bhel).toBeDefined();
      expect(bhel.status).toBe('scanned');
      expect(bhel.relevance).toBe('Not Related');
    });

    it('isolates corrupt file failure without failing the entire batch', async () => {
      const validDocx = path.join(fixturesDir, 'civil_works.docx');
      const corruptPdfBuffer = Buffer.from('%PDF-1.4\ncorrupted content that fails parsing');

      const res = await request(app)
        .post('/api/scans')
        .attach('files', validDocx)
        .attach('files', corruptPdfBuffer, 'broken.pdf');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toEqual({ total: 2, successful: 1, failed: 1 });
      expect(res.body.data.results).toHaveLength(2);

      const validResult = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('civil_works')
      );
      expect(validResult.status).toBe('scanned');

      const brokenResult = res.body.data.results.find((r) =>
        (r.originalFileName || r.documentName).includes('broken')
      );
      expect(brokenResult.status).toBe('failed');
      expect(brokenResult.relevance).toBe('Not Assessed');
    });
  });

  describe('GET /api/scans/:id and GET /api/scans/:id/report', () => {
    it('retrieves scan record by ID', async () => {
      // First create a scan
      const docxPath = path.join(fixturesDir, 'relevant_sow.docx');
      const uploadRes = await request(app).post('/api/scans').attach('files', docxPath);

      const scanId = uploadRes.body.data.scanId;

      const getRes = await request(app).get(`/api/scans/${scanId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.scanId).toBe(scanId);
      expect(getRes.body.data.results).toHaveLength(1);
    });

    it('returns 404 for non-existent scan ID', async () => {
      const res = await request(app).get('/api/scans/non-existent-scan-id');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('downloads the generated Excel report with correct spreadsheet MIME type', async () => {
      const docxPath = path.join(fixturesDir, 'relevant_sow.docx');
      const uploadRes = await request(app).post('/api/scans').attach('files', docxPath);

      const scanId = uploadRes.body.data.scanId;

      const reportRes = await request(app)
        .get(`/api/scans/${scanId}/report`)
        .buffer(true)
        .parse((res, callback) => {
          const data = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(data)));
        });
      expect(reportRes.status).toBe(200);
      expect(reportRes.header['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(reportRes.header['content-disposition']).toContain('attachment');
      expect(reportRes.header['content-disposition']).toContain('.xlsx');
      expect(reportRes.body.length).toBeGreaterThan(1000);
    });

    it('returns 404 when downloading report for invalid scan ID', async () => {
      const res = await request(app).get('/api/scans/invalid-id/report');
      expect(res.status).toBe(404);
    });
  });
});
