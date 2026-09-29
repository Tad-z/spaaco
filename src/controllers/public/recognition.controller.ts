import type { Request, Response } from 'express';
import { getDirectoryPage, getRecognitionsOverview } from '../../services/recognition.service.js';
import { toDirectoryPage, toOverview } from '../../serializers/recognition.serializer.js';
import { readParams } from '../../middlewares/validate.middleware.js';
import { slugParams } from '../../validators/common.validator.js';

export async function listRecognitionsHandler(req: Request, res: Response): Promise<void> {
  const { directories, achievements } = await getRecognitionsOverview({ preview: req.preview });
  res.json({ data: toOverview(directories, achievements) });
}

export async function getRecognitionDirectoryHandler(req: Request, res: Response): Promise<void> {
  const { slug } = readParams(req, slugParams);
  const { directory, awards, labels } = await getDirectoryPage(slug, { preview: req.preview });

  res.json({ data: toDirectoryPage(directory, awards, labels) });
}
