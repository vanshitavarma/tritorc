import HybridScoreBadge from './HybridScoreBadge.jsx';

export default function TenderDetailsDrawer({ document, onClose, onOpenChat }) {
  if (!document) return null;

  const tenderFields = document.tenderFields || {};
  const isFailed = document.status === 'failed';
  const aiAnalysis = document.aiAnalysis || {};

  // Read or compute hybrid score
  const hybrid = document.hybridScore || aiAnalysis.hybridScore || null;
  const defaultScore =
    document.relevance === 'Related' ? 85 : document.relevance === 'Possible' ? 55 : 15;
  const scoreVal = hybrid ? hybrid.totalScore ?? hybrid.score : defaultScore;
  const gradeVal = hybrid ? hybrid.grade : (document.relevance === 'Related' ? 'Highly Relevant' : document.relevance === 'Possible' ? 'Possible' : 'Not Relevant');
  const breakdown = hybrid?.breakdown;

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>Tender Intelligence Details</h3>
            <p className="doc-subtitle">{document.documentName}</p>
            {document.originalFileName && document.originalFileName !== document.documentName && (
              <span className="doc-file-tag">Original: {document.originalFileName}</span>
            )}
          </div>
          <div className="drawer-header-actions">
            {onOpenChat && (
              <button
                type="button"
                className="btn-drawer-chat"
                onClick={() => {
                  onClose();
                  onOpenChat(document);
                }}
              >
                Open Chat
              </button>
            )}
            <button type="button" className="btn-close-drawer" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {isFailed ? (
            <div className="error-callout">
              <h4>Extraction Failed</h4>
              <p>{document.error || 'The document text could not be read.'}</p>
            </div>
          ) : (
            <div className="fields-grid">
              {/* Hybrid Score Banner */}
              <div className="field-card full-width hybrid-score-card">
                <div className="score-summary-row">
                  <div>
                    <span className="field-title">Hybrid Relevance Evaluation</span>
                    <p className="score-desc">
                      Blended deterministic keyword matching, vector similarity, technical specifications, and scope alignment.
                    </p>
                  </div>
                  <HybridScoreBadge
                    score={scoreVal}
                    grade={gradeVal}
                    breakdown={breakdown}
                    isProvisional={hybrid?.isProvisional}
                  />
                </div>

                {breakdown && (
                  <div className="score-components-grid">
                    <div className="component-stat">
                      <span className="comp-label">Keyword Match (K)</span>
                      <strong className="comp-value">{breakdown.keywordScore ?? breakdown.keyword ?? 0}/30</strong>
                    </div>
                    <div className="component-stat">
                      <span className="comp-label">Semantic Similarity (S)</span>
                      <strong className="comp-value">{breakdown.semanticScore ?? breakdown.semantic ?? 0}/25</strong>
                    </div>
                    <div className="component-stat">
                      <span className="comp-label">Technical Alignment (T)</span>
                      <strong className="comp-value">{breakdown.technicalScore ?? breakdown.technical ?? 0}/25</strong>
                    </div>
                    <div className="component-stat">
                      <span className="comp-label">Scope Fit (W)</span>
                      <strong className="comp-value">{breakdown.scopeScore ?? breakdown.scope ?? 0}/20</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Executive Summary */}
              <div className="field-card full-width summary-highlight">
                <span className="field-title">Executive Summary</span>
                <p className="field-prose">{tenderFields['Tender Summary'] || 'Not Found'}</p>
              </div>

              {/* Core Identifiers */}
              <div className="field-card">
                <span className="field-title">Tender No</span>
                <span className="field-val">{tenderFields['Tender No'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Work Category (Tab Name)</span>
                <span className="field-val highlight-blue">
                  {tenderFields['Tab Name'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card">
                <span className="field-title">Tender Authority</span>
                <span className="field-val">{tenderFields['Tender Authority'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Location (Site &amp; State)</span>
                <span className="field-val highlight-location">{tenderFields['Location'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Opening Date</span>
                <span className="field-val">{tenderFields['Opening Date'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Closing Date</span>
                <span className="field-val">{tenderFields['Closing Date'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Tender Amount</span>
                <span className="field-val highlight-green">
                  {tenderFields['Tender Amount'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card">
                <span className="field-title">EMD</span>
                <span className="field-val">{tenderFields['EMD'] || 'Not Found'}</span>
              </div>

              {/* Scope & Description */}
              <div className="field-card full-width">
                <span className="field-title">Scope of Work (Concise Summary)</span>
                <p className="field-prose">{tenderFields['Scope of Work'] || 'Not Found'}</p>
              </div>

              <div className="field-card full-width">
                <span className="field-title">Project Description</span>
                <p className="field-prose">{tenderFields['Tender Description'] || 'Not Found'}</p>
              </div>

              {/* Qualifications */}
              <div className="field-card full-width">
                <span className="field-title">Technical Qualification Requirements</span>
                <p className="field-prose">
                  {tenderFields['Technical Qualification'] || 'Not Found'}
                </p>
              </div>

              <div className="field-card full-width">
                <span className="field-title">Financial Qualification Requirements</span>
                <p className="field-prose">
                  {tenderFields['Financial Qualification'] || 'Not Found'}
                </p>
              </div>

              <div className="field-card full-width">
                <span className="field-title">Corrigendum / Addenda</span>
                <span className="field-val">{tenderFields['Corrigendum'] || 'Not Found'}</span>
              </div>

              {/* Contact info */}
              <div className="field-card full-width">
                <span className="field-title">Purchaser Address</span>
                <span className="field-val">
                  {tenderFields['Purchaser Address'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card">
                <span className="field-title">Email</span>
                <span className="field-val">{tenderFields['Email'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Website</span>
                <span className="field-val">{tenderFields['Website'] || 'Not Found'}</span>
              </div>

              {/* Strategic Business AI Insights */}
              {aiAnalysis.aiExplanation && (
                <div className="field-card full-width ai-insights-box">
                  <span className="field-title">Strategic Business Relevance Insights</span>
                  <p className="field-prose">
                    <strong>Semantic Assessment:</strong> {aiAnalysis.semanticAssessment || 'N/A'}
                    <br />
                    <strong>Analysis:</strong> {aiAnalysis.aiExplanation}
                    <br />
                    <strong>Key Opportunities:</strong> {aiAnalysis.keyOpportunities || 'N/A'}
                    <br />
                    <strong>Recommended Follow-up:</strong>{' '}
                    {aiAnalysis.recommendedFollowUp || 'N/A'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
