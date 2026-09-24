import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { UnauthenticatedError } from '../../core/errors.js';
import {
  getCvLink,
  getSubmission,
  listSubmissions,
  updateSubmission,
} from '../../services/submission-admin.service.js';
import {
  toApplicationAdmin,
  toEnquiryAdmin,
  toMessageAdmin,
} from '../../serializers/submission.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readBody, readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import {
  applicationPatch,
  listApplicationsQuery,
  listSubmissionsQuery,
  submissionPatch,
} from '../../validators/submission.validator.js';

/** requireAuth guarantees this, but the type does not, so it is checked once. */
const actorContext = (req: Request): { actorId: Types.ObjectId } => {
  if (!req.user) throw new UnauthenticatedError();
  return { actorId: req.user.id };
};

export async function listEnquiriesHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listSubmissionsQuery);
  const { items, total } = await listSubmissions('enquiry', query);

  res.json({ data: items.map(toEnquiryAdmin), meta: toMeta(query.page, query.pageSize, total) });
}

export async function getEnquiryHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);

  res.json({ data: toEnquiryAdmin(await getSubmission('enquiry', id, actorContext(req))) });
}

export async function updateEnquiryHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const patch = readBody(req, submissionPatch);

  res.json({ data: toEnquiryAdmin(await updateSubmission('enquiry', id, patch)) });
}

export async function listMessagesHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listSubmissionsQuery);
  const { items, total } = await listSubmissions('message', query);

  res.json({ data: items.map(toMessageAdmin), meta: toMeta(query.page, query.pageSize, total) });
}

export async function getMessageHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);

  res.json({ data: toMessageAdmin(await getSubmission('message', id, actorContext(req))) });
}

export async function updateMessageHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const patch = readBody(req, submissionPatch);

  res.json({ data: toMessageAdmin(await updateSubmission('message', id, patch)) });
}

export async function listApplicationsHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listApplicationsQuery);
  const { items, total } = await listSubmissions('application', query);

  res.json({
    data: items.map(toApplicationAdmin),
    meta: toMeta(query.page, query.pageSize, total),
  });
}

export async function getApplicationHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);

  res.json({
    data: toApplicationAdmin(await getSubmission('application', id, actorContext(req))),
  });
}

export async function updateApplicationHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const patch = readBody(req, applicationPatch);

  res.json({ data: toApplicationAdmin(await updateSubmission('application', id, patch)) });
}

export async function getApplicationCvHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);

  res.json({ data: await getCvLink(id, actorContext(req)) });
}
