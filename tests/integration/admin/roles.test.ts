import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { createTestUser } from '../../support/auth.js';
import { registeredAdminRoutes } from '../../support/routes.js';
import { USER_ROLES } from '../../../src/constants/enums.js';
import type { UserRole } from '../../../src/types/api.js';

/**
 * The single home for role enforcement (ADR-029), and the route inventory that
 * keeps it honest (ADR-034).
 *
 * The list of admin routes is *derived from the Express router stack*, not
 * hand-maintained. A hand-written list is only as complete as whoever last
 * remembered to extend it — and the bug this exists to catch is precisely a
 * route reaching production without the guard the matrix promises. With the
 * list derived, adding an unguarded route fails here automatically.
 */

setupTestDb();

const app = buildTestApp();

type Method = 'get' | 'post' | 'patch' | 'delete' | 'put';

/** Roles permitted per route pattern, from the matrix in docs/API.md. */
const MATRIX: Record<string, readonly UserRole[]> = {
  '/api/v1/admin/users': [],
  '/api/v1/admin/users/:id': [],
  '/api/v1/admin/audit-logs': [],

  '/api/v1/admin/content/:collection': ['editor', 'hr'],
  '/api/v1/admin/content/:collection/:id': ['editor', 'hr'],
  '/api/v1/admin/content/:collection/reorder': ['editor', 'hr'],
  '/api/v1/admin/content/:collection/:id/publish': ['editor', 'hr'],
  '/api/v1/admin/content/:collection/:id/unpublish': ['editor', 'hr'],

  // Pages and settings are the site's own structure: editor and above, and no
  // HR, whose grant is the jobs collection rather than the pages it appears on.
  '/api/v1/admin/pages/:key': ['editor'],
  '/api/v1/admin/settings': ['editor'],
};

/** Auth routes are about having a session, not a role; auth.test.ts covers them. */
const isAuthRoute = (path: string): boolean => path.includes('/auth/');

/**
 * Authentication and authorisation are asserted separately on purpose.
 * Accepting `requireAuth` as evidence of a role guard would let a route that
 * merely needs a session pass as one that checks what that session may do —
 * dropping `requireRole('admin')` from `GET /admin/users` went unnoticed until
 * these were split.
 */
const AUTH_GUARD = 'requireAuth';
const ROLE_GUARDS = ['requireRole', 'requireContentAccess'];

const adminRoutes = registeredAdminRoutes();
const roleGoverned = adminRoutes.filter((route) => !isAuthRoute(route.path));

/** Concrete values so a derived route can actually be called. */
const CONCRETE: Record<string, string> = {
  ':collection': 'jobs',
  ':key': 'home',
  ':id': '665f1a2b3c4d5e6f70819293',
};

const concretePath = (path: string): string =>
  path
    .split('/')
    .map((segment) => CONCRETE[segment] ?? segment)
    .join('/');

/** A body good enough to get past validation and reach the guard. */
const BODIES: Record<string, Record<string, unknown>> = {
  'post /api/v1/admin/users': {
    name: 'Role Check',
    email: 'role-check@spaajibade.test',
    password: 'a-long-enough-passphrase',
    roles: ['editor'],
  },
  'patch /api/v1/admin/users/:id': { name: 'Renamed' },
  'post /api/v1/admin/content/:collection': {
    title: 'Role check',
    description: '<p>A role.</p>',
    employmentType: 'full_time',
    workMode: 'hybrid',
  },
  'patch /api/v1/admin/content/:collection/reorder': {
    ids: ['665f1a2b3c4d5e6f70819293'],
  },
  'patch /api/v1/admin/content/:collection/:id': { title: 'Renamed' },
};

const send = (route: { method: string; path: string }, token?: string): request.Test => {
  const test = request(app)[route.method as Method](concretePath(route.path));
  if (token !== undefined) test.set('Authorization', `Bearer ${token}`);

  const body = BODIES[`${route.method} ${route.path}`];
  return body === undefined ? test : test.send(body);
};

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

describe('the route inventory', () => {
  it('finds the admin routes on the router stack', () => {
    // If this ever reads zero, every assertion below is vacuous.
    expect(adminRoutes.length).toBeGreaterThan(10);
    expect(roleGoverned.length).toBeGreaterThan(0);
  });

  it.each(
    roleGoverned.map((route) => ({ name: `${route.method.toUpperCase()} ${route.path}`, route }))
  )('$name has an explicit role guard', ({ route }) => {
    const roleGuards = route.handlers.filter((handler) => ROLE_GUARDS.includes(handler));
    const where = `${route.method.toUpperCase()} ${route.path} has handlers [${route.handlers.join(', ')}]`;

    expect(
      roleGuards,
      `${where} and no role guard among them. Every admin route must state its own access.`
    ).not.toEqual([]);
    expect(route.handlers, `${where} and is unauthenticated.`).toContain(AUTH_GUARD);
  });

  it.each(
    roleGoverned.map((route) => ({ name: `${route.method.toUpperCase()} ${route.path}`, route }))
  )('$name appears in the role matrix', ({ route }) => {
    expect(
      Object.keys(MATRIX),
      `${route.path} is not in the matrix. Add it, with the roles docs/API.md grants.`
    ).toContain(route.path);
  });

  it('has no matrix entry for a route that no longer exists', () => {
    const live = new Set(roleGoverned.map((route) => route.path));
    const stale = Object.keys(MATRIX).filter((path) => !live.has(path));

    expect(stale).toEqual([]);
  });

  it('guards every auth route that is not a sign-in step', () => {
    const needsSession = adminRoutes.filter(
      (route) =>
        isAuthRoute(route.path) &&
        !['/auth/login', '/auth/refresh', '/auth/logout'].some((open) => route.path.endsWith(open))
    );

    expect(needsSession.length).toBeGreaterThan(0);
    for (const route of needsSession) {
      expect(route.handlers, `${route.path} is unauthenticated`).toContain(AUTH_GUARD);
    }
  });
});

describe('every admin route requires authentication', () => {
  it.each(
    roleGoverned.map((route) => ({ name: `${route.method.toUpperCase()} ${route.path}`, route }))
  )('$name returns 401 without a token', async ({ route }) => {
    const res = await send(route);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('role matrix', () => {
  const cases = roleGoverned.flatMap((route) =>
    USER_ROLES.values.map((role) => ({
      name: `${route.method.toUpperCase()} ${route.path} as ${role}`,
      route,
      role,
      // `admin` passes everything; `hr` reaches content only for jobs, which is
      // the collection the concrete path uses.
      permitted: role === 'admin' || (MATRIX[route.path] ?? []).includes(role),
    }))
  );

  it.each(cases)('$name', async ({ route, role, permitted }) => {
    const { token } = await createTestUser({ roles: [role] });

    const res = await send(route, token);

    if (permitted) {
      expect(res.status, JSON.stringify(res.body)).not.toBe(403);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('collection-level access', () => {
  it('stops HR reaching a collection other than jobs', async () => {
    const hr = await createTestUser({ roles: ['hr'] });

    const res = await request(app)
      .get('/api/v1/admin/content/insights')
      .set('Authorization', `Bearer ${hr.token}`);

    expect(res.status).toBe(403);
  });

  it('lets an editor reach every collection', async () => {
    const editor = await createTestUser({ roles: ['editor'] });

    for (const collection of ['practice-areas', 'people', 'insights', 'faqs']) {
      const res = await request(app)
        .get(`/api/v1/admin/content/${collection}`)
        .set('Authorization', `Bearer ${editor.token}`);

      expect(res.status, collection).toBe(200);
    }
  });
});
