/**
 * 100-Point Hybrid Relevance Scorer for Tritorc Tender Evaluation.
 *
 * Evaluates 4 independent components:
 * 1. Keyword Alignment (K, max 30) - deterministic keyword hits and distinct count
 * 2. Semantic Similarity (S, max 25) - vector search cosine similarity
 * 3. Technical Alignment (T, max 25) - technical qualifications and equipment specs
 * 4. Scope-of-Work Alignment (W, max 20) - direct fit with Tritorc products/services
 *
 * Formula: Relevance Score = K + S + T + W
 */

export const HYBRID_THRESHOLDS = Object.freeze({
  HIGHLY_RELEVANT_MIN: 80,
  RELATED_MIN: 60,
  POSSIBLE_MIN: 40,
  LOW_RELEVANCE_MIN: 20,
});

/**
 * Maps numeric hybrid score to human-readable verdict grade.
 *
 * @param {number} score - Score from 0 to 100
 * @returns {string} Grade label
 */
export const getHybridScoreGrade = (score = 0) => {
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0) {
    return 'Not Assessed';
  }
  if (score >= HYBRID_THRESHOLDS.HIGHLY_RELEVANT_MIN) return 'Highly Relevant';
  if (score >= HYBRID_THRESHOLDS.RELATED_MIN) return 'Related';
  if (score >= HYBRID_THRESHOLDS.POSSIBLE_MIN) return 'Possible';
  if (score >= HYBRID_THRESHOLDS.LOW_RELEVANCE_MIN) return 'Low Relevance';
  return 'Not Relevant';
};

/**
 * Evaluates Keyword Alignment (0 to 30 points).
 */
export const evaluateKeywordAlignment = ({ distinctCount = 0, totalHits = 0 } = {}) => {
  if (distinctCount === 0 || totalHits === 0) {
    return { score: 0, factors: ['No baseline keywords matched'] };
  }

  let score = 0;
  const factors = [];

  // Distinct count contributes up to 18 points (6 pts per distinct keyword, max 3)
  const distinctScore = Math.min(18, distinctCount * 6);
  score += distinctScore;
  factors.push(`${distinctCount} distinct keyword(s) matched (${distinctScore}/18 pts)`);

  // Total hits contribute up to 12 points
  let hitsScore = 0;
  if (totalHits >= 15) hitsScore = 12;
  else if (totalHits >= 10) hitsScore = 10;
  else if (totalHits >= 5) hitsScore = 7;
  else if (totalHits >= 2) hitsScore = 4;
  else hitsScore = 2;

  score += hitsScore;
  factors.push(`${totalHits} total hit(s) across document (${hitsScore}/12 pts)`);

  return {
    score: Math.min(30, score),
    factors,
  };
};

/**
 * Evaluates Semantic Vector Similarity (0 to 25 points).
 * Calibrated against cosine similarity scores.
 */
export const evaluateSemanticSimilarity = ({ topSimilarity = 0, retrievedCount = 0 } = {}) => {
  if (topSimilarity <= 0 || retrievedCount === 0) {
    return { score: 0, factors: ['No semantic vector evidence available'] };
  }

  let score = 0;
  const factors = [];

  if (topSimilarity >= 0.85) {
    score = 25;
    factors.push(`Very high semantic similarity (${topSimilarity.toFixed(4)} >= 0.85)`);
  } else if (topSimilarity >= 0.78) {
    score = 21;
    factors.push(`High semantic similarity (${topSimilarity.toFixed(4)} >= 0.78)`);
  } else if (topSimilarity >= 0.70) {
    score = 16;
    factors.push(`Moderate semantic similarity (${topSimilarity.toFixed(4)} >= 0.70)`);
  } else if (topSimilarity >= 0.60) {
    score = 10;
    factors.push(`Basic semantic similarity (${topSimilarity.toFixed(4)} >= 0.60)`);
  } else if (topSimilarity >= 0.50) {
    score = 5;
    factors.push(`Marginal semantic similarity (${topSimilarity.toFixed(4)})`);
  } else {
    score = 0;
    factors.push(`Sub-threshold semantic similarity (${topSimilarity.toFixed(4)} < 0.50)`);
  }

  return {
    score,
    factors,
  };
};

/**
 * Evaluates Technical Alignment (0 to 25 points).
 * Checks technical qualifications, ratings, certifications, and tooling requirements.
 */
export const evaluateTechnicalAlignment = ({ technicalText = '', extractedFields = {} } = {}) => {
  const combined = `${technicalText} ${extractedFields['Technical Qualification'] || ''} ${extractedFields['Scope of Work'] || ''}`.toLowerCase();
  if (!combined.trim()) {
    return { score: 5, factors: ['Technical criteria not explicitly defined'] };
  }

  let score = 0;
  const factors = [];

  // 1. High-pressure ratings or torque thresholds (up to 8 pts)
  if (/\b(?:\d+\s*(?:nm|k\s*nm|bar|psi|kn)|15000\s*nm|700\s*bar)\b/i.test(combined)) {
    score += 8;
    factors.push('Specific torque/pressure ratings specified (e.g. Nm, Bar)');
  } else if (/\b(?:torque|tension|hydraulic|pressure)\b/i.test(combined)) {
    score += 4;
    factors.push('General hydraulic/torque tooling context present');
  }

  // 2. Industry certifications & credentials (up to 9 pts)
  if (/\b(?:iso|nabl|oem|calibration|make in india|class\s*[12])\b/i.test(combined)) {
    score += 9;
    factors.push('OEM/ISO/NABL calibration or certification required');
  } else if (/\b(?:experience|credentials|past\s*performance)\b/i.test(combined)) {
    score += 5;
    factors.push('Prior supply credentials or experience required');
  }

  // 3. Flange / Bolting specialization (up to 8 pts)
  if (/\b(?:bolting|flange|stud|tensioner|torque\s*wrench|nut\s*splitter)\b/i.test(combined)) {
    score += 8;
    factors.push('Direct technical match for bolting/flange tools');
  } else if (/\b(?:mechanical|machining|overhaul|maintenance)\b/i.test(combined)) {
    score += 4;
    factors.push('General mechanical or maintenance scope');
  }

  return {
    score: Math.min(25, Math.max(0, score)),
    factors,
  };
};

