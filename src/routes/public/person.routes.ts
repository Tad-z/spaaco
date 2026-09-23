import { Router } from 'express';
import { getPersonHandler, listPeopleHandler } from '../../controllers/public/person.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { listPeopleQuery, personSlugParams } from '../../validators/person.validator.js';

export const personRoutes: Router = Router();

personRoutes.get(
  '/people',
  optionalPreviewAuth,
  validate({ query: listPeopleQuery }),
  listPeopleHandler
);

personRoutes.get(
  '/people/:slug',
  optionalPreviewAuth,
  validate({ params: personSlugParams }),
  getPersonHandler
);
