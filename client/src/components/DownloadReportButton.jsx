export default function DownloadReportButton({ reportUrl, scanId }) {
  if (!reportUrl && !scanId) return null;
  const href = reportUrl || `/api/scans/${scanId}/report`;

  return (
    <a
      href={href}
      download
      className="btn-download-report"
      title="Download comprehensive 24-column Excel workbook"
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
      <span>Download Excel Report (.xlsx)</span>
    </a>
  );
}
