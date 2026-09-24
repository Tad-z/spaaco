import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { UnauthenticatedError, ValidationError } from '../../core/errors.js';
import {
  createContent,
  deleteContent,
  getContent,
  listContent,
  reorderContent,
  setPublished,
  updateContent,
} from '../../services/content.service.js';
import { buildExpanded } from '../../services/expand.service.js';
import {
  collectExpandTargets,
  toAdminContent,
} from '../../serializers/admin-content.serializer.js';
import type { StoredDoc } from '../../serializers/admin-content.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readBody, readParams, readQuery } from '../../middlewares/validate.middleware.js';
import {
  adminCollectionParams,
  adminItemParams,
  CONTENT_CREATE_SCHEMAS,
  CONTENT_UPDATE_SCHEMAS,
  listContentQuery,
  reorderBody,
} from '../../validators/content.validator.js';
import type { AdminCollection } from '../../types/api.js';

/**
 * One set of handlers for all seven content collections.
 *
 * The body schema is chosen by the `collection` path parameter, which the
 * route has already validated against the enum, so the lookup is total.
 */

/** requireAuth guarantees this, but the type does not, so it is checked once. */
const actorContext = (req: Request): { actorId: Types.ObjectId } => {
  if (!req.user) throw new UnauthenticatedError();
  return { actorId: req.user.id };
};

/** Serialize one or many documents with their previews resolved in one pass. */
async function serialize(
  collection: AdminCollection,
  docs: StoredDoc[]
): Promise<ReturnType<typeof toAdminContent>[]> {
  const { mediaIds, personIds } = collectExpandTargets(collection, docs);
  const expanded = await buildExpanded(mediaIds, personIds);

  return docs.map((doc) => toAdminContent(collection, doc, expanded));
}

export async function listContentHandler(req: Request, res: Response): Promise<void> {
  const { collection } = readParams(req, adminCollectionParams);
  const query = readQuery(req, listContentQuery);

  const { items, total } = await listContent(collection, query);

  res.json({
    data: await serialize(collection, items),
    meta: toMeta(query.page, query.pageSize, total),
  });
}

export async function getContentHandler(req: Request, res: Response): Promise<void> {
  const { collection, id } = readParams(req, adminItemParams);
  const doc = await getContent(collection, id);

  res.json({ data: (await serialize(collection, [doc]))[0] });
}

export async function createContentHandler(req: Request, res: Response): Promise<void> {
  const { collection } = readParams(req, adminCollectionParams);
  const body = CONTENT_CREATE_SCHEMAS[collection].parse(req.body) as Record<string, unknown>;

  const doc = await createContent(collection, body, actorContext(req));

  res.status(201).json({ data: (await serialize(collection, [doc]))[0] });
}

export async function updateContentHandler(req: Request, res: Response): Promise<void> {
  const { collection, id } = readParams(req, adminItemParams);
  const revision = req.ifMatch;
  if (revision === undefined) throw new ValidationError('An If-Match header is required');

  const body = CONTENT_UPDATE_SCHEMAS[collection].parse(req.body) as Record<string, unknown>;
  const doc = await updateContent(collection, id, revision, body, actorContext(req));

  res.json({ data: (await serialize(collection, [doc]))[0] });
}

export async function deleteContentHandler(req: Request, res: Response): Promise<void> {
  const { collection, id } = readParams(req, adminItemParams);

  await deleteContent(collection, id, actorContext(req));

  res.status(204).end();
}

export async function publishContentHandler(req: Request, res: Response): Promise<void> {
  const { collection, id } = readParams(req, adminItemParams);
  const doc = await setPublished(collection, id, true, actorContext(req));

  res.json({ data: (await serialize(collection, [doc]))[0] });
}

export async function unpublishContentHandler(req: Request, res: Response): Promise<void> {
  const { collection, id } = readParams(req, adminItemParams);
  const doc = await setPublished(collection, id, false, actorContext(req));

  res.json({ data: (await serialize(collection, [doc]))[0] });
}

export async function reorderContentHandler(req: Request, res: Response): Promise<void> {
  const { collection } = readParams(req, adminCollectionParams);
  const { ids } = readBody(req, reorderBody);

  await reorderContent(collection, ids, actorContext(req));

  res.status(204).end();
}
