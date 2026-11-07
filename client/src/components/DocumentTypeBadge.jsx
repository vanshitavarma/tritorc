export default function DocumentTypeBadge({ documentType, isValidTender }) {
  const norm = String(documentType || 'UNKNOWN').toUpperCase();

  let label = 'Unknown Doc';
  let badgeClass = 'badge-doc-unknown';

  switch (norm) {
    case 'TENDER':
      label = 'Valid Tender';
      badgeClass = 'badge-doc-tender';
      break;
    case 'SCOPE_OF_WORK':
      label = 'Valid Scope of Work';
      badgeClass = 'badge-doc-sow';
      break;
    case 'PROCUREMENT_DOCUMENT':
      label = 'Procurement Doc';
      badgeClass = 'badge-doc-procurement';
      break;
    case 'NON_TENDER':
      label = 'Non-Tender Document';
      badgeClass = 'badge-doc-non-tender';
      break;
    case 'UNKNOWN':
    default:
      label = isValidTender ? 'Verified Doc' : 'Needs Manual Review';
      badgeClass = isValidTender ? 'badge-doc-procurement' : 'badge-doc-review';
      break;
  }

  return <span className={`doc-type-badge ${badgeClass}`}>{label}</span>;
}
