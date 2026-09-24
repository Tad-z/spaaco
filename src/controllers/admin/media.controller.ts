import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { UnauthenticatedError, ValidationError } from '../../core/errors.js';
import {
  deleteMedia,
  findUsages,
  getMediaWithUsages,
  listMedia,
  replaceMediaFile,
  updateMedia,
  uploadMedia,
} from '../../services/media.service.js';
import { toMediaAdmin } from '../../serializers/media-admin.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readBody, readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import {
  listMediaQuery,
  updateMediaBody,
  uploadMediaBody,
} from '../../validators/media.validator.js';

/**
 * The revision the editor read. `ifMatch` runs before both write routes and
 * refuses a request without one, so reaching here empty is a wiring bug.
 */
const expectedRevision = (req: Request): number => {
  if (req.ifMatch === undefined) {
    throw new ValidationError('An If-Match header carrying the current revision is required', [
      { path: 'If-Match', message: 'required' },
    ]);
  }

  return req.ifMatch;
};

/** requireAuth guarantees this, but the type does not, so it is checked once. */
const actorContext = (req: Request): { actorId: Types.ObjectId } => {
  if (!req.user) throw new UnauthenticatedError();
  return { actorId: req.user.id };
};

/**
 * The uploaded file. `imageUpload` rejects a request without one, so reaching
 * here empty is a wiring mistake rather than a client error.
 */
const uploadedFile = (req: Request): Express.Multer.File => {
  if (req.file === undefined) {
    throw new ValidationError('A file is required', [{ path: 'file', message: 'required' }]);
  }

  return req.file;
};

export async function uploadMediaHandler(req: Request, res: Response): Promise<void> {
  // `validate` runs after `imageUpload` on this route, because multer is what
  // turns a multipart request into a body at all.
  const fields = readBody(req, uploadMediaBody);
  const file = uploadedFile(req);

  const doc = await uploadMedia(
    {
      buffer: file.buffer,
      originalFilename: file.originalname,
      alt: fields.alt,
      title: fields.title ?? null,
    },
    actorContext(req)
  );

  res.status(201).json({ data: toMediaAdmin(doc) });
}

export async function listMediaHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listMediaQuery);
  const { items, total } = await listMedia(query);

  res.json({
    data: items.map((item) => toMediaAdmin(item)),
    meta: toMeta(query.page, query.pageSize, total),
  });
}

export async function getMediaHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);

  const { doc, usedBy } = await getMediaWithUsages(id);

  res.json({ data: toMediaAdmin(doc, usedBy) });
}

export async function updateMediaHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const input = readBody(req, updateMediaBody);

  const doc = await updateMedia(id, expectedRevision(req), input);

  res.json({ data: toMediaAdmin(doc, await findUsages(id)) });
}

export async function replaceMediaFileHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const file = uploadedFile(req);

  const doc = await replaceMediaFile(
    id,
    expectedRevision(req),
    file.buffer,
    file.originalname,
    actorContext(req)
  );

  res.json({ data: toMediaAdmin(doc, await findUsages(id)) });
}

export async function deleteMediaHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);

  await deleteMedia(id, actorContext(req));

  res.status(204).end();
}
