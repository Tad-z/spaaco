import type { FilterQuery, Types } from 'mongoose';
import { config } from '../config/env.js';
import { NEWSLETTER } from '../config/constants.js';
import { NotFoundError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { hashIp, randomToken, sha256 } from '../helpers/hash.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { NewsletterSubscriber } from '../models/index.js';
import { record, recordOrThrow } from './audit.service.js';
import { sendMail } from './notify.service.js';
import { firmName, isBot, requireHuman, USER_AGENT_MAX } from './submission.service.js';
import type { RequestContext } from './submission.service.js';
import {
  alreadySubscribedEmail,
  confirmationEmail,
  welcomeEmail,
} from '../templates/emails/newsletter.template.js';
import type { INewsletterSubscriber } from '../interfaces/newsletter-subscriber.interface.js';
import type {
  ListNewsletterSubscribersQuery,
  NewsletterSubscribeBody,
} from '../validators/newsletter.validator.js';

/**
 * The newsletter mailing list (ADR-065).
 *
 * Double opt-in. Subscribing stores a pending record and emails a link, and
 * only following it puts the address on the list. Without that, anybody could
 * sign up anybody else's address — and a law firm mailing people who never
 * asked is both an NDPA problem and a deliverability one.
 *
 * Personal data throughout: nothing here logs an address, and the audit
 * entries record counts and ids, never who.
 */

export type LeanSubscriber = INewsletterSubscriber & { _id: Types.ObjectId };

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);

