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

adminAuthRoutes.use(noStore);

adminAuthRoutes.post('/auth/login', loginLimiter, validate({ body: loginBody }), loginHandler);
adminAuthRoutes.post('/auth/refresh', loginLimiter, refreshHandler);
adminAuthRoutes.post('/auth/logout', logoutHandler);

adminAuthRoutes.get('/auth/me', allowEnrolment, meHandler);
adminAuthRoutes.post('/auth/2fa/setup', allowEnrolment, totpSetupHandler);
adminAuthRoutes.post(
  '/auth/2fa/enable',
  allowEnrolment,
  validate({ body: totpEnableBody }),
  totpEnableHandler
);
adminAuthRoutes.post(
  '/auth/password',
  allowEnrolment,
  validate({ body: passwordChangeBody }),
  changePasswordHandler
);
