#!/usr/bin/env node
// PostToolUse hook: formats the file Claude just edited. It never blocks.
// If prettier isn't installed yet (before task 0.1), it does nothing.
import { spawnSync } from 'node:child_process';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const filePath = JSON.parse(raw || '{}')?.tool_input?.file_path;
if (!filePath) process.exit(0);

spawnSync(
  'npx',
  ['--no-install', 'prettier', '--write', '--ignore-unknown', '--log-level', 'silent', filePath],
  {
    stdio: 'ignore',
  }
);
process.exit(0);
