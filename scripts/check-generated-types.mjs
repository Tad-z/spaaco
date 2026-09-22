#!/usr/bin/env node
/**
 * Fails when src/types/api.generated.ts is out of date with openapi/openapi.yaml.
 * Regenerate with `npm run types:gen`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = join(root, 'openapi', 'openapi.yaml');
const generated = join(root, 'src', 'types', 'api.generated.ts');

const fail = (message) => {
  console.error(`types:check failed — ${message}`);
  process.exit(1);
};

if (!existsSync(spec)) fail('openapi/openapi.yaml not found.');
if (!existsSync(generated)) fail('src/types/api.generated.ts not found. Run `npm run types:gen`.');

const normalise = (value) => value.replace(/\r\n/g, '\n').trimEnd();

const fresh = execFileSync(
  process.execPath,
  [join(root, 'node_modules', 'openapi-typescript', 'bin', 'cli.js'), spec],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);

if (normalise(fresh) !== normalise(readFileSync(generated, 'utf8'))) {
  fail('src/types/api.generated.ts is stale. Run `npm run types:gen` and commit the result.');
}

console.log('types:check ok — api.generated.ts matches openapi.yaml');
