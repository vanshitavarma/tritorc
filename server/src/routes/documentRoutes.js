import { Router } from 'express';
import {
  getDocumentById,
  chatWithDocument,
  analyzeDocument,
  getDocumentInsights,
} from '../controllers/documentController.js';

const router = Router();

router.get('/documents/:documentId', getDocumentById);
router.post('/documents/:documentId/chat', chatWithDocument);
router.post('/documents/:documentId/analyze', analyzeDocument);
router.get('/documents/:documentId/insights', getDocumentInsights);

export default router;
