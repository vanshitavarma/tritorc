/**
 * Safely parses HTTP response bodies, handling empty responses, non-JSON errors,
 * HTML proxy timeouts, and structured error payloads without throwing raw SyntaxError.
 *
 * @param {Response} response - Fetch response object
 * @param {string} fallbackMessage - Default error message if none can be parsed
 * @returns {Promise<Object>} Parsed JSON payload
 */
async function parseApiResponse(response, fallbackMessage = 'Request failed') {
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();

  let parsed = null;
  if (rawText && rawText.trim().length > 0) {
    if (
      contentType.includes('application/json') ||
      rawText.trim().startsWith('{') ||
      rawText.trim().startsWith('[')
    ) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Non-JSON or malformed payload, fallback below
      }
    }
  }

  // Handle non-OK status codes (4xx, 5xx)
  if (!response.ok) {
    let errorMessage = parsed?.message || parsed?.error?.message || parsed?.error?.code || null;

    if (!errorMessage) {
      if (response.status === 413) {
        errorMessage = 'Uploaded file(s) exceed the maximum allowable size (10MB per file).';
      } else if (response.status === 415) {
        errorMessage = 'Unsupported file format. Please upload .pdf or .docx documents only.';
      } else if (response.status === 504) {
        errorMessage =
          'Scanning request timed out. Please try again with fewer or smaller documents.';
      } else if (response.status === 502 || response.status === 503) {
        errorMessage =
          'Scanning server is currently unavailable. Please verify the backend service is running.';
      } else if (rawText && rawText.length < 150 && !rawText.includes('<!DOCTYPE')) {
        errorMessage = rawText.trim();
      } else {
        errorMessage = `${fallbackMessage} (HTTP ${response.status})`;
      }
    }

    const err = new Error(errorMessage);
    err.status = response.status;
    err.code = parsed?.error?.code || parsed?.code || `HTTP_${response.status}`;
    err.details = parsed;
    throw err;
  }

  // If HTTP status is OK (200, 201), but body was empty
  if (!parsed) {
    if (rawText && rawText.trim().length > 0) {
      throw new Error(`Unexpected server response format: ${rawText.slice(0, 100)}`);
    }
    throw new Error('Received an empty response from the server.');
  }

  return parsed;
}

export async function fetchKeywords() {
  let response;
  try {
    response = await fetch('/api/keywords');
  } catch (netErr) {
    throw new Error(`Unable to load keywords: ${netErr.message || 'Network error'}`);
  }

  const json = await parseApiResponse(response, 'Failed to fetch keywords configuration');
  return json.data?.keywords || [];
}

export async function uploadAndScan(files) {
  if (!files || files.length === 0) {
    throw new Error('Please select at least one document to scan.');
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  let response;
  try {
    response = await fetch('/api/scans', {
      method: 'POST',
      body: formData,
    });
  } catch (netErr) {
    throw new Error(
      `Network connection error: Could not reach the backend scanning server (${netErr.message}). Ensure the server is running on port 5000.`
    );
  }

  const json = await parseApiResponse(response, 'Tender scanning failed');
  return json.data;
}

export async function fetchScan(scanId) {
  let response;
  try {
    response = await fetch(`/api/scans/${scanId}`);
  } catch (netErr) {
    throw new Error(`Network error while retrieving scan: ${netErr.message}`);
  }

  const json = await parseApiResponse(response, 'Failed to fetch scan results');
  return json.data;
}

export function getDownloadReportUrl(scanId) {
  return `/api/scans/${scanId}/report`;
}

export function getDownloadCsvUrl(scanId) {
  return `/api/scans/${scanId}/csv`;
}

export async function chatWithDocument(documentId, { message, conversationHistory = [] }) {
  if (!documentId) throw new Error('Document ID is required for chat');
  if (!message || !message.trim()) throw new Error('Message cannot be empty');

  let response;
  try {
    response = await fetch(`/api/documents/${documentId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationHistory }),
    });
  } catch (netErr) {
    throw new Error(`Chat network error: ${netErr.message}`);
  }

  const json = await parseApiResponse(response, 'Failed to complete tender chat');
  return json.data;
}

export async function fetchDocumentDetails(documentId) {
  if (!documentId) throw new Error('Document ID is required');

  let response;
  try {
    response = await fetch(`/api/documents/${documentId}`);
  } catch (netErr) {
    throw new Error(`Failed to retrieve document details: ${netErr.message}`);
  }

  const json = await parseApiResponse(response, 'Failed to fetch document');
  return json.data;
}

export async function analyzeDocument(documentId) {
  if (!documentId) throw new Error('Document ID is required');

  let response;
  try {
    response = await fetch(`/api/documents/${documentId}/analyze`, {
      method: 'POST',
    });
  } catch (netErr) {
    throw new Error(`Analysis failed: ${netErr.message}`);
  }

  const json = await parseApiResponse(response, 'Failed to analyze tender document');
  return json.data;
}

export async function fetchDocumentInsights(documentId) {
  if (!documentId) return null;

  let response;
  try {
    response = await fetch(`/api/documents/${documentId}/insights`);
  } catch {
    return null;
  }

  const json = await parseApiResponse(response, 'Failed to fetch insights');
  return json.data;
}

export async function fetchScanHistory(page = 1, limit = 10) {
  let response;
  try {
    response = await fetch(`/api/scans?page=${page}&limit=${limit}`);
  } catch (netErr) {
    throw new Error(`Failed to load scan history: ${netErr.message}`);
  }

  const json = await parseApiResponse(response, 'Failed to fetch scans');
  return json.data;
}
