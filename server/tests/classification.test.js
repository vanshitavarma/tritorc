import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyDocumentType,
  evaluateDeterministicSignals,
  DOCUMENT_TYPES,
  CLASSIFICATION_STATUS,
} from '../src/services/classification/documentClassifier.js';
import { extractPdfText } from '../src/services/extraction/pdfExtractor.js';
import { extractDocxText } from '../src/services/extraction/docxExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('Document Type Classification & Validation Engine', () => {
  describe('Requirement 1: Supplied Assignment PDF rejection', () => {
    it('accurately classifies Tender_Keyword_Scanner_Assignment.pdf as NON_TENDER with rejection status', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'Tender_Keyword_Scanner_Assignment.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'Tender_Keyword_Scanner_Assignment.pdf',
      });

      const result = await classifyDocumentType(text, {
        originalName: 'Tender_Keyword_Scanner_Assignment.pdf',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.NON_TENDER);
      expect(result.isValidTender).toBe(false);
      expect(result.status).toBe(CLASSIFICATION_STATUS.REJECTED);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.rejectionReason).toBeDefined();
    });
  });

  describe('Requirement 2: Genuine GeM Tenders acceptance', () => {
    it('accurately accepts GeM-Bidding-9563430.pdf (OPGC) as a valid TENDER', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'GeM-Bidding-9563430.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'GeM-Bidding-9563430.pdf',
      });

      const result = await classifyDocumentType(text, {
        originalName: 'GeM-Bidding-9563430.pdf',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.TENDER);
      expect(result.isValidTender).toBe(true);
      expect(result.status).toBe(CLASSIFICATION_STATUS.VALID);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('accurately accepts GeM-Bidding-9605104.pdf (BHEL) as a valid TENDER', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'GeM-Bidding-9605104.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'GeM-Bidding-9605104.pdf',
      });

      const result = await classifyDocumentType(text, {
        originalName: 'GeM-Bidding-9605104.pdf',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.TENDER);
      expect(result.isValidTender).toBe(true);
      expect(result.status).toBe(CLASSIFICATION_STATUS.VALID);
    });

    it('accurately accepts GeM-Bidding-9649647.pdf (SAIL) as a valid TENDER', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'GeM-Bidding-9649647.pdf'));
      const { text } = await extractPdfText({
        buffer: buf,
        originalName: 'GeM-Bidding-9649647.pdf',
      });

      const result = await classifyDocumentType(text, {
        originalName: 'GeM-Bidding-9649647.pdf',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.TENDER);
      expect(result.isValidTender).toBe(true);
      expect(result.status).toBe(CLASSIFICATION_STATUS.VALID);
    });
  });

  describe('Requirement 3: Genuine Scope of Work acceptance', () => {
    it('accurately accepts relevant_sow.docx as a valid SCOPE_OF_WORK', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'relevant_sow.docx'));
      const { text } = await extractDocxText({
        buffer: buf,
        originalName: 'relevant_sow.docx',
      });

      const result = await classifyDocumentType(text, {
        originalName: 'relevant_sow.docx',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.SCOPE_OF_WORK);
      expect(result.isValidTender).toBe(true);
      expect(result.status).toBe(CLASSIFICATION_STATUS.VALID);
    });

    it('accurately accepts civil_works.docx as a valid SCOPE_OF_WORK', async () => {
      const buf = fs.readFileSync(path.join(fixturesDir, 'civil_works.docx'));
      const { text } = await extractDocxText({
        buffer: buf,
        originalName: 'civil_works.docx',
      });

      const result = await classifyDocumentType(text, {
        originalName: 'civil_works.docx',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.SCOPE_OF_WORK);
      expect(result.isValidTender).toBe(true);
      expect(result.status).toBe(CLASSIFICATION_STATUS.VALID);
    });
  });

  describe('Requirement 4: Avoid false rejection on tender containing keyword list', () => {
    it('accepts a genuine tender that contains an explicit keyword/equipment list', async () => {
      const tenderWithKeywordList = [
        'Bid Number: GEM/2026/B/9991234',
        'Organisation Name: Bharat Petroleum Corporation Limited',
        'Bid Opening Date/Time: 20-08-2026 15:00:00',
        'Estimated Bid Value: 4500000',
        'EMD Detail: Required: Yes',
        'Item Category: Flange Integrity and Bolting Equipment',
        'Relevant Categories / Tooling list:',
        '1. Hydraulic torque wrench',
        '2. Bolt tensioner',
        '3. Flange management system',
        '4. Nut splitter',
        '5. Mechanical bolting',
        '6. Turnaround services',
        '7. Torque calibration unit',
        'Technical Specifications: Tools must comply with ASME PCC-1 standards.',
        'Eligibility Criteria: Bidders must have executed controlled bolting services.',
      ].join('\n');

      const result = await classifyDocumentType(tenderWithKeywordList, {
        originalName: 'BPCL_Bolting_Tender.pdf',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.TENDER);
      expect(result.isValidTender).toBe(true);
      expect(result.status).toBe(CLASSIFICATION_STATUS.VALID);
    });
  });

  describe('Requirement 5: Unrelated academic assignment rejection', () => {
    it('rejects an academic/coursework assignment with rubrics and marks', async () => {
      const academicText = [
        'Department of Computer Science - Academic Year 2026',
        'Course Syllabus & Homework Assignment 4: Binary Trees & Sorting Algorithms',
        'Student Name: ____________ Roll No: ___________',
        'Due Date: Sunday 11:59 PM. Submit your code via GitHub repository link.',
        'Problem Set 1: Implement an AVL tree in Java. Total Marks: 50.',
        'Scored out of 100. Late submissions lose 10 marks per day.',
        'Evaluation Criteria: Code quality (25 marks), Correctness (50 marks), Unit tests (25 marks).',
      ].join('\n');

      const result = await classifyDocumentType(academicText, {
        originalName: 'CS101_Assignment_4.pdf',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.NON_TENDER);
      expect(result.isValidTender).toBe(false);
      expect(result.status).toBe(CLASSIFICATION_STATUS.REJECTED);
      expect(result.rejectionReason).toBeDefined();
    });
  });

  describe('Requirement 6: Ambiguous document marked UNKNOWN with review status', () => {
    it('marks a general ambiguous memo as UNKNOWN requiring review', async () => {
      const ambiguousMemo = [
        'Internal Staff Memo - Logistics & Facilities Department',
        'Please be advised that the main cafeteria will be closed for quarterly cleaning on Friday.',
        'Staff members are requested to use the annex cafeteria.',
      ].join('\n');

      const result = await classifyDocumentType(ambiguousMemo, {
        originalName: 'facilities_memo.txt',
      });

      expect(result.documentType).toBe(DOCUMENT_TYPES.UNKNOWN);
      expect(result.isValidTender).toBe(false);
      expect(result.status).toBe(CLASSIFICATION_STATUS.REVIEW_NEEDED);
      expect(result.message).toContain('manual review');
    });

    it('safely marks ultra-short or empty documents as UNKNOWN', async () => {
      const result = await classifyDocumentType('Too short', { originalName: 'empty.pdf' });
      expect(result.documentType).toBe(DOCUMENT_TYPES.UNKNOWN);
      expect(result.isValidTender).toBe(false);
      expect(result.status).toBe(CLASSIFICATION_STATUS.REVIEW_NEEDED);
    });
  });

  describe('Deterministic signal scoring evaluator', () => {
    it('evaluates signals accurately with zero negative hits for clean tenders', () => {
      const text =
        'Bid Number: GEM/2026/B/12345 Organisation Name: Indian Oil Corporation Limited Bid End Date: 12-09-2026';
      const signals = evaluateDeterministicSignals(text);
      expect(signals.negativeScore).toBe(0);
      expect(signals.tenderScore).toBeGreaterThanOrEqual(40);
      expect(signals.positiveReasons.length).toBeGreaterThanOrEqual(2);
    });

    it('evaluates heavy negative scores for take-home programming assignments', () => {
      const text =
        'Intern Evaluation MERN take-home assignment Scored out of 100 Required stack React Node.js GitHub repo link AI_NOTES.txt Notes for candidates';
      const signals = evaluateDeterministicSignals(text);
      expect(signals.negativeScore).toBeGreaterThanOrEqual(100);
      expect(signals.negativeReasons.length).toBeGreaterThanOrEqual(3);
    });
  });
});
