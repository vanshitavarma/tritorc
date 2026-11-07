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

const PIN_STATE_RANGES = [
  { min: 110000, max: 119999, state: 'Delhi' },
  { min: 120000, max: 139999, state: 'Haryana' },
  { min: 140000, max: 159999, state: 'Punjab' },
  { min: 160000, max: 169999, state: 'Chandigarh' },
  { min: 170000, max: 179999, state: 'Himachal Pradesh' },
  { min: 180000, max: 199999, state: 'Jammu and Kashmir' },
  { min: 244000, max: 249999, state: 'Uttarakhand' },
  { min: 262000, max: 263999, state: 'Uttarakhand' },
  { min: 200000, max: 289999, state: 'Uttar Pradesh' },
  { min: 300000, max: 349999, state: 'Rajasthan' },
  { min: 360000, max: 399999, state: 'Gujarat' },
  { min: 403000, max: 403999, state: 'Goa' },
  { min: 400000, max: 449999, state: 'Maharashtra' },
  { min: 490000, max: 497999, state: 'Chhattisgarh' },
  { min: 450000, max: 489999, state: 'Madhya Pradesh' },
  { min: 500000, max: 509999, state: 'Telangana' },
  { min: 515000, max: 535999, state: 'Andhra Pradesh' },
  { min: 560000, max: 599999, state: 'Karnataka' },
  { min: 605000, max: 605999, state: 'Puducherry' },
  { min: 600000, max: 649999, state: 'Tamil Nadu' },
  { min: 670000, max: 699999, state: 'Kerala' },
  { min: 737000, max: 737999, state: 'Sikkim' },
  { min: 700000, max: 749999, state: 'West Bengal' },
  { min: 750000, max: 779999, state: 'Odisha' },
  { min: 780000, max: 789999, state: 'Assam' },
  { min: 790000, max: 792999, state: 'Arunachal Pradesh' },
  { min: 793000, max: 794999, state: 'Meghalaya' },
  { min: 795000, max: 795999, state: 'Manipur' },
  { min: 796000, max: 796999, state: 'Mizoram' },
  { min: 797000, max: 798999, state: 'Nagaland' },
  { min: 799000, max: 799999, state: 'Tripura' },
  { min: 814000, max: 835999, state: 'Jharkhand' },
  { min: 800000, max: 859999, state: 'Bihar' },
];

const KNOWN_CITY_STATES = {
  banharpali: 'Odisha',
  rourkela: 'Odisha',
  jharsuguda: 'Odisha',
  bhubaneswar: 'Odisha',
  cuttack: 'Odisha',
  angul: 'Odisha',
  paradeep: 'Odisha',
  sambalpur: 'Odisha',
  damanjodi: 'Odisha',
  ranipet: 'Tamil Nadu',
  'indira gandhi complex': 'Tamil Nadu',
  chennai: 'Tamil Nadu',
  coimbatore: 'Tamil Nadu',
  tiruchirappalli: 'Tamil Nadu',
  trichy: 'Tamil Nadu',
  salem: 'Tamil Nadu',
  madurai: 'Tamil Nadu',
  tuticorin: 'Tamil Nadu',
  bhilai: 'Chhattisgarh',
  raipur: 'Chhattisgarh',
  korba: 'Chhattisgarh',
  bilaspur: 'Chhattisgarh',
  bokaro: 'Jharkhand',
  jamshedpur: 'Jharkhand',
  ranchi: 'Jharkhand',
  dhanbad: 'Jharkhand',
  durgapur: 'West Bengal',
  asansol: 'West Bengal',
  kolkata: 'West Bengal',
  haldia: 'West Bengal',
  haridwar: 'Uttarakhand',
  dehradun: 'Uttarakhand',
  bhopal: 'Madhya Pradesh',
  indore: 'Madhya Pradesh',
  gwalior: 'Madhya Pradesh',
  jabalpur: 'Madhya Pradesh',
  visakhapatnam: 'Andhra Pradesh',
  vizag: 'Andhra Pradesh',
  vijayawada: 'Andhra Pradesh',
  hyderabad: 'Telangana',
  secunderabad: 'Telangana',
  bengaluru: 'Karnataka',
  bangalore: 'Karnataka',
  mangaluru: 'Karnataka',
  mangalore: 'Karnataka',
  mysuru: 'Karnataka',
  mumbai: 'Maharashtra',
  pune: 'Maharashtra',
  nagpur: 'Maharashtra',
  nashik: 'Maharashtra',
  vadodara: 'Gujarat',
  surat: 'Gujarat',
  ahmedabad: 'Gujarat',
  jamnagar: 'Gujarat',
};

