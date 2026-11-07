import RelevanceBadge from './RelevanceBadge.jsx';
import DocumentTypeBadge from './DocumentTypeBadge.jsx';

export default function ResultsTable({ results, onSelectDocument }) {
  if (!results || results.length === 0) return null;

  const validTenders = results.filter(
    (r) => r.isValidTender !== false && r.status !== 'rejected' && r.status !== 'review_needed'
  );

  const excludedDocs = results.filter(
    (r) =>
      r.isValidTender === false ||
      r.status === 'rejected' ||
      r.status === 'review_needed' ||
      r.documentType === 'NON_TENDER' ||
      r.documentType === 'UNKNOWN'
  );

  return (
    <div className="results-table-container">
      {/* 1. Primary Tender Intelligence Table */}
      <div className="table-header-info">
        <h3>
          Verified Tender Intelligence ({validTenders.length} of {results.length} processed)
        </h3>
        <p className="table-hint">
          Click &quot;View Details&quot; to inspect executive summaries, qualification criteria, and
          full 20 tender fields.
        </p>
      </div>

      {validTenders.length === 0 ? (
        <div className="empty-valid-tenders-banner">
          <p>
            <strong>No valid procurement tenders or Scope of Work documents found.</strong>
          </p>
          <p className="empty-subtext">
            All uploaded files were identified as non-tenders or requiring manual review. See
            rejection details below.
          </p>
        </div>
      ) : (
        <div className="responsive-table-wrapper">
          <table className="results-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Type</th>
                <th>Relevance</th>
                <th>Match Count</th>
                <th>Matched Keywords</th>
                <th>Category</th>
                <th>Tender No</th>
                <th>Authority</th>
                <th>Amount</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {validTenders.map((doc, idx) => {
                const tenderFields = doc.tenderFields || {};
                const isFailed = doc.status === 'failed';
                const matches = doc.matches || [];
                const matchedStr = isFailed
                  ? doc.error || 'Failed'
                  : matches.length > 0
                    ? matches.map((m) => (typeof m === 'string' ? m : m.keyword)).join(', ')
                    : '(none found)';

                return (
                  <tr
                    key={`${doc.documentName}-${idx}`}
                    className={`row-${doc.relevance?.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <td className="doc-name-cell" title={doc.documentName}>
                      <div className="doc-title-wrapper">
                        <strong className="doc-title-text">{doc.documentName}</strong>
                        {doc.originalFileName && doc.originalFileName !== doc.documentName && (
                          <span className="doc-file-tag">{doc.originalFileName}</span>
                        )}
                      </div>
                    </td>
                    <td className="type-cell">
                      <DocumentTypeBadge
                        documentType={doc.documentType}
                        isValidTender={doc.isValidTender}
                      />
                    </td>
                    <td>
                      <RelevanceBadge relevance={doc.relevance} />
                    </td>
                    <td className="match-count-cell">
                      <span className="count-pill">{isFailed ? 0 : (doc.distinctCount ?? 0)}</span>
                    </td>
                    <td className="keywords-cell" title={matchedStr}>
                      {matchedStr}
                    </td>
                    <td className="category-cell">
                      <span className="category-tag">{tenderFields['Tab Name'] || 'General'}</span>
                    </td>
                    <td>{tenderFields['Tender No'] || (isFailed ? 'Not Found' : '-')}</td>
                    <td className="authority-cell" title={tenderFields['Tender Authority']}>
                      {tenderFields['Tender Authority'] || (isFailed ? 'Not Found' : '-')}
                    </td>
                    <td className="amount-cell">
                      {tenderFields['Tender Amount'] || (isFailed ? 'Not Found' : '-')}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-view-details"
                        onClick={() => onSelectDocument(doc)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Excluded / Non-Tender Documents Section */}
      {excludedDocs.length > 0 && (
        <div className="excluded-docs-section">
          <div className="excluded-header">
            <h4>Excluded Non-Tender Documents ({excludedDocs.length})</h4>
            <p className="excluded-subtext">
              These documents were excluded from tender keyword matching, scoring, and Excel report
              columns because they are not genuine procurement tenders.
            </p>
          </div>

          <div className="excluded-cards-grid">
            {excludedDocs.map((doc, idx) => {
              const isRejected = doc.status === 'rejected' || doc.documentType === 'NON_TENDER';
              return (
                <div
                  key={`excluded-${doc.originalFileName || doc.documentName}-${idx}`}
                  className={`excluded-card ${isRejected ? 'card-rejected' : 'card-review'}`}
                >
                  <div className="card-top-row">
                    <span className="file-name-heading">
                      📄 {doc.originalFileName || doc.documentName}
                    </span>
                    <DocumentTypeBadge
                      documentType={doc.documentType}
                      isValidTender={doc.isValidTender}
                    />
                  </div>
                  <div className="card-reason-box">
                    <strong className="reason-label">
                      {isRejected ? '⛔ Rejection Reason:' : '⚠️ Manual Review Required:'}
                    </strong>
                    <p className="reason-text">
                      {doc.rejectionReason || doc.message || 'Non-tender document identified.'}
                    </p>
                  </div>
                  {doc.reasons && doc.reasons.length > 0 && (
                    <div className="detected-signals">
                      <span className="signals-title">Detected Signals:</span>
                      <ul className="signals-list">
                        {doc.reasons.map((r, rIdx) => (
                          <li key={`sig-${rIdx}`}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
