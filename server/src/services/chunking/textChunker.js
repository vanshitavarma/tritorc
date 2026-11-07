import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Normalizes text content for duplicate detection and consistent hashing:
 * - Converts to lowercase
 * - Removes non-printable / zero-width characters
 * - Normalizes Windows CRLF to LF
 * - Collapses repeated whitespace/tabs into a single space
 * - Trims edges
 *
 * @param {string} text
 * @returns {string} Normalized string
 */
export const normalizeChunkText = (text = '') => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // strip zero-width characters
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ') // collapse horizontal whitespace
    .replace(/\n\s*\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Computes deterministic SHA-256 hash of text content.
 *
 * @param {string} text
 * @returns {string} Hex encoded SHA-256 hash
 */
export const computeContentHash = (text = '') => {
  const clean = normalizeChunkText(text);
  return crypto.createHash('sha256').update(clean).digest('hex');
};

/**
 * Estimates token count using standard technical/industrial text heuristic.
 * 1 word ≈ 1.33 tokens, accounting for technical specifications, ratings, and symbols.
 *
 * @param {string} text
 * @returns {number} Estimated token count
 */
export const estimateTokenCount = (text = '') => {
  if (!text || typeof text !== 'string') return 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return Math.max(1, Math.round(words.length * 1.33));
};

export const SECTION_PATTERNS = [
  {
    section: 'Scope of Work',
    pattern:
      /\b(?:SCOPE\s+OF\s+WORK|REQUIREMENT\s+DESCRIPTION|WORK\s+SPECIFICATION|BILL\s+OF\s+QUANTITIES|BOQ|SCHEDULE\s+OF\s+REQUIREMENTS)\b/i,
  },
  {
    section: 'Eligibility Criteria',
    pattern:
      /\b(?:ELIGIBILITY\s+CRITERIA|Technical\s+Qualification|Experience\s+Criteria|PRE-QUALIFICATION\s+CRITERIA|PQC|MANDATORY\s+CRITERIA)\b/i,
  },
  {
    section: 'Commercial & EMD',
    pattern:
      /\b(?:EMD\s+Detail|Estimated\s+Bid\s+Value|Payment\s+Terms|Two\s+Packet\s+Bid|Security\s+Deposit|PBG|Earnest\s+Money)\b/i,
  },
  {
    section: 'Buyer ATC & Conditions',
    pattern:
      /\b(?:Buyer\s+Added\s+Bid\s+Specific|Additional\s+Terms\s+and\s+Conditions|Special\s+Conditions\s+of\s+Contract|ATC)\b/i,
  },
  {
    section: 'Consignees & Delivery',
    pattern:
      /\b(?:Consignees\/Reporting\s+Officer|Delivery\s+Schedule|Place\s+of\s+Delivery|Consignee\s+Detail)\b/i,
  },
];

/**
 * Detects section context from chunk text.
 *
 * @param {string} text
 * @returns {string} Detected section name
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
 * Determines whether a line is part of a table row (markdown pipe table, tab-delimited, or multi-space column).
 *
 * @param {string} line
 * @returns {boolean}
 */
export const isTableRow = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Markdown pipe table row (e.g., | Item | Quantity | Price |)
  if (/^\|.*\|\s*$/.test(trimmed)) return true;

  // Tab-delimited row (at least 2 tabs)
  if ((line.match(/\t/g) || []).length >= 2) return true;

  // Columnar layout: at least 2 distinct whitespace gaps of 3+ spaces
  const multiSpaceGaps = (line.match(/\s{3,}/g) || []).length;
  if (multiSpaceGaps >= 2) return true;

  // Numbered table line (e.g. "1.   Hydraulic Torque Wrench   2 Sets   Rourkela")
  if (/^\s*\d+[\s.)-]+\S+(?:\s{2,}\S+){2,}/.test(line)) return true;

  return false;
};

/**
 * Determines whether a line represents a field label or key-value pair.
 *
 * @param {string} line
 * @returns {{ isLabel: boolean, isStandaloneLabel: boolean, label: string }}
 */
