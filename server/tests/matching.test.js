import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadKeywords, parseKeywordsCsv } from '../src/config/keywords.js';
import { tokenizeWords } from '../src/services/matching/tokenizeWords.js';
import { findKeywordHits } from '../src/services/matching/findKeywordHits.js';
import { scanText } from '../src/services/matching/scanText.js';
import { extractText } from '../src/services/extraction/index.js';
import { classifyRelevance } from '../src/services/relevance/classifyRelevance.js';
import { AppError } from '../src/utils/AppError.js';

const currentDir = fileURLToPath(new URL('.', import.meta.url));

const getFixtureBuffer = (filename) => {
  return readFileSync(resolve(currentDir, 'fixtures', filename));
};

describe('Deterministic Keyword Scanner & Matching Engine', () => {
  describe('Keyword Configuration (keywords.csv)', () => {
    it('loads the 20 default keywords from server/data/keywords.csv', () => {
      const keywords = loadKeywords();
      expect(keywords).toHaveLength(20);
      expect(keywords).toContain('Hydraulic torque wrench');
      expect(keywords).toContain('Bolt tensioner');
      expect(keywords).toContain('Controlled bolting');
    });

    it('validates CSV header and throws AppError if keyword column is missing', () => {
      const badCsv = 'item_name,category\ntorque wrench,bolting';
      expect(() => parseKeywordsCsv(badCsv)).toThrow(AppError);
    });

    it('trims whitespace and drops case-insensitive duplicates and blank rows', () => {
      const dirtyCsv = `keyword
        Torque Wrench
        torque wrench
        
        Bolt Tensioner  
        bolt tensioner
      `;
      const parsed = parseKeywordsCsv(dirtyCsv);
      expect(parsed).toEqual(['Torque Wrench', 'Bolt Tensioner']);
    });
  });

  describe('Text Normalization & Stemming Morphology', () => {
    const tableCases = [
      {
        description: 'plural variant: "Torque wrenches" matches "Torque wrench"',
        text: 'The contractor must supply heavy duty Torque wrenches for refinery maintenance.',
        keyword: 'Torque wrench',
        shouldMatch: true,
      },
      {
        description: 'morphological variant: "tensioning" matches "tensioner"',
        text: 'Execution of bolt tensioning procedures on heat exchanger flanges.',
        keyword: 'Bolt tensioner',
        shouldMatch: true,
      },
      {
        description: 'hyphen normalization: "Pre-tensioning" matches "pre tensioning"',
        text: 'Pre-tensioning of studs shall be performed according to ASME standards.',
        keyword: 'Pre-tensioning',
        shouldMatch: true,
      },
      {
        description: 'word boundary isolation: "extension" must NEVER match tension keywords',
        text: 'Submission deadline extension granted for technical bid query resolution.',
        keyword: 'Bolt tensioner',
        shouldMatch: false,
      },
    ];

    for (const testCase of tableCases) {
      it(testCase.description, () => {
        const tokens = tokenizeWords(testCase.text);
        const result = findKeywordHits(tokens, testCase.keyword, 1);
        if (testCase.shouldMatch) {
          expect(result.hits).toBeGreaterThan(0);
        } else {
          expect(result.hits).toBe(0);
        }
      });
    }

    it('gap matching: "torque wrench calibration" matches "Torque calibration" only when maxWordGap >= 1', () => {
      const sampleText = 'Provision of torque wrench calibration for turnaround operations.';
      const tokens = tokenizeWords(sampleText);

      const withGap0 = findKeywordHits(tokens, 'Torque calibration', 0);
      expect(withGap0.hits).toBe(0);

      const withGap1 = findKeywordHits(tokens, 'Torque calibration', 1);
      expect(withGap1.hits).toBe(1);
    });
  });

  describe('scanText Integration', () => {
    it('returns structured scan with distinctCount equal to distinct matched keywords', () => {
      const text =
        'Supply of Hydraulic torque wrench, Bolt tensioner, and another Hydraulic torque wrench.';
      const result = scanText(text, ['Hydraulic torque wrench', 'Bolt tensioner']);

      expect(result.distinctCount).toBe(2);
      expect(result.totalHits).toBe(3);
      expect(result.matches[0].keyword).toBe('Hydraulic torque wrench');
      expect(result.matches[0].hits).toBe(2);
      expect(result.matches[1].keyword).toBe('Bolt tensioner');
      expect(result.matches[1].hits).toBe(1);
    });

    it('preserves firstIndex ordering of matched keywords in document text', () => {
      const text = 'First flange management, then bolt tensioner, and lastly controlled bolting.';
      const result = scanText(text);

      expect(result.matches.map((m) => m.keyword)).toEqual([
        'Flange management',
        'Bolt tensioner',
        'Controlled bolting',
      ]);
    });
  });

  describe('Three GeM PDF Fixtures Integration', () => {
    it('OPGC (GeM-Bidding-9563430.pdf) scores 0 matches and Not Related', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9563430.pdf');
      const extracted = await extractText({ buffer, originalName: 'GeM-Bidding-9563430.pdf' });
      const scan = scanText(extracted.text);
      const verdict = classifyRelevance(scan);

      expect(scan.distinctCount).toBe(0);
      expect(scan.totalHits).toBe(0);
      expect(scan.matches).toEqual([]);
      expect(verdict).toBe('Not Related');
    });

    it('BHEL (GeM-Bidding-9605104.pdf) scores 0 matches on default list (Not Related)', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9605104.pdf');
      const extracted = await extractText({ buffer, originalName: 'GeM-Bidding-9605104.pdf' });
      const scan = scanText(extracted.text);
      const verdict = classifyRelevance(scan);

      expect(scan.distinctCount).toBe(0);
      expect(scan.totalHits).toBe(0);
      expect(verdict).toBe('Not Related');
    });

    it('BHEL configurable borderline demo: adding "hydraulic nut" scores 1 distinct and Possible', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9605104.pdf');
      const extracted = await extractText({ buffer, originalName: 'GeM-Bidding-9605104.pdf' });
      const customKeywords = [...loadKeywords(), 'Hydraulic nut'];
      const scan = scanText(extracted.text, customKeywords);
      const verdict = classifyRelevance(scan);

      expect(scan.distinctCount).toBe(1);
      expect(scan.totalHits).toBeGreaterThanOrEqual(5);
      expect(scan.matches[0].keyword).toBe('Hydraulic nut');
      expect(verdict).toBe('Possible');
    });

    it('SAIL (GeM-Bidding-9649647.pdf) scores 3 distinct keywords, 22 hits, and Related', async () => {
      const buffer = getFixtureBuffer('GeM-Bidding-9649647.pdf');
      const extracted = await extractText({ buffer, originalName: 'GeM-Bidding-9649647.pdf' });
      const scan = scanText(extracted.text);
      const verdict = classifyRelevance(scan);

      expect(scan.distinctCount).toBe(3);
      expect(scan.totalHits).toBe(22);
      expect(scan.matches.map((m) => m.keyword)).toEqual([
        'Hydraulic torque wrench',
        'Torque wrench',
        'Torque calibration',
      ]);
      expect(verdict).toBe('Related');
    });
  });

  describe('Authored DOCX Fixtures Integration', () => {
    it('relevant_sow.docx scores Related with 6 distinct keywords', async () => {
      const buffer = getFixtureBuffer('relevant_sow.docx');
      const extracted = await extractText({ buffer, originalName: 'relevant_sow.docx' });
      const scan = scanText(extracted.text);
      const verdict = classifyRelevance(scan);

      expect(scan.distinctCount).toBe(6);
      expect(verdict).toBe('Related');
    });

    it('civil_works.docx scores Not Related with 0 keyword matches', async () => {
      const buffer = getFixtureBuffer('civil_works.docx');
      const extracted = await extractText({ buffer, originalName: 'civil_works.docx' });
      const scan = scanText(extracted.text);
      const verdict = classifyRelevance(scan);

      expect(scan.distinctCount).toBe(0);
      expect(scan.totalHits).toBe(0);
      expect(verdict).toBe('Not Related');
    });
  });
});
