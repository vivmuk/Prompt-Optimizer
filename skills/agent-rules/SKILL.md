---
name: agent-rules
description: Writes the AGENTS.md-style rules file every coding agent reads before touching a repo — scope, safety, verification duties, project conventions — plus derived variants (CLAUDE.md, Cursor rules). Use when the user asks to "write AGENTS.md", "set rules for my coding agent", or wants the agent to stop breaking the build.
license: MIT
version: 1.0.0
---

# Agent rules

## Steps

1. **Interview the repo, not the user**: README, package manifests, CI config, existing lint/format configs, test layout, CHANGELOG. Rules contradicting reality get ignored by agents.
2. **Scope block**: what this repo is, what agents may change freely, what is protected (generated code, migrations, payment paths, public API signatures).
3. **Verification duties**: the exact commands an agent MUST run before claiming success (lint, typecheck, targeted tests, full tests when core files changed). Name them literally — agents follow literals.
4. **Conventions that survive tooling**: commit message format, branch naming, no drive-by refactors, comment-when-unusual.
5. **Safety**: never commit secrets (name the detection command), never force-push, never edit CI unsupervised, flag destructive SQL.
6. **Escalation**: "If a required change contradicts these rules, stop and explain" — this line prevents most agent damage.
7. **Keep it under ~120 lines.** Every line is context tax on every agent run; cut anything CI already enforces.
8. **Deliver** AGENTS.md plus the requested variants, each derived (not copied) — variant-specific syntax for Cursor (`.cursor/rules`), Claude (`CLAUDE.md`), Codex (`AGENTS.md` is native).

## Pitfalls

- Aspirations aren't rules: "write good code" is ignored; "run `pnpm test:changed` before committing" is obeyed.
- Don't paste the whole CONTRIBUTING.md — link it and extract the agent-relevant 20 lines.
- Rules drift: add a "last verified against repo state YYYY-MM-DD" line and re-derive after major refactors.
- If CI exists, the rules file's job is to make agents run it, not to duplicate it.
