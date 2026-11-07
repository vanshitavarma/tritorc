export default function HybridScoreBadge({ score, grade, breakdown, isProvisional = false }) {
  const numericScore = typeof score === 'number' ? Math.round(score) : null;

  if (numericScore === null) {
    return <span className="score-badge score-unassessed">N/A</span>;
  }

  let gradeClass = 'score-not-relevant';
  let gradeLabel = grade || 'Not Relevant';

  if (numericScore >= 80) {
    gradeClass = 'score-highly-relevant';
    gradeLabel = grade || 'Highly Relevant';
  } else if (numericScore >= 60) {
    gradeClass = 'score-related';
    gradeLabel = grade || 'Related';
  } else if (numericScore >= 40) {
    gradeClass = 'score-possible';
    gradeLabel = grade || 'Possible';
  } else if (numericScore >= 20) {
    gradeClass = 'score-low-relevance';
    gradeLabel = grade || 'Low Relevance';
  }

  const tooltipText = breakdown
    ? `K:${breakdown.keywordScore ?? breakdown.keyword ?? 0}/30 S:${breakdown.semanticScore ?? breakdown.semantic ?? 0}/25 T:${breakdown.technicalScore ?? breakdown.technical ?? 0}/25 W:${breakdown.scopeScore ?? breakdown.scope ?? 0}/20`
    : `Score: ${numericScore}/100`;

  return (
    <div
      className={`hybrid-score-badge ${gradeClass}`}
      title={tooltipText}
    >
      <span className="score-number">{numericScore}</span>
      <span className="score-max">/100</span>
      <span className="score-grade-text">{gradeLabel}</span>
      {isProvisional && <span className="score-provisional-dot" title="Provisional baseline score">•</span>}
    </div>
  );
}
