export default function StatusBanner({ results }) {
  if (!results || results.length === 0) return null;

  const total = results.length;
  const validTenders = results.filter(
    (r) => r.isValidTender !== false && r.status !== 'rejected' && r.status !== 'review_needed'
  );
  const relatedCount = validTenders.filter((r) => r.relevance === 'Related').length;
  const possibleCount = validTenders.filter((r) => r.relevance === 'Possible').length;
  const notRelatedCount = validTenders.filter((r) => r.relevance === 'Not Related').length;
  const rejectedCount = results.filter(
    (r) => r.status === 'rejected' || r.documentType === 'NON_TENDER'
  ).length;
  const reviewCount = results.filter(
    (r) => r.status === 'review_needed' || r.documentType === 'UNKNOWN'
  ).length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return (
    <div className="status-banner">
      <div className="stat-card">
        <span className="stat-label">Total Uploaded</span>
        <span className="stat-value">{total}</span>
      </div>
      <div className="stat-card stat-valid">
        <span className="stat-label">Valid Tenders / SOW</span>
        <span className="stat-value">{validTenders.length}</span>
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
      {rejectedCount > 0 && (
        <div className="stat-card stat-rejected">
          <span className="stat-label">Non-Tenders Rejected</span>
          <span className="stat-value">{rejectedCount}</span>
        </div>
      )}
      {reviewCount > 0 && (
        <div className="stat-card stat-review">
          <span className="stat-label">Needs Review</span>
          <span className="stat-value">{reviewCount}</span>
        </div>
      )}
      {failedCount > 0 && (
        <div className="stat-card stat-failed">
          <span className="stat-label">Extraction Errors</span>
          <span className="stat-value">{failedCount}</span>
        </div>
      )}
    </div>
  );
}
