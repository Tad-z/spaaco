import type { Request, Response } from 'express';
import { getSite } from '../../services/site.service.js';
import { toSite } from '../../serializers/site.serializer.js';
import { remember } from '../../services/cache.service.js';
import { TAGS } from '../../constants/cache-tags.js';
import type { Site } from '../../types/api.js';

export async function getSiteShell(req: Request, res: Response): Promise<void> {
  // Preview bypasses the cache entirely: a draft must never be served to the
  // next visitor from a shared entry.
  if (req.preview) {
    res.json({ data: toSite(await getSite({ preview: true })) });
    return;
  }

  const data = await remember<Site>('site', [TAGS.site], async () =>
    toSite(await getSite())
  );

  res.json({ data });
}
