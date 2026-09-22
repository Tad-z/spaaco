import { Router } from 'express';
import { getHealth } from '../../controllers/public/health.controller.js';

export const healthRoutes: Router = Router();

healthRoutes.get('/health', getHealth);
