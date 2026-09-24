/**
 * Bundles the OpenAPI spec for `/docs`.
 *
 * The spec keeps its 77 response examples in `fixtures/responses/*.json` and
 * references them, which is what lets the contract tests and the spec share
 * one copy of every example. A browser cannot follow those references — it
 * would need the fixtures served too — so Redoc renders the literal
 * `{ "$ref": "../fixtures/responses/site.json" }` instead of the example.
 *
 * Bundling inlines them. The source spec keeps its references; only the served
 * artefact is flattened.
 *
 * Output goes next to the caller's `openapi/` directory so one relative path
 * works in both layouts: `openapi/` in the repository for `npm run dev`, and
 * `dist/openapi/` in a build.
 *
 * If bundling fails — most likely because dev dependencies were pruned before
 * the build — this copies the spec unbundled rather than failing. Docs with
 * unrendered examples are a poor page; a deploy that will not start is an
 * outage, and the two are not worth trading.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const OUT_DIR = process.argv[2] ?? 'openapi';
const OUT = `${OUT_DIR}/openapi.bundled.yaml`;

await mkdir(OUT_DIR, { recursive: true });

try {
  // The CLI's entry point, run with this Node rather than through `npx`: the
  // shim is a `.cmd` on Windows, which Node 24 refuses to spawn without a
  // shell, and a shell would concatenate the arguments unescaped.
  const cli = createRequire(import.meta.url).resolve('@redocly/cli/bin/cli.js');

  execFileSync(process.execPath, [cli, 'bundle', 'openapi/openapi.yaml', '-o', OUT], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  console.log(`bundled openapi/openapi.yaml to ${OUT}`);
} catch {
  await copyFile('openapi/openapi.yaml', OUT);
  console.warn(`WARNING: could not bundle the spec; copied it unbundled to ${OUT}.`);
  console.warn('The /docs examples will show as $ref. Is @redocly/cli installed?');
}
