import { adminAuthRoutes } from '../../src/routes/admin/auth.routes.js';
import { adminUserRoutes } from '../../src/routes/admin/user.routes.js';
import { adminContentRoutes } from '../../src/routes/admin/content.routes.js';
import { adminSingletonRoutes } from '../../src/routes/admin/singleton.routes.js';
import { adminMediaRoutes } from '../../src/routes/admin/media.routes.js';
import { adminSubmissionRoutes } from '../../src/routes/admin/submission.routes.js';
import { healthRoutes } from '../../src/routes/public/health.routes.js';
import { siteRoutes } from '../../src/routes/public/site.routes.js';
import { contentRoutes } from '../../src/routes/public/content.routes.js';
import { personRoutes } from '../../src/routes/public/person.routes.js';
import { insightRoutes } from '../../src/routes/public/insight.routes.js';
import { pageRoutes } from '../../src/routes/public/page.routes.js';
import { searchRoutes } from '../../src/routes/public/search.routes.js';
import { submissionRoutes } from '../../src/routes/public/submission.routes.js';
import { fileRoutes } from '../../src/routes/public/file.routes.js';
import { API_PREFIX } from '../../src/routes/index.js';

/**
 * Reads the routes actually registered on the Express app.
 *
 * Derived rather than hand-listed: a hand-maintained list is only as complete
 * as whoever last remembered to update it, and the one bug this is guarding
 * against — a route reaching production without the guard the matrix promises —
 * is exactly the kind that slips past a list someone forgot to extend.
 */

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { name: string; handle: unknown }[];
  };
  handle?: { stack?: RouteLayer[] };
}

export interface RegisteredRoute {
  readonly method: string;
  /** Full path as mounted, e.g. `/api/v1/admin/content/:collection`. */
  readonly path: string;
  /** Names of the handler functions in the chain, in order. */
  readonly handlers: readonly string[];
}

function collect(layers: readonly RouteLayer[], prefix: string, into: RegisteredRoute[]): void {
  for (const layer of layers) {
    if (layer.route) {
      const handlers = layer.route.stack.map((entry) => entry.name);

      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled) into.push({ method, path: `${prefix}${layer.route.path}`, handlers });
      }
      continue;
    }

    const nested = layer.handle?.stack;
    if (nested) collect(nested, prefix, into);
  }
}

/** Every admin route the app serves. */
export function registeredAdminRoutes(): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  for (const router of [
    adminAuthRoutes,
    adminUserRoutes,
    adminContentRoutes,
    adminSingletonRoutes,
    adminMediaRoutes,
    adminSubmissionRoutes,
  ]) {
    collect((router as unknown as { stack: RouteLayer[] }).stack, `${API_PREFIX}/admin`, routes);
  }

  return routes;
}

/**
 * Every public route, for the canary sweep and the coverage check.
 *
 * The routers are listed rather than walked from `apiRoutes`, for the same
 * reason the admin ones are: walking the top-level stack loses each router's
 * mount path, so the admin routers came back as `/api/v1/content/:collection`
 * instead of `/api/v1/admin/content/:collection` — which then looked public
 * and was filtered by a prefix that no longer matched.
 */
export function registeredPublicRoutes(): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  for (const router of [
    healthRoutes,
    siteRoutes,
    contentRoutes,
    personRoutes,
    insightRoutes,
    pageRoutes,
    searchRoutes,
    submissionRoutes,
    fileRoutes,
  ]) {
    collect((router as unknown as { stack: RouteLayer[] }).stack, API_PREFIX, routes);
  }

  return routes;
}