const siteLink = (path: string, token: string): string =>
  `${config.PUBLIC_SITE_URL.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;

export const unsubscribeUrlFor = (token: string): string =>
  siteLink(NEWSLETTER.unsubscribePath, token);

const isDuplicateKey = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && (error as { code: unknown }).code === 11000;

/**
 * Ask an address to confirm.
 *
 * Every path ends in the same response, so the caller learns nothing about
 * whether the address was already known. The email differs, but only its
 * owner sees that.
 */
export async function subscribe(
  body: NewsletterSubscribeBody,
  context: RequestContext
): Promise<void> {
  if (isBot(body.website)) {
    logger.info({ form: 'newsletter', outcome: 'honeypot' }, 'submission discarded');
    return;
  }

  await requireHuman(body.turnstileToken, context.ip);

  const existing = await NewsletterSubscriber.findOne({ email: body.email })
    .select('status unsubscribeToken')
    .lean<Pick<LeanSubscriber, '_id' | 'status' | 'unsubscribeToken'> | null>();

  if (existing?.status === 'subscribed') {
    await sendMail({
      to: body.email,
      ...alreadySubscribedEmail(unsubscribeUrlFor(existing.unsubscribeToken), await firmName()),
    });
    logger.info({ form: 'newsletter', outcome: 'already_subscribed' }, 'submission received');
    return;
  }

  const confirmToken = randomToken();

  try {
    // New, pending again, or back after unsubscribing: each starts a fresh
    // confirmation with the consent given now. The status guard stops a
    // confirmation that landed since the read above from being undone.
    await NewsletterSubscriber.updateOne(
      { email: body.email, status: { $ne: 'subscribed' } },
      {
        $set: {
          status: 'pending',
          consent: { given: true, textVersion: body.consentTextVersion, at: new Date() },
          confirmTokenHash: sha256(confirmToken),
          unsubscribedAt: null,
          expiresAt: daysFromNow(NEWSLETTER.confirmWindowDays),
          ipHash: hashIp(context.ip, config.IP_HASH_SALT),
          userAgent: context.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
        },
        $setOnInsert: { email: body.email, unsubscribeToken: randomToken() },
      },
      { upsert: true, runValidators: true }
    );
  } catch (error: unknown) {
    // The address was confirmed between the read and the write, so the upsert
    // tried to insert a second record for it. It is on the list; done.
    if (!isDuplicateKey(error)) throw error;
    logger.info({ form: 'newsletter', outcome: 'already_subscribed' }, 'submission received');
    return;
  }

  await sendMail({
    to: body.email,
    ...confirmationEmail(siteLink(NEWSLETTER.confirmPath, confirmToken), await firmName()),
  });

  logger.info({ form: 'newsletter', outcome: 'confirmation_sent' }, 'submission received');
}

/**
 * Follow the emailed link.
 *
 * The token is single use: its hash is cleared as the address is confirmed,
 * in the same update, so a second click is a 404 rather than a second welcome.
 * The expiry is checked as well as relied on, because the TTL monitor runs
 * only once a minute.
 */
export async function confirm(token: string): Promise<void> {
  const now = new Date();

  const confirmed = await NewsletterSubscriber.findOneAndUpdate(
    { confirmTokenHash: sha256(token), status: 'pending', expiresAt: { $gt: now } },
    {
      $set: { status: 'subscribed', subscribedAt: now, confirmTokenHash: null, expiresAt: null },
    },
    { new: true }
  )
    .select('email unsubscribeToken')
    .lean<Pick<LeanSubscriber, '_id' | 'email' | 'unsubscribeToken'> | null>();

  if (!confirmed) throw new NotFoundError('Confirmation link');

  logger.info({ form: 'newsletter', outcome: 'confirmed' }, 'subscription confirmed');

  await sendMail({
    to: confirmed.email,
    ...welcomeEmail(unsubscribeUrlFor(confirmed.unsubscribeToken), await firmName()),
  });
}

/**
 * Take an address off the list.
 *
 * Succeeds for a token that matches nothing, too. The token is unguessable, so
 * one that matches nothing belonged to a record already erased or expired, and
 * either way the address is not on the list — which is what was asked for.
 */
export async function unsubscribe(token: string): Promise<void> {
  const now = new Date();

  const result = await NewsletterSubscriber.updateOne(
    { unsubscribeToken: token, status: { $ne: 'unsubscribed' } },
    {
      $set: {
        status: 'unsubscribed',
        unsubscribedAt: now,
        confirmTokenHash: null,
        expiresAt: daysFromNow(NEWSLETTER.unsubscribedRetentionDays),
      },
    }
  );

  logger.info(
    { form: 'newsletter', outcome: result.modifiedCount === 1 ? 'unsubscribed' : 'no_change' },
    'unsubscribe requested'
  );
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ADMIN_FIELDS = 'email status consent subscribedAt unsubscribedAt createdAt';

export interface ActorContext {
  readonly actorId: Types.ObjectId;
}

export async function listSubscribers(
  options: ListNewsletterSubscribersQuery,
  context: ActorContext
): Promise<{ items: LeanSubscriber[]; total: number }> {
  const filter: FilterQuery<INewsletterSubscriber> = {};
  if (options.status !== undefined) filter.status = options.status;
  if (options.q !== undefined) filter.email = new RegExp(escapeRegex(options.q), 'i');

  const [items, total] = await Promise.all([
    NewsletterSubscriber.find(filter)
      .select(ADMIN_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<LeanSubscriber[]>(),
    NewsletterSubscriber.countDocuments(filter),
  ]);

  // As with submissions: the rows are personal data, so reading them is
  // recorded. The filter is recorded as present or absent, never its text,
  // which is part of somebody's address.
  await record({
    action: 'newsletter.list',
    entity: 'newsletter',
    actor: context.actorId,
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      status: options.status ?? 'any',
      searched: options.q !== undefined,
      returned: items.length,
    },
  });

  return { items, total };
}

export interface ExportRow {
  readonly email: string;
  readonly subscribedAt: Date;
  readonly unsubscribeUrl: string;
}

/**
 * Everybody to send to, with the link each email must carry.
 *
 * The one read here that must be audited or not happen: it hands over the
 * whole list at once, outside anything this API can see afterwards.
 */
export async function exportSubscribers(context: ActorContext): Promise<ExportRow[]> {
  const subscribers = await NewsletterSubscriber.find({ status: 'subscribed' })
    .select('email subscribedAt unsubscribeToken')
    .sort({ subscribedAt: 1, _id: 1 })
    .lean<Pick<LeanSubscriber, '_id' | 'email' | 'subscribedAt' | 'unsubscribeToken'>[]>();

  await recordOrThrow({
    action: 'newsletter.export',
    entity: 'newsletter',
    actor: context.actorId,
    meta: { rows: subscribers.length },
  });

  return subscribers.map((subscriber) => ({
    email: subscriber.email,
    // `confirm` sets it on every subscribed record; the epoch is never expected.
    subscribedAt: subscriber.subscribedAt ?? new Date(0),
    unsubscribeUrl: unsubscribeUrlFor(subscriber.unsubscribeToken),
  }));
}

/** Erasure (NDPA): the record goes entirely, and the audit entry keeps only the id. */
export async function deleteSubscriber(id: string, context: ActorContext): Promise<void> {
  const deleted = await NewsletterSubscriber.findByIdAndDelete(id)
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();

  if (!deleted) throw new NotFoundError('Subscriber');

  await record({
    action: 'newsletter.delete',
    entity: 'newsletter',
    entityId: deleted._id,
    actor: context.actorId,
  });
}
