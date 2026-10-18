---
name: viv-skill-creator
description: Authors a robust SKILL.md package in the Agent Skills standard — trigger-rich frontmatter, numbered steps with exact commands, verification steps and pitfalls — and validates it by executing its own instructions. Use when the user asks to "create a skill", "write a SKILL.md", "turn this workflow into a skill", or "package this procedure for my agent".
license: MIT
version: 1.0.0
---

# Skill creator

## Steps

1. **Extract the procedure from evidence, not memory**: the real transcript, script, or working notes. A skill written from recollection encodes the mistakes too.
2. **Write the frontmatter**: `name` (lowercase, hyphenated), and a `description` that LEADS with the trigger — "Use when the user… <trigger phrases>" — followed by a one-line behavior summary. The description is the routing layer; if the trigger words are missing, the skill never loads.
3. **Body structure, in order**: purpose (2-3 lines) → prerequisites → numbered steps (each starting with an imperative verb, containing literal commands/paths, not descriptions of them) → verification step ("how you know this step worked") → pitfalls section (each pitfall as "wrong: … → right: …") → one worked example end-to-end.
4. **Literals over abstractions**: exact file paths, exact command strings, exact config values. Anything the agent must guess is a failure you haven't hit yet.
5. **Size discipline**: under ~150 lines. Split a longer skill into a parent skill + linked reference files; the body is re-read in full on every trigger.
6. **Validate by execution** (mandatory, at least twice): run the skill's steps as written, in a fresh context, on the real task. Record every place you deviated — each deviation is a bug in the skill. Patch the file, run again, until a clean run needs zero improvisation.
7. **Deliver**: the SKILL.md content, the validation log (runs + deviations fixed), and the install path for the target agent.

## Verification step

- Frontmatter parses; description contains at least 3 distinct trigger phrases.
- A cold agent following only the file completes the task with no questions.
- The pitfalls section contains at least one pitfall discovered during validation, not invented beforehand.

## Pitfalls

- Descriptions written as task summaries instead of triggers ("This skill is about X" → never routed to).
- Steps that say "configure appropriately" instead of giving the config.
- Skills that hard-code environment specifics (paths, tokens) without a "adapt to your environment" note — they break on the second machine.
- Testing the skill on the SAME session that wrote it: familiar context hides missing steps. Always validate cold.
