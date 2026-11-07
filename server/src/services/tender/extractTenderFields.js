import {
  FIELD_DEFINITIONS,
  NOT_FOUND,
  extractConsigneeDetails,
} from '../../config/tenderFields.js';
import { EXTRACTED_TENDER_FIELDS } from '../../config/reportColumns.js';

/**
 * Extracts context variables from raw text to feed dependent field transforms
 * (such as composite purchaser address and summary generation).
 */
const buildExtractionContext = (text) => {
  const { consigneeAddress, location } = extractConsigneeDetails(text);

  const orgMatch = text.match(/Organisation Name\s+([^\r\n]+)/i);
  const organisationName = orgMatch ? orgMatch[1].trim() : NOT_FOUND;

  const officeMatch = text.match(/Office Name\s+([^\r\n]+)/i);
  const officeName = officeMatch ? officeMatch[1].trim() : NOT_FOUND;

  const itemMatch = text.match(/Item Category\s+([^\r\n]+)/i);
  const itemCategory = itemMatch ? itemMatch[1].replace(/[,\s]+$/, '').trim() : NOT_FOUND;

  const qtyMatch = text.match(/Total Quantity\s+([^\r\n]+)/i);
  const totalQuantity = qtyMatch ? qtyMatch[1].trim() : NOT_FOUND;

  const bidTypeMatch = text.match(/Type of Bid\s+([^\r\n]+)/i);
  const typeOfBid = bidTypeMatch ? bidTypeMatch[1].trim() : NOT_FOUND;

  return {
    consigneeAddress,
    location,
    organisationName,
    officeName,
    itemCategory,
    totalQuantity,
    typeOfBid,
  };
};

/**
 * Evaluates a single declarative field definition against document text.
 */
export const readField = (text, definition, context = {}) => {
  if (!definition) return NOT_FOUND;

  if (!definition.pattern) {
    if (typeof definition.transform === 'function') {
      try {
        const val = definition.transform(null, context);
        return val && typeof val === 'string' && val.trim().length > 0 ? val.trim() : NOT_FOUND;
      } catch {
        return NOT_FOUND;
      }
    }
    return NOT_FOUND;
  }

  const match = text.match(definition.pattern);
  if (!match) {
    if (typeof definition.fallbackTransform === 'function') {
      try {
        const fallbackVal = definition.fallbackTransform(context);
        return fallbackVal && typeof fallbackVal === 'string' && fallbackVal.trim().length > 0
          ? fallbackVal.trim()
          : NOT_FOUND;
      } catch {
        return NOT_FOUND;
      }
    }
    return NOT_FOUND;
  }

  try {
    const value = definition.transform(match, context);
    return value && typeof value === 'string' && value.trim().length > 0 ? value.trim() : NOT_FOUND;
  } catch {
    return NOT_FOUND;
  }
};

/**
 * Extracts conservative GeM tender fields from extracted text.
 * Returns an object with all 20 tender-specific report columns mapped to values or 'Not Found'.
 *
 * @param {string} text - Extracted document text
 * @returns {Record<string, string>}
 */
export const extractTenderFields = (text = '') => {
  const safeText = typeof text === 'string' ? text : '';
  const context = buildExtractionContext(safeText);
  const result = {};

  for (const def of FIELD_DEFINITIONS) {
    result[def.column] = readField(safeText, def, context);
  }

  // Ensure all 20 expected columns exist even if omitted from definitions
  for (const col of EXTRACTED_TENDER_FIELDS) {
    if (!(col in result)) {
      result[col] = NOT_FOUND;
    }
  }

  return result;
};
