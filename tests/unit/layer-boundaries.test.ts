import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * The layer table in docs/ARCHITECTURE.md is only a rule if lint enforces it.
 * These probes write a deliberately illegal import, lint it, then delete it.
 */
const root = process.cwd();
const probes: string[] = [];

function writeProbe(relativePath: string, contents: string): string {
  const absolute = join(root, relativePath);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, contents, 'utf8');
  probes.push(absolute);
  return absolute;
}

async function lintProbe(absolute: string): Promise<ESLint.LintResult> {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintFiles([absolute]);
  if (!result) throw new Error(`eslint returned no result for ${absolute}`);
  return result;
}

afterAll(() => {
  for (const probe of probes) rmSync(probe, { force: true });
});

describe('eslint layer boundaries', () => {
  it('rejects a controller importing a model', async () => {
    writeProbe(
      'src/models/__boundary-probe.model.ts',
      'export const boundaryProbeModel = { name: "probe" };\n'
    );
    const controller = writeProbe(
      'src/controllers/public/__boundary-probe.controller.ts',
      [
        "import { boundaryProbeModel } from '../../models/__boundary-probe.model.js';",
        '',
        'export const probe = (): string => boundaryProbeModel.name;',
        '',
      ].join('\n')
    );

    const result = await lintProbe(controller);
    const messages = result.messages.filter((m) => m.ruleId === 'import/no-restricted-paths');

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.severity).toBe(2);
  });

  it('rejects a serializer importing a service', async () => {
    writeProbe(
      'src/services/__boundary-probe.service.ts',
      'export const boundaryProbeService = { find: (): string => "probe" };\n'
    );
    const serializer = writeProbe(
      'src/serializers/__boundary-probe.serializer.ts',
      [
        "import { boundaryProbeService } from '../services/__boundary-probe.service.js';",
        '',
        'export const probe = (): string => boundaryProbeService.find();',
        '',
      ].join('\n')
    );

    const result = await lintProbe(serializer);
    const messages = result.messages.filter((m) => m.ruleId === 'import/no-restricted-paths');

    expect(messages.length).toBeGreaterThan(0);
  });

  it('allows a controller importing a service', async () => {
    writeProbe(
      'src/services/__boundary-probe-ok.service.ts',
      'export const okService = { find: (): string => "probe" };\n'
    );
    const controller = writeProbe(
      'src/controllers/public/__boundary-probe-ok.controller.ts',
      [
        "import { okService } from '../../services/__boundary-probe-ok.service.js';",
        '',
        'export const probe = (): string => okService.find();',
        '',
      ].join('\n')
    );

    const result = await lintProbe(controller);
    const messages = result.messages.filter((m) => m.ruleId === 'import/no-restricted-paths');

    expect(messages).toEqual([]);
  });
});
