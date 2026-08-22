# Prompt Optimizer

A Venice.ai-powered orchestration workbench for prompts, agents, skills, plugins and autonomous loops.

Seven generators live in the left rail. Pick one, fill in the control panel on the
left, and watch the run assemble in the orchestration column on the right.

## The generators

| Generator | What it produces |
| --- | --- |
| **Optimizer** | A rough draft becomes an engineered prompt, shaped for a specific provider dialect (Claude XML, Gemini PTCF, OpenAI Markdown, or universal). Answer it in place or hand it to another chatbot. |
| **Agent Builder** | Name, description, system instructions and conversation starters for a custom agent. |
| **Skills** | A complete Anthropic `.skill` package — SKILL.md, scripts, reference docs, folder tree — downloadable as a `.skill` archive. |
| **Plugin Builder** | A Claude Code plugin design: commands, agents, skills, hooks and MCP servers, exported as build instructions any AI can scaffold from. |
| **Loop Design** | A Loop Engineering spec — trigger, actions, proof, memory, stop conditions — pressure-tested by a second-pass Loop Critic. Exports as markdown, JSON or a Mermaid diagram. |
| **Content Loop** | A repeatable content *engine*: pillars, a dated cycle calendar, channel-native drafts, Venice-generated key visuals, and the feedback loop that makes cycle two better than cycle one. |
| **Gauntlet Loop** | A tool-creation gauntlet: parallel sub-agents that each own one dimension, an adversarial critic scoring against a named gold standard, a blind side-by-side comparison protocol, and a loop that will not exit until the critic picks your build. Outputs a runnable mega-prompt. |

## Content Loop

Give it a subject, an audience, a set of channels and a cadence. It runs a
five-stage pipeline:

1. **Strategy** — pillars with promises and proof sources, KPIs with the
   instrument that reads each one, a repurpose chain, and an explicit feedback
   loop with numeric kill criteria.
2. **Calendar** — one full cycle of dated slots spread across channels and
   pillars, each with a hook, an angle, a CTA and an image prompt.
3. **Drafts** — finished, channel-native copy for every slot.
4. **Visuals** — up to four key images generated through the Venice image API.
5. **Assembly** — the whole thing as a downloadable content kit (Markdown) or a
   machine-readable spec (JSON).

## Gauntlet Loop

Name what should be built and the gold standard it must beat. It forges a
gauntlet spec, then runs an adversarial critic over its own design — hunting for
rubrics vague enough to self-grade, blind protocols that leak which artifact is
which, and stop conditions that let a loop exit on effort rather than quality —
and returns the repaired spec plus a runnable prompt.

Outputs: the gauntlet prompt, the agent roster, the scored critic rubric, the
blind comparison protocol, loop control and stop conditions, and the raw JSON.

## Running it

### Local (recommended — the API proxy lives here)

```bash
npm install
echo "VENICE_API_KEY=your-key-here" > .env
npm start          # http://localhost:3000
```

### Netlify

Publish the repo as a static site and set `VENICE_API_KEY` in
Site settings → Environment variables. Note that the `/api/*` proxy routes are
served by `server.js`; a static Netlify deploy needs equivalent functions for
chat, models and image generation.

## Progress and cost

Every generator carries a run meter under its orchestration header.

**Progress** is determinate, not decorative. Each generator declares weighted
stages — weights approximate real duration, so the bar moves at an even rate
instead of jumping a fifth per step. Within a stage the bar eases toward that
stage's ceiling but never reaches it until the stage actually reports done, so
the bar can only ever be ahead of reality by less than one stage, and never
sticks at 100%. The tabs `app.js` owns are bound to the percentage they already
emit, and their own status lines drive the bar's label.

**Cost** comes from Venice's published per-model pricing on `/models`:

- Before a run, the meter shows an estimate for the selected model, based on a
  measured token profile for that generator. It updates when you change model,
  and Content Loop folds in image cost when visuals are switched on.
- During and after a run, the estimate is replaced by the real figure. `meter.js`
  instruments `fetch`, reads the `usage` block off every completion, and prices
  it — which is how cost works on the older tabs without modifying them.
- Clicking the cost chip opens a per-call breakdown: model, tokens in and out,
  cached tokens, latency, and USD per call.

Text is priced per million tokens from `input.usd` / `output.usd`, honouring the
`extended` tier above its context threshold and the cached-input rate where the
response reports one. Images use `generation.usd` or the per-resolution tier.
Models Venice publishes no rate for are marked unpriced rather than guessed at.

## API surface

`server.js` proxies Venice so the API key never reaches the browser.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Reports whether `VENICE_API_KEY` is present (never returns the key). |
| `GET /api/models` | Venice model catalogue, used to populate every model dropdown. |
| `POST /api/chat` | Chat completions proxy. |
| `POST /api/image` | Image generation proxy (`/image/generate`). Requires `model` and `prompt`. |
| `POST /api/skill-package` | Zips a generated skill into a downloadable `.skill` archive. |

## Design system

The interface follows the **Impeccable** design principles — the anti-patterns
are treated as hard rules rather than suggestions:

- **No default typefaces.** Bricolage Grotesque for display, Instrument Sans for
  UI, JetBrains Mono for code and labels.
- **No pure black, no untinted grey.** Every neutral carries a teal or warm cast,
  so surfaces have a temperature.
- **No purple-to-blue gradient.** The palette is lagoon ink with an ember accent,
  supported by saffron and jade.
- **No cards inside cards.** Depth comes from hairline rules, spacing and a
  single elevation step.
- **No bounce or elastic easing.** Motion is short and ease-out only.

Tokens live at the top of `styles.css`. Recolouring the whole application means
editing that one block.

### Files

```
index.html        App shell: left rail, control panels, orchestration columns
styles.css        Design tokens, shell, and every shared component
generators.css    Components specific to Content Loop and Gauntlet Loop
meter.js          Run progress bar, live cost metering, fetch instrumentation
app.js            Optimizer, Agent Builder, Skills, Plugin Builder, Loop Design
generators.js     Content Loop, Gauntlet Loop, and shared orchestration plumbing
server.js         Express server and the Venice proxy routes
```

## Security notes

- The Venice API key is read from the server environment and never sent to the
  browser.
- All Venice traffic goes over HTTPS through the local proxy.
- The Content Security Policy in `netlify.toml` allows only the font, CDN and
  Venice origins the app actually uses.

## Acknowledgements

Powered by [Venice.ai](https://venice.ai). Design principles from
[Impeccable](https://impeccable.style/).

## License

MIT.
