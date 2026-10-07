import { Router } from 'express';
import { healthRoutes } from './public/health.routes.js';
import { siteRoutes } from './public/site.routes.js';
import { contentRoutes } from './public/content.routes.js';
import { personRoutes } from './public/person.routes.js';
import { insightRoutes } from './public/insight.routes.js';
import { pageRoutes } from './public/page.routes.js';
import { recognitionRoutes } from './public/recognition.routes.js';
import { legalPageRoutes } from './public/legal-page.routes.js';
import { searchRoutes } from './public/search.routes.js';
import { submissionRoutes } from './public/submission.routes.js';
import { newsletterRoutes } from './public/newsletter.routes.js';
import { fileRoutes } from './public/file.routes.js';
import { config } from '../config/env.js';
import { adminAuthRoutes } from './admin/auth.routes.js';
import { adminUserRoutes } from './admin/user.routes.js';
import { adminContentRoutes } from './admin/content.routes.js';
import { adminSingletonRoutes } from './admin/singleton.routes.js';
import { adminMediaRoutes } from './admin/media.routes.js';
import { adminSubmissionRoutes } from './admin/submission.routes.js';
import { adminNewsletterRoutes } from './admin/newsletter.routes.js';

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
apiRoutes.use(recognitionRoutes);
apiRoutes.use(legalPageRoutes);
apiRoutes.use(searchRoutes);

// Admin routers deny by default: each states its own auth and roles.
apiRoutes.use(submissionRoutes);
apiRoutes.use(newsletterRoutes);

// Only the local private driver hands out links this API has to redeem; with
// S3 the presigned URL points at S3, so the route does not exist at all.
if (config.STORAGE_PRIVATE_DRIVER === 'local') {
  apiRoutes.use(fileRoutes);
}

apiRoutes.use('/admin', adminAuthRoutes);
apiRoutes.use('/admin', adminUserRoutes);
apiRoutes.use('/admin', adminContentRoutes);
apiRoutes.use('/admin', adminSingletonRoutes);
apiRoutes.use('/admin', adminMediaRoutes);
apiRoutes.use('/admin', adminSubmissionRoutes);
apiRoutes.use('/admin', adminNewsletterRoutes);
