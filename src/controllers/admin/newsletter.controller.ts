import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { UnauthenticatedError } from '../../core/errors.js';
import {
  deleteSubscriber,
  exportSubscribers,
  listSubscribers,
} from '../../services/newsletter.service.js';
import {
  toNewsletterCsv,
  toNewsletterSubscriberAdmin,
} from '../../serializers/newsletter.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import { listNewsletterSubscribersQuery } from '../../validators/newsletter.validator.js';

/** requireAuth guarantees this, but the type does not, so it is checked once. */
const actorContext = (req: Request): { actorId: Types.ObjectId } => {
  if (!req.user) throw new UnauthenticatedError();
  return { actorId: req.user.id };
};

export async function listSubscribersHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listNewsletterSubscribersQuery);
  const { items, total } = await listSubscribers(query, actorContext(req));

  res.json({
    data: items.map(toNewsletterSubscriberAdmin),
    meta: toMeta(query.page, query.pageSize, total),
  });
}

export async function exportSubscribersHandler(req: Request, res: Response): Promise<void> {
  const rows = await exportSubscribers(actorContext(req));
  const date = new Date().toISOString().slice(0, 10);

  res
    .type('text/csv; charset=utf-8')
    .attachment(`newsletter-subscribers-${date}.csv`)
    .send(toNewsletterCsv(rows));
}

export async function deleteSubscriberHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  await deleteSubscriber(id, actorContext(req));

  res.status(204).end();
}
