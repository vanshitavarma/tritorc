import RelevanceBadge from './RelevanceBadge.jsx';

export default function ResultsTable({ results, onSelectDocument }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="results-table-container">
      <div className="table-header-info">
        <h3>Tender Intelligence Results ({results.length})</h3>
        <p className="table-hint">
          Click &quot;View Details&quot; to inspect concise executive summaries, qualification
          criteria, and full 20 tender fields.
        </p>
      </div>

      <div className="responsive-table-wrapper">
        <table className="results-table">
          <thead>
            <tr>
              <th>Document Name</th>
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
            {results.map((doc, idx) => {
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
    </div>
  );
}
