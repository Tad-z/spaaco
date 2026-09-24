import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import helmet from 'helmet';

/**
 * The contract, served as documentation at `/docs`.
 *
 * This is the one HTML this API returns, and it is a deliberate exception to
 * the API-only rule (ADR-044): the frontend team needs a link that is always
 * current, and a built file somebody re-uploads after each spec change is a
 * link that is quietly wrong most of the time.
 *
 * The page is a shell. It renders nothing itself — Redoc fetches the YAML from
 * `/docs/openapi.yaml` and draws it — so there is no second copy of the
 * contract to drift, and `npm run spec:lint` still guards the only source.
 *
 * `../../openapi/openapi.yaml` resolves in both layouts by design:
 * `src/routes/` reaches the repository's copy, and `dist/src/routes/` reaches
 * the one `npm run build` places at `dist/openapi/`. The build must copy it,
 * because the spec is not TypeScript and `tsc` will not carry it.
 */

const SPEC_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'openapi',
  'openapi.yaml'
);

/**
 * Redoc loads from a CDN and builds its search index in a blob worker, neither
 * of which the default policy allows. Scoped to this router so the API's own
 * responses keep the strict policy — a relaxation applied globally to suit one
 * page is how a strict policy stops meaning anything.
 */
const docsCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://cdn.redoc.ly'],
    workerSrc: ["'self'", 'blob:'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
  },
});

/**
 * No inline script: Redoc's standalone bundle initialises any `<redoc>`
 * element it finds, which keeps `'unsafe-inline'` out of the policy above.
 */
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>SPA Ajibade &amp; Co. API</title>
    <style>
      body { margin: 0; }
    </style>
  </head>
  <body>
    <redoc spec-url="/docs/openapi.yaml"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>
`;

export const docsRoutes: Router = Router();

docsRoutes.get('/docs/openapi.yaml', (_req, res) => {
  res.type('application/yaml').sendFile(SPEC_PATH);
});

docsRoutes.get('/docs', docsCsp, (_req, res) => {
  res.type('html').send(PAGE);
});
