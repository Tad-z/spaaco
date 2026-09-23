import type { Request, Response } from 'express';
import { search } from '../../services/search.service.js';
import { toSearchResults } from '../../serializers/search.serializer.js';
import { readQuery } from '../../middlewares/validate.middleware.js';
import { searchQuery } from '../../validators/common.validator.js';

export async function searchHandler(req: Request, res: Response): Promise<void> {
  const { q } = readQuery(req, searchQuery);
  const sources = await search(q);

  res.json({ data: toSearchResults(sources) });
}
