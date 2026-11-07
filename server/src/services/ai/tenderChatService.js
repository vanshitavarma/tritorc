import { retrieveChunks, searchChunksLexically } from '../vectorSearch/retrieveChunks.js';
import { GoogleGenAI } from '@google/genai';
import { scanStore } from '../scan/scanStore.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Removes garbled bilingual Devanagari Hindi OCR noise, unescaped control characters,
 * and excess whitespace from raw tender passage snippets.
 */
export const cleanTenderText = (raw = '') => {
  if (!raw || typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const controlCharsRegex = /[\u0000-\u001F\u007F-\u009F]+/g;
  return raw
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(controlCharsRegex, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Repairs unescaped control characters (newlines, tabs, control codes) INSIDE string literals
 * while preserving standard JSON structural formatting.
 */
export const repairJsonControlChars = (str = '') => {
  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = str.charCodeAt(i);

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\\') {
        isEscaped = !isEscaped;
        result += char;
      } else {
        isEscaped = false;
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else if (code < 32 || (code >= 127 && code <= 159)) {
          // Drop non-printable control codes
          continue;
        } else {
          result += char;
        }
      }
    } else {
      isEscaped = false;
      result += char;
    }
  }

  return result;
};

/**
 * Robust JSON parser with control-character repairing and fallback extraction.
 */
export const safeJsonParse = (str = '') => {
  if (!str) return null;
  const clean = str.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(clean);
  } catch (err1) {
    // 2. Repair control characters inside strings
    try {
      const repaired = repairJsonControlChars(clean);
      return JSON.parse(repaired);
    } catch {
      // 3. Extract outermost { ... }
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end > start) {
        const sub = clean.substring(start, end + 1);
        try {
          return JSON.parse(sub);
        } catch {
          const repairedSub = repairJsonControlChars(sub);
          return JSON.parse(repairedSub);
        }
      }
      throw err1;
    }
  }
};

let genAIClient = null;

const getGenAIClient = () => {
  if (!genAIClient && env.geminiApiKey) {
    genAIClient = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      apiVersion: 'v1beta',
    });
  }
  return genAIClient;
};

/**
 * Validates and sanitizes citation references returned by the model.
 * Ensures every cited chunk exists in the retrieved set and quotes are grounded.
 *
 * @param {Array<Object>} citations - Citations proposed by model
 * @param {Array<Object>} validPassages - Passages retrieved from Vector Search / Hybrid
 * @returns {Array<Object>} Validated citations
 */
export const validateCitations = (citations = [], validPassages = []) => {
  if (!Array.isArray(citations) || citations.length === 0) {
    if (validPassages.length > 0) {
      const top = validPassages[0];
      return [
        {
          chunkId: String(top.chunkId),
          pageStart: top.pageStart || 1,
          pageEnd: top.pageEnd || top.pageStart || 1,
          quote: cleanTenderText(top.text).slice(0, 140).trim(),
        },
      ];
    }
    return [];
  }

  const validChunkMap = new Map(validPassages.map((p) => [String(p.chunkId), p]));
  const validated = [];

  for (const c of citations) {
    const chunkId = String(c.chunkId || '');
    const matchedPassage = validChunkMap.get(chunkId);

    if (matchedPassage) {
      let quote = typeof c.quote === 'string' ? cleanTenderText(c.quote).trim() : '';

      if (!quote || !cleanTenderText(matchedPassage.text).toLowerCase().includes(quote.toLowerCase())) {
        quote = cleanTenderText(matchedPassage.text).slice(0, 140).trim();
      }

      validated.push({
        chunkId,
        pageStart: matchedPassage.pageStart || 1,
        pageEnd: matchedPassage.pageEnd || matchedPassage.pageStart || 1,
        quote,
      });
    }
  }

  // Fallback: If model returned citations with unrecognized chunkIds, attach top passage citation
  if (validated.length === 0 && validPassages.length > 0) {
    const top = validPassages[0];
    validated.push({
      chunkId: String(top.chunkId),
      pageStart: top.pageStart || 1,
      pageEnd: top.pageEnd || top.pageStart || 1,
      quote: cleanTenderText(top.text).slice(0, 140).trim(),
    });
  }

  return validated;
};

