import ScannerPage from './pages/ScannerPage.jsx';

export default function App() {
  return (
    <div className="tender-app">
      <header className="tender-header">
        <div className="header-brand">
          <div className="brand-logo">TRITORC</div>
          <span className="brand-divider">/</span>
          <span className="brand-title">Tender & SOW Keyword Scanner</span>
        </div>
        <div className="header-badge">Production v1.0</div>
      </header>
      <main className="tender-main">
        <ScannerPage />
      </main>
      <footer className="tender-footer">
        <p>
          Tritorc Equipment Pvt. Ltd. &copy; 2026. All deterministic matching verified against 20
          configured keywords.
        </p>
      </footer>
    </div>
  );
}