/**
 * Evaluates Scope of Work Alignment (0 to 20 points).
 * Checks direct commercial fit for Tritorc tools and turnaround services.
 */
export const evaluateScopeAlignment = ({ scopeText = '', category = '' } = {}) => {
  const combined = `${scopeText} ${category}`.toLowerCase();
  if (!combined.trim()) {
    return { score: 4, factors: ['Scope of work summary unavailable'] };
  }

  let score = 0;
  const factors = [];

  // Core product lines: Hydraulic torque wrenches, bolt tensioners, flange spreaders (15-20 pts)
  if (
    /\b(?:hydraulic\s*torque\s*wrench|bolt\s*tensioner|flange\s*management|nut\s*splitter|socket\s*set)\b/i.test(
      combined
    )
  ) {
    score = 20;
    factors.push('Core Tritorc product/service: Hydraulic torque wrench or tensioner');
  } else if (/\b(?:torque\s*wrench|hydraulic\s*nut|flange\s*spreader|impact\s*socket)\b/i.test(combined)) {
    score = 15;
    factors.push('Related bolting tool/accessory in scope');
  } else if (/\b(?:beveling|cold\s*cutting|pipe\s*cutting|tube\s*tool)\b/i.test(combined)) {
    score = 12;
    factors.push('Machining & pipe beveling tooling scope');
  } else if (/\b(?:refinery|petrochemical|turnaround|shutdown|boiler|turbine)\b/i.test(combined)) {
    score = 8;
    factors.push('Industrial plant turnaround/maintenance scope');
  } else {
    score = 3;
    factors.push('General procurement scope without specific bolting match');
  }

  return {
    score: Math.min(20, Math.max(0, score)),
    factors,
  };
};

/**
 * Calculates the complete 100-Point Hybrid Relevance Score.
 *
 * @param {Object} params
 * @param {number} params.distinctCount - Distinct keyword hits
 * @param {number} params.totalHits - Total keyword hits
 * @param {number} [params.topSimilarity=0] - Best vector search cosine similarity
 * @param {number} [params.retrievedCount=0] - Number of semantic evidence chunks
 * @param {string} [params.technicalText=''] - Technical qualification summary
 * @param {string} [params.scopeText=''] - Scope of work summary
 * @param {Object} [params.tenderFields={}] - Extracted 20 tender fields
 * @param {boolean} [params.isAiAvailable=true] - Whether AI/RAG was available for assessment
 * @returns {Object} Complete hybrid score report
 */
export const calculateHybridScore = ({
  distinctCount = 0,
  totalHits = 0,
  topSimilarity = 0,
  retrievedCount = 0,
  technicalText = '',
  scopeText = '',
  tenderFields = {},
  isAiAvailable = true,
} = {}) => {
  // 1. Keyword Alignment (max 30)
  const keywordResult = evaluateKeywordAlignment({ distinctCount, totalHits });

  // If AI was not available or retrieval failed, compute baseline provisional score
  const isProvisional = !isAiAvailable || topSimilarity <= 0;

  // 2. Semantic Similarity (max 25)
  const semanticResult = evaluateSemanticSimilarity({
    topSimilarity,
    retrievedCount,
  });

  // 3. Technical Alignment (max 25)
  const technicalResult = evaluateTechnicalAlignment({
    technicalText,
    extractedFields: tenderFields,
  });

  // 4. Scope Alignment (max 20)
  const scopeResult = evaluateScopeAlignment({
    scopeText: scopeText || tenderFields['Scope of Work'] || '',
    category: tenderFields['Tab Name'] || '',
  });

  const totalScore = Math.min(
    100,
    Math.round(
      keywordResult.score + semanticResult.score + technicalResult.score + scopeResult.score
    )
  );

  const grade = getHybridScoreGrade(totalScore);

  return {
    score: totalScore,
    grade,
    isProvisional,
    breakdown: {
      keywordScore: keywordResult.score,
      maxKeywordScore: 30,
      semanticScore: semanticResult.score,
      maxSemanticScore: 25,
      technicalScore: technicalResult.score,
      maxTechnicalScore: 25,
      scopeScore: scopeResult.score,
      maxScopeScore: 20,
    },
    evidence: {
      distinctKeywords: distinctCount,
      totalHits,
      topCosineSimilarity: Number(topSimilarity.toFixed(4)),
      keywordFactors: keywordResult.factors,
      semanticFactors: semanticResult.factors,
      technicalFactors: technicalResult.factors,
      scopeFactors: scopeResult.factors,
    },
  };
};
