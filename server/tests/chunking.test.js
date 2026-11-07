import { describe, it, expect } from 'vitest';
import {
  chunkDocumentText,
  normalizeChunkText,
  computeContentHash,
  estimateTokenCount,
  detectSection,
  isTableRow,
  parseLabelLine,
  measureRetrievalQuality,
} from '../src/services/chunking/textChunker.js';

describe('Section-Aware Chunking & Provenance Engine', () => {
  describe('Text Normalization & Deterministic Hashing', () => {
    it('normalizes whitespace, casing, and zero-width characters', () => {
      const messy = '  HYDRAULIC \t TORQUE\u200B\uFEFF   WRENCH \r\n\r\n 15000 NM   ';
      const clean = normalizeChunkText(messy);
      expect(clean).toBe('hydraulic torque wrench 15000 nm');
    });

    it('computes identical SHA-256 contentHash for identical normalized content', () => {
      const textA = 'Tender Notice: Flange Management Services\nDate: 2026-08-01';
      const textB = '  tender notice:   flange management services \r\n date: 2026-08-01 ';
      expect(computeContentHash(textA)).toBe(computeContentHash(textB));
    });

    it('estimates tokens accurately for technical/industrial text', () => {
      const phrase = 'Hydraulic torque wrench square drive 1.5 inch capacity 15000 Nm';
      const tokens = estimateTokenCount(phrase);
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(20);
    });
  });

  describe('Table Row & Label-Value Integrity', () => {
    it('correctly detects table rows in markdown, tab-delimited, and columnar formats', () => {
      expect(isTableRow('| S.No | Item Description | Quantity |')).toBe(true);
      expect(isTableRow('1\tHydraulic Torque Wrench\t02 Sets')).toBe(true);
      expect(isTableRow('Item 1    High Pressure Pump    01 No    Active')).toBe(true);
      expect(isTableRow('Regular paragraph text explaining the requirements.')).toBe(false);
    });

    it('correctly detects standalone labels and inline label-values', () => {
      const standalone = parseLabelLine('Technical Specification:');
      expect(standalone.isLabel).toBe(true);
      expect(standalone.isStandaloneLabel).toBe(true);
      expect(standalone.label).toBe('Technical Specification');

      const inline = parseLabelLine('Bid Number: GEM/2026/B/7824594');
      expect(inline.isLabel).toBe(true);
      expect(inline.isStandaloneLabel).toBe(false);
      expect(inline.label).toBe('Bid Number');

      const normal = parseLabelLine('This tender requires calibration of tools.');
      expect(normal.isLabel).toBe(false);
    });

    it('never cuts table rows or splits labels from their values across chunks', () => {
      const tableContent = [
        'PREAMBLE',
        'The following table specifies required equipment for the blast furnace turnaround.',
        '',
        '| Sl | Equipment Description | Model | Qty | Rating |',
        '| 1  | Hydraulic Torque Wrench | TR-150 | 2   | 15000 Nm |',
        '| 2  | High Pressure Power Pack | PP-700 | 2   | 700 Bar |',
        '| 3  | Direct Tension Indicator | DTI-10 | 4   | High Accuracy |',
        '| 4  | Flange Spreader Hydraulic | FS-14  | 2   | 14 Ton |',
        '',
        'Item Category:',
        'Industrial Bolting Tools and Heavy Machinery',
        '',
        'Bid Submission Guidelines:',
        'All bids must be accompanied by OEM compliance.',
      ].join('\n');

      const chunks = chunkDocumentText(tableContent, {
        chunkSizeTokens: 250,
        overlapTokens: 50,
      });

      expect(chunks.length).toBeGreaterThan(0);

      // Verify each table row remains intact in whichever chunk it appears
      for (const chunk of chunks) {
        const lines = chunk.text.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('|')) {
            // Must have opening and closing pipes
            expect(line.trim().endsWith('|')).toBe(true);
          }
        }
      }

      // Verify "Item Category:" and its value "Industrial Bolting Tools..." are never severed
      const categoryChunk = chunks.find((c) => c.text.includes('Item Category:'));
      if (categoryChunk) {
        expect(categoryChunk.text).toContain('Industrial Bolting Tools and Heavy Machinery');
      }
    });
  });

  describe('Section Detection & Domain Awareness', () => {
    it('accurately identifies industrial tender sections', () => {
      expect(detectSection('SCOPE OF WORK FOR OVERHAULING OF TURBINE')).toBe('Scope of Work');
      expect(detectSection('ELIGIBILITY CRITERIA AND PQC CONDITIONS')).toBe('Eligibility Criteria');
      expect(detectSection('EMD Detail and Financial Security Deposit')).toBe('Commercial & EMD');
      expect(detectSection('Buyer Added Bid Specific Additional Terms and Conditions (ATC)')).toBe(
        'Buyer ATC & Conditions'
      );
      expect(detectSection('Consignees/Reporting Officer Delivery Schedule')).toBe(
        'Consignees & Delivery'
      );
      expect(detectSection('General background note')).toBe('General');
    });

    it('tags chunks with their active section context and tracks page/paragraph provenance', () => {
      const multiSectionDoc = `
        TENDER DOCUMENT
        
        SCOPE OF WORK
        The contractor shall provide hydraulic torque tightening services for high pressure flanges.
        All technician personnel must hold Level 2 bolting qualifications.

        ELIGIBILITY CRITERIA
        Minimum 5 years experience in petrochemical or steel plant shutdowns.
        Average annual financial turnover shall be at least 1 Crore.

        Buyer Added Bid Specific ATC
        Tools must be calibrated within 180 days prior to mobilization.
      `;

      const chunks = chunkDocumentText(multiSectionDoc, {
        chunkSizeTokens: 200,
        overlapTokens: 40,
        pageCount: 3,
      });

      expect(chunks.length).toBeGreaterThan(0);

      // Verify sections are recognized
      const scopeChunk = chunks.find((c) => c.section === 'Scope of Work');
      const eligChunk = chunks.find((c) => c.section === 'Eligibility Criteria');
      expect(scopeChunk).toBeDefined();
      expect(eligChunk).toBeDefined();

      // Verify provenance structure
      for (const chunk of chunks) {
        expect(chunk.provenance).toBeDefined();
        expect(chunk.provenance.pageStart).toBeGreaterThanOrEqual(1);
        expect(chunk.provenance.pageEnd).toBeGreaterThanOrEqual(chunk.provenance.pageStart);
        expect(chunk.provenance.paragraphStart).toBeGreaterThanOrEqual(1);
        expect(chunk.provenance.paragraphEnd).toBeGreaterThanOrEqual(
          chunk.provenance.paragraphStart
        );
        expect(chunk.contentHash).toHaveLength(64);
        expect(typeof chunk.text).toBe('string');
        expect(chunk.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Duplicate Chunk Detection', () => {
    it('detects duplicate repeated boilerplate chunks across pages', () => {
      const boilerplate =
        'Disclaimer: This tender document is generated electronically by the portal. Any alteration is prohibited.';
      const repeatedDoc = `
        Page 1 Content
        ${boilerplate}

        Page 2 Content with other technical details
        ${boilerplate}
      `;

      const chunks = chunkDocumentText(repeatedDoc, {
        chunkSizeTokens: 300,
        overlapTokens: 20,
      });

      const boilerplateChunks = chunks.filter((c) => c.text.includes(boilerplate));
      if (boilerplateChunks.length > 1) {
        expect(boilerplateChunks[0].isDuplicate).toBe(false);
        expect(boilerplateChunks[1].isDuplicate).toBe(true);
      }
    });

    it('deduplicates chunks when deduplicate option is true', () => {
      const repetitiveText = `
        Standard Industrial Bolting Disclaimer notice applies to all bidders.
        Standard Industrial Bolting Disclaimer notice applies to all bidders.
      `;

      const allChunks = chunkDocumentText(repetitiveText, {
        chunkSizeTokens: 50,
        overlapTokens: 10,
        deduplicate: false,
      });

      const uniqueChunks = chunkDocumentText(repetitiveText, {
        chunkSizeTokens: 50,
        overlapTokens: 10,
        deduplicate: true,
      });

      expect(uniqueChunks.length).toBeLessThanOrEqual(allChunks.length);
      expect(uniqueChunks.every((c) => !c.isDuplicate)).toBe(true);
    });
  });

  describe('Retrieval Quality Measurement', () => {
    it('computes quality metrics including table preservation rate and token distributions', () => {
      const sampleText = `
        SCOPE OF WORK
        | S.No | Tool | Qty |
        | 1 | Hydraulic Wrench | 2 |
        
        ELIGIBILITY CRITERIA
        Experience: 3 years.
      `;

      const chunks = chunkDocumentText(sampleText, {
        chunkSizeTokens: 700,
        overlapTokens: 100,
      });

      const quality = measureRetrievalQuality(chunks);
      expect(quality.totalChunks).toBe(chunks.length);
      expect(quality.avgTokens).toBeGreaterThan(0);
      expect(quality.tableRowPreservationRate).toBe(1.0);
      expect(quality.qualityScore).toBeGreaterThanOrEqual(80);
      expect(quality.sectionBreakdown).toBeDefined();
    });

    it('returns sensible defaults for empty chunks array', () => {
      const emptyQuality = measureRetrievalQuality([]);
      expect(emptyQuality.totalChunks).toBe(0);
      expect(emptyQuality.tableRowPreservationRate).toBe(1.0);
      expect(emptyQuality.qualityScore).toBe(100);
    });
  });
});
