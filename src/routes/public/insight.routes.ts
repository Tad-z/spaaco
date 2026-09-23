import { Router } from 'express';
import {
  getInsightHandler,
  listInsightsHandler,
} from '../../controllers/public/insight.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { insightSlugParams, listInsightsQuery } from '../../validators/insight.validator.js';

export const insightRoutes: Router = Router();

insightRoutes.get(
  '/insights',
  optionalPreviewAuth,
  validate({ query: listInsightsQuery }),
  listInsightsHandler
);

insightRoutes.get(
  '/insights/:slug',
  optionalPreviewAuth,
  validate({ params: insightSlugParams }),
  getInsightHandler
);
