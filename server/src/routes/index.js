import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import scanRoutes from './scanRoutes.js';
import retrievalRoutes from './retrievalRoutes.js';
import documentRoutes from './documentRoutes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/', scanRoutes);
router.use('/', retrievalRoutes);
router.use('/', documentRoutes);

export default router;
