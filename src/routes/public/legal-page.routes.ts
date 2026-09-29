import { Router } from 'express';
import { getLegalPageHandler } from '../../controllers/public/legal-page.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { legalKeyParams } from '../../validators/legal-page.validator.js';

export const legalPageRoutes: Router = Router();

legalPageRoutes.get(
  '/legal/:key',
  optionalPreviewAuth,
  validate({ params: legalKeyParams }),
  getLegalPageHandler
);
