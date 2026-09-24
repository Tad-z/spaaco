import { Router } from 'express';
import {
  createUserHandler,
  listAuditLogsHandler,
  listUsersHandler,
  revokeUserSessionsHandler,
  updateUserHandler,
} from '../../controllers/admin/user.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { idParams, pagination } from '../../validators/common.validator.js';
import { createUserBody, listAuditQuery, updateUserBody } from '../../validators/auth.validator.js';

/**
 * Accounts and the audit trail are administrators only (docs/API.md matrix).
 *
 * The guards are attached per route rather than with `router.use(...)`: this
 * router is mounted at `/admin` alongside the others, and a path-less `use`
 * would apply to every `/admin/*` request passing through it — which briefly
 * made admin-only the rule for the whole admin API.
 */
export const adminUserRoutes: Router = Router();

const adminOnly = [noStore, requireAuth(), requireRole('admin')] as const;

adminUserRoutes.get('/users', ...adminOnly, validate({ query: pagination }), listUsersHandler);

// The step the compromised-account procedure in docs/RUNBOOK.md depends on:
// ending somebody else's sessions without knowing their password.
adminUserRoutes.post(
  '/users/:id/revoke-sessions',
  ...adminOnly,
  validate({ params: idParams }),
  revokeUserSessionsHandler
);
adminUserRoutes.post('/users', ...adminOnly, validate({ body: createUserBody }), createUserHandler);
adminUserRoutes.patch(
  '/users/:id',
  ...adminOnly,
  validate({ params: idParams, body: updateUserBody }),
  updateUserHandler
);

adminUserRoutes.get(
  '/audit-logs',
  ...adminOnly,
  validate({ query: listAuditQuery }),
  listAuditLogsHandler
);
