import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { REPORT_COLUMNS, COLUMN_WIDTHS } from '../../config/reportColumns.js';
import { NOT_FOUND } from '../../config/tenderFields.js';

export const NONE_FOUND = '(none found)';

export const HEADER_STYLE = {
  font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } },
  alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
};

export const DATA_STYLE = {
  font: { name: 'Arial', size: 9 },
  alignment: { vertical: 'top', wrapText: true },
};

export const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

export const ZEBRA_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' },
};

export const VERDICT_COLORS = {
  Related: 'FFD9F2D9', // Soft pastel green
  Possible: 'FFFDEBD3', // Soft pastel amber
  'Not Related': 'FFF2F2F2', // Neutral light gray
  'Not Assessed': 'FFFBE4E4', // Soft muted red for errors
};

/**
 * Maps a single document result to the 24 canonical report columns in order.
 */
export const buildPrimaryRowValues = (doc = {}) => {
  const isFailed = doc.status === 'failed';

  let matchedKeywordsStr;
  let matchCount;
  let relevance;

  if (isFailed) {
    matchedKeywordsStr = doc.error || 'Extraction failed';
    matchCount = 0;
    relevance = 'Not Assessed';
  } else {
    const rawMatches = doc.matches || [];
    if (rawMatches.length > 0) {
      matchedKeywordsStr = rawMatches
        .map((m) => (typeof m === 'string' ? m : m.keyword))
        .join(', ');
    } else {
      matchedKeywordsStr = NONE_FOUND;
    }

    matchCount = typeof doc.distinctCount === 'number' ? doc.distinctCount : rawMatches.length;

    relevance = doc.relevance || doc.verdict || 'Not Related';
  }

  const tenderFields = doc.tenderFields || {};

  return REPORT_COLUMNS.map((colName) => {
    switch (colName) {
      case 'Document Name':
        return doc.documentName || doc.originalName || 'document';
      case 'Matched Keywords':
        return matchedKeywordsStr;
      case 'Match Count':
        return matchCount;
      case 'Relevance to Tritorc':
        return relevance;
      default:
        if (isFailed) {
          return NOT_FOUND;
        }
        return tenderFields[colName] ?? doc[colName] ?? NOT_FOUND;
    }
  });
};

/**
 * Builds the primary 24-column "Tender Scan Report" worksheet with corporate executive styling.
 */
const buildPrimaryWorksheet = (workbook, results) => {
  const sheet = workbook.addWorksheet('Tender Scan Report', {
    views: [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: 1,
        topLeftCell: 'B2',
        activeCell: 'A1',
      },
    ],
  });

  // Enable auto-filters on all 24 columns
  sheet.autoFilter = 'A1:X1';

  // Professional print setup
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:1',
  };

  sheet.columns = REPORT_COLUMNS.map((col, idx) => ({
    header: col,
    key: `col_${idx + 1}`,
    width: COLUMN_WIDTHS[idx] || 20,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
  });

  results.forEach((doc, rowIdx) => {
    const rowValues = buildPrimaryRowValues(doc);
    const row = sheet.addRow(rowValues);
    const isOdd = rowIdx % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = DATA_STYLE.font;
      cell.alignment = DATA_STYLE.alignment;
      cell.border = THIN_BORDER;

      // Col 24: Relevance to Tritorc fill styling
      if (colNumber === 24) {
        const verdict = String(cell.value || '').trim();
        const argb = VERDICT_COLORS[verdict] || VERDICT_COLORS['Not Related'];
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb },
        };
      } else if (isOdd) {
        // Alternating subtle zebra striping
        cell.fill = ZEBRA_FILL;
      }
    });
  });

  return sheet;
};

/**
 * Builds secondary "Keyword Breakdown" worksheet with per-keyword occurrences.
 */
