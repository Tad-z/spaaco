import { Router } from 'express';
import { getPageHandler } from '../../controllers/public/page.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { pageKeyParams } from '../../validators/page.validator.js';

export const pageRoutes: Router = Router();

pageRoutes.get(
  '/pages/:key',
  optionalPreviewAuth,
  validate({ params: pageKeyParams }),
  getPageHandler
);
