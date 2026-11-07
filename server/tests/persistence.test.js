import { describe, it, expect, vi } from 'vitest';
import {
  chunkDocumentText,
  computeContentHash,
  detectSection,
} from '../src/services/chunking/textChunker.js';
import {
  persistScanSession,
  getPersistedScan,
} from '../src/services/persistence/mongoPersistence.js';
import * as databaseModule from '../src/config/database.js';

describe('Text Chunking & Provenance Service', () => {
  it('computes deterministic SHA-256 content hashes', () => {
    const text = 'Hydraulic torque wrench 15000 Nm';
    const hash1 = computeContentHash(text);
    const hash2 = computeContentHash(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    expect(computeContentHash('Different text')).not.toBe(hash1);
  });

  it('detects domain-specific tender sections accurately', () => {
    expect(
      detectSection('SCOPE OF WORK: Supply and operation of high pressure hydraulic pumps')
    ).toBe('Scope of Work');
    expect(
      detectSection('ELIGIBILITY CRITERIA: Minimum 5 years refinery turnaround experience')
    ).toBe('Eligibility Criteria');
    expect(detectSection('Technical Qualification: Past credentials in mechanical bolting')).toBe(
      'Eligibility Criteria'
    );
    expect(detectSection('EMD Detail: Earnest Money Deposit required')).toBe('Commercial & EMD');
    expect(detectSection('Buyer Added Bid Specific Additional Terms and Conditions (ATC)')).toBe(
      'Buyer ATC & Conditions'
    );
    expect(detectSection('Delivery Schedule and Consignees/Reporting Officer')).toBe(
      'Consignees & Delivery'
    );
    expect(detectSection('Regular paragraph without any section headers')).toBe('General');
  });

  it('chunks text into windows with section metadata and page provenance', () => {
    const sampleText = `
      BID DOCUMENT
      SCOPE OF WORK
      The contractor shall provide heavy-duty hydraulic torque wrenches and certified technicians.
      All equipment must be calibrated within 6 months.

      ELIGIBILITY CRITERIA
      The bidder must have completed at least 3 bolting turnaround projects in petrochemical refineries.
      Annual turnover must exceed 50 Lakhs.

      Buyer Added Bid Specific ATC
      Local content declaration must be submitted along with technical bid.
    `.repeat(10);

    const chunks = chunkDocumentText(sampleText, {
      chunkSize: 500,
      overlap: 80,
      pageCount: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].text.length).toBeGreaterThan(0);
    expect(chunks[0].contentHash).toHaveLength(64);
    expect(chunks[0].provenance.pageStart).toBeGreaterThanOrEqual(1);
    expect(chunks[0].provenance.pageStart).toBeLessThanOrEqual(5);

    // Verify chunk indexes are sequential
    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
      expect(typeof chunk.section).toBe('string');
      expect(typeof chunk.contentHash).toBe('string');
    });
  });

  it('returns an empty array when provided empty or whitespace-only text', () => {
    expect(chunkDocumentText('')).toEqual([]);
    expect(chunkDocumentText('   \n\t  ')).toEqual([]);
    expect(chunkDocumentText(null)).toEqual([]);
    expect(chunkDocumentText(undefined)).toEqual([]);
  });
});

describe('MongoDB Persistence Layer', () => {
  it('throws an error if scanId is omitted', async () => {
    await expect(persistScanSession({})).rejects.toThrow('scanId is required');
  });

  it('gracefully degrades when MongoDB is not connected', async () => {
    // Mock getDatabaseStatus to report disconnected
    const spy = vi.spyOn(databaseModule, 'getDatabaseStatus').mockReturnValue({
      status: 'disconnected',
      isReady: false,
    });

    const result = await persistScanSession({
      scanId: 'test-scan-disconnected',
      results: [{ status: 'scanned', documentName: 'Tender 1' }],
    });

    expect(result.persisted).toBe(false);
    expect(result.scanId).toBe('test-scan-disconnected');
    expect(result.reason).toContain('disconnected');

    const queryResult = await getPersistedScan('test-scan-disconnected');
    expect(queryResult).toBeNull();

    spy.mockRestore();
  });
});
