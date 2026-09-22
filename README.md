# SPA Ajibade & Co. — Website API

TypeScript + Node.js + Express + MongoDB content API for the SPA Ajibade & Co. website. The frontend team owns all UI, including the admin dashboard.

## Structure

A layered TypeScript project: `interfaces/`, `models/`, `validators/`, `services/`, `serializers/`, `controllers/`, `routes/`, `middlewares/`, `helpers/`, `core/`, `integrations/`. See `docs/ARCHITECTURE.md` for the full tree, the layer rules, and one resource traced through every layer.

## Working with Claude Code

This repo is set up so Claude Code can build it task by task:

| Path | Purpose | When it loads |
|---|---|---|
| `CLAUDE.md` | Project rules, commands, conventions | Every session |
| `.claude/rules/*.md` | Rules scoped to TypeScript, layers, models, tests, contract, personal data | Only when Claude opens matching files |
| `.claude/skills/next-task` | `/next-task [n]`: plan → build → verify → tick → commit | When you invoke it |
| `.claude/skills/new-resource` | Scaffold a resource across every layer (interface → routes + tests) | When a task adds a resource |
| `.claude/skills/contract-check` | Audit spec vs code vs fixtures | Before frontend handoffs |
| `.claude/agents/api-reviewer.md` | Read-only reviewer subagent | After each task / Phase 7 |
| `.claude/settings.json` | Permissions, plus hooks that block `.env`/lockfile edits and auto-format | Always |
| `docs/` | Brief, API, data model, architecture, roadmap, seed content, decisions | On demand |

### Getting started
1. Install Node 24 LTS and Claude Code. Open a terminal in this folder and run `claude`.
2. Type `/next-task`. Claude starts with task 0.1 (scaffold), then 0.2 (OpenAPI spec).
3. After Phase 0, share `npm run mock` and `docs/FRONTEND_HANDOFF.md` with the frontend team, so they can build against the mock straight away.
4. Keep going with `/next-task`. After each task, you can ask Claude to "use the api-reviewer agent on the last commit".

Tips:
- Run `/clear` between tasks so each one starts with a clean context.
- When the firm answers an open question, update the table in `docs/DECISIONS.md`. Claude reads it before each task.
- If Claude repeats a mistake, add one specific line to `CLAUDE.md` or the relevant rule file.
