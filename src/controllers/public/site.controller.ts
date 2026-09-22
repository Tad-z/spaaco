import type { Request, Response } from 'express';
import { getSite } from '../../services/site.service.js';
import { toSite } from '../../serializers/site.serializer.js';

export async function getSiteShell(req: Request, res: Response): Promise<void> {
  const sources = await getSite({ preview: req.preview });
  res.json({ data: toSite(sources) });
}
