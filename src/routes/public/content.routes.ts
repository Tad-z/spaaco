import { Router } from 'express';
import {
  getJobHandler,
  getPracticeAreaHandler,
  listFaqsHandler,
  listJobsHandler,
  listOfficesHandler,
  listPracticeAreasHandler,
} from '../../controllers/public/content.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { idParams, slugParams } from '../../validators/common.validator.js';

export const contentRoutes: Router = Router();

contentRoutes.get('/practice-areas', optionalPreviewAuth, listPracticeAreasHandler);
contentRoutes.get(
  '/practice-areas/:slug',
  optionalPreviewAuth,
  validate({ params: slugParams }),
  getPracticeAreaHandler
);

contentRoutes.get('/offices', optionalPreviewAuth, listOfficesHandler);
contentRoutes.get('/faqs', optionalPreviewAuth, listFaqsHandler);

contentRoutes.get('/jobs', optionalPreviewAuth, listJobsHandler);
contentRoutes.get('/jobs/:id', optionalPreviewAuth, validate({ params: idParams }), getJobHandler);
