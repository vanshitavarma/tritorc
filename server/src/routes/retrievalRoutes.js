import { Router } from 'express';
import { searchDocumentChunks } from '../controllers/retrievalController.js';

const router = Router();

router.post('/documents/:documentId/retrieval', searchDocumentChunks);
router.post('/retrieval', searchDocumentChunks);

export default router;
