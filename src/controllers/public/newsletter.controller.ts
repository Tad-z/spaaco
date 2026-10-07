import type { Request, Response } from 'express';
import { confirm, subscribe, unsubscribe } from '../../services/newsletter.service.js';
import { readBody } from '../../middlewares/validate.middleware.js';
import {
  newsletterSubscribeBody,
  newsletterTokenBody,
} from '../../validators/newsletter.validator.js';
import type { NewsletterSubscribeReceipt, NewsletterTokenResult } from '../../types/api.js';

/**
 * The footer's newsletter form and the two pages its emails link to (ADR-065).
 *
 * Fixed answers: subscribe says the same thing for every address, so the
 * response cannot reveal who is already on the list.
 */

export async function subscribeHandler(req: Request, res: Response): Promise<void> {
  await subscribe(readBody(req, newsletterSubscribeBody), {
    // Resolved through `trust proxy`; hashed by the service, never stored raw.
    ip: req.ip ?? '0.0.0.0',
    userAgent: req.get('user-agent'),
  });

  const data: NewsletterSubscribeReceipt = { status: 'confirmation_sent' };
  res.status(202).json({ data });
}

export async function confirmHandler(req: Request, res: Response): Promise<void> {
  await confirm(readBody(req, newsletterTokenBody).token);

  const data: NewsletterTokenResult = { status: 'subscribed' };
  res.json({ data });
}

export async function unsubscribeHandler(req: Request, res: Response): Promise<void> {
  await unsubscribe(readBody(req, newsletterTokenBody).token);

  const data: NewsletterTokenResult = { status: 'unsubscribed' };
  res.json({ data });
}
