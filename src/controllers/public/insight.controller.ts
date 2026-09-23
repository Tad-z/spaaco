import type { Request, Response } from 'express';
import { getInsightBySlug, listInsights } from '../../services/insight.service.js';
import { toCard, toDetail } from '../../serializers/insight.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { insightSlugParams, listInsightsQuery } from '../../validators/insight.validator.js';

export async function listInsightsHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listInsightsQuery);
  const { items, total } = await listInsights({ ...query, preview: req.preview });

  res.json({ data: items.map(toCard), meta: toMeta(query.page, query.pageSize, total) });
}

export async function getInsightHandler(req: Request, res: Response): Promise<void> {
  const { slug } = readParams(req, insightSlugParams);
  const { insight, related } = await getInsightBySlug(slug, { preview: req.preview });

  res.json({ data: toDetail(insight, related.map(toCard)) });
}
