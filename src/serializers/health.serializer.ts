import { APP_VERSION } from '../config/constants.js';
import type { Health } from '../types/api.js';
import type { IHealthStatus } from '../interfaces/health.interface.js';

/** Shape the liveness facts into the payload the spec defines. */
export const toHealth = (status: IHealthStatus): Health => ({
  status: 'ok',
  db: status.dbConnected ? 'up' : 'down',
  version: APP_VERSION,
});
