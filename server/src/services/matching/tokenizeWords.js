import { stemmer } from 'stemmer';
import { normalizeText } from './normalizeText.js';

export const tokenizeWords = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const wordRegex = /[\p{L}\p{N}]+/gu;
  const tokens = [];
  let match;

  while ((match = wordRegex.exec(normalized)) !== null) {
    const word = match[0];
    tokens.push({
      word,
      stem: stemmer(word),
      index: match.index,
    });
  }

  return tokens;
};
