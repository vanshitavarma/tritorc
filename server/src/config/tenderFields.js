/**
 * Declarative tender field extraction definitions for GeM bid documents.
 * Anchored on English labels to avoid bilingual Hindi noise.
 */

export const NOT_FOUND = 'Not Found';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Normalizes DD-MM-YYYY to DD-Mon-YYYY (e.g. 22-07-2026 -> 22-Jul-2026).
 * Returns 'Not Found' if ambiguous or unparseable.
 */
export const formatDate = (rawDate) => {
  if (!rawDate || typeof rawDate !== 'string') return NOT_FOUND;
  const match = rawDate.trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (!match) return NOT_FOUND;
  const [, day, monthStr, year] = match;
  const monthNum = parseInt(monthStr, 10);
  if (monthNum < 1 || monthNum > 12) return NOT_FOUND;
  return `${day}-${MONTH_NAMES[monthNum - 1]}-${year}`;
};

/**
 * Formats numeric tender value as INR currency (e.g. 721570 -> INR 721,570).
 * Requires explicit positive integer digits.
 */
export const formatAmount = (numStr) => {
  if (!numStr) return NOT_FOUND;
  const cleanDigits = String(numStr).replace(/\D/g, '');
  if (!cleanDigits) return NOT_FOUND;
  const num = parseInt(cleanDigits, 10);
  if (isNaN(num) || num <= 0) return NOT_FOUND;
  return `INR ${num.toLocaleString('en-US')}`;
};

/**
 * Formats EMD status. Returns 'Not Required' ONLY when explicitly stated as No.
 */
export const formatEmd = (value) => {
  if (!value) return NOT_FOUND;
  const v = value.trim().toLowerCase();
  if (v === 'no') return 'Not Required';
  if (v === 'yes') return 'Required (see document)';
  return NOT_FOUND;
};

/**
 * Extracts and cleans relevant categories for notification, filtering bilingual noise.
 */
export const formatTabName = (rawText) => {
  if (!rawText) return NOT_FOUND;
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/[\u0900-\u097F]/.test(l)); // Filter Hindi lines
  if (lines.length === 0) return NOT_FOUND;
  return lines.join(', ');
};

/**
 * Extracts consignee address and location from first consignee entry.
 */
export const extractConsigneeDetails = (fullText) => {
  if (!fullText || typeof fullText !== 'string') {
    return { consigneeAddress: NOT_FOUND, location: NOT_FOUND };
  }

  const pinMatch = fullText.match(
    /\b(\d{6})\s*,\s*([^\t\r\n]+(?:[\r\n]+[^\t\r\n]+)*?)(?=\s+\d+\s+\d+|\s+Buyer Added|\s+Fेता|\s+=ेता|\s+Gेता|\s+Technical Specifications|$)/i
  );

  if (!pinMatch) {
    return { consigneeAddress: NOT_FOUND, location: NOT_FOUND };
  }

  const pin = pinMatch[1];
  const rawRest = pinMatch[2];
  const lines = rawRest
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cleanedLines = [];
  for (const l of lines) {
    if (/^\d+\s+\d+/.test(l)) break;
    cleanedLines.push(l);
  }
  const addressRest = cleanedLines.join(' ');
  const consigneeAddress = `${pin},${addressRest}`;

  const parts = consigneeAddress
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const location = parts.length > 1 ? parts[parts.length - 1] : parts[0];

  return {
    consigneeAddress: consigneeAddress || NOT_FOUND,
    location: location || NOT_FOUND,
  };
};

/**
 * Constructs a factual, deterministic tender summary without LLM hallucination.
 */
export const buildTenderSummary = ({ itemCategory, totalQuantity, typeOfBid }) => {
  if (!itemCategory || itemCategory === NOT_FOUND) return NOT_FOUND;
  let summary = `Tender for ${itemCategory}`;
  if (totalQuantity && totalQuantity !== NOT_FOUND) {
    summary += ` (Total Quantity: ${totalQuantity})`;
  }
  if (typeOfBid && typeOfBid !== NOT_FOUND) {
    summary += ` via ${typeOfBid}`;
  }
  return `${summary}.`;
};

