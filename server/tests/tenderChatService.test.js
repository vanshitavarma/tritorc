import { describe, it, expect } from 'vitest';
import {
  validateCitations,
  synthesizeFallbackAnswer,
} from '../src/services/ai/tenderChatService.js';

describe('Tender Chat Service - Citation Validation and Grounding', () => {
  const mockPassages = [
    {
      chunkId: 'chunk-101',
      pageStart: 3,
      pageEnd: 4,
      score: 0.88,
      text: 'The vendor must supply 4 units of hydraulic torque wrenches with operating pressure 700 bar.',
    },
    {
      chunkId: 'chunk-102',
      pageStart: 7,
      pageEnd: 7,
      score: 0.75,
      text: 'Turnover must be minimum INR 50 Lakhs in the preceding 3 financial years.',
    },
  ];

  it('validates citations against genuine retrieved passages', () => {
    const rawCitations = [
      {
        chunkId: 'chunk-101',
        quote: 'hydraulic torque wrenches with operating pressure 700 bar',
      },
    ];

    const validated = validateCitations(rawCitations, mockPassages);
    expect(validated).toHaveLength(1);
    expect(validated[0].chunkId).toBe('chunk-101');
    expect(validated[0].pageStart).toBe(3);
    expect(validated[0].pageEnd).toBe(4);
    expect(validated[0].quote).toContain('hydraulic torque wrenches');
  });

  it('discards hallucinated chunk IDs not present in retrieved passages', () => {
    const hallucinatedCitations = [
      {
        chunkId: 'non-existent-chunk-999',
        quote: 'Some fabricated quote from the internet',
      },
    ];

    // Fallbacks to top valid passage
    const validated = validateCitations(hallucinatedCitations, mockPassages);
    expect(validated).toHaveLength(1);
    expect(validated[0].chunkId).toBe('chunk-101');
  });

  it('returns clean "Not found in the provided document" fallback when no passages exist', () => {
    const fallback = synthesizeFallbackAnswer('What is the liquidated damages clause?', []);
    expect(fallback.answer).toBe('Not found in the provided document.');
    expect(fallback.citations).toEqual([]);
    expect(fallback.confidence).toBe('none');
  });

  it('synthesizes grounded fallback when passages exist but LLM fails', () => {
    const fallback = synthesizeFallbackAnswer('What equipment is required?', mockPassages);
    expect(fallback.answer).toContain('According to the document');
    expect(fallback.citations).toHaveLength(1);
    expect(fallback.citations[0].chunkId).toBe('chunk-101');
    expect(fallback.confidence).toBe('medium');
  });
});
