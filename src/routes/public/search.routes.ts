import { Router } from 'express';
import { searchHandler } from '../../controllers/public/search.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { searchQuery } from '../../validators/common.validator.js';
import { searchLimiter } from '../../middlewares/rate-limit.middleware.js';

export const searchRoutes: Router = Router();

// No optionalPreviewAuth: search never returns drafts, deliberately.
searchRoutes.get('/search', searchLimiter, validate({ query: searchQuery }), searchHandler);
