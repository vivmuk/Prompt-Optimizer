---
name: viv-agent-builder
description: Generates a complete custom-agent spec — system instructions, tool descriptions, starters, guardrails and stop conditions — for any agent platform. Use when the user asks to "build an agent", "design an AI agent for X", or "write system instructions for my bot".
license: MIT
version: 1.0.0
---

# Agent builder

## Steps

1. **Charter.** One sentence: what outcome does this agent own? Agents with fuzzy charters fail fuzzy.
2. **Inventory the tools.** For each: name (verb_noun), one-line description written for the MODEL not the human, input schema, failure mode, and idempotency. A tool whose failure the model can't predict is a tool it will misuse.
3. **Write the system prompt** in this order: identity & charter → hard rules (never do) → operating loop (numbered) → tool-use policy (when to call, when to ask) → escalation path ("stop and ask the human when…") → tone.
4. **Define the loop**: perceive → plan (one step) → act (one tool call) → verify (did the tool's output match expectations?) → repeat or stop. One action per turn beats batching.
5. **Stop conditions**: success signal, max turns, dead-end detector (same tool + same args twice → change approach), and the explicit "ask the human" triggers.
6. **Guardrails**: what it must never access, spend, delete, or claim. Money, deletion, publishing and personal data always require confirmation.
7. **Starters**: 3 example user messages that exercise the happy path, the tricky path and the escalation path.
8. **Output**: the system prompt in a fenced block, the tool table, starters, and a "first-week observables" list (what to log to know it's working).

## Pitfalls

- Don't give every tool to the agent "just in case" — unused tools dilute tool choice.
- Don't write the system prompt in second-person future ("you will") — use imperative present ("call X before Y").
- Long tool descriptions rot; keep each under 40 words and put the schema in the schema, not the prose.
- An agent without an escalation path will eventually improvise something expensive.
