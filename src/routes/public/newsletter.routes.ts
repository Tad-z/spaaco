import { Router } from 'express';
import {
  confirmHandler,
  subscribeHandler,
  unsubscribeHandler,
} from '../../controllers/public/newsletter.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  newsletterLimiter,
  newsletterTokenLimiter,
} from '../../middlewares/rate-limit.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import {
  newsletterSubscribeBody,
  newsletterTokenBody,
} from '../../validators/newsletter.validator.js';

/**
 * The newsletter (ADR-065). Subscribing is a form like the others and limited
 * like one; confirming and unsubscribing carry an unguessable token, so their
 * limit only stops a flood.
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
  '/newsletter/confirm',
  noStore,
  newsletterTokenLimiter,
  validate({ body: newsletterTokenBody }),
  confirmHandler
);

newsletterRoutes.post(
  '/newsletter/unsubscribe',
  noStore,
  newsletterTokenLimiter,
  validate({ body: newsletterTokenBody }),
  unsubscribeHandler
);
