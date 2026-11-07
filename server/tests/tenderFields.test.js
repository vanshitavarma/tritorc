import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatDate,
  formatAmount,
  formatEmd,
  formatTabName,
  extractConsigneeDetails,
  buildTenderSummary,
  NOT_FOUND,
} from '../src/config/tenderFields.js';
import { REPORT_COLUMNS, EXTRACTED_TENDER_FIELDS } from '../src/config/reportColumns.js';
import { extractTenderFields, readField } from '../src/services/tender/extractTenderFields.js';
import { extractPdfText } from '../src/services/extraction/pdfExtractor.js';
import { extractDocxText } from '../src/services/extraction/docxExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('Tender Field Extraction & Configuration', () => {
  describe('Report Column Definitions', () => {
    it('defines exactly 24 report columns matching the reference sample', () => {
      expect(REPORT_COLUMNS).toHaveLength(24);
      expect(REPORT_COLUMNS[0]).toBe('Document Name');
      expect(REPORT_COLUMNS[1]).toBe('Tender ID');
      expect(REPORT_COLUMNS[2]).toBe('Tender No');
      expect(REPORT_COLUMNS[3]).toBe('Tender Authority');
      expect(REPORT_COLUMNS[21]).toBe('Matched Keywords');
      expect(REPORT_COLUMNS[22]).toBe('Match Count');
      expect(REPORT_COLUMNS[23]).toBe('Relevance to Tritorc');
    });

    it('contains exactly 20 extracted tender fields (excluding 4 scan metadata columns)', () => {
      expect(EXTRACTED_TENDER_FIELDS).toHaveLength(20);
      expect(EXTRACTED_TENDER_FIELDS).not.toContain('Document Name');
      expect(EXTRACTED_TENDER_FIELDS).not.toContain('Matched Keywords');
      expect(EXTRACTED_TENDER_FIELDS).not.toContain('Match Count');
      expect(EXTRACTED_TENDER_FIELDS).not.toContain('Relevance to Tritorc');
    });
  });

  describe('Transform & Normalization Helpers', () => {
    describe('formatDate', () => {
      it('converts DD-MM-YYYY to DD-Mon-YYYY', () => {
        expect(formatDate('22-07-2026')).toBe('22-Jul-2026');
        expect(formatDate('27-07-2026')).toBe('27-Jul-2026');
        expect(formatDate('03-08-2026')).toBe('03-Aug-2026');
        expect(formatDate('01-01-2025')).toBe('01-Jan-2025');
        expect(formatDate('31-12-2024')).toBe('31-Dec-2024');
      });

      it('returns Not Found for invalid, missing, or out-of-range dates', () => {
        expect(formatDate(null)).toBe(NOT_FOUND);
        expect(formatDate('')).toBe(NOT_FOUND);
        expect(formatDate('2026-07-22')).toBe(NOT_FOUND);
        expect(formatDate('32-13-2026')).toBe(NOT_FOUND);
        expect(formatDate('arbitrary text')).toBe(NOT_FOUND);
      });
    });

    describe('formatAmount', () => {
      it('formats valid integer amounts with INR prefix and digit grouping', () => {
        expect(formatAmount('721570')).toBe('INR 721,570');
        expect(formatAmount('1000000')).toBe('INR 1,000,000');
        expect(formatAmount(50000)).toBe('INR 50,000');
      });

      it('returns Not Found for missing, empty, zero, or non-numeric boilerplate', () => {
        expect(formatAmount(null)).toBe(NOT_FOUND);
        expect(formatAmount('')).toBe(NOT_FOUND);
        expect(formatAmount('0')).toBe(NOT_FOUND);
        expect(formatAmount('solely for the purpose of guidance on EMD amount')).toBe(NOT_FOUND);
      });
    });

    describe('formatEmd', () => {
      it('returns Not Required when explicitly No', () => {
        expect(formatEmd('No')).toBe('Not Required');
        expect(formatEmd('no')).toBe('Not Required');
        expect(formatEmd(' NO ')).toBe('Not Required');
      });

      it('returns Required (see document) when Yes', () => {
        expect(formatEmd('Yes')).toBe('Required (see document)');
        expect(formatEmd('yes')).toBe('Required (see document)');
      });

      it('returns Not Found when ambiguous or missing', () => {
        expect(formatEmd(null)).toBe(NOT_FOUND);
        expect(formatEmd('')).toBe(NOT_FOUND);
        expect(formatEmd('NA')).toBe(NOT_FOUND);
      });
    });

    describe('formatTabName', () => {
      it('filters out Hindi text and joins English categories with commas', () => {
        const raw = 'Cutting Tools\nShaping Machine\nएमएसएमई\tएमएसएमई';
        expect(formatTabName(raw)).toBe('Cutting Tools, Shaping Machine');
      });

      it('returns Not Found if all lines are non-English or empty', () => {
        expect(formatTabName('')).toBe(NOT_FOUND);
        expect(formatTabName('   ')).toBe(NOT_FOUND);
        expect(formatTabName('एमएसएमई')).toBe(NOT_FOUND);
      });
    });

    describe('extractConsigneeDetails', () => {
      it('extracts consignee pin and location from address text with state', () => {
        const text = `Consignees/Reporting Officer\n1 \tAshis Mohapatra \t768234,BANHARPALI \t1 \t30\nBuyer Added Bid Specific`;
        const { consigneeAddress, location } = extractConsigneeDetails(text);
        expect(consigneeAddress).toBe('768234,BANHARPALI');
        expect(location).toBe('BANHARPALI, Odisha');
      });

      it('returns Not Found when no pincode address block is present', () => {
        const { consigneeAddress, location } = extractConsigneeDetails(
          'Random document text without consignee info'
        );
        expect(consigneeAddress).toBe(NOT_FOUND);
        expect(location).toBe(NOT_FOUND);
      });
    });

    describe('buildTenderSummary', () => {
      it('creates factual template sentence without generative hallucination', () => {
        const summary = buildTenderSummary({
          itemCategory: 'TUBE BEVELING MACHINE',
          totalQuantity: '1',
          typeOfBid: 'Two Packet Bid',
        });
        expect(summary).toBe(
          'Tender for TUBE BEVELING MACHINE (Total Quantity: 1) via Two Packet Bid.'
        );
      });

      it('returns Not Found when itemCategory is absent', () => {
        expect(buildTenderSummary({ itemCategory: NOT_FOUND })).toBe(NOT_FOUND);
      });
    });
  });

  describe('readField declarative parser', () => {
    it('applies pattern and transform correctly', () => {
      const def = {
        column: 'Test',
        pattern: /Value:\s*(\w+)/i,
        transform: (m) => m[1].toUpperCase(),
      };
      expect(readField('Value: active', def)).toBe('ACTIVE');
    });

    it('falls back when pattern misses and fallbackTransform is defined', () => {
      const def = {
        column: 'Test',
        pattern: /Missing:\s*(\w+)/i,
        transform: (m) => m[1],
        fallbackTransform: (ctx) => ctx.fallbackVal || NOT_FOUND,
      };
      expect(readField('Text without match', def, { fallbackVal: 'Fallback' })).toBe('Fallback');
    });

    it('returns Not Found when pattern misses and no fallback is defined', () => {
      const def = {
        column: 'Test',
        pattern: /Missing:\s*(\w+)/i,
        transform: (m) => m[1],
      };
      expect(readField('Text without match', def)).toBe(NOT_FOUND);
    });

    it('safely handles null definition or thrown errors', () => {
      expect(readField('text', null)).toBe(NOT_FOUND);
      const throwingDef = {
        column: 'Throw',
        pattern: /Test/,
        transform: () => {
          throw new Error('Boom');
        },
      };
      expect(readField('Test', throwingDef)).toBe(NOT_FOUND);
    });
  });

  describe('Golden Integration Tests on GeM Fixtures', () => {
    it('accurately extracts tender fields from OPGC bid (GeM-Bidding-9563430.pdf)', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'GeM-Bidding-9563430.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'GeM-Bidding-9563430.pdf',
      });
      const fields = extractTenderFields(text);

      expect(fields['Tender No']).toBe('GEM/2026/B/7748755');
      expect(fields['Tender Authority']).toBe('Odisha Power Generation Corporation Limited');
      expect(fields['Opening Date']).toBe('22-Jul-2026');
      expect(fields['Closing Date']).toBe('22-Jul-2026');
      expect(fields['Tender Amount']).toBe('INR 721,570');
      expect(fields['EMD']).toBe('Not Required');
      expect(fields['Email']).toBe('mohit.murmu@opgc.co.in');
      expect(fields['Location']).toBe('BANHARPALI, Odisha');
      expect(fields['Tab Name']).toBe('Cutting Tools, Shaping Machine');
      expect(fields['Tender Description']).toBe('TUBE BEVELING MACHINE');
      expect(fields['Scope of Work']).toBe('TUBE BEVELING MACHINE');
      expect(fields['Technical Qualification']).toBe(NOT_FOUND);
      expect(fields['Purchaser Address']).toBe(
        'Opgc Banharpali, Odisha Power Generation Corporation Limited, 768234,BANHARPALI'
      );
      expect(fields['Tender Summary']).toBe(
        'Tender for TUBE BEVELING MACHINE (Total Quantity: 1) via Two Packet Bid.'
      );

      // Invariant fields never in GeM
      expect(fields['Tender ID']).toBe(NOT_FOUND);
      expect(fields['Document Cost']).toBe(NOT_FOUND);
      expect(fields['Tender Fee']).toBe(NOT_FOUND);
      expect(fields['Financial Qualification']).toBe(NOT_FOUND);
      expect(fields['Corrigendum']).toBe(NOT_FOUND);
      expect(fields['Website']).toBe(NOT_FOUND);
    });

    it('accurately extracts tender fields from BHEL bid (GeM-Bidding-9605104.pdf)', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'GeM-Bidding-9605104.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'GeM-Bidding-9605104.pdf',
      });
      const fields = extractTenderFields(text);

      expect(fields['Tender No']).toBe('GEM/2026/B/7785415');
      expect(fields['Tender Authority']).toBe('Bharat Heavy Electricals Limited (bhel)');
      expect(fields['Opening Date']).toBe('27-Jul-2026');
      expect(fields['Closing Date']).toBe('27-Jul-2026');
      // Crucial requirement: Estimated Bid Value boilerplate MUST NOT be captured as amount
      expect(fields['Tender Amount']).toBe(NOT_FOUND);
      expect(fields['EMD']).toBe('Not Required');
      expect(fields['Email']).toBe('ksantosh@bhel.in');
      expect(fields['Location']).toBe('INDIRA GANDHI COMPLEX, Tamil Nadu');
      expect(fields['Tab Name']).toBe('Rivet Nut (BHEL)');
      expect(fields['Tender Description']).toBe('HYDRAULIC NUT OF THREAD SIZE M140X2 (FD)');
      expect(fields['Scope of Work']).toBe('HYDRAULIC NUT OF THREAD SIZE M140X2 (FD)');
      expect(fields['Technical Qualification']).toBe(NOT_FOUND);
      expect(fields['Purchaser Address']).toBe(
        'Boiler Auxiliaries Plant Ranipet, Bharat Heavy Electricals Limited (bhel), 632406,INDIRA GANDHI COMPLEX'
      );
      expect(fields['Tender Summary']).toBe(
        'Tender for HYDRAULIC NUT OF THREAD SIZE M140X2 (FD) (Total Quantity: 9) via Single Packet Bid.'
      );
      expect(fields['Tender ID']).toBe(NOT_FOUND);
      expect(fields['Document Cost']).toBe(NOT_FOUND);
      expect(fields['Tender Fee']).toBe(NOT_FOUND);
      expect(fields['Financial Qualification']).toBe(NOT_FOUND);
      expect(fields['Corrigendum']).toBe(NOT_FOUND);
      expect(fields['Website']).toBe(NOT_FOUND);
    });

    it('accurately extracts tender fields from SAIL bid (GeM-Bidding-9649647.pdf)', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'GeM-Bidding-9649647.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'GeM-Bidding-9649647.pdf',
      });
      const fields = extractTenderFields(text);

      expect(fields['Tender No']).toBe('GEM/2026/B/7824594');
      expect(fields['Tender Authority']).toBe('Rourkela Steel Plant');
      expect(fields['Opening Date']).toBe('03-Aug-2026');
      expect(fields['Closing Date']).toBe('03-Aug-2026');
      expect(fields['Tender Amount']).toBe(NOT_FOUND);
      expect(fields['EMD']).toBe('Not Required');
      expect(fields['Email']).toBe('buyer26.rsp.or@gembuyer.in');
      expect(fields['Location']).toBe('Rourkela, Odisha');
      expect(fields['Tab Name']).toBe('Hydraulic Torque Wrench Set');
      expect(fields['Tender Description']).toBe('HYDRAULIC TORQUE WRENCH WITH POWER PACK');
      expect(fields['Scope of Work']).toBe('HYDRAULIC TORQUE WRENCH WITH POWER PACK');
      expect(fields['Technical Qualification']).toContain(
        'FIRM MUST BE A MANUFACTURER OR TORQUE WRENCH'
      );
      expect(fields['Purchaser Address']).toBe(
        'Materials Management Purchase, Rourkela Steel Plant, 769011,Office of GM I/c Stores & Inspection, Rourkela Steel Plant, Rourkela'
      );
      expect(fields['Tender Summary']).toBe(
        'Tender for HYDRAULIC TORQUE WRENCH WITH POWER PACK (Total Quantity: 1) via Two Packet Bid.'
      );
      expect(fields['Tender ID']).toBe(NOT_FOUND);
      expect(fields['Document Cost']).toBe(NOT_FOUND);
      expect(fields['Tender Fee']).toBe(NOT_FOUND);
      expect(fields['Financial Qualification']).toBe(NOT_FOUND);
      expect(fields['Corrigendum']).toBe(NOT_FOUND);
      expect(fields['Website']).toBe(NOT_FOUND);
    });

    it('returns Not Found for all fields when scanning non-GeM DOCX document', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'civil_works.docx'));
      const { text } = await extractDocxText({ buffer: buf, originalName: 'civil_works.docx' });
      const fields = extractTenderFields(text);

      for (const col of EXTRACTED_TENDER_FIELDS) {
        expect(fields[col]).toBe(NOT_FOUND);
      }
    });
  });
});