export const parseLabelLine = (line = '') => {
  const trimmed = line.trim();
  // Standalone label line ending with colon (e.g., "Item Category:")
  const standaloneMatch = trimmed.match(/^([A-Za-z0-9\s/()._-]{2,50}):\s*$/);
  if (standaloneMatch) {
    return { isLabel: true, isStandaloneLabel: true, label: standaloneMatch[1] };
  }

  // Label with value (e.g., "Bid Number: GEM/2026/B/7824594")
  const inlineMatch = trimmed.match(/^([A-Za-z0-9\s/()._-]{2,40}):\s+(.+)$/);
  if (inlineMatch) {
    return { isLabel: true, isStandaloneLabel: false, label: inlineMatch[1] };
  }

  return { isLabel: false, isStandaloneLabel: false, label: '' };
};

/**
 * Breaks raw document text into cohesive semantic blocks (paragraphs, atomic table rows, label-value pairs).
 * Atomic units (such as a label line followed by its value, or table rows) are grouped so that chunking
 * never cuts them apart.
 *
 * @param {string} fullText
 * @returns {Array<{ text: string, isTable: boolean, sectionHeader?: string, estimatedTokens: number }>}
 */
export const parseSemanticBlocks = (fullText = '') => {
  const rawLines = fullText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let currentBlockLines = [];
  let currentBlockIsTable = false;
  let inStandaloneLabel = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Check for major section headings
    const sectionName = detectSection(trimmed);
    const isMajorHeading = sectionName !== 'General' && trimmed.length < 80;

    if (isMajorHeading) {
      if (currentBlockLines.length > 0) {
        const text = currentBlockLines.join('\n');
        blocks.push({
          text,
          isTable: currentBlockIsTable,
          estimatedTokens: estimateTokenCount(text),
        });
        currentBlockLines = [];
        currentBlockIsTable = false;
        inStandaloneLabel = false;
      }
      blocks.push({
        text: line,
        isTable: false,
        sectionHeader: sectionName,
        estimatedTokens: estimateTokenCount(line),
      });
      continue;
    }

    const tableRow = isTableRow(line);
    const labelInfo = parseLabelLine(line);

    if (tableRow) {
      // If previous block wasn't a table, flush it
      if (currentBlockLines.length > 0 && !currentBlockIsTable) {
        const text = currentBlockLines.join('\n');
        blocks.push({
          text,
          isTable: false,
          estimatedTokens: estimateTokenCount(text),
        });
        currentBlockLines = [];
      }
      currentBlockIsTable = true;
      currentBlockLines.push(line);
      inStandaloneLabel = false;
      continue;
    }

    if (currentBlockIsTable) {
      // End of table block reached
      if (currentBlockLines.length > 0) {
        const text = currentBlockLines.join('\n');
        blocks.push({
          text,
          isTable: true,
          estimatedTokens: estimateTokenCount(text),
        });
        currentBlockLines = [];
        currentBlockIsTable = false;
      }
    }

    // Handle standalone label followed by its value line
    if (labelInfo.isStandaloneLabel) {
      if (currentBlockLines.length > 0 && !inStandaloneLabel) {
        const text = currentBlockLines.join('\n');
        blocks.push({
          text,
          isTable: false,
          estimatedTokens: estimateTokenCount(text),
        });
        currentBlockLines = [];
      }
      currentBlockLines.push(line);
      inStandaloneLabel = true;
      continue;
    }

    if (inStandaloneLabel) {
      // This line is the value for the standalone label above
      currentBlockLines.push(line);
      const text = currentBlockLines.join('\n');
      blocks.push({
        text,
        isTable: false,
        estimatedTokens: estimateTokenCount(text),
      });
      currentBlockLines = [];
      inStandaloneLabel = false;
      continue;
    }

    // Blank line indicates paragraph boundary
    if (!trimmed) {
      if (currentBlockLines.length > 0) {
        const text = currentBlockLines.join('\n');
        blocks.push({
          text,
          isTable: false,
          estimatedTokens: estimateTokenCount(text),
        });
        currentBlockLines = [];
      }
      continue;
    }

    currentBlockLines.push(line);
  }

  if (currentBlockLines.length > 0) {
    const text = currentBlockLines.join('\n');
    blocks.push({
      text,
      isTable: currentBlockIsTable,
      estimatedTokens: estimateTokenCount(text),
    });
  }

  return blocks;
};

