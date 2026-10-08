import type { FilterQuery, Types } from 'mongoose';
import { config } from '../config/env.js';
import { NotFoundError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { hashIp } from '../helpers/hash.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { NewsletterSubscriber } from '../models/index.js';
import { record, recordOrThrow } from './audit.service.js';
import { isBot, requireHuman, USER_AGENT_MAX } from './submission.service.js';
import type { RequestContext } from './submission.service.js';
import type { INewsletterSubscriber } from '../interfaces/newsletter-subscriber.interface.js';
import type {
  ListNewsletterSubscribersQuery,
  NewsletterSubscribeBody,
} from '../validators/newsletter.validator.js';

/**
 * The newsletter mailing list (ADR-067).
 *
 * Deliberately simple: submitting an address puts it on the list, and asking
 * to leave takes it off. Nothing is emailed. Both answers are the same for
 * every address, so neither endpoint says who is subscribed.
 *
 * Personal data throughout: nothing here logs an address, and the audit
 * entries record counts and ids, never who.
 */

export type LeanSubscriber = INewsletterSubscriber & { _id: Types.ObjectId };

export async function subscribe(
  body: NewsletterSubscribeBody,
  context: RequestContext
): Promise<void> {
  if (isBot(body.website)) {
    logger.info({ form: 'newsletter', outcome: 'honeypot' }, 'submission discarded');
    return;
  }

  await requireHuman(body.turnstileToken, context.ip);

  // An upsert, so subscribing twice is not an error. A repeat refreshes the
  // consent record, which then shows the wording agreed to most recently.
  await NewsletterSubscriber.updateOne(
    { email: body.email },
    {
      $set: {
        consent: { given: true, textVersion: body.consentTextVersion, at: new Date() },
        ipHash: hashIp(context.ip, config.IP_HASH_SALT),
        userAgent: context.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      },
      $setOnInsert: { email: body.email },
    },
    { upsert: true, runValidators: true }
  );

  logger.info({ form: 'newsletter', outcome: 'subscribed' }, 'submission received');
}

/** Deleting, not flagging: an address nobody may write to has no purpose here. */
export async function unsubscribe(email: string): Promise<void> {
  const result = await NewsletterSubscriber.deleteOne({ email });

  logger.info(
    { form: 'newsletter', outcome: result.deletedCount === 1 ? 'unsubscribed' : 'not_listed' },
    'unsubscribe requested'
  );
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ActorContext {
  readonly actorId: Types.ObjectId;
}

export async function listSubscribers(
  options: ListNewsletterSubscribersQuery,
  context: ActorContext
): Promise<{ items: LeanSubscriber[]; total: number }> {
  const filter: FilterQuery<INewsletterSubscriber> = {};
  if (options.q !== undefined) filter.email = new RegExp(escapeRegex(options.q), 'i');

  const [items, total] = await Promise.all([
    NewsletterSubscriber.find(filter)
      .select('email consent createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<LeanSubscriber[]>(),
    NewsletterSubscriber.countDocuments(filter),
  ]);

  // As with submissions: the rows are personal data, so reading them is
  // recorded. The search is recorded as used or not, never its text, which
  // is part of somebody's address.
  await record({
    action: 'newsletter.list',
    entity: 'newsletter',
    actor: context.actorId,
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      searched: options.q !== undefined,
      returned: items.length,
    },
  });

  return { items, total };
}

/**
 * The whole list, to send a newsletter to.
 *
 * The one read here that must be audited or not happen: it hands over every
 * address at once, outside anything this API can see afterwards.
 */
export async function exportSubscribers(context: ActorContext): Promise<LeanSubscriber[]> {
  const subscribers = await NewsletterSubscriber.find()
    .select('email createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean<LeanSubscriber[]>();

  await recordOrThrow({
    action: 'newsletter.export',
    entity: 'newsletter',
    actor: context.actorId,
    meta: { rows: subscribers.length },
  });

  return subscribers;
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
