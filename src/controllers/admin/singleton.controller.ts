import type { Request, Response } from 'express';
import { ValidationError } from '../../core/errors.js';
import {
  getSingleton,
  legalPageConfig,
  pageConfig,
  patchSingleton,
  replaceSingleton,
  settingsConfig,
} from '../../services/singleton.service.js';
import type { SingletonDoc } from '../../services/singleton.service.js';
import { buildExpanded } from '../../services/expand.service.js';
import {
  collectPageExpandTargets,
  toAdminPage,
  toAdminSettings,
} from '../../serializers/admin-singleton.serializer.js';
import { toAdminLegalPage } from '../../serializers/legal-page.serializer.js';
import { readBody, readParams } from '../../middlewares/validate.middleware.js';
import { legalKeyParams } from '../../validators/legal-page.validator.js';
import { pageKeyParams } from '../../validators/page.validator.js';
import { patchBody, replaceBody } from '../../validators/singleton.validator.js';

/**
 * The admin singletons: one page document per key, and site settings.
 *
 * Thin, like every controller here — the merge, validation and locking all
 * live in `services/singleton.service.ts`.
 */

/**
 * The revision the editor read. `ifMatch` runs before every write route and
 * rejects a request without it, so reaching here without one is a wiring bug.
 */
const expectedRevision = (req: Request): number => {
  if (req.ifMatch === undefined) {
    throw new ValidationError('An If-Match header carrying the current revision is required', [
      { path: 'If-Match', message: 'required' },
    ]);
  }

  return req.ifMatch;
};

async function sendPage(res: Response, doc: SingletonDoc): Promise<void> {
  const { mediaIds, personIds } = collectPageExpandTargets(doc);
  const expanded = await buildExpanded(mediaIds, personIds);

  res.json({ data: toAdminPage(doc, expanded) });
}

export async function getAdminPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, pageKeyParams);

  await sendPage(res, await getSingleton(pageConfig(key)));
}

export async function replaceAdminPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, pageKeyParams);
  const body = readBody(req, replaceBody);

  const doc = await replaceSingleton(pageConfig(key), expectedRevision(req), body);

  await sendPage(res, doc);
}

export async function patchAdminPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, pageKeyParams);
  const body = readBody(req, patchBody);

  const doc = await patchSingleton(pageConfig(key), expectedRevision(req), body);

  await sendPage(res, doc);
}

export async function getAdminSettingsHandler(_req: Request, res: Response): Promise<void> {
  res.json({ data: toAdminSettings(await getSingleton(settingsConfig())) });
}

export async function replaceAdminSettingsHandler(req: Request, res: Response): Promise<void> {
  const body = readBody(req, replaceBody);

  const doc = await replaceSingleton(settingsConfig(), expectedRevision(req), body);

  res.json({ data: toAdminSettings(doc) });
}

export async function patchAdminSettingsHandler(req: Request, res: Response): Promise<void> {
  const body = readBody(req, patchBody);

  const doc = await patchSingleton(settingsConfig(), expectedRevision(req), body);

  res.json({ data: toAdminSettings(doc) });
}

export async function getAdminLegalPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, legalKeyParams);

  res.json({ data: toAdminLegalPage(await getSingleton(legalPageConfig(key))) });
}

export async function replaceAdminLegalPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, legalKeyParams);
  const body = readBody(req, replaceBody);

  const doc = await replaceSingleton(legalPageConfig(key), expectedRevision(req), body);

  res.json({ data: toAdminLegalPage(doc) });
}
