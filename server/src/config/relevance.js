import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { AppError } from '../utils/AppError.js';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_CONFIG_PATH = resolve(currentDir, 'relevance.json');

export const parseRelevanceConfig = (jsonString) => {
  try {
    const raw = JSON.parse(jsonString);

    const relatedMinDistinct = Number.parseInt(raw.relatedMinDistinct, 10);
    const relatedMinTotalHits = Number.parseInt(raw.relatedMinTotalHits, 10);
    const possibleMinDistinct = Number.parseInt(raw.possibleMinDistinct, 10);
    const maxWordGap = Number.parseInt(raw.maxWordGap, 10);

    if (
      Number.isNaN(relatedMinDistinct) ||
      Number.isNaN(relatedMinTotalHits) ||
      Number.isNaN(possibleMinDistinct) ||
      Number.isNaN(maxWordGap)
    ) {
      throw new Error('All relevance threshold values must be valid integers');
    }

    return Object.freeze({
      relatedMinDistinct,
      relatedMinTotalHits,
      possibleMinDistinct,
      maxWordGap,
    });
  } catch (error) {
    throw new AppError(`Invalid relevance configuration: ${error.message}`, 500);
  }
};

export const loadRelevanceConfig = (filePath = DEFAULT_CONFIG_PATH) => {
  if (!existsSync(filePath)) {
    throw new AppError(`Relevance configuration file not found: ${filePath}`, 500);
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseRelevanceConfig(content);
};

export const relevanceConfig = loadRelevanceConfig();
