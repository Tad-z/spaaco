import { Router } from 'express';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  updateProfileHandler,
} from '../../controllers/admin/auth.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { loginLimiter } from '../../middlewares/rate-limit.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import {
  loginBody,
  passwordChangeBody,
  profileUpdateBody,
} from '../../validators/auth.validator.js';

const signedIn = requireAuth();

export const adminAuthRoutes: Router = Router();

// Attached per route, not with a path-less `use`: this router shares the
// `/admin` mount with the others, so a blanket `use` would touch them all.
adminAuthRoutes.post(
  '/auth/login',
  noStore,
  loginLimiter,
  validate({ body: loginBody }),
  loginHandler
);
adminAuthRoutes.post('/auth/refresh', noStore, loginLimiter, refreshHandler);
adminAuthRoutes.post('/auth/logout', noStore, logoutHandler);

adminAuthRoutes.get('/auth/me', noStore, signedIn, meHandler);

// Your own display name and notification address. Roles and activation are
// not here: an account that could grant itself a role would make the matrix
// decorative.
adminAuthRoutes.patch(
  '/auth/me',
  noStore,
  signedIn,
  validate({ body: profileUpdateBody }),
  updateProfileHandler
);
adminAuthRoutes.post(
  '/auth/password',
  noStore,
  signedIn,
  validate({ body: passwordChangeBody }),
  changePasswordHandler
);
