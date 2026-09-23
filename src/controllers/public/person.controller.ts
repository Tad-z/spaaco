import type { Request, Response } from 'express';
import { getPersonBySlug, listPeople } from '../../services/person.service.js';
import { toDetail, toSummary } from '../../serializers/person.serializer.js';
import { toCard as insightCard } from '../../serializers/insight.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { listPeopleQuery, personSlugParams } from '../../validators/person.validator.js';

export async function listPeopleHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listPeopleQuery);
  const { items, total } = await listPeople({ ...query, preview: req.preview });

  res.json({ data: items.map(toSummary), meta: toMeta(query.page, query.pageSize, total) });
}

export async function getPersonHandler(req: Request, res: Response): Promise<void> {
  const { slug } = readParams(req, personSlugParams);
  const { person, insights } = await getPersonBySlug(slug, { preview: req.preview });

  res.json({ data: toDetail(person, insights.map(insightCard)) });
}
