import { Router } from 'express';
import {
  createUserHandler,
  listAuditLogsHandler,
  listUsersHandler,
  updateUserHandler,
} from '../../controllers/admin/user.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { idParams, pagination } from '../../validators/common.validator.js';
import { createUserBody, listAuditQuery, updateUserBody } from '../../validators/auth.validator.js';

/** Accounts and the audit trail are administrators only (docs/API.md matrix). */
export const adminUserRoutes: Router = Router();

adminUserRoutes.use(noStore, requireAuth(), requireRole('admin'));

adminUserRoutes.get('/users', validate({ query: pagination }), listUsersHandler);
adminUserRoutes.post('/users', validate({ body: createUserBody }), createUserHandler);
adminUserRoutes.patch(
  '/users/:id',
  validate({ params: idParams, body: updateUserBody }),
  updateUserHandler
);

adminUserRoutes.get('/audit-logs', validate({ query: listAuditQuery }), listAuditLogsHandler);
