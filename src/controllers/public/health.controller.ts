import type { Request, Response } from 'express';
import { checkHealth } from '../../services/health.service.js';
import { toHealth } from '../../serializers/health.serializer.js';

/**
 * Controllers stay thin: read validated input, call one service, serialize,
 * respond. Express 5 forwards a rejected promise to the error handler, so
 * there is no try/catch here.
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const status = await checkHealth();
  res.json({ data: toHealth(status) });
}
