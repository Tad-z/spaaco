import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { createTestUser } from '../../support/auth.js';
import { USER_ROLES } from '../../../src/constants/enums.js';
import type { UserRole } from '../../../src/types/api.js';

/**
 * The single home for role enforcement (ADR-029).
 *
 * Every admin route is listed once here and exercised against every role, plus
 * the unauthenticated case. A resource's own test file never repeats 401/403,
 * so this table is the only thing standing between a mis-wired router and a
 * business_dev user editing content — which makes its completeness the thing
 * to guard. The last test in the file checks that every registered admin route
 * appears in the table.
 */

setupTestDb();

const app = buildTestApp();

type Method = 'get' | 'post' | 'patch' | 'delete' | 'put';

interface RouteCase {
  readonly method: Method;
  readonly path: string;
  /** Roles permitted, per the matrix in docs/API.md. `admin` always passes. */
  readonly allowed: readonly UserRole[];
  readonly body?: Record<string, unknown>;
}

const ROUTES: readonly RouteCase[] = [
  { method: 'get', path: '/api/v1/admin/users', allowed: [] },
  {
    method: 'post',
    path: '/api/v1/admin/users',
    allowed: [],
    body: {
      name: 'New Person',
      email: 'new-person@spaajibade.test',
      password: 'a-long-enough-passphrase',
      roles: ['editor'],
    },
  },
  {
    method: 'patch',
    path: '/api/v1/admin/users/665f1a2b3c4d5e6f70819293',
    allowed: [],
    body: { name: 'Renamed' },
  },
  { method: 'get', path: '/api/v1/admin/audit-logs', allowed: [] },
];

const send = (route: RouteCase, token?: string): request.Test => {
  const test = request(app)[route.method](route.path);
  if (token !== undefined) test.set('Authorization', `Bearer ${token}`);
  return route.body === undefined ? test : test.send(route.body);
};

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

describe('every admin route requires authentication', () => {
  it.each(ROUTES.map((route) => ({ name: `${route.method.toUpperCase()} ${route.path}`, route })))(
    '$name returns 401 without a token',
    async ({ route }) => {
      const res = await send(route);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  );
});

describe('role matrix', () => {
  const cases = ROUTES.flatMap((route) =>
    USER_ROLES.values.map((role) => ({
      name: `${route.method.toUpperCase()} ${route.path} as ${role}`,
      route,
      role,
      permitted: role === 'admin' || route.allowed.includes(role),
    }))
  );

  it.each(cases)('$name', async ({ route, role, permitted }) => {
    const { token } = await createTestUser({ roles: [role] });

    const res = await send(route, token);

    if (permitted) {
      expect(res.status).not.toBe(403);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('the table itself', () => {
  it('covers every registered admin route', async () => {
    const { adminAuthRoutes } = await import('../../../src/routes/admin/auth.routes.js');
    const { adminUserRoutes } = await import('../../../src/routes/admin/user.routes.js');

    interface Layer {
      route?: { path: string; methods: Record<string, boolean> };
    }

    const registered = [adminAuthRoutes, adminUserRoutes].flatMap((router) =>
      (router.stack as Layer[])
        .filter((layer) => layer.route !== undefined)
        .flatMap((layer) =>
          Object.keys(layer.route?.methods ?? {}).map(
            (method) => `${method} /api/v1/admin${layer.route?.path ?? ''}`
          )
        )
    );

    // The auth routes are covered by auth.test.ts, which exercises their
    // specific 401/403 behaviour; they need no role, only a session.
    const authRoutes = registered.filter((route) => route.includes('/auth/'));
    const roleGoverned = registered.filter((route) => !route.includes('/auth/'));

    const tabled = ROUTES.map(
      (route) => `${route.method} ${route.path.replace(/665f[0-9a-f]+/, ':id')}`
    );

    expect(authRoutes.length).toBeGreaterThan(0);
    for (const route of roleGoverned) {
      expect(tabled).toContain(route.replace(':id', ':id'));
    }
  });
});
