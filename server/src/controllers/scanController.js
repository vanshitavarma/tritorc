import { scanDocuments } from '../services/scan/scanDocuments.js';
import { scanStore } from '../services/scan/scanStore.js';
import { buildWorkbook } from '../services/report/buildWorkbook.js';
import { loadKeywords } from '../config/keywords.js';
import { AppError } from '../utils/AppError.js';

export const getKeywords = async (_req, res, next) => {
  try {
    const keywords = await loadKeywords();
    res.status(200).json({
      status: 'success',
      data: {
        keywords,
        total: keywords.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createScan = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError(
        'No files uploaded. Please upload at least one .pdf or .docx document.',
        400,
        'NO_FILES'
      );
    }

    const results = await scanDocuments(req.files);
    const scanId = scanStore.generateId();
    const scannedAt = new Date().toISOString();

    const reportBuffer = await buildWorkbook(results);
    scanStore.saveScan(scanId, {
      scanId,
      scannedAt,
      totalFiles: req.files.length,
      results,
    });
    scanStore.saveReport(scanId, reportBuffer);

    res.status(201).json({
      status: 'success',
      data: {
        scanId,
        scannedAt,
        totalFiles: req.files.length,
        results,
        reportUrl: `/api/scans/${scanId}/report`,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getScanById = async (req, res, next) => {
  try {
    const scan = scanStore.getScan(req.params.id);
    if (!scan) {
      throw new AppError('Scan not found or expired.', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      status: 'success',
      data: scan,
    });
  } catch (error) {
    next(error);
  }
};

export const downloadReport = async (req, res, next) => {
  try {
    const reportBuffer = scanStore.getReport(req.params.id);
    if (!reportBuffer) {
      throw new AppError('Report not found or expired.', 404, 'NOT_FOUND');
    }

    const filename = `Tritorc_Tender_Scan_Report_${req.params.id.slice(0, 8)}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', reportBuffer.length);

    res.status(200).send(reportBuffer);
  } catch (error) {
    next(error);
  }
};
