import { Router } from 'express';
import {
  createContentHandler,
  deleteContentHandler,
  getContentHandler,
  listContentHandler,
  publishContentHandler,
  reorderContentHandler,
  unpublishContentHandler,
  updateContentHandler,
} from '../../controllers/admin/content.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireContentAccess } from '../../middlewares/require-content-access.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { ifMatch } from '../../middlewares/if-match.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import {
  adminCollectionParams,
  adminItemParams,
  listContentQuery,
  reorderBody,
} from '../../validators/content.validator.js';

/**
 * Content CRUD, under `/admin/content/{collection}`.
 *
 * The `/content/` segment keeps these from colliding with the admin
 * singletons, which would otherwise depend on registration order (ADR-033).
 *
 * `editor` covers content; `hr` is granted jobs only, which is enforced below
 * rather than by role alone, since the role matrix is per area, not per route.
 */
export const adminContentRoutes: Router = Router();

// Per route, for the same reason: a path-less `use` on a router sharing the
// `/admin` mount would apply to every admin request.
const contentGuards = [noStore, requireAuth(), requireContentAccess] as const;

adminContentRoutes.get(
  '/content/:collection',
  ...contentGuards,
  validate({ params: adminCollectionParams, query: listContentQuery }),
  listContentHandler
);

adminContentRoutes.post(
  '/content/:collection',
  ...contentGuards,
  validate({ params: adminCollectionParams }),
  createContentHandler
);

adminContentRoutes.patch(
  '/content/:collection/reorder',
  ...contentGuards,
  validate({ params: adminCollectionParams, body: reorderBody }),
  reorderContentHandler
);

adminContentRoutes.get(
  '/content/:collection/:id',
  ...contentGuards,
  validate({ params: adminItemParams }),
  getContentHandler
);

adminContentRoutes.patch(
  '/content/:collection/:id',
  ...contentGuards,
  ifMatch,
  validate({ params: adminItemParams }),
  updateContentHandler
);

adminContentRoutes.delete(
  '/content/:collection/:id',
  ...contentGuards,
  validate({ params: adminItemParams }),
  deleteContentHandler
);

adminContentRoutes.post(
  '/content/:collection/:id/publish',
  ...contentGuards,
  validate({ params: adminItemParams }),
  publishContentHandler
);

adminContentRoutes.post(
  '/content/:collection/:id/unpublish',
  ...contentGuards,
  validate({ params: adminItemParams }),
  unpublishContentHandler
);
