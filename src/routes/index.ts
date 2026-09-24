import { Router } from 'express';
import { healthRoutes } from './public/health.routes.js';
import { siteRoutes } from './public/site.routes.js';
import { contentRoutes } from './public/content.routes.js';
import { personRoutes } from './public/person.routes.js';
import { insightRoutes } from './public/insight.routes.js';
import { pageRoutes } from './public/page.routes.js';
import { searchRoutes } from './public/search.routes.js';
import { submissionRoutes } from './public/submission.routes.js';
import { adminAuthRoutes } from './admin/auth.routes.js';
import { adminUserRoutes } from './admin/user.routes.js';
import { adminContentRoutes } from './admin/content.routes.js';
import { adminSingletonRoutes } from './admin/singleton.routes.js';
import { adminMediaRoutes } from './admin/media.routes.js';

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
apiRoutes.use(contentRoutes);
apiRoutes.use(personRoutes);
apiRoutes.use(insightRoutes);
apiRoutes.use(pageRoutes);
apiRoutes.use(searchRoutes);

// Admin routers deny by default: each states its own auth and roles.
apiRoutes.use(submissionRoutes);

apiRoutes.use('/admin', adminAuthRoutes);
apiRoutes.use('/admin', adminUserRoutes);
apiRoutes.use('/admin', adminContentRoutes);
apiRoutes.use('/admin', adminSingletonRoutes);
apiRoutes.use('/admin', adminMediaRoutes);
