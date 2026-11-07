import { Router } from 'express';
import { uploadFiles } from '../middleware/uploadFiles.js';
import {
  getKeywords,
  createScan,
  getScanById,
  downloadReport,
} from '../controllers/scanController.js';

const router = Router();

router.get('/keywords', getKeywords);
router.post('/scans', uploadFiles, createScan);
router.get('/scans/:id', getScanById);
router.get('/scans/:id/report', downloadReport);

export default router;
