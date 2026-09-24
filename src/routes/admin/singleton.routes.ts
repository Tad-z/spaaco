import { Router } from 'express';
import {
  getAdminPageHandler,
  getAdminSettingsHandler,
  patchAdminPageHandler,
  patchAdminSettingsHandler,
  replaceAdminPageHandler,
  replaceAdminSettingsHandler,
} from '../../controllers/admin/singleton.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { ifMatch } from '../../middlewares/if-match.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { pageKeyParams } from '../../validators/page.validator.js';
import { patchBody, replaceBody } from '../../validators/singleton.validator.js';

/**
 * Pages and settings, under `/admin/pages/:key` and `/admin/settings`.
 *
 * `editor` and above, and no `hr`: the matrix in docs/API.md grants HR the
 * jobs *collection*, not the page documents the site is built from.
 */
export const adminSingletonRoutes: Router = Router();

// Per route, never `router.use`: these share the `/admin` mount with the other
// admin routers, so a path-less guard would apply to all of them.
const guards = [noStore, requireAuth(), requireRole('editor')] as const;

adminSingletonRoutes.get(
  '/pages/:key',
  ...guards,
  validate({ params: pageKeyParams }),
  getAdminPageHandler
);

adminSingletonRoutes.put(
  '/pages/:key',
  ...guards,
  ifMatch,
  validate({ params: pageKeyParams, body: replaceBody }),
  replaceAdminPageHandler
);

adminSingletonRoutes.patch(
  '/pages/:key',
  ...guards,
  ifMatch,
  validate({ params: pageKeyParams, body: patchBody }),
  patchAdminPageHandler
);

adminSingletonRoutes.get('/settings', ...guards, getAdminSettingsHandler);

adminSingletonRoutes.put(
  '/settings',
  ...guards,
  ifMatch,
  validate({ body: replaceBody }),
  replaceAdminSettingsHandler
);

adminSingletonRoutes.patch(
  '/settings',
  ...guards,
  ifMatch,
  validate({ body: patchBody }),
  patchAdminSettingsHandler
);
