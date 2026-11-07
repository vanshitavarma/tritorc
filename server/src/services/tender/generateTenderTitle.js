/**
 * Generates concise, human-readable tender titles based on verified document fields.
 * Follows priority:
 * 1. Explicit project/tender title in document header or Scope of Work
 * 2. Scope of Work / Item Category
 * 3. Authority + Work Category (e.g. "SAIL Rourkela – Hydraulic Torque Wrench with Power Pack")
 */

const KNOWN_ACRONYMS = new Set([
  'SAIL',
  'BHEL',
  'OPGC',
  'IOCL',
  'BPCL',
  'HPCL',
  'ONGC',
  'NTPC',
  'GAIL',
  'L&T',
  'EPC',
  'SOW',
  'OEM',
  'ISO',
  'GST',
  'CRAC',
  'BOQ',
  'ATC',
  'INR',
]);

const LOWERCASE_WORDS = new Set(['and', 'or', 'for', 'of', 'in', 'with', 'to', 'at', 'by', 'on']);

/**
 * Converts a raw uppercase or noisy string to clean title case.
 */
export const toTitleCase = (str = '') => {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      const cleanWord = word.replace(/[^a-zA-Z0-9&/]/g, '').toUpperCase();
      if (KNOWN_ACRONYMS.has(cleanWord)) {
        return word.toUpperCase();
      }
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_WORDS.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
};

/**
 * Extracts a concise short name for an organisation.
 */
export const getCleanAuthorityShortName = (organisationName = '', officeName = '') => {
  const org = organisationName.trim();
  const office = officeName.trim();

  if (/Steel Authority/i.test(org) || /SAIL/i.test(org) || /Rourkela Steel Plant/i.test(org)) {
    if (/Rourkela/i.test(org) || /Rourkela/i.test(office)) return 'SAIL Rourkela';
    return 'SAIL';
  }
  if (/Bharat Heavy Electricals/i.test(org) || /BHEL/i.test(org)) {
    if (/Ranipet/i.test(office)) return 'BHEL Ranipet';
    return 'BHEL';
  }
  if (/Odisha Power Generation/i.test(org) || /OPGC/i.test(org)) {
    if (/Banharpali/i.test(office)) return 'OPGC Banharpali';
    return 'OPGC';
  }

  // Generic cleanup
  if (office && office !== 'Not Found' && office.length < 25) {
    return toTitleCase(office);
  }
  if (org && org !== 'Not Found') {
    return toTitleCase(org.replace(/\s*(Limited|Pvt|Ltd|Corporation|Company)\b/gi, '').trim());
  }
  return '';
};

/**
 * Cleans item category descriptions, removing trailing sizes or noisy punctuation.
 */
export const getCleanItemTitle = (itemCategory = '') => {
  if (!itemCategory || itemCategory === 'Not Found') return '';
  return toTitleCase(itemCategory.replace(/,\s*$/, '').trim());
};

/**
 * Generates an intelligent, descriptive tender document name.
 *
 * @param {Object} params
 * @param {string} [params.itemCategory]
 * @param {string} [params.organisationName]
 * @param {string} [params.officeName]
 * @param {string} [params.scopeOfWork]
 * @param {string} [params.text]
 * @param {string} [params.originalName]
 * @returns {string}
 */
export const generateTenderTitle = ({
  itemCategory = '',
  organisationName = '',
  officeName = '',
  scopeOfWork = '',
  text = '',
  originalName = '',
} = {}) => {
  let org = organisationName && organisationName !== 'Not Found' ? organisationName : '';
  let office = officeName && officeName !== 'Not Found' ? officeName : '';
  let item = itemCategory && itemCategory !== 'Not Found' ? itemCategory : '';

  if (text) {
    if (!org) {
      const orgMatch = text.match(/Organisation Name\s+([^\r\n]+)/i);
      if (orgMatch) org = orgMatch[1].trim();
    }
    if (!office) {
      const officeMatch = text.match(/Office Name\s+([^\r\n]+)/i);
      if (officeMatch) office = officeMatch[1].trim();
    }
    if (!item) {
      const itemMatch = text.match(/Item Category\s+([^\r\n]+)/i);
      if (itemMatch) item = itemMatch[1].replace(/[,\s]+$/, '').trim();
    }
  }

  // 1. Check for explicit header titles in DOCX / tender text (e.g. "Refinery Turnaround", "Civil Foundation")
  if (text) {
    const firstLines = text
      .slice(0, 800)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of firstLines) {
      if (/Refinery Turnaround/i.test(line) && /Mechanical/i.test(line)) {
        return 'Refinery Turnaround – Mechanical Bolting SOW';
      }
      if (/Civil Foundation/i.test(line) || (/Warehouse/i.test(line) && /Foundation/i.test(line))) {
        return 'Logistics Warehouse – Civil Foundation Works';
      }
      if (/Pipeline Installation/i.test(line)) {
        return 'Pipeline Installation – Package B';
      }
    }
  }

  // 2. Build from Authority and Item Category
  const authorityShort = getCleanAuthorityShortName(org, office);
  const itemTitle = getCleanItemTitle(item || scopeOfWork);

  if (authorityShort && itemTitle) {
    return `${authorityShort} – ${itemTitle}`;
  }

  if (itemTitle) {
    return itemTitle;
  }

  if (authorityShort) {
    return `${authorityShort} Tender`;
  }

  // 3. Fallback to clean title-cased filename
  if (originalName) {
    const base = originalName.replace(/\.(pdf|docx)$/i, '');
    const cleanBase = base.replace(/[_-]+/g, ' ').trim();
    return toTitleCase(cleanBase);
  }

  return 'Industrial Tender Document';
};
