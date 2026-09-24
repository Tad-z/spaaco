import { Application } from '../models/index.js';
import { privateStorage } from '../integrations/storage/private/index.js';
import { logger } from '../core/logger.js';

/**
 * Deleting CV files whose application has gone.
 *
 * MongoDB's TTL index expires the *record*, and it has no idea a file exists
 * alongside it. Without this sweep, a firm would accumulate the CVs of every
 * applicant whose data they have already promised to delete — the retention
 * policy would be true of the database and false of the storage bucket, which
 * is worse than having no policy, because it is documented as working.
 */

/**
 * How long a file is left alone before it counts as an orphan.
 *
 * A CV is written to storage *before* its record is created, so for a moment
 * every upload in flight looks exactly like an orphan. An hour is far longer
 * than that window and far shorter than any retention period.
 */
const GRACE_MS = 60 * 60 * 1000;

export interface SweepResult {
  readonly checked: number;
  readonly deleted: number;
}

/**
 * Remove stored CVs that no application refers to.
 *
 * Deliberately driven from storage rather than from the database: the records
 * that would tell us what to delete are precisely the ones that no longer
 * exist. The referenced set is read once, so the cost is one query plus one
 * listing however many files there are.
 */
export async function sweepOrphanedCvs(now: Date = new Date()): Promise<SweepResult> {
  const storage = privateStorage();

  const [stored, live] = await Promise.all([
    storage.list(),
    Application.find({}).select('cv.storageKey').lean<{ cv: { storageKey: string } }[]>(),
  ]);

  const referenced = new Set(live.map((application) => application.cv.storageKey));
  const cutoff = now.getTime() - GRACE_MS;

  let deleted = 0;

  for (const object of stored) {
    if (referenced.has(object.key)) continue;
    // Too new to judge: its record may be moments from being written.
    if (object.lastModified.getTime() > cutoff) continue;

    await storage.remove(object.key);
    deleted += 1;
  }

  if (deleted > 0) {
    // The count only. A key identifies one applicant's file.
    logger.info({ checked: stored.length, deleted }, 'swept orphaned CV files');
  }

  return { checked: stored.length, deleted };
}

/**
 * Run the sweep daily.
 *
 * `unref` so the timer never holds the process open: a container asked to stop
 * should stop, not wait up to a day for a housekeeping tick.
 */
export function startRetentionSweep(intervalMs = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  // Once shortly after boot as well as daily. A container that restarts more
  // often than the interval — routine — would otherwise never sweep at all,
  // and orphaned CVs would accumulate for ever. Delayed so it does not compete
  // with the first requests after a deploy.
  setTimeout(() => {
    void sweepOrphanedCvs().catch((error: unknown) => {
      logger.error({ err: error }, 'the CV retention sweep failed');
    });
  }, 60_000).unref();

  const timer = setInterval(() => {
    void sweepOrphanedCvs().catch((error: unknown) => {
      logger.error({ err: error }, 'the CV retention sweep failed');
    });
  }, intervalMs);

  timer.unref();

  return timer;
}
