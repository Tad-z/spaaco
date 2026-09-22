import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * The layer table in docs/ARCHITECTURE.md is only a rule if lint enforces it.
 * These probes write deliberately illegal imports, lint them, then delete them.
 *
 * All probes are linted in a single ESLint run: creating the instance loads the
 * flat config and the TypeScript program, which is by far the slowest thing in
 * the suite, so it happens once rather than once per case.
 */

const root = process.cwd();
const RULE = 'import/no-restricted-paths';

interface Probe {
  /** The file whose imports are under test. */
  readonly file: string;
  /** Extra files it imports, written so the resolver can follow them. */
  readonly supporting: readonly { path: string; contents: string }[];
  readonly contents: string;
  readonly shouldFail: boolean;
  readonly description: string;
}

const probes: Probe[] = [
  {
    description: 'a controller importing a model',
    shouldFail: true,
    file: 'src/controllers/public/__probe-model.controller.ts',
    supporting: [
      {
        path: 'src/models/__probe.model.ts',
        contents: 'export const probeModel = { name: "probe" };\n',
      },
    ],
    contents: [
      "import { probeModel } from '../../models/__probe.model.js';",
      '',
      'export const probe = (): string => probeModel.name;',
      '',
    ].join('\n'),
  },
  {
    description: 'a serializer importing a service',
    shouldFail: true,
    file: 'src/serializers/__probe.serializer.ts',
    supporting: [
      {
        path: 'src/services/__probe.service.ts',
        contents: 'export const probeService = { find: (): string => "probe" };\n',
      },
    ],
    contents: [
      "import { probeService } from '../services/__probe.service.js';",
      '',
      'export const probe = (): string => probeService.find();',
      '',
    ].join('\n'),
  },
  {
    description: 'a service importing a controller',
    shouldFail: true,
    file: 'src/services/__probe-reverse.service.ts',
    supporting: [
      {
        path: 'src/controllers/public/__probe-target.controller.ts',
        contents: 'export const probeController = { handle: (): string => "probe" };\n',
      },
    ],
    contents: [
      "import { probeController } from '../controllers/public/__probe-target.controller.js';",
      '',
      'export const probe = (): string => probeController.handle();',
      '',
    ].join('\n'),
  },
  {
    description: 'a controller importing a service',
    shouldFail: false,
    file: 'src/controllers/public/__probe-ok.controller.ts',
    supporting: [
      {
        path: 'src/services/__probe-ok.service.ts',
        contents: 'export const okService = { find: (): string => "probe" };\n',
      },
    ],
    contents: [
      "import { okService } from '../../services/__probe-ok.service.js';",
      '',
      'export const probe = (): string => okService.find();',
      '',
    ].join('\n'),
  },
];

const written: string[] = [];
const violationsByFile = new Map<string, number>();

function write(relativePath: string, contents: string): string {
  const absolute = join(root, relativePath);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, contents, 'utf8');
  written.push(absolute);
  return absolute;
}

beforeAll(async () => {
  const targets = probes.map((probe) => {
    for (const support of probe.supporting) write(support.path, support.contents);
    return write(probe.file, probe.contents);
  });

  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles(targets);

  for (const result of results) {
    violationsByFile.set(
      result.filePath,
      result.messages.filter((message) => message.ruleId === RULE).length
    );
  }
});

afterAll(() => {
  for (const path of written) rmSync(path, { force: true });
});

describe('eslint layer boundaries', () => {
  it.each(probes.filter((probe) => probe.shouldFail))('rejects $description', ({ file }) => {
    expect(violationsByFile.get(join(root, file))).toBeGreaterThan(0);
  });

  it.each(probes.filter((probe) => !probe.shouldFail))('allows $description', ({ file }) => {
    expect(violationsByFile.get(join(root, file))).toBe(0);
  });

  it('linted every probe, so a resolver failure cannot pass as "no violations"', () => {
    for (const probe of probes) {
      expect(violationsByFile.has(join(root, probe.file))).toBe(true);
    }
  });
});
