import type { Request, Response } from 'express';
import { getPageSources } from '../../services/pages/page.service.js';
import { toPage } from '../../serializers/pages.serializer.js';
import { remember } from '../../services/cache.service.js';
import { TAGS } from '../../constants/cache-tags.js';
import { readParams } from '../../middlewares/validate.middleware.js';
import { pageKeyParams } from '../../validators/page.validator.js';
import type { Page } from '../../types/api.js';

export async function getPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, pageKeyParams);

  if (req.preview) {
    res.json({ data: toPage(key, await getPageSources(key, { preview: true })) });
    return;
  }

  // One expression for both, so the key and its tag cannot drift apart.
  const tag = TAGS.page(key);
  const data = await remember<Page>(tag, [tag], async () => toPage(key, await getPageSources(key)));

  res.json({ data });
}
