import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { AppError } from '../utils/AppError.js';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_KEYWORDS_PATH = resolve(currentDir, '../../data/keywords.csv');

let cachedKeywords = null;

export const parseKeywordsCsv = (csvContent) => {
  if (typeof csvContent !== 'string') {
    throw new AppError('Invalid keywords CSV content: expected string', 500);
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new AppError('Keywords CSV file is empty', 500);
  }

  const headerLine = lines[0].toLowerCase();
  const firstHeader = headerLine.split(',')[0].trim();
  if (firstHeader !== 'keyword') {
    throw new AppError(
      `Invalid keywords CSV header: expected "keyword" as the first column, got "${lines[0]}"`,
      500
    );
  }

  const seen = new Set();
  const uniqueKeywords = [];

  for (let i = 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const keyword = rawLine.split(',')[0].trim();

    if (!keyword) continue;

    const normalizedKey = keyword.toLowerCase();
    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      uniqueKeywords.push(keyword);
    }
  }

  return uniqueKeywords;
};

export const loadKeywords = ({ filePath = DEFAULT_KEYWORDS_PATH, forceReload = false } = {}) => {
  if (cachedKeywords && !forceReload && filePath === DEFAULT_KEYWORDS_PATH) {
    return cachedKeywords;
  }

  if (!existsSync(filePath)) {
    throw new AppError(`Keywords file not found: ${filePath}`, 500);
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseKeywordsCsv(content);

    if (filePath === DEFAULT_KEYWORDS_PATH) {
      cachedKeywords = parsed;
    }

    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to load keywords from ${filePath}: ${error.message}`, 500);
  }
};
