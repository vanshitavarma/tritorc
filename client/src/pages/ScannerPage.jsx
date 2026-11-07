import { useState } from 'react';
import { useScan } from '../hooks/useScan.js';
import UploadDropzone from '../components/UploadDropzone.jsx';
import FileList from '../components/FileList.jsx';
import StatusBanner from '../components/StatusBanner.jsx';
import DownloadReportButton from '../components/DownloadReportButton.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import TenderDetailsDrawer from '../components/TenderDetailsDrawer.jsx';
import TenderChatDrawer from '../components/TenderChatDrawer.jsx';

export default function ScannerPage() {
  const {
    files,
    status,
    scanResult,
    error,
    keywords,
    activeDrawerDoc,
    setActiveDrawerDoc,
    addFiles,
    removeFile,
    clearFiles,
    startScan,
  } = useScan();

  const [showKeywords, setShowKeywords] = useState(false);
  const [chatDoc, setChatDoc] = useState(null);
  const isScanning = status === 'uploading';

  // Compute dashboard statistics
  const results = scanResult?.results || [];
  const validTenders = results.filter(
    (r) => r.isValidTender !== false && r.status !== 'rejected' && r.status !== 'review_needed'
  );
  const relatedCount = validTenders.filter((r) => r.relevance === 'Related').length;
  const possibleCount = validTenders.filter((r) => r.relevance === 'Possible').length;
  const nonTenderCount = results.filter(
    (r) => r.isValidTender === false || r.status === 'rejected' || r.documentType === 'NON_TENDER'
  ).length;

  return (
    <div className="scanner-page">
      <div className="hero-section">
        <h2>Tritorc Tender Intelligence &amp; RAG Copilot</h2>
        <p className="hero-subtitle">
          Upload PDF or DOCX procurement documents to match Tritorc bolting and flange management
          keywords, run deep AI summarization, compute 100-point hybrid relevance scores, and chat
          with individual tenders using grounded citations.
        </p>

        <div className="keywords-pill-bar">
          <button
            type="button"
            className="btn-keywords-pill"
            onClick={() => setShowKeywords(!showKeywords)}
          >
            Configured Keywords ({keywords.length || 20}) {showKeywords ? '▲' : '▼'}
          </button>
        </div>

        {showKeywords && (
          <div className="keywords-dropdown">
            <p className="keywords-hint">
              Default 20 keywords from <code>server/data/keywords.csv</code>:
            </p>
            <div className="keywords-tag-list">
              {keywords.map((kw, i) => (
                <span key={`${kw}-${i}`} className="kw-tag">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="scanner-workflow">
        <div className="upload-card">
          <UploadDropzone onFilesSelected={addFiles} disabled={isScanning} />
          <FileList files={files} onRemoveFile={removeFile} disabled={isScanning} />

          {error && <div className="error-banner">{error}</div>}

          <div className="action-row">
            <button
              type="button"
              className="btn-scan"
              onClick={startScan}
              disabled={files.length === 0 || isScanning}
            >
              {isScanning ? (
                <>
                  <span className="spinner" /> Scanning {files.length} Document(s)...
                </>
              ) : (
                `Scan ${files.length > 0 ? `${files.length} Document(s)` : 'Tenders'}`
              )}
            </button>
            {files.length > 0 && !isScanning && (
              <button type="button" className="btn-clear" onClick={clearFiles}>
                Clear
              </button>
            )}
          </div>
        </div>

        {scanResult && scanResult.results && (
          <div className="results-section">
            {/* Dashboard Metric Stat Cards */}
            <div className="dashboard-metrics-grid">
              <div className="metric-card">
                <span className="metric-title">Total Scanned</span>
                <strong className="metric-number">{results.length}</strong>
                <span className="metric-sub">Processed documents</span>
              </div>
              <div className="metric-card metric-valid">
                <span className="metric-title">Verified Tenders</span>
                <strong className="metric-number">{validTenders.length}</strong>
                <span className="metric-sub">SOW &amp; tenders</span>
              </div>
              <div className="metric-card metric-related">
                <span className="metric-title">Related / Target</span>
                <strong className="metric-number">{relatedCount}</strong>
                <span className="metric-sub">&gt;= 3 keywords, &gt;= 10 hits</span>
              </div>
              <div className="metric-card metric-possible">
                <span className="metric-title">Possible</span>
                <strong className="metric-number">{possibleCount}</strong>
                <span className="metric-sub">Borderline scope</span>
              </div>
              <div className="metric-card metric-excluded">
                <span className="metric-title">Non-Tenders Excluded</span>
                <strong className="metric-number">{nonTenderCount}</strong>
                <span className="metric-sub">Filtered non-procurement</span>
              </div>
            </div>

            <div className="results-toolbar">
              <StatusBanner results={scanResult.results} />
              <DownloadReportButton
                reportUrl={scanResult.reportUrl}
                csvReportUrl={scanResult.csvReportUrl}
                scanId={scanResult.scanId}
              />
            </div>

            <ResultsTable
              results={scanResult.results}
              onSelectDocument={setActiveDrawerDoc}
              onOpenChat={setChatDoc}
            />
          </div>
        )}
      </div>

      <TenderDetailsDrawer
        document={activeDrawerDoc}
        onClose={() => setActiveDrawerDoc(null)}
        onOpenChat={setChatDoc}
      />

      <TenderChatDrawer
        document={chatDoc}
        isOpen={Boolean(chatDoc)}
        onClose={() => setChatDoc(null)}
      />
    </div>
  );
}
