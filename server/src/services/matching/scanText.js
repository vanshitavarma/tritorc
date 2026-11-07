import { loadKeywords } from '../../config/keywords.js';
import { relevanceConfig } from '../../config/relevance.js';
import { tokenizeWords } from './tokenizeWords.js';
import { findKeywordHits } from './findKeywordHits.js';

export const scanText = (text, keywords = null, options = {}) => {
  const keywordList = Array.isArray(keywords) && keywords.length > 0 ? keywords : loadKeywords();
  const maxWordGap = options.maxWordGap ?? relevanceConfig.maxWordGap;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return {
      matches: [],
      distinctCount: 0,
      totalHits: 0,
    };
  }

  const documentTokens = tokenizeWords(text);
  if (documentTokens.length === 0) {
    return {
      matches: [],
      distinctCount: 0,
      totalHits: 0,
    };
  }

  const matchedKeywords = [];

  for (const keyword of keywordList) {
    const hitResult = findKeywordHits(documentTokens, keyword, maxWordGap);
    if (hitResult.hits > 0) {
      matchedKeywords.push(hitResult);
    }
  }

  // Sort matches by first appearance in the source text
  matchedKeywords.sort((a, b) => a.firstIndex - b.firstIndex);

  const distinctCount = matchedKeywords.length;
  const totalHits = matchedKeywords.reduce((sum, item) => sum + item.hits, 0);

  return {
    matches: matchedKeywords,
    distinctCount,
    totalHits,
  };
};
