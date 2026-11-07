export async function fetchKeywords() {
  const response = await fetch('/api/keywords');
  if (!response.ok) {
    throw new Error('Failed to fetch keywords configuration');
  }
  const json = await response.json();
  return json.data?.keywords || [];
}

export async function uploadAndScan(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await fetch('/api/scans', {
    method: 'POST',
    body: formData,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || 'Scan failed');
  }

  return json.data;
}

export async function fetchScan(scanId) {
  const response = await fetch(`/api/scans/${scanId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch scan results');
  }
  const json = await response.json();
  return json.data;
}

export function getDownloadReportUrl(scanId) {
  return `/api/scans/${scanId}/report`;
}
