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

  // `pipe` does not forward the source's errors, and an unhandled 'error' on a
  // stream ends the process. A file removed between the stat and the read is
  // rare but entirely possible.
  download.stream.on('error', (error: Error) => {
    res.destroy(error);
  });

  download.stream.pipe(res);
}
