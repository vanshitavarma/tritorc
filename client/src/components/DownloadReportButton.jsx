export default function DownloadReportButton({ reportUrl, csvReportUrl, scanId }) {
  if (!scanId && !reportUrl && !csvReportUrl) return null;

  const excelHref = reportUrl || (scanId ? `/api/scans/${scanId}/report` : '#');
  const csvHref = csvReportUrl || (scanId ? `/api/scans/${scanId}/csv` : '#');

  const today = new Date().toISOString().slice(0, 10);
  const csvFilename = `TenderIQ_Scan_Report_${today}.csv`;

  return (
    <div className="download-buttons-group">
      <a
        href={csvHref}
        download={csvFilename}
        className="btn-download-report btn-download-csv"
        title="Download exact 24-column RFC 4180 CSV report with UTF-8 BOM"
      >
        <svg
          className="icon-download"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span>Download CSV (.csv)</span>
      </a>

      <a
        href={excelHref}
        download
        className="btn-download-report btn-download-xlsx"
        title="Download full 24-column Excel report (.xlsx) with Keyword Breakdown & AI Insights"
      >
        <svg
          className="icon-download"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span>Download Excel (.xlsx)</span>
      </a>
    </div>
  );
}
