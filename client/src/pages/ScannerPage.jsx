import { useState } from 'react';
import { useScan } from '../hooks/useScan.js';
import UploadDropzone from '../components/UploadDropzone.jsx';
import FileList from '../components/FileList.jsx';
import StatusBanner from '../components/StatusBanner.jsx';
import DownloadReportButton from '../components/DownloadReportButton.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import TenderDetailsDrawer from '../components/TenderDetailsDrawer.jsx';

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
  const isScanning = status === 'uploading';

  return (
    <div className="scanner-page">
      <div className="hero-section">
        <h2>Tritorc Tender Relevance Scanner</h2>
        <p className="hero-subtitle">
          Upload PDF or DOCX tender documents to match against Tritorc bolting and flange management
          keywords, compute deterministic baseline verdicts, extract 20 GeM tender fields, and
          download the 24-column Excel report.
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
            <div className="results-toolbar">
              <StatusBanner results={scanResult.results} />
              <DownloadReportButton
                reportUrl={scanResult.reportUrl}
                csvReportUrl={scanResult.csvReportUrl}
                scanId={scanResult.scanId}
              />
            </div>

            <ResultsTable results={scanResult.results} onSelectDocument={setActiveDrawerDoc} />
          </div>
        )}
      </div>

      <TenderDetailsDrawer document={activeDrawerDoc} onClose={() => setActiveDrawerDoc(null)} />
    </div>
  );
}
