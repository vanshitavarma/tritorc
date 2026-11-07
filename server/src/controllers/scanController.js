import { scanDocuments } from '../services/scan/scanDocuments.js';
import { scanStore } from '../services/scan/scanStore.js';
import { buildWorkbook } from '../services/report/buildWorkbook.js';
import { buildCsvReport } from '../services/report/buildCsv.js';
import { persistScanSession, getPersistedScan } from '../services/persistence/mongoPersistence.js';
import { getDatabaseStatus } from '../config/database.js';
import { loadKeywords } from '../config/keywords.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

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

    // Asynchronously persist to MongoDB Atlas if connected
    persistScanSession({
      scanId,
      scannedAt,
      totalFiles: req.files.length,
      results,
      files: req.files,
    }).catch((persistErr) => {
      logger.warn(`MongoDB persistence background error for scan ${scanId}: ${persistErr.message}`);
    });

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
    let scan = scanStore.getScan(req.params.id);
    if (!scan) {
      const persisted = await getPersistedScan(req.params.id);
      if (persisted && persisted.scan) {
        scan = {
          scanId: persisted.scan.scanId,
          scannedAt: persisted.scan.createdAt,
          totalFiles: persisted.scan.fileCounts?.total || persisted.documents?.length || 0,
          results: persisted.documents,
        };
      }
    }

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

export const getScans = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    let scans = [];
    let total = 0;

    const dbStatus = getDatabaseStatus();
    if (dbStatus.isReady) {
      try {
        const { Scan } = await import('../models/Scan.js');
        total = await Scan.countDocuments();
        scans = await Scan.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
      } catch {
        // Fallback to in-memory scans if MongoDB query fails
      }
    }

    if (scans.length === 0) {
      const memoryScans = scanStore.getAllScans ? scanStore.getAllScans() : [];
      total = memoryScans.length;
      scans = memoryScans.slice(skip, skip + limit);
    }

    res.status(200).json({
      success: true,
      status: 'success',
      data: {
        scans,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
