---
name: viv-model-tuner
description: Picks the right model for a task and rewrites the prompt the way that specific model reads best — capability, cost, speed, modality, context window. Use when the user asks "which model should I use", "tune this prompt for <model>", or wants provider-specific prompt shaping.
license: MIT
version: 1.0.0
---

# Model tuner

## Steps

1. **Classify the task**: reasoning-heavy / coding / long-context retrieval / vision / audio / image-gen / structured extraction / creative writing.
2. **Rank candidates** on four axes: capability-at-task, latency tolerance, cost sensitivity, and special requirements (JSON mode, function calling, vision input).
3. **Fetch the live catalog** when an API is reachable (`GET /models`); otherwise use known families and say the list may be stale.
4. **Recommend one primary + one fallback**, each with a one-line reason tied to a task property, not brand loyalty.
5. **Tune the prompt for the primary model**:
   - Instruction-tuned chat models → imperative, structured, explicit output contract.
   - Reasoning/thinking models → state the goal and constraints, let it plan; don't micro-manage its reasoning; ask for the answer after its thinking, per the provider's convention.
   - Small/fast models → one task per prompt, few-shot examples over long explanations, hard length caps.
   - JSON-mode/function-calling models → exact schema in the prompt, "output only JSON", no prose.
6. **Note the provider quirks** that change behavior: temperature sensitivity, system-prompt handling, token limits, whether `response_format` is supported.
7. **Deliver**: table of top 2-3 (model · why · risk), the tuned prompt in a fenced block, and what to change if switching to the fallback.

## Pitfalls

- Don't recommend a model you can't name capabilities for; say "verify against the current catalog".
- Bigger is not better: a 3B fast model often beats a frontier model for extraction at a fraction of the cost.
- Benchmarks are population averages — the user's task is a population of one.
- Never claim live pricing you can't verify.
