import RelevanceBadge from './RelevanceBadge.jsx';

export default function ResultsTable({ results, onSelectDocument }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="results-table-container">
      <div className="table-header-info">
        <h3>Scan Results ({results.length})</h3>
        <p className="table-hint">
          Click &quot;View Details&quot; to inspect all 20 extracted GeM tender fields.
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
              <th>Tender No</th>
              <th>Tender Authority</th>
              <th>Estimated Value</th>
              <th>Fields</th>
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
                  className={`row-${doc.relevance?.toLowerCase()}`}
                >
                  <td className="doc-name-cell" title={doc.documentName}>
                    <strong>{doc.documentName}</strong>
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
                  <td>{tenderFields['Tender No'] || (isFailed ? 'Not Found' : '-')}</td>
                  <td className="authority-cell" title={tenderFields['Tender Authority']}>
                    {tenderFields['Tender Authority'] || (isFailed ? 'Not Found' : '-')}
                  </td>
                  <td>{tenderFields['Tender Amount'] || (isFailed ? 'Not Found' : '-')}</td>
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
