import { utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '../../support/setup-db.js';
import { Application } from '../../../src/models/index.js';
import { privateStorage } from '../../../src/integrations/storage/private/index.js';
import { sweepOrphanedCvs } from '../../../src/jobs/retention.job.js';
import { config } from '../../../src/config/env.js';

/**
 * The orphan sweep.
 *
 * MongoDB's TTL index expires the application record and knows nothing about
 * the file beside it, so without this the firm would keep the CV of every
 * applicant whose data they have already promised to delete — a retention
 * policy true of the database and false of the bucket.
 */

setupTestDb();

const consent = { given: true as const, textVersion: '2026-01', at: new Date() };

/** Writes a CV file and backdates it past the sweep's grace period. */
async function storeAgedCv(name: string, ageMs = 2 * 60 * 60 * 1000): Promise<string> {
  const key = await privateStorage().put({
    buffer: Buffer.from(`%PDF-1.7 ${name}`),
    mimeType: 'application/pdf',
    extension: 'pdf',
  });

  const when = new Date(Date.now() - ageMs);
  await utimes(join(config.PRIVATE_UPLOAD_DIR, key), when, when);

  return key;
}

const applicationFor = async (storageKey: string, reference: string): Promise<void> => {
  await Application.create({
    reference,
    fullName: 'Temitope Bakare',
    email: 'temitope.bakare@example.com',
    cv: {
      storageKey,
      originalName: 'cv.pdf',
      mimeType: 'application/pdf',
      bytes: 1024,
      scanStatus: 'clean',
    },
    consent,
    ipHash: 'c'.repeat(64),
  });
};

const storedKeys = async (): Promise<string[]> =>
  (await privateStorage().list()).map((object) => object.key);

beforeEach(async () => {
  for (const object of await privateStorage().list()) {
    await privateStorage().remove(object.key);
  }
});

describe('sweeping orphaned CVs', () => {
  it('deletes a file whose application has expired', async () => {
    const orphan = await storeAgedCv('orphan');

    // No application refers to it: exactly the state a TTL deletion leaves.
    const result = await sweepOrphanedCvs();

    expect(result.deleted).toBe(1);
    expect(await storedKeys()).not.toContain(orphan);
  });

  it('leaves a file whose application is still there', async () => {
    const live = await storeAgedCv('live');
    await applicationFor(live, 'APP-LIVE11');

    const result = await sweepOrphanedCvs();

    expect(result.deleted).toBe(0);
    expect(await storedKeys()).toContain(live);
  });

  it('spares a file too new to judge, which may be an upload in flight', async () => {
    // A CV is stored before its record is written, so for a moment every
    // upload looks exactly like an orphan. Deleting one would lose a CV that
    // the applicant believes they have sent.
    const inFlight = await storeAgedCv('in-flight', 1000);

    const result = await sweepOrphanedCvs();

    expect(result.deleted).toBe(0);
    expect(await storedKeys()).toContain(inFlight);
  });

  it('sweeps only the orphans when both kinds are present', async () => {
    const live = await storeAgedCv('live');
    await applicationFor(live, 'APP-LIVE22');
    const orphanA = await storeAgedCv('orphan-a');
    const orphanB = await storeAgedCv('orphan-b');

    const result = await sweepOrphanedCvs();

    expect(result).toEqual({ checked: 3, deleted: 2 });

    const remaining = await storedKeys();
    expect(remaining).toEqual([live]);
    expect(remaining).not.toContain(orphanA);
    expect(remaining).not.toContain(orphanB);
  });

  it('does nothing, and does not fail, when there is nothing stored', async () => {
    await expect(sweepOrphanedCvs()).resolves.toEqual({ checked: 0, deleted: 0 });
  });

  it('does not touch a file written by a driver that is not ours', async () => {
    // A stray file in the directory is still an orphan by definition, but it
    // must be aged like any other rather than deleted on sight.
    const stray = join(config.PRIVATE_UPLOAD_DIR, 'notes.txt');
    await writeFile(stray, 'a stray file');

    const result = await sweepOrphanedCvs();

    expect(result.deleted).toBe(0);
  });
});
