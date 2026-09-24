import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { MulterError } from 'multer';
import { UPLOAD_LIMITS } from '../config/constants.js';
import { PayloadTooLargeError, ValidationError } from '../core/errors.js';
import { namedHandler } from '../helpers/named-handler.helper.js';

/**
 * One CV, in memory.
 *
 * Memory storage matters more here than for images: the file must be scanned
 * for malware *before* it touches any disk, and a temp file would mean writing
 * an unscanned upload somewhere first.
 *
 * No `fileFilter`: the declared type is the applicant's claim, and the service
 * checks the bytes.
 */
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.cvMaxBytes, files: 1 },
}).single('cv');

export function cvUpload(): RequestHandler {
  const handler: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    single(req, res, (error: unknown) => {
      if (error instanceof MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(
            new PayloadTooLargeError(
              `The CV must be ${String(Math.round(UPLOAD_LIMITS.cvMaxBytes / (1024 * 1024)))} MB or smaller.`
            )
          );
          return;
        }

        next(
          new ValidationError(error.message, [{ path: error.field ?? 'cv', message: error.code }])
        );
        return;
      }

      if (error !== undefined && error !== null) {
        next(error);
        return;
      }

      if (req.file === undefined) {
        next(new ValidationError('A CV is required', [{ path: 'cv', message: 'required' }]));
        return;
      }

      next();
    });
  };

  return namedHandler('cvUpload', handler);
}
