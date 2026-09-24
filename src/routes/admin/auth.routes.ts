import { Router } from 'express';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  totpEnableHandler,
  totpSetupHandler,
} from '../../controllers/admin/auth.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { loginLimiter } from '../../middlewares/rate-limit.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import {
  loginBody,
  passwordChangeBody,
  totpEnableBody,
} from '../../validators/auth.validator.js';

/**
 * These routes are the only ones that accept a user who has not yet enrolled
 * in two-factor: otherwise nobody could ever complete setup.
 */
const allowEnrolment = requireAuth({ allowWithoutTotp: true });

export const adminAuthRoutes: Router = Router();

// Attached per route, not with a path-less `use`: this router shares the
// `/admin` mount with the others, so a blanket `use` would touch them all.
adminAuthRoutes.post('/auth/login', noStore, loginLimiter, validate({ body: loginBody }), loginHandler);
adminAuthRoutes.post('/auth/refresh', noStore, loginLimiter, refreshHandler);
adminAuthRoutes.post('/auth/logout', noStore, logoutHandler);

adminAuthRoutes.get('/auth/me', noStore, allowEnrolment, meHandler);
adminAuthRoutes.post('/auth/2fa/setup', noStore, allowEnrolment, totpSetupHandler);
adminAuthRoutes.post(
  '/auth/2fa/enable',
  noStore,
  allowEnrolment,
  validate({ body: totpEnableBody }),
  totpEnableHandler
);
adminAuthRoutes.post(
  '/auth/password',
  noStore,
  allowEnrolment,
  validate({ body: passwordChangeBody }),
  changePasswordHandler
);
