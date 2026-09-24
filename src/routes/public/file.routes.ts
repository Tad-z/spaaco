import { Router } from 'express';
import { downloadCvHandler } from '../../controllers/public/file.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { cvFileParams, cvFileQuery } from '../../validators/file.validator.js';

/**
 * Redeeming a locally signed CV link.
 *
 * Unauthenticated in the sense that it carries no token — the signature is the
 * authorisation, the same way a presigned S3 URL works. Mounted only when the
 * local private driver is in use, so a production deployment on S3 serves no
 * files from this API at all.
 */
export const fileRoutes: Router = Router();

fileRoutes.get(
  '/files/cv/:key',
  noStore,
  validate({ params: cvFileParams, query: cvFileQuery }),
  downloadCvHandler
);
