import { Router } from 'express';
import { getHealth } from '../../controllers/public/health.controller.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';

export const healthRoutes: Router = Router();

// A load balancer probe must see the current state, never a cached one.
healthRoutes.get('/health', noStore, getHealth);
