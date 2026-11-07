import RelevanceBadge from './RelevanceBadge.jsx';
import DocumentTypeBadge from './DocumentTypeBadge.jsx';
import HybridScoreBadge from './HybridScoreBadge.jsx';

export default function ResultsTable({ results, onSelectDocument, onOpenChat }) {
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
          Click &quot;Chat AI&quot; for grounded interactive Q&amp;A or &quot;View Details&quot; to inspect executive summaries and technical qualification criteria.
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
                <th>AI Score</th>
                <th>Match Count</th>
                <th>Matched Keywords</th>
                <th>Location</th>
                <th>Tender No</th>
                <th>Authority</th>
                <th>Amount</th>
                <th>Actions</th>
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

                const loc = tenderFields['Location'] || '-';

                // Calculate or read hybrid score
                const hybrid = doc.hybridScore || doc.aiAnalysis?.hybridScore || null;
                const defaultScore =
                  doc.relevance === 'Related' ? 85 : doc.relevance === 'Possible' ? 55 : 15;
                const scoreVal = hybrid ? hybrid.totalScore ?? hybrid.score : defaultScore;
                const gradeVal = hybrid ? hybrid.grade : (doc.relevance === 'Related' ? 'Highly Relevant' : doc.relevance === 'Possible' ? 'Possible' : 'Not Relevant');

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
                    <td className="score-cell">
                      <HybridScoreBadge
                        score={scoreVal}
                        grade={gradeVal}
                        breakdown={hybrid?.breakdown}
                        isProvisional={hybrid?.isProvisional}
                      />
                    </td>
                    <td className="match-count-cell">
                      <span className="count-pill">{isFailed ? 0 : (doc.distinctCount ?? 0)}</span>
                    </td>
                    <td className="keywords-cell" title={matchedStr}>
                      {matchedStr}
                    </td>
                    <td className="location-cell" title={loc}>
                      <span className="location-text">{loc}</span>
                    </td>
                    <td>{tenderFields['Tender No'] || (isFailed ? 'Not Found' : '-')}</td>
                    <td className="authority-cell" title={tenderFields['Tender Authority']}>
                      {tenderFields['Tender Authority'] || (isFailed ? 'Not Found' : '-')}
                    </td>
                    <td className="amount-cell">
                      {tenderFields['Tender Amount'] || (isFailed ? 'Not Found' : '-')}
                    </td>
                    <td className="actions-cell">
                      <div className="table-actions-group">
                        {onOpenChat && (
                          <button
                            type="button"
                            className="btn-chat-ai"
                            onClick={() => onOpenChat(doc)}
                            title="Open grounded TenderIQ Copilot"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            Ask Copilot
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-view-details"
                          onClick={() => onSelectDocument(doc)}
                          title="View executive summary and qualification criteria"
                        >
                          Details
                        </button>
                      </div>
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
                      {doc.originalFileName || doc.documentName}
                    </span>
                    <DocumentTypeBadge
                      documentType={doc.documentType}
                      isValidTender={doc.isValidTender}
                    />
                  </div>
                  <div className="card-reason-box">
                    <strong className="reason-label">
                      {isRejected ? 'Rejection Reason:' : 'Manual Review Required:'}
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