/**
 * Declarative field extractors.
 * Each entry defines { column, pattern, transform, fallbackTransform }
 */
export const FIELD_DEFINITIONS = [
  {
    column: 'Tender ID',
    pattern: null,
    transform: () => NOT_FOUND,
  },
  {
    column: 'Tender No',
    pattern: /(?:Bid Number| बड सं[=?]या):\s*([A-Z0-9/]+)/i,
    transform: (m) => m[1].trim(),
  },
  {
    column: 'Tender Authority',
    pattern: /Organisation Name\s+([^\r\n]+)/i,
    transform: (m) => m[1].trim(),
  },
  {
    column: 'Location',
    pattern: null,
    transform: (_m, ctx) => ctx.location || NOT_FOUND,
  },
  {
    column: 'Opening Date',
    pattern: /Bid Opening\s+Date\/Time\s+([0-9]{2}-[0-9]{2}-[0-9]{4})/i,
    transform: (m) => formatDate(m[1]),
  },
  {
    column: 'Closing Date',
    pattern: /Bid End Date\/Time\s+([0-9]{2}-[0-9]{2}-[0-9]{4})/i,
    transform: (m) => formatDate(m[1]),
  },
  {
    column: 'Tender Amount',
    pattern: /Estimated Bid Value\s+(\d+)/i,
    transform: (m) => formatAmount(m[1]),
  },
  {
    column: 'EMD',
    pattern: /EMD Detail[\s\S]{1,250}?(?:Required|आव[Pश]यकता)\s*[:\t ]*(Yes|No)\b/i,
    transform: (m) => formatEmd(m[1]),
  },
  {
    column: 'Document Cost',
    pattern: null,
    transform: () => NOT_FOUND,
  },
  {
    column: 'Tender Fee',
    pattern: null,
    transform: () => NOT_FOUND,
  },
  {
    column: 'Tab Name',
    pattern:
      /Relevant\s+Categories selected for notification\s+([\s\S]*?)(?:MSE Relaxation|'टाट|Startup|\r?\n\r?\n|$)/i,
    transform: (m) => formatTabName(m[1]),
  },
  {
    column: 'Technical Qualification',
    pattern:
      /ELIGIBILITY CRITERIA->\s*-*\s*([\s\S]*?)(?:REQUIREMENT DESCRIPTION|SPECIAL TERMS|Buyer Added Bid Specific|\r?\n\r?\n\r?\n|$)/i,
    transform: (m) => {
      const cleaned = m[1].replace(/\s+/g, ' ').trim();
      return cleaned.length > 0 ? cleaned : NOT_FOUND;
    },
  },
  {
    column: 'Financial Qualification',
    pattern: null,
    transform: () => NOT_FOUND,
  },
  {
    column: 'Scope of Work',
    pattern: /REQUIREMENT DESCRIPTION->\s*-*\s*([^\r\n]+)/i,
    transform: (m) => m[1].trim(),
    fallbackTransform: (ctx) => ctx.itemCategory || NOT_FOUND,
  },
  {
    column: 'Tender Summary',
    pattern: null,
    transform: (_m, ctx) => buildTenderSummary(ctx),
  },
  {
    column: 'Tender Description',
    pattern: /Item Category\s+([^\r\n]+)/i,
    transform: (m) => m[1].replace(/[,\s]+$/, '').trim(),
  },
  {
    column: 'Corrigendum',
    pattern: null,
    transform: () => NOT_FOUND,
  },
  {
    column: 'Purchaser Address',
    pattern: null,
    transform: (_m, ctx) => {
      const parts = [ctx.officeName, ctx.organisationName, ctx.consigneeAddress].filter(
        (part) => part && part !== NOT_FOUND
      );
      return parts.length > 0 ? parts.join(', ') : NOT_FOUND;
    },
  },
  {
    column: 'Email',
    pattern: /Buyer Email id:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    transform: (m) => m[1].trim(),
  },
  {
    column: 'Website',
    pattern: null,
    transform: () => NOT_FOUND,
  },
];
