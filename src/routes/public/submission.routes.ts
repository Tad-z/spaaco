import { Router } from 'express';
import {
  createEnquiryHandler,
  createMessageHandler,
} from '../../controllers/public/submission.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { formLimiter } from '../../middlewares/rate-limit.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { enquiryBody, messageBody } from '../../validators/submission.validator.js';

/**
 * The public forms.
 *
 * Rate limited per IP and per form: the captcha stops casual bots, and the
 * limiter stops one that solves it from flooding the firm's inbox. `noStore`
 * because a form response must never sit in a shared cache.
 */
export const submissionRoutes: Router = Router();

submissionRoutes.post(
  '/enquiries',
  noStore,
  formLimiter,
  validate({ body: enquiryBody }),
  createEnquiryHandler
);

submissionRoutes.post(
  '/messages',
  noStore,
  formLimiter,
  validate({ body: messageBody }),
  createMessageHandler
);
