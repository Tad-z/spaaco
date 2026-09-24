import type { Request, Response } from 'express';
import {
  submitApplication,
  submitEnquiry,
  submitMessage,
} from '../../services/submission.service.js';
import type { RequestContext } from '../../services/submission.service.js';
import { readBody, readParams } from '../../middlewares/validate.middleware.js';
import { idParams } from '../../validators/common.validator.js';
import { ValidationError } from '../../core/errors.js';
import {
  applicationBody,
  enquiryBody,
  messageBody,
} from '../../validators/submission.validator.js';

/**
 * The public forms.
 *
 * Both return the same thing — a reference — because nothing a submitter typed
 * is echoed back. A form filled in on a shared or overlooked screen should
 * leave nothing on it.
 */

const contextOf = (req: Request): RequestContext => ({
  // Express resolves this through `trust proxy`, so it is the client address
  // rather than the load balancer's. Hashed by the service, never stored raw.
  ip: req.ip ?? '0.0.0.0',
  userAgent: req.get('user-agent'),
});

export async function createEnquiryHandler(req: Request, res: Response): Promise<void> {
  const result = await submitEnquiry(readBody(req, enquiryBody), contextOf(req));

  res.status(201).json({ data: result });
}

export async function createMessageHandler(req: Request, res: Response): Promise<void> {
  const result = await submitMessage(readBody(req, messageBody), contextOf(req));

  res.status(201).json({ data: result });
}

export async function createApplicationHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const body = readBody(req, applicationBody);

  // `cvUpload` refuses a request without a file, so this is a wiring check.
  if (req.file === undefined) {
    throw new ValidationError('A CV is required', [{ path: 'cv', message: 'required' }]);
  }

  const result = await submitApplication(
    id,
    body,
    { buffer: req.file.buffer, originalName: req.file.originalname },
    contextOf(req)
  );

  res.status(201).json({ data: result });
}
