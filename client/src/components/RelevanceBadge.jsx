export default function RelevanceBadge({ relevance }) {
  const norm = String(relevance || 'Not Related').trim();
  let badgeClass = 'badge-not-related';

  if (norm === 'Related') {
    badgeClass = 'badge-related';
  } else if (norm === 'Possible') {
    badgeClass = 'badge-possible';
  } else if (norm === 'Not Assessed') {
    badgeClass = 'badge-failed';
  }

  return <span className={`relevance-badge ${badgeClass}`}>{norm}</span>;
}
