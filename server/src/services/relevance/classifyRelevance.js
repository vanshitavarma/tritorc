import { relevanceConfig } from '../../config/relevance.js';

export const classifyRelevance = (scanResult, thresholds = relevanceConfig) => {
  const distinctCount = scanResult?.distinctCount || 0;
  const totalHits = scanResult?.totalHits || 0;

  const isRelated =
    distinctCount >= thresholds.relatedMinDistinct ||
    (distinctCount >= thresholds.possibleMinDistinct &&
      totalHits >= thresholds.relatedMinTotalHits);

  if (isRelated) {
    return 'Related';
  }

  if (distinctCount >= thresholds.possibleMinDistinct) {
    return 'Possible';
  }

  return 'Not Related';
};
