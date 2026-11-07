import { Router } from 'express';
import { getHealth, getLiveness, getReadiness } from '../controllers/healthController.js';

const router = Router();

router.get('/health', getHealth);
router.get('/health/live', getLiveness);
router.get('/health/ready', getReadiness);

export default router;
