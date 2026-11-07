import { scanDocuments } from '../services/scan/scanDocuments.js';
import { scanStore } from '../services/scan/scanStore.js';
import { buildWorkbook } from '../services/report/buildWorkbook.js';
import { buildCsvReport } from '../services/report/buildCsv.js';
import { loadKeywords } from '../config/keywords.js';
import { AppError } from '../utils/AppError.js';

export const getKeywords = async (_req, res, next) => {
  try {
    const keywords = await loadKeywords();
    res.status(200).json({
      success: true,
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
    const csvBuffer = buildCsvReport(results);

    scanStore.saveScan(scanId, {
      scanId,
      scannedAt,
      totalFiles: req.files.length,
      results,
    });
    scanStore.saveReport(scanId, reportBuffer);
    scanStore.saveCsvReport(scanId, csvBuffer);

    const successful = results.filter((r) => r.status === 'scanned').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    const reviewNeeded = results.filter((r) => r.status === 'review_needed').length;

    res.status(201).json({
      success: true,
      status: 'success',
      message: 'Tender scan completed',
      data: {
        scanId,
        scannedAt,
        totalFiles: req.files.length,
        results,
        summary: {
          total: results.length,
          successful,
          failed,
          ...(rejected > 0 ? { rejected } : {}),
          ...(reviewNeeded > 0 ? { reviewNeeded } : {}),
        },
        reportUrl: `/api/scans/${scanId}/report`,
        csvReportUrl: `/api/scans/${scanId}/csv`,
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
      success: true,
      status: 'success',
      data: scan,
    });
  } catch (error) {
    next(error);
  }
};

export const downloadReport = async (req, res, next) => {
  try {
    if (req.query.format === 'csv') {
      return downloadCsvReport(req, res, next);
    }

    let reportBuffer = scanStore.getReport(req.params.id);
    if (!reportBuffer) {
      // If scan exists but report buffer wasn't cached, generate it on demand
      const scan = scanStore.getScan(req.params.id);
      if (scan && scan.results) {
        reportBuffer = await buildWorkbook(scan.results);
        scanStore.saveReport(req.params.id, reportBuffer);
      } else {
        throw new AppError('Report not found or expired.', 404, 'NOT_FOUND');
      }
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

export const downloadCsvReport = async (req, res, next) => {
  try {
    let csvBuffer = scanStore.getCsvReport(req.params.id);
    if (!csvBuffer) {
      const scan = scanStore.getScan(req.params.id);
      if (scan && scan.results) {
        csvBuffer = buildCsvReport(scan.results);
        scanStore.saveCsvReport(req.params.id, csvBuffer);
      } else {
        throw new AppError('CSV report not found or expired.', 404, 'NOT_FOUND');
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `TenderIQ_Scan_Report_${today}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', csvBuffer.length);

    res.status(200).send(csvBuffer);
  } catch (error) {
    next(error);
  }
};
