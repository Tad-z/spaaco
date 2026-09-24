import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { MulterError } from 'multer';
import { UPLOAD_LIMITS } from '../config/constants.js';
import { PayloadTooLargeError, ValidationError } from '../core/errors.js';
import { namedHandler } from '../helpers/named-handler.helper.js';

/**
 * One file, in memory, for the image library.
 *
 * Memory storage rather than a temp file: the service needs the bytes anyway
 * to sniff the type and read the dimensions, and nothing untrusted is ever
 * written to disk before it has been accepted.
 *
 * No `fileFilter` here. The only trustworthy check is on the bytes, which
 * multer cannot see, so filtering on the declared type would look like
 * security while proving nothing.
 */

const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.imageMaxBytes, files: 1 },
}).single('file');

/** Multer's own errors, mapped to the contract's codes. */
export function imageUpload(): RequestHandler {
  const handler: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    single(req, res, (error: unknown) => {
      if (error instanceof MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(
            new PayloadTooLargeError(
              `The image must be ${String(Math.round(UPLOAD_LIMITS.imageMaxBytes / (1024 * 1024)))} MB or smaller.`
            )
          );
          return;
        }

        next(
          new ValidationError(error.message, [{ path: error.field ?? 'file', message: error.code }])
        );
        return;
      }

      if (error !== undefined && error !== null) {
        next(error);
        return;
      }

      if (req.file === undefined) {
        next(new ValidationError('A file is required', [{ path: 'file', message: 'required' }]));
        return;
      }

      next();
    });
  };

  return namedHandler('imageUpload', handler);
}