/**
 * Section-aware chunking with token constraints, provenance tracking, table integrity preservation,
 * and duplicate detection using normalized text hashing.
 *
 * @param {string} fullText - Verbatim extracted document text
 * @param {Object} [options]
 * @param {number} [options.chunkSizeTokens=800] - Target tokens per chunk (~700-1000 tokens)
 * @param {number} [options.overlapTokens=120] - Overlap between adjacent chunks (~100-150 tokens)
 * @param {number} [options.pageCount=1] - Total pages in original document
 * @param {boolean} [options.deduplicate=false] - Whether to exclude duplicate chunks (retaining only first occurrence)
 * @returns {Array<{ chunkIndex: number, text: string, normalizedText: string, contentHash: string, section: string, provenance: Object, tokenCount: number, isDuplicate: boolean }>}
 */
export const chunkDocumentText = (fullText = '', options = {}) => {
  if (!fullText || typeof fullText !== 'string' || fullText.trim().length === 0) {
    return [];
  }

  const chunkSizeTokens = options.chunkSizeTokens ?? env.chunkSizeTokens ?? 800;
  const overlapTokens = options.overlapTokens ?? env.chunkOverlapTokens ?? 120;
  const pageCount = Math.max(1, options.pageCount || 1);
  const deduplicate = Boolean(options.deduplicate);

  const clean = fullText.replace(/\r\n/g, '\n');
  const totalLength = clean.length;
  const semanticBlocks = parseSemanticBlocks(clean);

  if (semanticBlocks.length === 0) return [];

  const chunks = [];
  const seenHashes = new Set();
  let currentSection = 'General';
  let blockIndex = 0;
  let chunkIndex = 0;

  while (blockIndex < semanticBlocks.length) {
    const chunkBlocks = [];
    let accumulatedTokens = 0;
    const startBlockIdx = blockIndex;

    // Accumulate atomic semantic blocks up to chunkSizeTokens
    while (blockIndex < semanticBlocks.length) {
      const block = semanticBlocks[blockIndex];

      // Section boundary awareness: if a new major section begins and we already have content, finalize current chunk
      if (block.sectionHeader && chunkBlocks.length > 0) {
        break;
      }

      if (block.sectionHeader) {
        currentSection = block.sectionHeader;
      }

      // If adding this block would exceed chunk size, and we already have sufficient tokens (>= 200), break
      if (accumulatedTokens + block.estimatedTokens > chunkSizeTokens && accumulatedTokens >= 200) {
        break;
      }

      chunkBlocks.push(block);
      accumulatedTokens += block.estimatedTokens;
      blockIndex++;

      // If we hit or exceeded chunkSizeTokens, finish chunk
      if (accumulatedTokens >= chunkSizeTokens) {
        break;
      }
    }

    // Fallback: If a single atomic block is gigantic, include it directly
    if (chunkBlocks.length === 0 && blockIndex < semanticBlocks.length) {
      chunkBlocks.push(semanticBlocks[blockIndex]);
      accumulatedTokens += semanticBlocks[blockIndex].estimatedTokens;
      blockIndex++;
    }

    if (chunkBlocks.length > 0) {
      const chunkText = chunkBlocks.map((b) => b.text).join('\n\n');
      const normalized = normalizeChunkText(chunkText);
      const hash = computeContentHash(chunkText);
      const isDuplicate = seenHashes.has(hash);
      seenHashes.add(hash);

      // Calculate character offsets for approximate page provenance
      const charOffset = clean.indexOf(chunkBlocks[0].text);
      const approxPageStart =
        charOffset >= 0 && totalLength > 0
          ? Math.min(pageCount, Math.max(1, Math.floor((charOffset / totalLength) * pageCount) + 1))
          : 1;

      const endOffset =
        charOffset >= 0 ? charOffset + chunkText.length : Math.min(totalLength, 1000);
      const approxPageEnd =
        totalLength > 0
          ? Math.min(
              pageCount,
              Math.max(approxPageStart, Math.floor((endOffset / totalLength) * pageCount) + 1)
            )
          : approxPageStart;

      const chunkObj = {
        chunkIndex,
        text: chunkText, // Exact verbatim source text
        normalizedText: normalized,
        contentHash: hash,
        section: detectSection(chunkText) !== 'General' ? detectSection(chunkText) : currentSection,
        provenance: {
          pageStart: approxPageStart,
          pageEnd: approxPageEnd,
          paragraphStart: startBlockIdx + 1,
          paragraphEnd: blockIndex,
        },
        tokenCount: accumulatedTokens,
        isDuplicate,
      };

      if (!deduplicate || !isDuplicate) {
        chunks.push(chunkObj);
        chunkIndex++;
      }
    }

    // Determine overlap: rewind blockIndex to cover overlapTokens
    if (blockIndex < semanticBlocks.length) {
      let overlapCount = 0;
      let rewindSteps = 0;

      for (let r = chunkBlocks.length - 1; r >= 0; r--) {
        const b = chunkBlocks[r];
        if (overlapCount + b.estimatedTokens > overlapTokens) break;
        overlapCount += b.estimatedTokens;
        rewindSteps++;
      }

      // Ensure progression to avoid infinite loops
      const maxRewind = Math.max(0, chunkBlocks.length - 1);
      blockIndex = Math.max(startBlockIdx + 1, blockIndex - Math.min(rewindSteps, maxRewind));
    }
  }

  return chunks;
};

