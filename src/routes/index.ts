import { Router } from 'express';
import { healthRoutes } from './public/health.routes.js';
import { siteRoutes } from './public/site.routes.js';

/**
 * The one place routers are mounted.
 *
 * `/api/v1` is part of the documented path in openapi.yaml (ADR-019), so the
 * URLs here match the spec and the mock exactly.
 */
export const API_PREFIX = '/api/v1';

export const apiRoutes: Router = Router();

apiRoutes.use(healthRoutes);
apiRoutes.use(siteRoutes);
