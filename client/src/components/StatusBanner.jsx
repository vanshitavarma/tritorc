export default function StatusBanner({ results }) {
  if (!results || results.length === 0) return null;

  const total = results.length;
  const relatedCount = results.filter((r) => r.relevance === 'Related').length;
  const possibleCount = results.filter((r) => r.relevance === 'Possible').length;
  const notRelatedCount = results.filter((r) => r.relevance === 'Not Related').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return (
    <div className="status-banner">
      <div className="stat-card">
        <span className="stat-label">Total Documents</span>
        <span className="stat-value">{total}</span>
      </div>
      <div className="stat-card stat-related">
        <span className="stat-label">Related</span>
        <span className="stat-value">{relatedCount}</span>
      </div>
      <div className="stat-card stat-possible">
        <span className="stat-label">Possible</span>
        <span className="stat-value">{possibleCount}</span>
      </div>
      <div className="stat-card stat-not-related">
        <span className="stat-label">Not Related</span>
        <span className="stat-value">{notRelatedCount}</span>
      </div>
      {failedCount > 0 && (
        <div className="stat-card stat-failed">
          <span className="stat-label">Extraction Errors</span>
          <span className="stat-value">{failedCount}</span>
        </div>
      )}
    </div>
  );
}
