import type { Request, Response } from 'express';
import { getLegalPage } from '../../services/legal-page.service.js';
import { toLegalPage } from '../../serializers/legal-page.serializer.js';
import { readParams } from '../../middlewares/validate.middleware.js';
import { legalKeyParams } from '../../validators/legal-page.validator.js';

export async function getLegalPageHandler(req: Request, res: Response): Promise<void> {
  const { key } = readParams(req, legalKeyParams);
  res.json({ data: toLegalPage(await getLegalPage(key, { preview: req.preview })) });
}
