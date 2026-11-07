/**
 * Shared report column configuration matching docs/reference/sample_tender_scan_report.xlsx
 */

export const REPORT_COLUMNS = [
  'Document Name',
  'Tender ID',
  'Tender No',
  'Tender Authority',
  'Location',
  'Opening Date',
  'Closing Date',
  'Tender Amount',
  'EMD',
  'Document Cost',
  'Tender Fee',
  'Tab Name',
  'Technical Qualification',
  'Financial Qualification',
  'Scope of Work',
  'Tender Summary',
  'Tender Description',
  'Corrigendum',
  'Purchaser Address',
  'Email',
  'Website',
  'Matched Keywords',
  'Match Count',
  'Relevance to Tritorc',
];

/**
 * Column widths (in character units) matching the reference sample workbook
 */
export const COLUMN_WIDTHS = [
  30, // Document Name
  15, // Tender ID
  16, // Tender No
  24, // Tender Authority
  20, // Location
  13, // Opening Date
  13, // Closing Date
  18, // Tender Amount
  16, // EMD
  14, // Document Cost
  13, // Tender Fee
  15, // Tab Name
  30, // Technical Qualification
  28, // Financial Qualification
  34, // Scope of Work
  34, // Tender Summary
  36, // Tender Description
  30, // Corrigendum
  30, // Purchaser Address
  24, // Email
  20, // Website
  40, // Matched Keywords
  11, // Match Count
  16, // Relevance to Tritorc
];

export const SCAN_METADATA_COLUMNS = [
  'Document Name',
  'Matched Keywords',
  'Match Count',
  'Relevance to Tritorc',
];

export const EXTRACTED_TENDER_FIELDS = REPORT_COLUMNS.filter(
  (col) => !SCAN_METADATA_COLUMNS.includes(col)
);
