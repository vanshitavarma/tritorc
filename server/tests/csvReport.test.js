import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../src/app.js';
import {
  buildCsvReport,
  escapeCsvCell,
  serializeCsvRow,
  UTF8_BOM,
} from '../src/services/report/buildCsv.js';
import { REPORT_COLUMNS } from '../src/config/reportColumns.js';
import { extractPdfText } from '../src/services/extraction/pdfExtractor.js';
import { scanText } from '../src/services/matching/scanText.js';
import { classifyRelevance } from '../src/services/relevance/classifyRelevance.js';
import { extractTenderFields } from '../src/services/tender/extractTenderFields.js';
import { loadKeywords } from '../src/config/keywords.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

/**
 * Standard RFC 4180 CSV parser for testing
 */
function parseRfc4180Csv(csvText) {
  // Strip BOM if present
  const clean = csvText.startsWith(UTF8_BOM) ? csvText.slice(UTF8_BOM.length) : csvText;
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++; // skip \n
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out any trailing empty row from final newline
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

describe('CSV Report Generation & RFC 4180 Compliance', () => {
  describe('Cell & Row Serializer', () => {
    it('escapes cells containing commas, quotes, and newlines', () => {
      expect(escapeCsvCell('simple')).toBe('simple');
      expect(escapeCsvCell('with, comma')).toBe('"with, comma"');
      expect(escapeCsvCell('with "quotes"')).toBe('"with ""quotes"""');
      expect(escapeCsvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
      expect(escapeCsvCell('comma, and "quotes"\nmultiline')).toBe(
        '"comma, and ""quotes""\nmultiline"'
      );
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
      expect(escapeCsvCell(42)).toBe('42');
    });

    it('serializes a row of values joined by commas', () => {
      const row = ['Doc1.pdf', 'Not Found', 'GEM/2026', 'Tritorc, Tools'];
      expect(serializeCsvRow(row)).toBe('Doc1.pdf,Not Found,GEM/2026,"Tritorc, Tools"');
    });
  });

  describe('buildCsvReport structure & headers', () => {
    it('prepends UTF-8 BOM (0xEF, 0xBB, 0xBF) for Excel compatibility', () => {
      const buffer = buildCsvReport([]);
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('contains the exact 24 headers in exact order', () => {
      const buffer = buildCsvReport([]);
      const text = buffer.toString('utf-8');
      const rows = parseRfc4180Csv(text);

      expect(rows).toHaveLength(1); // header row only
      expect(rows[0]).toHaveLength(24);
      expect(rows[0]).toEqual(REPORT_COLUMNS);
    });

    it('formats a zero-match document with (none found) and 0 count', () => {
      const doc = {
        documentName: 'unrelated.pdf',
        status: 'scanned',
        matches: [],
        distinctCount: 0,
        relevance: 'Not Related',
        tenderFields: { 'Tender No': 'TND-001' },
      };

      const buffer = buildCsvReport([doc]);
      const rows = parseRfc4180Csv(buffer.toString('utf-8'));

      expect(rows).toHaveLength(2); // header + 1 data row
      const dataRow = rows[1];
      expect(dataRow).toHaveLength(24);
      expect(dataRow[0]).toBe('unrelated.pdf');
      expect(dataRow[2]).toBe('TND-001');
      expect(dataRow[21]).toBe('(none found)');
      expect(dataRow[22]).toBe('0');
      expect(dataRow[23]).toBe('Not Related');
      expect(dataRow[1]).toBe('Not Found'); // Tender ID missing
    });

    it('formats a multi-match document preserving full descriptions', () => {
      const doc = {
        documentName: 'relevant.pdf',
        status: 'scanned',
        matches: [
          { keyword: 'Hydraulic torque wrench', hits: 6 },
          { keyword: 'Torque wrench', hits: 15 },
        ],
        distinctCount: 2,
        relevance: 'Related',
        tenderFields: {
          'Scope of Work':
            'Complete mechanical bolting, flange alignment, and torque tightening.\nIncludes high-pressure power packs.',
        },
      };

      const buffer = buildCsvReport([doc]);
      const rows = parseRfc4180Csv(buffer.toString('utf-8'));

      const dataRow = rows[1];
      expect(dataRow[21]).toBe('Hydraulic torque wrench, Torque wrench');
      expect(dataRow[22]).toBe('2');
      expect(dataRow[23]).toBe('Related');
      // Preserves multiline text in Scope of Work
      expect(dataRow[14]).toContain('flange alignment');
      expect(dataRow[14]).toContain('\nIncludes high-pressure');
    });

    it('excludes rejected non-tenders from CSV rows', () => {
      const mixed = [
        {
          documentName: 'valid.pdf',
          status: 'scanned',
          documentType: 'TENDER',
          isValidTender: true,
          matches: [],
          distinctCount: 0,
          relevance: 'Not Related',
          tenderFields: { 'Tender No': 'TND-001' },
        },
        {
          documentName: 'assignment.pdf',
          status: 'rejected',
          documentType: 'NON_TENDER',
          isValidTender: false,
          matches: [],
          distinctCount: 0,
          relevance: 'Not Assessed',
          tenderFields: {},
        },
      ];

      const buffer = buildCsvReport(mixed);
      const rows = parseRfc4180Csv(buffer.toString('utf-8'));
      expect(rows).toHaveLength(2); // 1 header + 1 valid tender row (assignment excluded)
      expect(rows[1][0]).toBe('valid.pdf');
    });
  });

  describe('Integration with 3 GeM PDFs', () => {
    it('produces valid 24-column CSV records for OPGC, BHEL, and SAIL', async () => {
      const keywords = await loadKeywords();
      const files = [
        'GeM-Bidding-9563430.pdf', // OPGC
        'GeM-Bidding-9605104.pdf', // BHEL
        'GeM-Bidding-9649647.pdf', // SAIL
      ];

      const results = [];
      for (const fileName of files) {
        const buf = fs.readFileSync(path.join(fixturesDir, fileName));
        const { text } = await extractPdfText({ buffer: buf, originalName: fileName });
        const scan = scanText(text, keywords);
        const relevance = classifyRelevance(scan);
        const tenderFields = extractTenderFields(text);

        results.push({
          documentName: fileName,
          status: 'scanned',
          matches: scan.matches,
          distinctCount: scan.distinctCount,
          totalHits: scan.totalHits,
          relevance,
          tenderFields,
        });
      }

      const csvBuffer = buildCsvReport(results);
      const csvText = csvBuffer.toString('utf-8');
      const rows = parseRfc4180Csv(csvText);

      expect(rows).toHaveLength(4); // 1 header + 3 tenders

      // Every record has exactly 24 columns
      rows.forEach((r) => {
        expect(r).toHaveLength(24);
      });

      // OPGC Row (row index 1)
      const opgc = rows[1];
      expect(opgc[0]).toBe('GeM-Bidding-9563430.pdf');
      expect(opgc[2]).toBe('GEM/2026/B/7748755');
      expect(opgc[3]).toBe('Odisha Power Generation Corporation Limited');
      expect(opgc[7]).toBe('INR 721,570');
      expect(opgc[8]).toBe('Not Required');
      expect(opgc[21]).toBe('(none found)');
      expect(opgc[22]).toBe('0');
      expect(opgc[23]).toBe('Not Related');

      // BHEL Row (row index 2)
      const bhel = rows[2];
      expect(bhel[0]).toBe('GeM-Bidding-9605104.pdf');
      expect(bhel[2]).toBe('GEM/2026/B/7785415');
      expect(bhel[7]).toBe('Not Found'); // Boilerplate rejected
      expect(bhel[21]).toBe('(none found)');
      expect(bhel[22]).toBe('0');
      expect(bhel[23]).toBe('Not Related');

      // SAIL Row (row index 3)
      const sail = rows[3];
      expect(sail[0]).toBe('GeM-Bidding-9649647.pdf');
      expect(sail[2]).toBe('GEM/2026/B/7824594');
      expect(sail[3]).toBe('Rourkela Steel Plant');
      expect(sail[21]).toContain('Hydraulic torque wrench');
      expect(sail[22]).toBe('3');
      expect(sail[23]).toBe('Related');
      // Full technical qualification preserved
      expect(sail[12]).toContain('FIRM MUST BE A MANUFACTURER OR TORQUE WRENCH');
    });
  });

  describe('REST API CSV Endpoints', () => {
    it('downloads CSV report via GET /api/scans/:id/csv with correct headers and filename', async () => {
      const docxPath = path.join(fixturesDir, 'relevant_sow.docx');
      const uploadRes = await request(app).post('/api/scans').attach('files', docxPath);

      expect(uploadRes.status).toBe(201);
      const scanId = uploadRes.body.data.scanId;
      expect(uploadRes.body.data.csvReportUrl).toBe(`/api/scans/${scanId}/csv`);

      const csvRes = await request(app).get(`/api/scans/${scanId}/csv`);
      expect(csvRes.status).toBe(200);
      expect(csvRes.header['content-type']).toContain('text/csv');

      const today = new Date().toISOString().slice(0, 10);
      expect(csvRes.header['content-disposition']).toContain(`TenderIQ_Scan_Report_${today}.csv`);

      // Verify BOM is present in binary response
      const text = csvRes.text;
      expect(text.startsWith(UTF8_BOM)).toBe(true);

      const rows = parseRfc4180Csv(text);
      expect(rows[0]).toEqual(REPORT_COLUMNS);
      // Column 1 is intelligent Document Name (human-readable title)
      expect(rows[1][0]).toBe('Relevant SOW');
      expect(rows[1][23]).toBe('Related');
    });

    it('downloads CSV report via GET /api/scans/:id/report?format=csv', async () => {
      const docxPath = path.join(fixturesDir, 'relevant_sow.docx');
      const uploadRes = await request(app).post('/api/scans').attach('files', docxPath);

      const scanId = uploadRes.body.data.scanId;
      const res = await request(app).get(`/api/scans/${scanId}/report?format=csv`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
    });
  });
});
