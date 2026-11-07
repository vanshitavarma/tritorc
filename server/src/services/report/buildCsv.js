import { Buffer } from 'node:buffer';
import { REPORT_COLUMNS } from '../../config/reportColumns.js';
import { buildPrimaryRowValues } from './buildWorkbook.js';

export const UTF8_BOM = '\uFEFF';
export const CRLF = '\r\n';

/**
 * Escapes a cell value according to RFC 4180 specifications.
 * - Wraps in double quotes if it contains commas, double quotes, or newlines.
 * - Doubles internal double quotes (" -> "").
 * - Preserves numbers and plain strings as-is.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeCsvCell = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Serializes an array of values into a single RFC 4180 CSV row string.
 *
 * @param {Array<unknown>} rowValues
 * @returns {string}
 */
export const serializeCsvRow = (rowValues) => {
  return rowValues.map(escapeCsvCell).join(',');
};

/**
 * Generates an RFC 4180 compliant CSV report with UTF-8 BOM from document scan results.
 * Preserves the exact 24-column order matching sample_tender_scan_report.xlsx.
 *
 * @param {Array<Object>} results - Array of scanned document results
 * @returns {Buffer} - UTF-8 encoded Buffer with BOM
 */
export const buildCsvReport = (results = []) => {
  const validResults = results.filter(
    (doc) =>
      doc.isValidTender !== false &&
      doc.status !== 'rejected' &&
      doc.status !== 'review_needed' &&
      doc.documentType !== 'NON_TENDER'
  );

  const headerRow = serializeCsvRow(REPORT_COLUMNS);

  const dataRows = validResults.map((doc) => {
    const rowValues = buildPrimaryRowValues(doc);
    return serializeCsvRow(rowValues);
  });

  const allRows = [headerRow, ...dataRows];
  const csvContent = UTF8_BOM + allRows.join(CRLF) + CRLF;

  return Buffer.from(csvContent, 'utf-8');
};
