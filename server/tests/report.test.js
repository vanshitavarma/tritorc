import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { buildWorkbook, buildPrimaryRowValues } from '../src/services/report/buildWorkbook.js';
import { REPORT_COLUMNS, COLUMN_WIDTHS } from '../src/config/reportColumns.js';
import { extractPdfText } from '../src/services/extraction/pdfExtractor.js';
import { scanText } from '../src/services/matching/scanText.js';
import { classifyRelevance } from '../src/services/relevance/classifyRelevance.js';
import { extractTenderFields } from '../src/services/tender/extractTenderFields.js';
import { loadKeywords } from '../src/config/keywords.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');
const sampleWorkbookPath = path.resolve(
  __dirname,
  '../../docs/reference/sample_tender_scan_report.xlsx'
);

describe('Excel Report Generation (buildWorkbook)', () => {
  describe('Header & Layout Parity with Reference Sample', () => {
    it('produces an identical 24-column header row matching sample_tender_scan_report.xlsx', async () => {
      // 1. Read reference sample workbook
      const sampleWb = new ExcelJS.Workbook();
      await sampleWb.xlsx.readFile(sampleWorkbookPath);
      const sampleSheet = sampleWb.getWorksheet(1);
      const sampleHeaderValues = sampleSheet.getRow(1).values.slice(1); // 1-based indexing in ExcelJS

      // 2. Generate a fresh report buffer
      const buffer = await buildWorkbook([]);
      const generatedWb = new ExcelJS.Workbook();
      await generatedWb.xlsx.load(buffer);
      const generatedSheet = generatedWb.getWorksheet('Tender Scan Report');
      const generatedHeaderValues = generatedSheet.getRow(1).values.slice(1);

      expect(generatedHeaderValues).toHaveLength(24);
      expect(generatedHeaderValues).toEqual(sampleHeaderValues);
      expect(generatedHeaderValues).toEqual(REPORT_COLUMNS);
    });

    it('matches reference column widths across all 24 columns', async () => {
      const buffer = await buildWorkbook([]);
      const generatedWb = new ExcelJS.Workbook();
      await generatedWb.xlsx.load(buffer);
      const sheet = generatedWb.getWorksheet('Tender Scan Report');

      sheet.columns.forEach((col, idx) => {
        expect(col.width).toBe(COLUMN_WIDTHS[idx]);
      });
    });

    it('freezes panes at B2 (xSplit 1, ySplit 1) matching the sample layout', async () => {
      const buffer = await buildWorkbook([]);
      const generatedWb = new ExcelJS.Workbook();
      await generatedWb.xlsx.load(buffer);
      const sheet = generatedWb.getWorksheet('Tender Scan Report');

      expect(sheet.views).toBeDefined();
      expect(sheet.views[0].state).toBe('frozen');
      expect(sheet.views[0].xSplit).toBe(1);
      expect(sheet.views[0].ySplit).toBe(1);
      expect(sheet.views[0].topLeftCell).toBe('B2');
    });

    it('applies navy fill (#1E3A5F) and bold white text to the header row', async () => {
      const buffer = await buildWorkbook([]);
      const generatedWb = new ExcelJS.Workbook();
      await generatedWb.xlsx.load(buffer);
      const sheet = generatedWb.getWorksheet('Tender Scan Report');

      const cellA1 = sheet.getCell('A1');
      expect(cellA1.font.bold).toBe(true);
      expect(cellA1.font.name).toBe('Arial');
      expect(cellA1.font.color?.argb).toMatch(/1?FFFFFF/i);
      expect(cellA1.fill.fgColor?.argb).toMatch(/1E3A5F/i);
      expect(sheet.getRow(1).height).toBe(30);
    });
  });

  describe('buildPrimaryRowValues mapping & fallbacks', () => {
    it('formats a zero-match document with (none found) and 0', () => {
      const doc = {
        documentName: 'unrelated.pdf',
        status: 'scanned',
        matches: [],
        distinctCount: 0,
        relevance: 'Not Related',
        tenderFields: { 'Tender No': 'TND-001' },
      };

      const values = buildPrimaryRowValues(doc);
      expect(values[0]).toBe('unrelated.pdf'); // Document Name
      expect(values[2]).toBe('TND-001'); // Tender No
      expect(values[21]).toBe('(none found)'); // Matched Keywords
      expect(values[22]).toBe(0); // Match Count
      expect(values[23]).toBe('Not Related'); // Relevance
      expect(values[1]).toBe('Not Found'); // Tender ID missing -> Not Found
    });

    it('formats a multi-match document with comma-joined keywords and count', () => {
      const doc = {
        documentName: 'relevant.pdf',
        status: 'scanned',
        matches: [
          { keyword: 'Hydraulic torque wrench', hits: 6 },
          { keyword: 'Torque wrench', hits: 15 },
        ],
        distinctCount: 2,
        relevance: 'Possible',
        tenderFields: {},
      };

      const values = buildPrimaryRowValues(doc);
      expect(values[0]).toBe('relevant.pdf');
      expect(values[21]).toBe('Hydraulic torque wrench, Torque wrench');
      expect(values[22]).toBe(2);
      expect(values[23]).toBe('Possible');
    });

    it('handles a failed document gracefully without breaking columns', () => {
      const doc = {
        documentName: 'corrupt.pdf',
        status: 'failed',
        error: 'Unsupported file format',
      };

      const values = buildPrimaryRowValues(doc);
      expect(values[0]).toBe('corrupt.pdf');
      expect(values[21]).toBe('Unsupported file format');
      expect(values[22]).toBe(0);
      expect(values[23]).toBe('Not Assessed');
      expect(values[1]).toBe('Not Found');
      expect(values[2]).toBe('Not Found');
    });
  });

  describe('Verdict Fill Styling', () => {
    it('applies correct pastel fills for Related, Possible, Not Related and Not Assessed', async () => {
      const mockResults = [
        {
          documentName: 'doc_related.pdf',
          status: 'scanned',
          matches: [{ keyword: 'Bolt tensioner', hits: 10 }],
          distinctCount: 3,
          relevance: 'Related',
        },
        {
          documentName: 'doc_possible.pdf',
          status: 'scanned',
          matches: [{ keyword: 'Torque wrench', hits: 2 }],
          distinctCount: 1,
          relevance: 'Possible',
        },
        {
          documentName: 'doc_unrelated.pdf',
          status: 'scanned',
          matches: [],
          distinctCount: 0,
          relevance: 'Not Related',
        },
        {
          documentName: 'doc_failed.pdf',
          status: 'failed',
          error: 'File too large',
        },
      ];

      const buffer = await buildWorkbook(mockResults);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const sheet = wb.getWorksheet('Tender Scan Report');

      // Col X (24) is Relevance to Tritorc
      const cellRow2 = sheet.getCell('X2'); // Related
      expect(cellRow2.value).toBe('Related');
      expect(cellRow2.fill?.fgColor?.argb).toMatch(/D9F2D9/i);

      const cellRow3 = sheet.getCell('X3'); // Possible
      expect(cellRow3.value).toBe('Possible');
      expect(cellRow3.fill?.fgColor?.argb).toMatch(/FDEBD3/i);

      const cellRow4 = sheet.getCell('X4'); // Not Related
      expect(cellRow4.value).toBe('Not Related');
      expect(cellRow4.fill?.fgColor?.argb).toMatch(/F2F2F2/i);

      const cellRow5 = sheet.getCell('X5'); // Not Assessed
      expect(cellRow5.value).toBe('Not Assessed');
      expect(cellRow5.fill?.fgColor?.argb).toMatch(/FBE4E4/i);
    });
  });

  describe('Secondary Worksheets (Keyword Breakdown & AI Insights)', () => {
    it('generates Keyword Breakdown sheet with per-keyword hits and firstIndex', async () => {
      const mockResults = [
        {
          documentName: 'tender.pdf',
          status: 'scanned',
          matches: [
            { keyword: 'Hydraulic torque wrench', hits: 6, firstIndex: 120 },
            { keyword: 'Torque calibration', hits: 1, firstIndex: 450 },
          ],
        },
        {
          documentName: 'empty.pdf',
          status: 'scanned',
          matches: [],
        },
      ];

      const buffer = await buildWorkbook(mockResults);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const bdSheet = wb.getWorksheet('Keyword Breakdown');
      expect(bdSheet).toBeDefined();
      expect(bdSheet.getRow(1).values.slice(1)).toEqual([
        'Document Name',
        'Keyword',
        'Hits',
        'First Match Position',
      ]);

      // Row 2: tender.pdf - Hydraulic torque wrench
      expect(bdSheet.getRow(2).getCell(1).value).toBe('tender.pdf');
      expect(bdSheet.getRow(2).getCell(2).value).toBe('Hydraulic torque wrench');
      expect(bdSheet.getRow(2).getCell(3).value).toBe(6);
      expect(bdSheet.getRow(2).getCell(4).value).toBe(120);

      // Row 3: tender.pdf - Torque calibration
      expect(bdSheet.getRow(3).getCell(2).value).toBe('Torque calibration');

      // Row 4: empty.pdf - (none found)
      expect(bdSheet.getRow(4).getCell(1).value).toBe('empty.pdf');
      expect(bdSheet.getRow(4).getCell(2).value).toBe('(none found)');
      expect(bdSheet.getRow(4).getCell(3).value).toBe(0);
    });

    it('generates AI Insights sheet with strategic business intelligence', async () => {
      const mockResults = [
        {
          documentName: 'tender.pdf',
          relevance: 'Related',
          aiAnalysis: {
            semanticAssessment: 'High Bolting Relevance',
            aiExplanation: 'Tender specifies high-pressure hydraulic torque tools.',
            keyOpportunities: 'Hydraulic torque wrenches and power packs',
            risksAndUnknowns: 'Strict 15-day delivery window',
            recommendedFollowUp: 'Pursue commercial bid.',
          },
        },
      ];

      const buffer = await buildWorkbook(mockResults);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const aiSheet = wb.getWorksheet('AI Insights');
      expect(aiSheet).toBeDefined();
      expect(aiSheet.getRow(1).values.slice(1)).toEqual([
        'Document Name',
        'Baseline Verdict',
        'Hybrid Score (0-100)',
        'Hybrid Grade',
        'Score Breakdown (K/S/T/W)',
        'Semantic Assessment',
        'AI Relevance Explanation',
        'Key Opportunities',
        'Risks and Unknowns',
        'Recommended Human Follow-up',
      ]);

      expect(aiSheet.getRow(2).getCell(1).value).toBe('tender.pdf');
      expect(aiSheet.getRow(2).getCell(2).value).toBe('Related');
      expect(aiSheet.getRow(2).getCell(3).value).toBe(85);
      expect(aiSheet.getRow(2).getCell(4).value).toBe('Highly Relevant');
      expect(aiSheet.getRow(2).getCell(6).value).toBe('High Bolting Relevance');
      expect(aiSheet.getRow(2).getCell(7).value).toContain('hydraulic torque tools');
      expect(aiSheet.getRow(2).getCell(8).value).toContain('power packs');
      expect(aiSheet.getRow(2).getCell(9).value).toContain('15-day');
      expect(aiSheet.getRow(2).getCell(10).value).toBe('Pursue commercial bid.');
    });

    it('respects options to exclude secondary worksheets', async () => {
      const buffer = await buildWorkbook([], {
        includeBreakdown: false,
        includeAiInsights: false,
      });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      expect(wb.worksheets).toHaveLength(1);
      expect(wb.worksheets[0].name).toBe('Tender Scan Report');
    });
  });

  describe('End-to-End Pipeline Fixtures Integration', () => {
    it('accurately builds 24-column workbook from the 3 GeM PDFs scanned through the pipeline', async () => {
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

      // Build report buffer
      const buffer = await buildWorkbook(results);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(5000);

      // Reopen with ExcelJS
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const sheet = wb.getWorksheet('Tender Scan Report');

      expect(sheet.rowCount).toBe(4); // 1 header + 3 data rows

      // Row 2: OPGC (Not Related)
      const opgcRow = sheet.getRow(2);
      expect(opgcRow.getCell(1).value).toBe('GeM-Bidding-9563430.pdf');
      expect(opgcRow.getCell(3).value).toBe('GEM/2026/B/7748755'); // Tender No
      expect(opgcRow.getCell(4).value).toBe('Odisha Power Generation Corporation Limited'); // Authority
      expect(opgcRow.getCell(8).value).toBe('INR 721,570'); // Tender Amount
      expect(opgcRow.getCell(9).value).toBe('Not Required'); // EMD
      expect(opgcRow.getCell(22).value).toBe('(none found)'); // Matched Keywords
      expect(opgcRow.getCell(23).value).toBe(0); // Match Count
      expect(opgcRow.getCell(24).value).toBe('Not Related'); // Relevance
      expect(opgcRow.getCell(24).fill?.fgColor?.argb).toMatch(/F2F2F2/i);

      // Row 3: BHEL (Not Related on default 20 list)
      const bhelRow = sheet.getRow(3);
      expect(bhelRow.getCell(1).value).toBe('GeM-Bidding-9605104.pdf');
      expect(bhelRow.getCell(3).value).toBe('GEM/2026/B/7785415');
      expect(bhelRow.getCell(8).value).toBe('Not Found'); // Boilerplate rejected
      expect(bhelRow.getCell(22).value).toBe('(none found)');
      expect(bhelRow.getCell(23).value).toBe(0);
      expect(bhelRow.getCell(24).value).toBe('Not Related');

      // Row 4: SAIL (Related)
      const sailRow = sheet.getRow(4);
      expect(sailRow.getCell(1).value).toBe('GeM-Bidding-9649647.pdf');
      expect(sailRow.getCell(3).value).toBe('GEM/2026/B/7824594');
      expect(sailRow.getCell(4).value).toBe('Rourkela Steel Plant');
      expect(sailRow.getCell(8).value).toBe('Not Found');
      expect(sailRow.getCell(22).value).toContain('Hydraulic torque wrench');
      expect(sailRow.getCell(23).value).toBe(3); // 3 distinct matched keywords
      expect(sailRow.getCell(24).value).toBe('Related');
      expect(sailRow.getCell(24).fill?.fgColor?.argb).toMatch(/D9F2D9/i);
    });

    it('excludes rejected non-tenders from primary sheet and populates Processing Summary sheet', async () => {
      const mixedResults = [
        {
          documentName: 'GeM-Bidding-9649647.pdf',
          originalFileName: 'GeM-Bidding-9649647.pdf',
          documentType: 'TENDER',
          isValidTender: true,
          status: 'scanned',
          matches: [{ keyword: 'Hydraulic torque wrench', hits: 5 }],
          distinctCount: 1,
          relevance: 'Related',
          tenderFields: { 'Tender No': 'GEM/2026/B/7824594' },
        },
        {
          documentName: 'Tender_Keyword_Scanner_Assignment.pdf',
          originalFileName: 'Tender_Keyword_Scanner_Assignment.pdf',
          documentType: 'NON_TENDER',
          isValidTender: false,
          status: 'rejected',
          rejectionReason: 'Internship evaluation assignment detected',
          matches: [],
          distinctCount: 0,
          relevance: 'Not Assessed',
          tenderFields: {},
        },
      ];

      const buffer = await buildWorkbook(mixedResults);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      // 1. Primary sheet has only the valid tender
      const primarySheet = wb.getWorksheet('Tender Scan Report');
      expect(primarySheet.rowCount).toBe(2); // 1 header + 1 valid tender
      expect(primarySheet.getRow(2).getCell(1).value).toBe('GeM-Bidding-9649647.pdf');

      // 2. Processing Summary sheet has both documents
      const summarySheet = wb.getWorksheet('Processing Summary');
      expect(summarySheet).toBeDefined();
      expect(summarySheet.rowCount).toBe(3); // 1 header + 2 documents

      const rowValid = summarySheet.getRow(2);
      expect(rowValid.getCell(1).value).toBe('GeM-Bidding-9649647.pdf');
      expect(rowValid.getCell(2).value).toBe('TENDER');
      expect(rowValid.getCell(3).value).toBe('Accepted (Scanned)');

      const rowRejected = summarySheet.getRow(3);
      expect(rowRejected.getCell(1).value).toBe('Tender_Keyword_Scanner_Assignment.pdf');
      expect(rowRejected.getCell(2).value).toBe('NON_TENDER');
      expect(rowRejected.getCell(3).value).toBe('Rejected (Non-Tender)');
      expect(rowRejected.getCell(4).value).toContain('Internship evaluation');
    });
  });
});
