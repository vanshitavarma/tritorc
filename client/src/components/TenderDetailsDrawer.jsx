export default function TenderDetailsDrawer({ document, onClose }) {
  if (!document) return null;

  const tenderFields = document.tenderFields || {};
  const isFailed = document.status === 'failed';

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>Tender Field Details</h3>
            <p className="doc-subtitle">{document.documentName}</p>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="drawer-body">
          {isFailed ? (
            <div className="error-callout">
              <h4>Extraction Failed</h4>
              <p>{document.error || 'The document text could not be read.'}</p>
            </div>
          ) : (
            <div className="fields-grid">
              <div className="field-card">
                <span className="field-title">Tender No</span>
                <span className="field-val">{tenderFields['Tender No'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Tender Authority</span>
                <span className="field-val">{tenderFields['Tender Authority'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Location</span>
                <span className="field-val">{tenderFields['Location'] || 'Not Found'}</span>
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
                <span className="field-title">Estimated Amount</span>
                <span className="field-val highlight">
                  {tenderFields['Tender Amount'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card">
                <span className="field-title">EMD</span>
                <span className="field-val">{tenderFields['EMD'] || 'Not Found'}</span>
              </div>
              <div className="field-card">
                <span className="field-title">Email</span>
                <span className="field-val">{tenderFields['Email'] || 'Not Found'}</span>
              </div>
              <div className="field-card full-width">
                <span className="field-title">Item Category / Description</span>
                <span className="field-val">
                  {tenderFields['Tender Description'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card full-width">
                <span className="field-title">Scope of Work</span>
                <span className="field-val">{tenderFields['Scope of Work'] || 'Not Found'}</span>
              </div>
              <div className="field-card full-width">
                <span className="field-title">Technical Qualification</span>
                <span className="field-val">
                  {tenderFields['Technical Qualification'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card full-width">
                <span className="field-title">Notification Categories (Tab Name)</span>
                <span className="field-val">{tenderFields['Tab Name'] || 'Not Found'}</span>
              </div>
              <div className="field-card full-width">
                <span className="field-title">Purchaser Address</span>
                <span className="field-val">
                  {tenderFields['Purchaser Address'] || 'Not Found'}
                </span>
              </div>
              <div className="field-card full-width">
                <span className="field-title">Deterministic Summary</span>
                <span className="field-val">{tenderFields['Tender Summary'] || 'Not Found'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
