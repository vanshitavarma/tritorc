import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import scanRoutes from './scanRoutes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/', scanRoutes);

export default router;
