import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import scanRoutes from './scanRoutes.js';
import retrievalRoutes from './retrievalRoutes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/', scanRoutes);
router.use('/', retrievalRoutes);

export default router;
