import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { generateTenderTitle } from '../src/services/tender/generateTenderTitle.js';
import {
  summarizeTechnicalQualification,
  summarizeFinancialQualification,
  summarizeScopeOfWork,
  summarizeTenderSummary,
  summarizeTenderDescription,
  summarizeCorrigendum,
  inferTabName,
  generateStrategicAiInsights,
} from '../src/services/tender/heuristicSummarizer.js';
import { summarizeTenderFields } from '../src/services/tender/summarizeTenderFields.js';
import { extractText } from '../src/services/extraction/extractText.js';
import { extractTenderFields } from '../src/services/tender/extractTenderFields.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');

describe('Tender Intelligence Summarizer & Title Generation', () => {
  describe('generateTenderTitle', () => {
    it('preserves recognized industrial acronyms (SAIL, BHEL, OPGC, NTPC)', () => {
      const title = generateTenderTitle({
        organisationName: 'STEEL AUTHORITY OF INDIA LIMITED',
        officeName: 'Rourkela Steel Plant',
        itemCategory: 'hydraulic torque wrench with power pack',
        originalName: 'GeM-Bidding-9649647.pdf',
      });

      expect(title).toBe('SAIL Rourkela – Hydraulic Torque Wrench with Power Pack');
    });

    it('generates concise title for BHEL boiler tender', () => {
      const title = generateTenderTitle({
        organisationName: 'Bharat Heavy Electricals Limited (BHEL)',
        officeName: 'Ranipet',
        itemCategory: 'supply and erection of boiler structures',
        originalName: 'GeM-Bidding-9605104.pdf',
      });

      expect(title).toContain('BHEL');
      expect(title).toContain('Boiler Structures');
    });

    it('cleans fallback file names without technical codes when no fields exist', () => {
      const title = generateTenderTitle({
        originalName: 'pipeline_flange_machining_work.pdf',
      });

      expect(title).toBe('Pipeline Flange Machining Work');
    });

    it('falls back to default title when empty', () => {
      const title = generateTenderTitle({});
      expect(title).toBe('Industrial Tender Document');
    });
  });

  describe('heuristicSummarizer methods', () => {
    it('summarizeTechnicalQualification extracts certifications, experience and ratings', () => {
      const rawText = `
        Bidder must have 3 years experience in supply of industrial tools.
        ISO 9001 certification.
        Equipment delivers 15000 Nm rating.
      `;
      const summary = summarizeTechnicalQualification(rawText, '');
      expect(summary).toContain('Experience: 3 years');
      expect(summary).toContain('ISO 9001');
      expect(summary).toContain('15000 Nm');
    });

    it('summarizeTechnicalQualification returns "Not Found" for document without qualifications', () => {
      const rawText = 'General notices and administrative announcements.';
      const summary = summarizeTechnicalQualification(rawText, '');
      expect(summary).toBe('Not Found');
    });

    it('summarizeFinancialQualification extracts turnover values or returns "Not Found"', () => {
      const textWithTurnover = 'Minimum Average Annual Turnover of the bidder should be 50 Lakhs.';
      const summary1 = summarizeFinancialQualification(textWithTurnover);
      expect(summary1).toContain('50 Lakhs');

      const textWithoutTurnover = 'All payments will be processed within 30 days of invoice.';
      const summary2 = summarizeFinancialQualification(textWithoutTurnover);
      expect(summary2).toBe('Not Found');
    });

    it('summarizeScopeOfWork produces concise bullet points', () => {
      const rawText =
        '1. Supply of hydraulic torque wrench.\n2. Calibration and testing at 700 bar.';
      const sow = summarizeScopeOfWork(rawText, '');
      expect(sow).toContain('Supply of hydraulic torque wrench');
      expect(sow).toContain('Calibration and testing');
    });

    it('summarizeTenderSummary produces an executive business overview', () => {
      const summary = summarizeTenderSummary({
        itemCategory: 'hydraulic torque wrench',
        organisationName: 'SAIL',
        relevance: 'Related',
        fullText: 'torque wrench rourkela steel plant',
      });
      expect(summary).toContain('SAIL Rourkela Steel Plant');
      expect(summary).toContain('Tritorc');
    });

    it('summarizeTenderDescription produces a concise project overview distinct from summary', () => {
      const desc = summarizeTenderDescription({
        itemCategory: 'hydraulic torque wrench',
        fullText: 'torque wrench rourkela steel plant',
      });
      expect(desc).toContain('Procurement of high-capacity hydraulic torque wrench');
    });

    it('summarizeCorrigendum identifies corrigendum/addenda changes or returns "Not Found"', () => {
      const textWithoutCorrigendum = 'Standard bid document without any revisions.';
      expect(summarizeCorrigendum(textWithoutCorrigendum)).toBe('Not Found');

      const textWithCorrigendum = 'Corrigendum 1: Bid submission date extended to 25-12-2026.';
      expect(summarizeCorrigendum(textWithCorrigendum)).toContain('Corrigendum 1:');
    });

    it('inferTabName categorizes industrial works accurately', () => {
      expect(inferTabName('hydraulic torque wrench with electric power pack')).toBe(
        'Industrial Bolting'
      );
      expect(inferTabName('boiler overhaul and pipe fabrication')).toBe('Mechanical Works');
      expect(inferTabName('reinforcement concrete foundation and boundary wall')).toBe(
        'Civil Works'
      );
    });

    it('generateStrategicAiInsights produces structured business fields', () => {
      const insights = generateStrategicAiInsights({
        relevance: 'Related',
        documentName: 'SAIL Rourkela – Hydraulic Torque Wrench',
        itemCategory: 'hydraulic torque wrench',
        fullText: 'torque wrench power pack',
      });

      expect(insights.semanticAssessment).toBe('High Bolting Fit');
      expect(insights.aiExplanation).toContain('Tritorc');
      expect(insights.keyOpportunities).toContain('hydraulic torque wrench');
      expect(insights.recommendedFollowUp).toContain('Prepare');
    });
  });

  describe('summarizeTenderFields with GeM PDFs', () => {
    it('accurately produces concise summaries and intelligent title for SAIL PDF', async () => {
      const filePath = path.join(fixturesDir, 'GeM-Bidding-9649647.pdf');
      const buffer = await fs.readFile(filePath);
      const extracted = await extractText({
        buffer,
        originalName: 'GeM-Bidding-9649647.pdf',
        mimeType: 'application/pdf',
      });

      const rawFields = extractTenderFields(extracted.text);
      const summarized = await summarizeTenderFields({
        rawFields,
        fullText: extracted.text,
        originalName: 'GeM-Bidding-9649647.pdf',
        relevance: 'Related',
      });

      // Intelligent document name
      expect(summarized.intelligentDocumentName).toBe(
        'SAIL Rourkela – Hydraulic Torque Wrench with Power Pack'
      );

      // Tab Name
      expect(summarized.enhancedFields['Tab Name']).toBe('Industrial Bolting');

      // Concise Technical Qualification (not verbatim pages of text)
      expect(summarized.enhancedFields['Technical Qualification']).not.toBe('Not Found');
      expect(summarized.enhancedFields['Technical Qualification'].length).toBeLessThan(600);

      // Financial Qualification
      expect(summarized.enhancedFields['Financial Qualification']).toBe('Not Found');

      // Scope of Work
      expect(summarized.enhancedFields['Scope of Work']).toContain('hydraulic torque wrench');
      expect(summarized.enhancedFields['Scope of Work'].length).toBeLessThan(800);

      // Executive Summary
      expect(summarized.enhancedFields['Tender Summary']).toContain('SAIL');
      expect(summarized.enhancedFields['Tender Summary']).toContain('Tritorc');

      // Corrigendum
      expect(summarized.enhancedFields['Corrigendum']).toBe('Not Found');
    });

    it('accurately produces concise summaries and intelligent title for OPGC PDF', async () => {
      const filePath = path.join(fixturesDir, 'GeM-Bidding-9563430.pdf');
      const buffer = await fs.readFile(filePath);
      const extracted = await extractText({
        buffer,
        originalName: 'GeM-Bidding-9563430.pdf',
        mimeType: 'application/pdf',
      });

      const rawFields = extractTenderFields(extracted.text);
      const summarized = await summarizeTenderFields({
        rawFields,
        fullText: extracted.text,
        originalName: 'GeM-Bidding-9563430.pdf',
        relevance: 'Not Related',
      });

      expect(summarized.intelligentDocumentName).toContain('OPGC');
      expect(summarized.enhancedFields['Tab Name']).not.toBe('Not Found');
      expect(summarized.enhancedFields['Scope of Work']).not.toBe('Not Found');
    });
  });
});