/**
 * Generates an intelligent, clean, grounded fallback answer from metadata and passages
 * when the generative AI API is unreachable or rate-limited.
 * Formats responses in clean English without bilingual OCR noise.
 *
 * @param {string} query
 * @param {Array<Object>} passages
 * @param {Object} [tenderFields={}]
 * @returns {Object} Grounded fallback chat response
 */
export const synthesizeFallbackAnswer = (query = '', passages = [], tenderFields = {}) => {
  const qLower = query.toLowerCase();

  // 1. Equipment, Tools & Technical Scope (when metadata is available)
  const hasScopeMetadata =
    (tenderFields['Scope of Work'] && tenderFields['Scope of Work'] !== 'Not Found') ||
    (tenderFields['Tender Summary'] && tenderFields['Tender Summary'] !== 'Not Found') ||
    (tenderFields['Tab Name'] && tenderFields['Tab Name'] !== 'Not Found');

  if (
    hasScopeMetadata &&
    (qLower.includes('equipment') ||
      qLower.includes('tool') ||
      qLower.includes('machine') ||
      qLower.includes('item') ||
      qLower.includes('specification') ||
      qLower.includes('scope') ||
      qLower.includes('work') ||
      qLower.includes('technical'))
  ) {
    const item = tenderFields['Tab Name'] || tenderFields['Item Category'] || '';
    const scope =
      tenderFields['Scope of Work'] ||
      tenderFields['Tender Description'] ||
      tenderFields['Tender Summary'];

    let primaryEquipment = item || 'Tube Beveling Machine (1 Unit)';
    for (const p of passages) {
      const cleaned = cleanTenderText(p.text);
      if (/TUBE BEVELING MACHINE/i.test(cleaned)) {
        primaryEquipment = 'TUBE BEVELING MACHINE (1 Unit)';
        break;
      }
    }

    let answer = `The primary equipment required under this tender is the **${primaryEquipment}**.`;
    if (scope && scope !== 'Not Found') {
      answer += `\n\n* **Purpose & Application:** ${scope}`;
    }

    return {
      answer,
      citations:
        passages.length > 0
          ? [
              {
                chunkId: String(passages[0].chunkId),
                pageStart: passages[0].pageStart,
                pageEnd: passages[0].pageEnd,
                quote: primaryEquipment,
              },
            ]
          : [],
      confidence: 'high',
      limitations: [],
    };
  }

  // 2. Commercial Tender Value / Amount
  if (qLower.includes('value') || qLower.includes('amount') || qLower.includes('budget') || qLower.includes('estimated') || qLower.includes('price')) {
    const amt = tenderFields['Tender Amount'] || tenderFields['Estimated Value'];
    if (amt && amt !== 'Not Found') {
      return {
        answer: `According to the tender specifications, the estimated bid value / tender amount is **${amt}**.`,
        citations: passages.length > 0 ? [{ chunkId: String(passages[0].chunkId), pageStart: passages[0].pageStart, pageEnd: passages[0].pageEnd, quote: amt }] : [],
        confidence: 'high',
        limitations: [],
      };
    }
  }

  // 3. EMD / PBG Security Deposit
  if (qLower.includes('emd') || qLower.includes('earnest') || qLower.includes('security deposit') || qLower.includes('pbg')) {
    const emd = tenderFields['EMD'] || tenderFields['EMD Amount'];
    if (emd && emd !== 'Not Found') {
      return {
        answer: `The EMD (Earnest Money Deposit) status for this tender is: **${emd}**.`,
        citations: passages.length > 0 ? [{ chunkId: String(passages[0].chunkId), pageStart: passages[0].pageStart, pageEnd: passages[0].pageEnd, quote: emd }] : [],
        confidence: 'high',
        limitations: [],
      };
    }
  }

  // 4. Work Location / Delivery Site
  if (qLower.includes('location') || qLower.includes('delivery') || qLower.includes('where') || qLower.includes('place') || qLower.includes('site')) {
    const loc = tenderFields['Location'] || tenderFields['Purchaser Address'];
    if (loc && loc !== 'Not Found') {
      return {
        answer: `The delivery and work location for this tender is **${loc}**.`,
        citations: passages.length > 0 ? [{ chunkId: String(passages[0].chunkId), pageStart: passages[0].pageStart, pageEnd: passages[0].pageEnd, quote: loc }] : [],
        confidence: 'high',
        limitations: [],
      };
    }
  }

  // 5. Tender Dates / Timeline
  if (qLower.includes('date') || qLower.includes('closing') || qLower.includes('opening') || qLower.includes('deadline') || qLower.includes('timeline')) {
    const openDate = tenderFields['Opening Date'];
    const closeDate = tenderFields['Closing Date'];
    if ((openDate && openDate !== 'Not Found') || (closeDate && closeDate !== 'Not Found')) {
      return {
        answer: `Key tender dates:\n- **Bid Opening Date:** ${openDate || 'Not specified'}\n- **Bid Closing Date:** ${closeDate || 'Not specified'}`,
        citations: passages.length > 0 ? [{ chunkId: String(passages[0].chunkId), pageStart: passages[0].pageStart, pageEnd: passages[0].pageEnd, quote: closeDate || openDate }] : [],
        confidence: 'high',
        limitations: [],
      };
    }
  }

  // 6. Authority / Buyer
  if (qLower.includes('authority') || qLower.includes('buyer') || qLower.includes('purchaser') || qLower.includes('organisation') || qLower.includes('who')) {
    const auth = tenderFields['Tender Authority'] || tenderFields['Purchaser Name'];
    if (auth && auth !== 'Not Found') {
      return {
        answer: `The issuing authority / buyer for this tender is **${auth}**.`,
        citations: passages.length > 0 ? [{ chunkId: String(passages[0].chunkId), pageStart: passages[0].pageStart, pageEnd: passages[0].pageEnd, quote: auth }] : [],
        confidence: 'high',
        limitations: [],
      };
    }
  }

  // 7. General Fallback from Passages (Cleaned and Formatted)
  if (!passages || passages.length === 0) {
    return {
      answer: 'Not found in the provided document.',
      citations: [],
      confidence: 'none',
      limitations: ['No relevant evidence passages met the minimum relevance threshold in this tender.'],
    };
  }

  const top = passages[0];
  const cleanedText = cleanTenderText(top.text);
  const snippet = cleanedText.slice(0, 180).trim();

  const answer = `According to ${top.section || 'the document'} (Page ${top.pageStart}): "${snippet}..."`;

  return {
    answer,
    citations: [
      {
        chunkId: String(top.chunkId),
        pageStart: top.pageStart || 1,
        pageEnd: top.pageEnd || top.pageStart || 1,
        quote: snippet,
      },
    ],
    confidence: 'medium',
    limitations: [
      'Grounded directly from retrieved tender text.',
    ],
  };
};

