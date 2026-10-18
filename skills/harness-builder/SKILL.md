---
name: harness-builder
description: Designs the full agent harness — the environment, not the prompt: rules, playbooks, subagents, skills, MCP wiring, hooks, permissions and the execution layer that turns an agent into a repeatable operator. Use when the user asks to "build a harness", "wire up an agent environment", or "make my agent reliable in production".
license: MIT
version: 1.0.0
---

# Harness builder

## Steps

1. **Name the job-to-be-done** and its cadence: one-off, hourly, event-driven, or always-on.
2. **Map the environment**: what the agent can reach (files, APIs, DBs, browsers, shells), via what (MCP servers, functions, CLIs), with what credentials. Explicit allow/deny list per surface.
3. **Rules file**: the always-loaded AGENTS.md-equivalent — scope, safety, verification duties. Keep under 100 lines; it is re-read every run.
4. **Playbooks** for the 3-5 recurring procedures, each: trigger, steps, verification, rollback.
5. **Hooks**: pre-action validators (guard spend, block dangerous paths), post-action verifiers (run tests after edits), and a logging hook (every tool call → transcript).
6. **Subagent design** if needed: each with a single responsibility, its own context window, and the exact handoff artifact (files, not chat memory).
7. **State & memory**: what persists between runs (state file path + schema), what must be re-derived. Never rely on chat history across runs.
8. **Failure policy**: retry with backoff for transport errors; abort + report for semantic failures; a kill switch the human can pull.
9. **Deliver**: an architecture diagram in text, the file tree, each config file's content, and a "prove it works" checklist: 3 scenarios including one deliberate failure.

## Pitfalls

- Harnesses fail at the seams: unversioned state files, credentials in env without rotation notes, hooks that silently pass.
- A hook that can't fail loudly is worse than no hook.
- Don't harness for the demo case; harness for the 3am-unattended run.
- Keep the execution layer boring: proven scheduler, plain logs, no clever state machines you can't debug.
