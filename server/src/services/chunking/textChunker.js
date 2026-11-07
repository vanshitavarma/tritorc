import crypto from 'node:crypto';

/**
 * Computes deterministic SHA-256 hash of text content.
 *
 * @param {string} text
 * @returns {string} Hex encoded sha256 hash
 */
export const computeContentHash = (text = '') => {
  return crypto.createHash('sha256').update(String(text).trim()).digest('hex');
};

const SECTION_PATTERNS = [
  { section: 'Scope of Work', pattern: /\b(?:SCOPE\s+OF\s+WORK|REQUIREMENT\s+DESCRIPTION)\b/i },
  {
    section: 'Eligibility Criteria',
    pattern: /\b(?:ELIGIBILITY\s+CRITERIA|Technical\s+Qualification|Experience\s+Criteria)\b/i,
  },
  {
    section: 'Commercial & EMD',
    pattern: /\b(?:EMD\s+Detail|Estimated\s+Bid\s+Value|Payment\s+Terms|Two\s+Packet\s+Bid)\b/i,
  },
  {
    section: 'Buyer ATC & Conditions',
    pattern: /\b(?:Buyer\s+Added\s+Bid\s+Specific|Additional\s+Terms\s+and\s+Conditions)\b/i,
  },
  {
    section: 'Consignees & Delivery',
    pattern: /\b(?:Consignees\/Reporting\s+Officer|Delivery\s+Schedule)\b/i,
  },
];

/**
 * Detects section context from chunk text.
 */
export const detectSection = (text = '') => {
  for (const item of SECTION_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.section;
    }
  }
  return 'General';
};

/**
 * Chunks extracted text into manageable windows with provenance and content hashing.
 *
 * @param {string} fullText - Entire document text
 * @param {Object} [options]
 * @param {number} [options.chunkSize=700]
 * @param {number} [options.overlap=100]
 * @param {number} [options.pageCount]
 * @returns {Array<{ chunkIndex: number, text: string, provenance: Object, section: string, contentHash: string }>}
 */
export const chunkDocumentText = (fullText = '', options = {}) => {
  if (!fullText || typeof fullText !== 'string' || fullText.trim().length === 0) {
    return [];
  }

  const { chunkSize = 700, overlap = 100, pageCount = 1 } = options;
  const clean = fullText.replace(/\r\n/g, '\n');
  const totalLength = clean.length;

  const chunks = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < totalLength) {
    let endIndex = Math.min(startIndex + chunkSize, totalLength);

    // Try to break cleanly at sentence or newline if within 100 chars of endIndex
    if (endIndex < totalLength) {
      const boundarySearch = clean.slice(startIndex, endIndex + 80);
      const breakMatch = boundarySearch.match(/[.\n]\s+/);
      if (breakMatch && breakMatch.index && breakMatch.index > chunkSize - 150) {
        endIndex = startIndex + breakMatch.index + breakMatch[0].length;
      }
    }

    const chunkText = clean.slice(startIndex, endIndex).trim();

    if (chunkText.length > 0) {
      // Estimate page provenance based on character offset and page count
      const approxPage =
        pageCount > 1
          ? Math.min(pageCount, Math.max(1, Math.floor((startIndex / totalLength) * pageCount) + 1))
          : 1;

      chunks.push({
        chunkIndex,
        text: chunkText,
        provenance: {
          pageStart: approxPage,
          pageEnd: approxPage,
        },
        section: detectSection(chunkText),
        contentHash: computeContentHash(chunkText),
      });

      chunkIndex++;
    }

    if (endIndex >= totalLength) {
      break;
    }

    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks;
};