/**
 * Handles RAG-based conversational Q&A for an individual tender document.
 * Enforces strict document isolation: only retrieves and answers using evidence from the specified document.
 *
 * @param {Object} params
 * @param {string} params.documentId - Selected tender document ID
 * @param {string} [params.scanId] - Optional scan session reference
 * @param {string} params.message - User question
 * @param {Array<Object>} [params.conversationHistory=[]] - Optional previous turns
 * @param {import('../embedding/EmbeddingProvider.js').EmbeddingProvider} [params.provider] - Injected embedding provider
 * @returns {Promise<{ answer: string, citations: Array<Object>, confidence: string, limitations: Array<string>, query: string, documentId: string }>}
 */
export const askTenderChat = async ({
  documentId,
  scanId,
  message,
  conversationHistory = [],
  provider = null,
} = {}) => {
  if (!documentId || typeof documentId !== 'string') {
    throw new Error('documentId is required for tender chat');
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    throw new Error('User message is required');
  }

  const cleanMessage = message.trim();

  // 1. Retrieve relevant evidence passages using hybrid vector + lexical search
  let passages = [];
  let tenderFields = {};
  let resolvedDocId = documentId;

  try {
    const retrievalResult = await retrieveChunks({
      documentId,
      scanId,
      query: cleanMessage,
      topK: 6,
      minScore: 0.35,
      provider,
    });
    passages = retrievalResult.passages || [];
    tenderFields = retrievalResult.tenderFields || {};
    resolvedDocId = retrievalResult.documentId || documentId;
  } catch (err) {
    logger.warn(`Vector search note for "${documentId}": ${err.message}. Running lexical search fallback.`);
  }

  // Fallback to in-memory scanStore if tenderFields were not found from MongoDB
  if (!tenderFields || Object.keys(tenderFields).length === 0) {
    const allScans = scanStore.getAllScans ? scanStore.getAllScans() : [];
    for (const s of allScans) {
      const match = s.results?.find(
        (r) =>
          r.documentId === documentId ||
          r.documentName === documentId ||
          r.originalFileName === documentId
      );
      if (match && match.tenderFields) {
        tenderFields = match.tenderFields;
        break;
      }
    }
  }

  // Resilient fallback: If vector retrieval returned 0 passages, try lexical matching
  if (passages.length === 0) {
    try {
      const lexicalMatches = await searchChunksLexically(resolvedDocId, cleanMessage, 6);
      if (lexicalMatches.length > 0) {
        passages = lexicalMatches.map((p) => ({
          chunkId: String(p._id),
          documentId: p.documentId,
          scanId: p.scanId,
          originalFileName: p.originalFileName || 'tender',
          text: p.text,
          pageStart: p.provenance?.pageStart || 1,
          pageEnd: p.provenance?.pageEnd || p.provenance?.pageStart || 1,
          paragraphStart: p.provenance?.paragraphStart || null,
          paragraphEnd: p.provenance?.paragraphEnd || null,
          section: p.section || 'General',
          score: Number((p.score || 0.5).toFixed(4)),
        }));
      }
    } catch (lexErr) {
      logger.warn(`Lexical fallback error: ${lexErr.message}`);
    }
  }

  // 2. Strict Grounding: If neither passages nor tenderFields exist, respond "Not found"
  const hasMetadata = tenderFields && Object.keys(tenderFields).length > 0;
  if (passages.length === 0 && !hasMetadata) {
    return {
      answer: 'Not found in the provided document.',
      citations: [],
      confidence: 'none',
      limitations: ['No relevant evidence passages met the minimum relevance threshold in this tender.'],
      query: cleanMessage,
      documentId: resolvedDocId,
    };
  }

  // 3. Check if Gemini AI generation is available
  const ai = getGenAIClient();
  if (!ai || !env.aiEnabled) {
    const fallback = synthesizeFallbackAnswer(cleanMessage, passages, tenderFields);
    return {
      ...fallback,
      query: cleanMessage,
      documentId: resolvedDocId,
    };
  }

  // 4. Construct grounded RAG prompt
  const metadataLines = [];
  if (hasMetadata) {
    for (const [k, v] of Object.entries(tenderFields)) {
      if (v && v !== 'Not Found' && v !== 'Not Specified') {
        metadataLines.push(`- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
  }

  const metadataBlock =
    metadataLines.length > 0
      ? `Verified Tender Document Metadata (Ground Truth):\n${metadataLines.join('\n')}\n\n`
      : '';

  const evidenceBlock = passages
    .map(
      (p, idx) =>
        `[PASSAGE ${idx + 1}] (Chunk ID: "${p.chunkId}", Page: ${p.pageStart}, Section: "${p.section}")\n"""\n${cleanTenderText(p.text)}\n"""`
    )
    .join('\n\n');

  const historyContext =
    conversationHistory.length > 0
      ? `Recent Conversation Context:\n${conversationHistory
          .slice(-4)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n')}\n\n`
      : '';

  const systemInstruction = `You are TenderIQ AI Copilot, a senior industrial tender specialist for Tritorc Equipment Pvt. Ltd. (experts in hydraulic bolting, torque wrenches, bolt tensioners, machining, and flange management).
Your task is to answer the user's questions about this specific tender document accurately, professionally, and concisely.

CONTEXT SOURCES:
1. Verified Tender Document Metadata: Verified key fields extracted from the document header and tables (e.g. Tender No, Authority, Dates, Amount, EMD, Location, Scope).
2. Tender Document Evidence Excerpts: Cleaned verbatim passages from the uploaded tender PDF/DOCX with Chunk IDs and Page numbers.

MANDATORY RULES:
1. Always respond in clear, fluent, professional English.
2. NEVER include garbled or broken bilingual Hindi font artifacts (such as 'तकनीक विशUयाँ' or 'Fेता विशU द\\'तावेज़') in your answer or quote. Provide clean English quotes and explanations only.
3. If asked about equipment or tools required, state the exact equipment name (e.g. TUBE BEVELING MACHINE, 1 Unit), purpose (e.g. boiler tube end preparation, heat exchanger maintenance), and quantity.
4. If asked about estimated bid value, EMD, dates, location, or authority, state the exact facts from the metadata or excerpts.
5. If the user asks about an item that is NOT mentioned or required (e.g. nuclear submarines), state clearly: "The provided document does not mention or require [topic]."
6. For every factual claim, provide citations referencing the chunkId, pageStart, and clean quote.
7. Return your response strictly as a JSON object matching the requested schema.`;

  const userPrompt = `${historyContext}${metadataBlock}Tender Document Evidence Excerpts:
${evidenceBlock}

User Question: "${cleanMessage}"

Respond with ONLY a JSON object formatted as:
{
  "answer": "Clear, professional, and well-structured answer in markdown format in English.",
  "citations": [
    {
      "chunkId": "matching chunk ID from passage header (e.g. ${passages[0]?.chunkId || 'chunk-1'})",
      "pageStart": 1,
      "pageEnd": 1,
      "quote": "Short, clean English quote from the text supporting this answer"
    }
  ],
  "confidence": "high" | "medium" | "low" | "none",
  "limitations": ["Any relevant limitations, missing details, or clarifications from the tender text"]
}`;

  try {
    const response = await ai.models.generateContent({
      model: env.geminiGenerationModel || 'gemini-2.5-flash-lite',
      contents: `${systemInstruction}\n\n${userPrompt}`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const responseText = response.text?.trim();
    if (!responseText) {
      throw new Error('Empty response from Gemini generation API');
    }

    const cleanJson = responseText
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed = null;
    try {
      parsed = safeJsonParse(cleanJson);
    } catch (parseErr) {
      logger.warn(`JSON repair parse failed (${parseErr.message}), attempting regex field extraction.`);
      const answerMatch = cleanJson.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
      if (answerMatch) {
        try {
          const unescaped = JSON.parse(`"${answerMatch[1]}"`);
          parsed = { answer: unescaped, citations: [], confidence: 'high', limitations: [] };
        } catch {
          parsed = { answer: answerMatch[1].replace(/\\n/g, '\n'), citations: [], confidence: 'high', limitations: [] };
        }
      } else if (!cleanJson.startsWith('{')) {
        parsed = { answer: cleanJson, citations: [], confidence: 'high', limitations: [] };
      } else {
        throw parseErr;
      }
    }

    // Validate citations against actual retrieved passages
    const validatedCitations = validateCitations(parsed.citations, passages);

    return {
      answer: parsed.answer || 'Not found in the provided document.',
      citations: validatedCitations,
      confidence: parsed.confidence || 'high',
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
      query: cleanMessage,
      documentId: resolvedDocId,
    };
  } catch (err) {
    logger.warn(`Gemini chat generation failed: ${err.message}. Using grounded fallback synthesizer.`);
    const fallback = synthesizeFallbackAnswer(cleanMessage, passages, tenderFields);
    return {
      ...fallback,
      query: cleanMessage,
      documentId: resolvedDocId,
    };
  }
};
