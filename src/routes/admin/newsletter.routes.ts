import { Router } from 'express';
import {
  deleteSubscriberHandler,
  exportSubscribersHandler,
  listSubscribersHandler,
} from '../../controllers/admin/newsletter.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import { listNewsletterSubscribersQuery } from '../../validators/newsletter.validator.js';

/**
 * The mailing list belongs to business development, who also handle the
 * firm's other outward contact (ADR-065). `admin` passes, as everywhere.
 */
export const adminNewsletterRoutes: Router = Router();

const guarded = [noStore, requireAuth(), requireRole('business_dev')] as const;

adminNewsletterRoutes.get(
  '/newsletter/subscribers',
  ...guarded,
  validate({ query: listNewsletterSubscribersQuery }),
  listSubscribersHandler
);

adminNewsletterRoutes.get('/newsletter/subscribers/export', ...guarded, exportSubscribersHandler);

adminNewsletterRoutes.delete(
  '/newsletter/subscribers/:id',
  ...guarded,
  validate({ params: idParams }),
  deleteSubscriberHandler
);
