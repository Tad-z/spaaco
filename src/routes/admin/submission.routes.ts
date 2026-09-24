import { Router } from 'express';
import {
  getApplicationCvHandler,
  getApplicationHandler,
  getEnquiryHandler,
  getMessageHandler,
  listApplicationsHandler,
  listEnquiriesHandler,
  listMessagesHandler,
  updateApplicationHandler,
  updateEnquiryHandler,
  updateMessageHandler,
} from '../../controllers/admin/submission.controller.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { noStore } from '../../middlewares/cache-headers.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import {
  applicationPatch,
  listApplicationsQuery,
  listSubmissionsQuery,
  submissionPatch,
} from '../../validators/submission.validator.js';

/**
 * Submissions, split by who the firm says should handle them.
 *
 * Business development takes enquiries and messages; HR takes applications and
 * CVs. Neither can see the other's, and an editor can see none of it — whoever
 * writes the website has no reason to read a client's matter or a job
 * applicant's history. `admin` passes everything, as everywhere else.
 */
export const adminSubmissionRoutes: Router = Router();

const clientFacing = [noStore, requireAuth(), requireRole('business_dev')] as const;
const hiring = [noStore, requireAuth(), requireRole('hr')] as const;

adminSubmissionRoutes.get(
  '/enquiries',
  ...clientFacing,
  validate({ query: listSubmissionsQuery }),
  listEnquiriesHandler
);

adminSubmissionRoutes.get(
  '/enquiries/:id',
  ...clientFacing,
  validate({ params: idParams }),
  getEnquiryHandler
);

adminSubmissionRoutes.patch(
  '/enquiries/:id',
  ...clientFacing,
  validate({ params: idParams, body: submissionPatch }),
  updateEnquiryHandler
);

adminSubmissionRoutes.get(
  '/messages',
  ...clientFacing,
  validate({ query: listSubmissionsQuery }),
  listMessagesHandler
);

adminSubmissionRoutes.get(
  '/messages/:id',
  ...clientFacing,
  validate({ params: idParams }),
  getMessageHandler
);

adminSubmissionRoutes.patch(
  '/messages/:id',
  ...clientFacing,
  validate({ params: idParams, body: submissionPatch }),
  updateMessageHandler
);

adminSubmissionRoutes.get(
  '/applications',
  ...hiring,
  validate({ query: listApplicationsQuery }),
  listApplicationsHandler
);

adminSubmissionRoutes.get(
  '/applications/:id',
  ...hiring,
  validate({ params: idParams }),
  getApplicationHandler
);

adminSubmissionRoutes.patch(
  '/applications/:id',
  ...hiring,
  validate({ params: idParams, body: applicationPatch }),
  updateApplicationHandler
);

adminSubmissionRoutes.get(
  '/applications/:id/cv',
  ...hiring,
  validate({ params: idParams }),
  getApplicationCvHandler
);
