import { describe, it, expect } from 'vitest';
import {
  calculateHybridScore,
  getHybridScoreGrade,
} from '../src/services/relevance/hybridScorer.js';

describe('Hybrid Relevance Scorer (100-point calibrated system)', () => {
  it('correctly assigns hybrid grades across thresholds', () => {
    expect(getHybridScoreGrade(95)).toBe('Highly Relevant');
    expect(getHybridScoreGrade(80)).toBe('Highly Relevant');
    expect(getHybridScoreGrade(70)).toBe('Related');
    expect(getHybridScoreGrade(60)).toBe('Related');
    expect(getHybridScoreGrade(50)).toBe('Possible');
    expect(getHybridScoreGrade(40)).toBe('Possible');
    expect(getHybridScoreGrade(30)).toBe('Low Relevance');
    expect(getHybridScoreGrade(20)).toBe('Low Relevance');
    expect(getHybridScoreGrade(10)).toBe('Not Relevant');
    expect(getHybridScoreGrade(0)).toBe('Not Relevant');
  });

  it('calculates score with strong keyword and semantic alignment', () => {
    const result = calculateHybridScore({
      distinctCount: 5,
      totalHits: 25,
      topSimilarity: 0.88,
      retrievedCount: 4,
      technicalText:
        'Must supply high pressure hydraulic torque wrench and bolt tensioner with valid test certificate',
      scopeText: 'Turnaround bolting maintenance and flange management work',
      tenderFields: {
        'Tender Authority': 'Steel Authority of India Limited',
      },
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBe('Highly Relevant');
    expect(result.breakdown.keywordScore).toBe(30); // Capped at 30
    expect(result.breakdown.semanticScore).toBeGreaterThan(15);
    expect(result.breakdown.technicalScore).toBeGreaterThanOrEqual(10);
    expect(result.breakdown.scopeScore).toBeGreaterThan(10);
    expect(result.evidence.distinctKeywords).toBe(5);
  });

  it('returns provisional score when semantic retrieval is pending', () => {
    const result = calculateHybridScore({
      distinctCount: 3,
      totalHits: 12,
      topSimilarity: 0,
      retrievedCount: 0,
      technicalText: '',
      scopeText: '',
      tenderFields: {},
    });

    expect(result.isProvisional).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });
});
