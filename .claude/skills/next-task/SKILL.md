---
name: next-task
description: Pick up and complete the next unchecked task from docs/ROADMAP.md. It plans, implements, verifies with npm run check, ticks the box, and commits. Use when the user says "next task", "continue the roadmap", "keep going", or names a roadmap task number like "do 3.4".
argument-hint: "[task-number, optional]"
disable-model-invocation: true
---

# Complete the next roadmap task

Target: task `$ARGUMENTS` if given; otherwise the first unchecked `- [ ]` task in `docs/ROADMAP.md`. Don't skip ahead. Later tasks assume earlier ones exist.

## 1. Load only the context this task needs
- Read the task and its **Accept** criteria in `docs/ROADMAP.md`.
- Read only the docs the task touches. Contract work needs `docs/API.md` plus `openapi/openapi.yaml`. Models need `docs/DATA_MODEL.md`. Fixtures and seed need `docs/SEED_CONTENT.md`. Anything involving auth, caching or adapters needs `docs/ARCHITECTURE.md`.
- Check `docs/DECISIONS.md` for open questions that affect the task, and use their stated default.
- Look at existing code in neighbouring modules and match its patterns before writing new ones.

## 2. Plan
State a short plan: the files to create or change, the tests to write, and any open-question defaults you're relying on. If the task touches more than 2 files, pause for the user's approval of the plan. If the spec needs to change, list the spec change first.

## 3. Implement, tests first where practical
- Write the failing integration/contract test that encodes the acceptance criteria, then make it pass.
- Keep changes scoped to this task. If you notice something else that's broken, note it for the summary instead of fixing it now.

## 4. Verify
Run `npm run check`. If it fails, fix the cause, not the test. Don't weaken assertions or skip tests to get to green. Re-run until it passes.

## 5. Close out
- Tick the task's checkbox in `docs/ROADMAP.md`.
- Add a DECISIONS.md entry if you made a choice a future session would need to know about.
- Stage and commit with a Conventional Commit message scoped to the resource, for example `feat(insights): add category filter and pagination`. Don't push.
- Reply with a short summary covering what was done, which acceptance criteria were verified and how, any follow-ups noticed, and the next task's number and title.
