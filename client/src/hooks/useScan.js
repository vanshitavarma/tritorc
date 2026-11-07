import { useState, useEffect, useCallback } from 'react';
import { fetchKeywords, uploadAndScan } from '../api/scanApi.js';

export function useScan() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'scanned' | 'error'
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [activeDrawerDoc, setActiveDrawerDoc] = useState(null);

  useEffect(() => {
    fetchKeywords()
      .then(setKeywords)
      .catch((err) => {
        // Non-fatal, app can still scan with server defaults
        console.warn('Could not load keywords list:', err.message);
      });
  }, []);

  const addFiles = useCallback((newFiles) => {
    setFiles((prev) => {
      const combined = [...prev, ...newFiles];
      // Limit to 10 files
      return combined.slice(0, 10);
    });
    setError(null);
  }, []);

  const removeFile = useCallback((index) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setStatus('idle');
    setScanResult(null);
    setError(null);
  }, []);

  const startScan = useCallback(async () => {
    if (files.length === 0) {
      setError('Please select at least one document to scan.');
      return;
    }

    if (status === 'uploading') {
      return; // Guard against concurrent duplicate submissions
    }

    try {
      setStatus('uploading');
      setError(null);
      const data = await uploadAndScan(files);
      setScanResult(data);
      setStatus('scanned');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Scanning failed');
    }
  }, [files, status]);

  return {
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
  };
}
