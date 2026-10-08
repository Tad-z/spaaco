import type { Request, Response } from 'express';
import { subscribe, unsubscribe } from '../../services/newsletter.service.js';
import { readBody } from '../../middlewares/validate.middleware.js';
import {
  newsletterSubscribeBody,
  newsletterUnsubscribeBody,
} from '../../validators/newsletter.validator.js';
import type { NewsletterResult } from '../../types/api.js';

/**
 * The footer's newsletter form and its unsubscribe form (ADR-067).
 *
 * Fixed answers, so neither response reveals whether an address was already
 * on the list.
 */

export async function subscribeHandler(req: Request, res: Response): Promise<void> {
  await subscribe(readBody(req, newsletterSubscribeBody), {
    // Resolved through `trust proxy`; hashed by the service, never stored raw.
    ip: req.ip ?? '0.0.0.0',
    userAgent: req.get('user-agent'),
  });

  const data: NewsletterResult = { status: 'subscribed' };
  res.status(201).json({ data });
}

export async function unsubscribeHandler(req: Request, res: Response): Promise<void> {
  await unsubscribe(readBody(req, newsletterUnsubscribeBody).email);

  const data: NewsletterResult = { status: 'unsubscribed' };
  res.json({ data });
}
