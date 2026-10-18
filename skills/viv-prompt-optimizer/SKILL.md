---
name: viv-prompt-optimizer
description: Transforms a rough idea into an engineered, provider-shaped prompt — role, context, constraints, output contract and self-check. Use when the user asks to "optimize this prompt", "improve my prompt", "make this prompt better", or pastes a prompt with "rewrite this for a model".
license: MIT
version: 1.0.0
---

# Prompt optimizer

## Steps

1. **Extract the intent.** One line: what does the user actually want back? If ambiguous, pick the most useful reading and say so in one clause.
2. **Choose the shape.** Default shape: ROLE → CONTEXT → TASK → CONSTRAINTS → OUTPUT CONTRACT → SELF-CHECK. Compress for tiny prompts; expand for production ones.
3. **Write the ROLE** as a practitioner, not a title ("a copy editor who has shipped 1000 landing pages", not "an expert writer").
4. **Front-load CONTEXT** the model can't infer: audience, product, data, tone, what already failed.
5. **Make the TASK one imperative sentence** with the deliverable named.
6. **CONSTRAINTS as bullets**, each testable ("under 150 words", not "be concise").
7. **OUTPUT CONTRACT**: exact format (markdown sections, JSON schema, table columns), length, and what to do if a required input is missing ("ask, don't invent").
8. **SELF-CHECK line**: "Before answering, verify [the 2-3 most-likely failure modes]. If any fails, fix silently and output once."
9. **Return** the optimized prompt in one fenced block + a 3-line changelog of what you changed and why.

## Pitfalls

- Don't stack personas ("you are X and Y and Z") — one role, deeply specified, beats three shallow ones.
- Don't add "think step by step" to simple tasks; it pads output without improving it. Reserve it for multi-step reasoning.
- Don't smuggle the answer into the prompt (leading questions degrade honesty).
- Keep the user's voice and vocabulary where it matters; optimize structure, not their words.
- If the prompt targets a specific model family you know, shape for it (e.g. strict JSON for function-calling models). Otherwise stay provider-neutral.

## Example

Input: "write a launch tweet for our beta"

Output shape:
```
ROLE: A launch copywriter whose threads routinely get 1k+ reposts in developer communities.
CONTEXT: <product, audience, date, what's new>
TASK: Write one launch tweet announcing the beta.
CONSTRAINTS: under 280 chars; no hashtags beyond one; must contain a concrete capability, not adjectives; curiosity gap in the first 6 words.
OUTPUT: the tweet only, no commentary. If the beta date is unknown, ask instead of inventing.
SELF-CHECK: Would a skeptical developer repost this? Is any claim unproven? Fix and output once.
```
