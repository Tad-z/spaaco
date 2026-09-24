import { Router } from 'express';
import {
  createApplicationHandler,
  createEnquiryHandler,
  createMessageHandler,
} from '../../controllers/public/submission.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  applicationLimiter,
  enquiryLimiter,
  messageLimiter,
} from '../../middlewares/rate-limit.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { cvUpload } from '../../middlewares/cv-upload.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import {
  applicationBody,
  enquiryBody,
  messageBody,
} from '../../validators/submission.validator.js';

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
  enquiryLimiter,
  validate({ body: enquiryBody }),
  createEnquiryHandler
);

submissionRoutes.post(
  '/messages',
  noStore,
  messageLimiter,
  validate({ body: messageBody }),
  createMessageHandler
);

// Multipart, so `cvUpload` runs before `validate`: until multer has parsed the
// request there are no fields to validate.
submissionRoutes.post(
  '/jobs/:id/applications',
  noStore,
  applicationLimiter,
  cvUpload(),
  validate({ params: idParams, body: applicationBody }),
  createApplicationHandler
);
