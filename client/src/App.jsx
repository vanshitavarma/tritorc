import ScannerPage from './pages/ScannerPage.jsx';

export default function App() {
  return (
    <div className="tender-app">
      <header className="tender-header">
        <div className="header-brand">
          <span className="brand-logo">TRITORC</span>
          <span className="brand-divider">/</span>
          <span className="brand-title">Tender &amp; SOW Keyword Scanner</span>
        </div>
        <div className="header-actions">
          <span className="header-status-badge">System Ready</span>
          <span className="header-version">v1.0</span>
        </div>
      </header>
      <main className="tender-main">
        <ScannerPage />
      </main>
      <footer className="tender-footer">
        <p>
          Tritorc Equipment Pvt. Ltd. &copy; 2026 &mdash; Deterministic 20-Keyword Scanner &bull;
          Atlas Vector Search &bull; Gemini RAG
        </p>
      </footer>
    </div>
  );
}
