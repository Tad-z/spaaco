#!/usr/bin/env node
// PreToolUse hook: blocks direct edits to secrets and lockfiles.
// Exit 2 = block; the stderr message is fed back to Claude.
import { basename } from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const filePath = JSON.parse(raw || '{}')?.tool_input?.file_path ?? '';
const name = basename(filePath.replaceAll('\\', '/'));

if (name === '.env.example') process.exit(0);
if (name === '.env' || name.startsWith('.env.') || name === 'package-lock.json') {
  console.error(
    `Blocked: ${name} must not be edited directly. Add new env vars to .env.example and src/config/; change dependencies with npm install.`
  );
  process.exit(2);
}
process.exit(0);
