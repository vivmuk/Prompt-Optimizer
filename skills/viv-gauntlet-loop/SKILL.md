---
name: viv-gauntlet-loop
description: Runs a tool-creation gauntlet — parallel sub-agents each owning one dimension, an adversarial critic scoring against a named gold standard, and a blind-comparison loop that won't exit until the winner is proven. Use when the user asks to "run a gauntlet", "compete N approaches and pick the best", or "pressure-test this tool or solution".
license: MIT
version: 1.0.0
---

# Gauntlet loop

## Steps

1. **Name the gold standard BEFORE generating anything**: the artifact a world-class practitioner would produce, stated concretely (named sections, tests it must pass, properties it must have). The critic scores against THIS, not against vibes.
2. **Decompose into dimensions** (e.g. for a tool: API design, error handling, performance, docs, test coverage). Each dimension gets a sub-agent that owns ONLY that dimension and produces its slice independently.
3. **Assemble** the dimension outputs into candidate version 1. Do not let the assembler "improve" the slices — inconsistency is signal.
4. **Critic pass**: score each dimension 0-10 against the gold standard, with one concrete citation per score (quote the artifact). No citation, no score.
5. **Blind comparison (the exit gate)**: present the current artifact and the gold standard to a fresh agent that has NOT seen the reasoning; ask "which is which and what's missing". If the fresh agent can't tell them apart, or its findings match the critic's, exit; else feed findings to the next iteration.
6. **Iterate**: max 3 loops. Each loop fixes the two lowest-scoring dimensions only. Track scores per loop; if scores don't move, the gold standard or the dimension split is wrong — stop and say so.
7. **Deliver**: the winning artifact, the score table per loop, the critic citations, and the two things you'd fix next with more budget.

## Pitfalls

- The critic must never see the generator's reasoning — contaminated judges always score high.
- Five dimensions scored vaguely is worth less than two scored with citations.
- Diminishing returns are real: loop 3 rarely justifies its cost. State this to the user before loop 3.
- Parallel sub-agents need disjoint outputs; overlapping ownership produces merge wars, not quality.
