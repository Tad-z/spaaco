import { Router } from 'express';
import {
  deleteMediaHandler,
  getMediaHandler,
  listMediaHandler,
  replaceMediaFileHandler,
  updateMediaHandler,
  uploadMediaHandler,
} from '../../controllers/admin/media.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { imageUpload } from '../../middlewares/upload.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import {
  listMediaQuery,
  updateMediaBody,
  uploadMediaBody,
} from '../../validators/media.validator.js';

/**
 * The image library, under `/admin/media`.
 *
 * `editor` and above, matching pages and settings: an image is site content.
 *
 * On the two multipart routes `imageUpload` runs *before* `validate`, because
 * until multer has parsed the request there is no body to validate.
 */
export const adminMediaRoutes: Router = Router();

const guards = [noStore, requireAuth(), requireRole('editor')] as const;

adminMediaRoutes.get('/media', ...guards, validate({ query: listMediaQuery }), listMediaHandler);

adminMediaRoutes.post(
  '/media',
  ...guards,
  imageUpload(),
  validate({ body: uploadMediaBody }),
  uploadMediaHandler
);

adminMediaRoutes.get('/media/:id', ...guards, validate({ params: idParams }), getMediaHandler);

adminMediaRoutes.patch(
  '/media/:id',
  ...guards,
  validate({ params: idParams, body: updateMediaBody }),
  updateMediaHandler
);

adminMediaRoutes.put(
  '/media/:id/file',
  ...guards,
  validate({ params: idParams }),
  imageUpload(),
  replaceMediaFileHandler
);

adminMediaRoutes.delete(
  '/media/:id',
  ...guards,
  validate({ params: idParams }),
  deleteMediaHandler
);
