import type { Request, Response } from 'express';
import { submitEnquiry, submitMessage } from '../../services/submission.service.js';
import type { RequestContext } from '../../services/submission.service.js';
import { readBody } from '../../middlewares/validate.middleware.js';
import { enquiryBody, messageBody } from '../../validators/submission.validator.js';

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
