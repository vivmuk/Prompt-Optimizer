---
name: viv-plugin-builder
description: Designs a complete agent plugin package — commands, agents, skills, hooks, MCP config — packaged as build instructions any AI can scaffold from. Use when the user asks to "make a Claude Code plugin", "package my tools as a plugin", or "build a plugin that does X".
license: MIT
version: 1.0.0
---

# Plugin builder

## Steps

1. **Define the user-facing surface first**: which slash-commands/invocations exist, what each returns. The manifest is downstream of the UX, never the reverse.
2. **Decompose**: what is a command (one-shot), a skill (procedural knowledge), an agent (autonomous loop), a hook (automatic), or MCP wiring (external system)? Most things are skills; promote only with cause.
3. **Write the manifest**: name, version, description, entry points, permissions, dependencies. Declare the minimum permission set that works.
4. **Commands**: for each — name, args schema, the prompt it expands to, output contract.
5. **Skills**: for each — frontmatter (name, trigger-rich description), numbered steps, verification step, pitfalls. Skills without a verification step get skipped by agents under pressure.
6. **Hooks**: events (PreToolUse, PostToolUse, etc.), matchers, and the script's exit-code contract. Every hook script must fail loud.
7. **MCP config**: server entries with transport, env requirements, and the tool allowlist.
8. **Deliver**: file tree, every file's full content, install instructions for the target platform, and an acceptance test script the user can run.

## Pitfalls

- One plugin, one job. A plugin that does formatting AND deploys AND dashboards is three plugins.
- Hooks run on EVERY matched action: a slow hook is a tax on every tool call. Keep them under ~50ms or make them async.
- Version the plugin; agents cache aggressively and stale caches cause phantom bugs.
- Test the uninstall path — plugins that leave orphan hooks are how trust dies.
