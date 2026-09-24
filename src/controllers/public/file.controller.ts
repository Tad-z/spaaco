import type { Request, Response } from 'express';
import { openSignedCv } from '../../services/file.service.js';
import { readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { cvFileParams, cvFileQuery } from '../../validators/file.validator.js';

/** Streams a CV to whoever holds a valid, unexpired signature. */
export async function downloadCvHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, cvFileParams);
  const { expires, signature, filename } = readQuery(req, cvFileQuery);

  const download = await openSignedCv(key, expires, signature, filename);

  res.setHeader('content-type', 'application/octet-stream');
  res.setHeader(
    'content-disposition',
    `attachment; filename="${download.filename.replace(/[^\w.-]/g, '_')}"`
  );

  download.stream.pipe(res);
}