/**
 * Measures chunking and retrieval quality metrics over a collection of chunks.
 *
 * @param {Array<Object>} chunks
 * @param {Object} [options]
 * @returns {Object} Quality metrics report
 */
export const measureRetrievalQuality = (chunks = []) => {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return {
      totalChunks: 0,
      avgTokens: 0,
      minTokens: 0,
      maxTokens: 0,
      duplicateCount: 0,
      tableRowPreservationRate: 1.0,
      sectionBreakdown: {},
      qualityScore: 100,
    };
  }

  const tokenCounts = chunks.map((c) => c.tokenCount || estimateTokenCount(c.text));
  const totalTokens = tokenCounts.reduce((acc, n) => acc + n, 0);
  const avgTokens = Math.round(totalTokens / tokenCounts.length);
  const minTokens = Math.min(...tokenCounts);
  const maxTokens = Math.max(...tokenCounts);

  let duplicateCount = 0;
  const sectionBreakdown = {};

  for (const c of chunks) {
    if (c.isDuplicate) duplicateCount++;
    const sec = c.section || 'General';
    sectionBreakdown[sec] = (sectionBreakdown[sec] || 0) + 1;
  }

  // Calculate table row preservation: verify no chunk severed a pipe table row
  let totalTableRows = 0;
  let brokenTableRows = 0;

  for (const c of chunks) {
    const lines = c.text.split('\n');
    for (const l of lines) {
      if (isTableRow(l)) {
        totalTableRows++;
        // If a line starts with '|' but doesn't end with '|', it was split mid-row
        if (l.trim().startsWith('|') && !l.trim().endsWith('|')) {
          brokenTableRows++;
        }
      }
    }
  }

  const tableRowPreservationRate =
    totalTableRows > 0 ? (totalTableRows - brokenTableRows) / totalTableRows : 1.0;

  // Composite score: weights size uniformity and table preservation
  let penalty = 0;
  if (minTokens < 100 && tokenCounts.length > 1) penalty += 10;
  if (maxTokens > 1500) penalty += 15;
  if (tableRowPreservationRate < 1.0) penalty += 30;

  const qualityScore = Math.max(0, 100 - penalty);

  return {
    totalChunks: chunks.length,
    avgTokens,
    minTokens,
    maxTokens,
    duplicateCount,
    tableRowPreservationRate,
    sectionBreakdown,
    qualityScore,
  };
};
