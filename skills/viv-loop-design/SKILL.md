---
name: viv-loop-design
description: Turns a plain-English request into a loop-engineering spec — trigger, actions, proof, memory and stop conditions — pressure-tested by a second-pass critic. Use when the user asks to "automate X", "make this run on a loop", "set up a recurring agent task", or "watch for Y and alert me".
license: MIT
version: 1.0.0
---

# Loop design

## Steps

1. **Trigger**: schedule (cron), event (webhook), or threshold (poll + compare). State the exact cadence and the timezone. If the user said "when something changes", define "change" as a diffable predicate.
2. **Actions**: numbered, idempotent where possible, each with its input source and output artifact. Actions that mutate the world get a dry-run flag.
3. **Proof**: what artifact proves the run did the work — a file, a sent message, a DB row, a diff. No proof, no run.
4. **Memory**: what the run needs from previous runs (state file, schema, retention). Cross-run memory is the #1 source of loop bugs — version the schema.
5. **Stop conditions**: hard budget (max turns/max spend), convergence (output stable N times), success (proof artifact created), and the abort path (alert the human, leave state clean).
6. **Failure policy**: transient (retry with backoff, capped), semantic (no retry, log + alert), and the poison-pill rule (a run failing 3x in a row disables itself rather than spamming).
7. **Critic pass (mandatory)**: re-read the spec as an adversary. Ask: what happens on the first run when the data is empty? On run 400 when the API changed? On a partial write? Fix every finding.
8. **Deliver**: the spec as YAML/JSON the scheduler can consume + a one-paragraph human summary + the watch-pattern for notifications.

## Pitfalls

- "Check for updates" is not a trigger; "GET /v2/items, diff against state.json ids, if >0 new…" is.
- Loops that send notifications without rate-limiting train the user to ignore notifications.
- Timezones: cron is local unless proven otherwise. Say which.
- Design for the empty first run explicitly; most loops crash there.