const INDIAN_STATES = [
  'Odisha',
  'Tamil Nadu',
  'Maharashtra',
  'Gujarat',
  'Karnataka',
  'West Bengal',
  'Jharkhand',
  'Chhattisgarh',
  'Andhra Pradesh',
  'Telangana',
  'Rajasthan',
  'Uttar Pradesh',
  'Madhya Pradesh',
  'Haryana',
  'Punjab',
  'Delhi',
  'Kerala',
  'Assam',
  'Bihar',
  'Uttarakhand',
  'Himachal Pradesh',
  'Goa',
  'Sikkim',
  'Tripura',
  'Meghalaya',
  'Manipur',
  'Nagaland',
  'Mizoram',
  'Arunachal Pradesh',
];

/**
 * Resolves the state or province for a given Indian pincode, city, or document context.
 */
export const resolveState = (pin = '', location = '', fullText = '') => {
  // 1. Check Indian PIN code range (first 6 digits)
  const cleanPin = String(pin).replace(/\D/g, '');
  if (cleanPin.length === 6) {
    const num = parseInt(cleanPin, 10);
    const match = PIN_STATE_RANGES.find((r) => num >= r.min && num <= r.max);
    if (match) return match.state;
  }

  // 2. Check known industrial cities/sites
  const locLower = (location || '').toLowerCase().trim();
  if (KNOWN_CITY_STATES[locLower]) {
    return KNOWN_CITY_STATES[locLower];
  }
  for (const [city, st] of Object.entries(KNOWN_CITY_STATES)) {
    if (locLower.includes(city)) {
      return st;
    }
  }

  // 3. Search document text / address for state name
  const textToSearch = `${location} ${fullText}`.toLowerCase();
  for (const stateName of INDIAN_STATES) {
    if (textToSearch.includes(stateName.toLowerCase())) {
      return stateName;
    }
  }

  return '';
};

/**
 * Formats location string to include the state/province (e.g. "BANHARPALI, Odisha").
 */
export const formatLocationWithState = (rawLocation = '', pin = '', fullText = '') => {
  if (!rawLocation || rawLocation === NOT_FOUND) return NOT_FOUND;

  // If already contains a comma and state/country (e.g. "Balikpapan, Indonesia" or "Mumbai, Maharashtra"), preserve
  if (rawLocation.includes(',')) {
    return rawLocation;
  }

  const state = resolveState(pin, rawLocation, fullText);
  if (state && !rawLocation.toLowerCase().includes(state.toLowerCase())) {
    return `${rawLocation}, ${state}`;
  }

  return rawLocation;
};

/**
 * Extracts consignee address and location from first consignee entry, including state.
 */
export const extractConsigneeDetails = (fullText) => {
  if (!fullText || typeof fullText !== 'string') {
    return { consigneeAddress: NOT_FOUND, location: NOT_FOUND, rawLocation: NOT_FOUND, pin: '' };
  }

  const pinMatch = fullText.match(
    /\b(\d{6})\s*,\s*([^\t\r\n]+(?:[\r\n]+[^\t\r\n]+)*?)(?=\s+\d+\s+\d+|\s+Buyer Added|\s+Fेता|\s+=ेता|\s+Gेता|\s+Technical Specifications|$)/i
  );

  if (!pinMatch) {
    return { consigneeAddress: NOT_FOUND, location: NOT_FOUND, rawLocation: NOT_FOUND, pin: '' };
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
  const rawLocation = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const location = formatLocationWithState(rawLocation, pin, fullText);

  return {
    consigneeAddress: consigneeAddress || NOT_FOUND,
    location: location || NOT_FOUND,
    rawLocation: rawLocation || NOT_FOUND,
    pin: pin || '',
    state: resolveState(pin, rawLocation, fullText) || '',
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
