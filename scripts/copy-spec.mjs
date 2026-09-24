/**
 * Copies the OpenAPI spec into the build.
 *
 * `/docs` serves the YAML at runtime, and `tsc` only emits TypeScript, so
 * without this the docs page would load in production and then fail to fetch
 * its own contract. Kept as a build step rather than a Dockerfile COPY so the
 * non-container deployments get it too.
 */
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/openapi', { recursive: true });
await copyFile('openapi/openapi.yaml', 'dist/openapi/openapi.yaml');

console.log('copied openapi/openapi.yaml to dist/openapi/');
