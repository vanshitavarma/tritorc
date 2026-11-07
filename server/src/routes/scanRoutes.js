import { Router } from 'express';
import { uploadFiles } from '../middleware/uploadFiles.js';
import {
  getKeywords,
  createScan,
  getScanById,
  getScans,
  downloadReport,
  downloadCsvReport,
} from '../controllers/scanController.js';

const router = Router();

router.get('/keywords', getKeywords);
router.get('/scans', getScans);
router.post('/scans', uploadFiles, createScan);
router.get('/scans/:id', getScanById);
router.get('/scans/:id/report', downloadReport);
router.get('/scans/:id/report.csv', downloadCsvReport);
router.get('/scans/:id/csv', downloadCsvReport);

export default router;
