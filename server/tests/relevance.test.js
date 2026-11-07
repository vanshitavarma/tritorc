import { describe, it, expect } from 'vitest';
import { classifyRelevance } from '../src/services/relevance/classifyRelevance.js';
import { relevanceConfig, parseRelevanceConfig } from '../src/config/relevance.js';

describe('Relevance Classification Engine (classifyRelevance)', () => {
  describe('Configured Default Threshold Boundaries', () => {
    const defaultThresholds = {
      relatedMinDistinct: 3,
      relatedMinTotalHits: 10,
      possibleMinDistinct: 1,
      maxWordGap: 1,
    };

    const boundaryCases = [
      {
        description: '0 distinct matches -> Not Related',
        scan: { distinctCount: 0, totalHits: 0 },
        expectedVerdict: 'Not Related',
      },
      {
        description: '1 distinct match, low total hits (1 hit) -> Possible',
        scan: { distinctCount: 1, totalHits: 1 },
        expectedVerdict: 'Possible',
      },
      {
        description: '2 distinct matches, 8 hits -> Possible',
        scan: { distinctCount: 2, totalHits: 8 },
        expectedVerdict: 'Possible',
      },
      {
        description: '3 distinct matches, low total hits (3 hits) -> Related (distinct >= 3 rule)',
        scan: { distinctCount: 3, totalHits: 3 },
        expectedVerdict: 'Related',
      },
      {
        description:
          '1 distinct match, high total hits (10 hits) -> Related (totalHits >= 10 rule)',
        scan: { distinctCount: 1, totalHits: 10 },
        expectedVerdict: 'Related',
      },
      {
        description: '1 distinct match, borderline hits (9 hits) -> Possible',
        scan: { distinctCount: 1, totalHits: 9 },
        expectedVerdict: 'Possible',
      },
      {
        description: '4 distinct matches, 15 hits -> Related',
        scan: { distinctCount: 4, totalHits: 15 },
        expectedVerdict: 'Related',
      },
      {
        description: 'null or empty scan object -> Not Related',
        scan: null,
        expectedVerdict: 'Not Related',
      },
    ];

    for (const testCase of boundaryCases) {
      it(testCase.description, () => {
        const verdict = classifyRelevance(testCase.scan, defaultThresholds);
        expect(verdict).toBe(testCase.expectedVerdict);
      });
    }
  });

  describe('Configuration Loading (relevance.json)', () => {
    it('loads frozen config matching the source-runbook starting thresholds', () => {
      expect(relevanceConfig.relatedMinDistinct).toBe(3);
      expect(relevanceConfig.relatedMinTotalHits).toBe(10);
      expect(relevanceConfig.possibleMinDistinct).toBe(1);
      expect(relevanceConfig.maxWordGap).toBe(1);
      expect(Object.isFrozen(relevanceConfig)).toBe(true);
    });

    it('rejects invalid or non-numeric JSON threshold configs', () => {
      const invalidJson = JSON.stringify({
        relatedMinDistinct: 'invalid',
        relatedMinTotalHits: 10,
        possibleMinDistinct: 1,
        maxWordGap: 1,
      });

      expect(() => parseRelevanceConfig(invalidJson)).toThrow();
    });
  });
});