const buildBreakdownWorksheet = (workbook, results) => {
  const sheet = workbook.addWorksheet('Keyword Breakdown', {
    views: [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: 1,
        topLeftCell: 'B2',
      },
    ],
  });

  sheet.autoFilter = 'A1:D1';
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const columns = [
    { header: 'Document Name', width: 34 },
    { header: 'Keyword', width: 28 },
    { header: 'Hits', width: 12 },
    { header: 'First Match Position', width: 20 },
  ];

  sheet.columns = columns.map((col, idx) => ({
    header: col.header,
    key: `bd_col_${idx + 1}`,
    width: col.width,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
  });

  results.forEach((doc) => {
    const docName = doc.documentName || doc.originalName || 'document';
    const isFailed = doc.status === 'failed';
    const matches = doc.matches || [];

    if (isFailed) {
      const row = sheet.addRow([docName, doc.error || 'Extraction Failed', 0, 'N/A']);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = DATA_STYLE.font;
        cell.alignment = DATA_STYLE.alignment;
        cell.border = THIN_BORDER;
      });
    } else if (matches.length === 0) {
      const row = sheet.addRow([docName, NONE_FOUND, 0, 'N/A']);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = DATA_STYLE.font;
        cell.alignment = DATA_STYLE.alignment;
        cell.border = THIN_BORDER;
      });
    } else {
      matches.forEach((m) => {
        const keyword = typeof m === 'string' ? m : m.keyword;
        const hits = typeof m === 'object' && typeof m.hits === 'number' ? m.hits : 1;
        const firstIndex =
          typeof m === 'object' && typeof m.firstIndex === 'number' ? m.firstIndex : 'N/A';

        const row = sheet.addRow([docName, keyword, hits, firstIndex]);
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = DATA_STYLE.font;
          cell.alignment = DATA_STYLE.alignment;
          cell.border = THIN_BORDER;
        });
      });
    }
  });

  return sheet;
};

/**
 * Builds secondary "AI Insights" worksheet with strategic business intelligence.
 */
const buildAiInsightsWorksheet = (workbook, results) => {
  const sheet = workbook.addWorksheet('AI Insights', {
    views: [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: 1,
        topLeftCell: 'B2',
      },
    ],
  });

  sheet.autoFilter = 'A1:G1';
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const columns = [
    { header: 'Document Name', width: 34 },
    { header: 'Baseline Verdict', width: 18 },
    { header: 'Semantic Assessment', width: 22 },
    { header: 'AI Relevance Explanation', width: 48 },
    { header: 'Key Opportunities', width: 40 },
    { header: 'Risks and Unknowns', width: 36 },
    { header: 'Recommended Human Follow-up', width: 36 },
  ];

  sheet.columns = columns.map((col, idx) => ({
    header: col.header,
    key: `ai_col_${idx + 1}`,
    width: col.width,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
  });

  results.forEach((doc, rowIdx) => {
    const docName = doc.documentName || doc.originalName || 'document';
    const isFailed = doc.status === 'failed';
    const baseline = doc.relevance || doc.verdict || (isFailed ? 'Not Assessed' : 'Not Related');
    const aiAnalysis = doc.aiAnalysis || {};

    const semantic = aiAnalysis.semanticAssessment || (isFailed ? 'Failed' : 'Deterministic Only');
    const explanation =
      aiAnalysis.aiExplanation || 'Deterministic keyword scan complete without AI generation.';
    const opportunities =
      aiAnalysis.keyOpportunities || (isFailed ? 'N/A' : 'Review tender scope.');
    const risks =
      aiAnalysis.risksAndUnknowns || (isFailed ? doc.error || 'Failed' : 'Standard review.');
    const followUp =
      aiAnalysis.recommendedFollowUp ||
      (baseline === 'Related' ? 'Pursue commercial bid.' : 'Archive.');

    const row = sheet.addRow([
      docName,
      baseline,
      semantic,
      explanation,
      opportunities,
      risks,
      followUp,
    ]);

    const isOdd = rowIdx % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = DATA_STYLE.font;
      cell.alignment = DATA_STYLE.alignment;
      cell.border = THIN_BORDER;
      if (isOdd) {
        cell.fill = ZEBRA_FILL;
      }
    });
  });

  return sheet;
};

/**
 * Generates an executive Excel workbook matching the 24-column corporate reference report.
 *
 * @param {Array<Object>} results - Document scan results
 * @param {Object} [options]
 * @param {boolean} [options.includeBreakdown=true]
 * @param {boolean} [options.includeAiInsights=true]
 * @returns {Promise<Buffer>}
 */
export const buildWorkbook = async (results = [], options = {}) => {
  const { includeBreakdown = true, includeAiInsights = true } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tritorc Tender Scanner';
  workbook.created = new Date();
  workbook.modified = new Date();

  buildPrimaryWorksheet(workbook, results);

  if (includeBreakdown) {
    buildBreakdownWorksheet(workbook, results);
  }

  if (includeAiInsights) {
    buildAiInsightsWorksheet(workbook, results);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
