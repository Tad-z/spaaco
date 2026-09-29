import { Router } from 'express';
import {
  getRecognitionDirectoryHandler,
  listRecognitionsHandler,
} from '../../controllers/public/recognition.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { slugParams } from '../../validators/common.validator.js';

export const recognitionRoutes: Router = Router();

recognitionRoutes.get('/recognitions', optionalPreviewAuth, listRecognitionsHandler);
recognitionRoutes.get(
  '/recognitions/:slug',
  optionalPreviewAuth,
  validate({ params: slugParams }),
  getRecognitionDirectoryHandler
);
