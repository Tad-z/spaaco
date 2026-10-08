import { Router } from 'express';
import {
  subscribeHandler,
  unsubscribeHandler,
} from '../../controllers/public/newsletter.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { newsletterLimiter, unsubscribeLimiter } from '../../middlewares/rate-limit.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import {
  newsletterSubscribeBody,
  newsletterUnsubscribeBody,
} from '../../validators/newsletter.validator.js';

/**
 * The newsletter (ADR-067). Each form has its own per-IP budget, as the other
 * forms do, so subscribing does not use up a visitor's unsubscribe attempts.
 */
export const newsletterRoutes: Router = Router();

newsletterRoutes.post(
  '/newsletter/subscriptions',
  noStore,
  newsletterLimiter,
  validate({ body: newsletterSubscribeBody }),
  subscribeHandler
);

newsletterRoutes.post(
  '/newsletter/unsubscribe',
  noStore,
  unsubscribeLimiter,
  validate({ body: newsletterUnsubscribeBody }),
  unsubscribeHandler
);
