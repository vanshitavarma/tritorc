import { tokenizeWords } from './tokenizeWords.js';

export const findKeywordHits = (documentTokens, keywordString, maxWordGap = 1) => {
  if (!Array.isArray(documentTokens) || documentTokens.length === 0 || !keywordString) {
    return {
      keyword: keywordString,
      hits: 0,
      firstIndex: -1,
    };
  }

  const keywordTokens = tokenizeWords(keywordString);
  if (keywordTokens.length === 0) {
    return {
      keyword: keywordString,
      hits: 0,
      firstIndex: -1,
    };
  }

  const kStems = keywordTokens.map((t) => t.stem);
  const kLen = kStems.length;
  let hits = 0;
  let firstIndex = -1;

  let docIdx = 0;
  while (docIdx < documentTokens.length) {
    if (documentTokens[docIdx].stem === kStems[0]) {
      let matchedAll = true;
      let currentDocIdx = docIdx;

      for (let k = 1; k < kLen; k += 1) {
        const nextTargetStem = kStems[k];
        const maxSearchIdx = Math.min(
          documentTokens.length - 1,
          currentDocIdx + 1 + Math.max(0, maxWordGap)
        );
        let foundNext = false;

        for (
          let candidateIdx = currentDocIdx + 1;
          candidateIdx <= maxSearchIdx;
          candidateIdx += 1
        ) {
          if (documentTokens[candidateIdx].stem === nextTargetStem) {
            currentDocIdx = candidateIdx;
            foundNext = true;
            break;
          }
        }

        if (!foundNext) {
          matchedAll = false;
          break;
        }
      }

      if (matchedAll) {
        hits += 1;
        if (firstIndex === -1) {
          firstIndex = documentTokens[docIdx].index;
        }
        // Advance past matched phrase to avoid repeated counting of overlapping sub-tokens
        docIdx = currentDocIdx;
      }
    }

    docIdx += 1;
  }

  return {
    keyword: keywordString,
    hits,
    firstIndex,
  };
};
