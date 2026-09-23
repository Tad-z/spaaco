import type { Request, Response } from 'express';
import { getPracticeAreaBySlug, listPracticeAreas } from '../../services/practice-area.service.js';
import { listOffices } from '../../services/office.service.js';
import { listFaqs } from '../../services/faq.service.js';
import { getJobById, listJobs } from '../../services/job.service.js';
import {
  toCard as practiceAreaCard,
  toDetail as practiceAreaDetail,
} from '../../serializers/practice-area.serializer.js';
import { toOffice } from '../../serializers/office.serializer.js';
import { toFaq } from '../../serializers/faq.serializer.js';
import { toJob } from '../../serializers/job.serializer.js';
import { toCard as insightCard } from '../../serializers/insight.serializer.js';
import { toSummary as personSummary } from '../../serializers/person.serializer.js';
import { readParams } from '../../middlewares/validate.middleware.js';
import { idParams, slugParams } from '../../validators/common.validator.js';

/**
 * The four straightforward collections: practice areas, offices, FAQs and jobs.
 *
 * They share a file because each handler is a few lines with no distinct
 * logic; four separate files would be boilerplate. People and insights have
 * their own controllers, because filtering, sorting and pagination give them
 * real behaviour worth keeping apart.
 */

export async function listPracticeAreasHandler(req: Request, res: Response): Promise<void> {
  const areas = await listPracticeAreas({ preview: req.preview });
  res.json({ data: areas.map(practiceAreaCard) });
}

export async function getPracticeAreaHandler(req: Request, res: Response): Promise<void> {
  const { slug } = readParams(req, slugParams);
  const { area, related } = await getPracticeAreaBySlug(slug, { preview: req.preview });

  res.json({
    data: practiceAreaDetail(area, area.contacts.map(personSummary), related.map(insightCard)),
  });
}

export async function listOfficesHandler(req: Request, res: Response): Promise<void> {
  const offices = await listOffices({ preview: req.preview });
  res.json({ data: offices.map(toOffice) });
}

export async function listFaqsHandler(req: Request, res: Response): Promise<void> {
  const faqs = await listFaqs({ preview: req.preview });
  res.json({ data: faqs.map(toFaq) });
}

export async function listJobsHandler(req: Request, res: Response): Promise<void> {
  const jobs = await listJobs({ preview: req.preview });
  res.json({ data: jobs.map(toJob) });
}

export async function getJobHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const job = await getJobById(id, { preview: req.preview });
  res.json({ data: toJob(job) });
}
