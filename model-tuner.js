/* ══════════════════════════════════════════════════════════════════════════
   model-tuner.js — the Model Tuner workspace.

   Pick a provider, then a model. The stage teaches that model straight from
   its maker's guidance (model-guides.js): strengths and trade-offs, do's and
   don'ts, a before/after rewrite, the settings that matter. Tuning compiles
   a rough prompt into one written to that guidance, says which rules it
   applied, and can test-run the result when Venice serves the same model.

   Builds on window.Workbench (generators.js) for transport and metering.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const W = window.Workbench;
  const G = window.ModelGuides;
  if (!W || !G) { console.warn('[model-tuner] Workbench or ModelGuides missing — tab disabled.'); return; }

  const { $, $$, esc, toast, copyText, download, slug } = W;
  const TAB = 'model-tuner';
  const STORE_KEY = 'model-tuner:selection';

  const STEPS = [
    { key: 'compile', label: 'Write the tuned prompt', weight: 1 }
  ];

  const state = {
    provider: null,
    model: null,
    view: 'guide',
    tuned: null,        // { model, provider, system, prompt, changes, gaps, input, task }
    venice: null        // catalogue model matching the target, if Venice serves it
  };

  /* ── Lookup ─────────────────────────────────────────────────────────── */

  const providerById = id => G.providers.find(p => p.id === id) || G.providers[0];
  const modelById = (p, id) => p.models.find(m => m.id === id) || p.models[0];

  function remember() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ p: state.provider.id, m: state.model.id })); } catch (e) { /* storage blocked — selection just won't persist */ }
  }

  function recall() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }

  /* ── Small render helpers ───────────────────────────────────────────── */

  function markTile(p, size) {
    return `<span class="mt-mark${size ? ' mt-mark-' + size : ''}" style="--hue:${esc(p.hue)}">${esc(p.mark)}</span>`;
  }

  function sourceLinks(list) {
    return list.map(s =>
      `<a class="mt-source" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}<span aria-hidden="true"> ↗</span></a>`
    ).join('');
  }

  const fmtDate = iso => {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const ICON = {
    plus:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>',
    minus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4 6.6 11.5 12.5 4.8"/></svg>',
    cross: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>'
  };

  function pointList(items, kind) {
    const icon = { pro: ICON.plus, con: ICON.minus, do: ICON.check, dont: ICON.cross }[kind];
    return `<ul class="mt-points is-${kind}">` + items.map(it => `
      <li>
        <span class="mt-point-icon">${icon}</span>
        <div><strong>${esc(it.t)}</strong><span>${esc(it.why)}</span></div>
      </li>`).join('') + '</ul>';
  }

  /* ── Panel: provider + model pickers ────────────────────────────────── */

  function renderProviders() {
    $('#mt-providers').innerHTML = G.providers.map(p => `
      <button type="button" class="mt-row${p === state.provider ? ' selected' : ''}" data-provider="${esc(p.id)}" role="option" aria-selected="${p === state.provider}">
        ${markTile(p)}
        <span class="mt-row-copy">
          <span class="mt-row-name">${esc(p.name)}</span>
          <span class="mt-row-sub">${esc(p.maker)} · ${p.models.length} model${p.models.length === 1 ? '' : 's'}</span>
        </span>
      </button>`).join('');
  }

  function renderModels() {
    $('#mt-models').innerHTML = state.provider.models.map(m => `
      <button type="button" class="mt-row mt-row-model${m === state.model ? ' selected' : ''}" data-model="${esc(m.id)}" role="option" aria-selected="${m === state.model}">
        <span class="mt-row-copy">
          <span class="mt-row-name">${esc(m.name)}</span>
          <span class="mt-row-sub">${esc(m.tagline)}</span>
        </span>
      </button>`).join('');
  }

  function select(providerId, modelId) {
    state.provider = providerById(providerId);
    state.model = modelById(state.provider, modelId);
    remember();
    renderProviders();
    renderModels();
    renderGuide();
    renderLineup();
    matchVenice();
    $('#mt-run-btn').textContent = 'Tune for ' + state.model.name;
    /* A tuned prompt belongs to the model it was written for; keep it, but
       say so when the selection has moved on. */
    renderTuned();
  }

  /* ── Stage: Guide ───────────────────────────────────────────────────── */

  function renderGuide() {
    const p = state.provider, m = state.model;

    const specs = m.specs.map(s => `
      <div class="mt-spec"><span class="mt-spec-k">${esc(s.k)}</span><span class="mt-spec-v">${esc(s.v)}</span></div>`).join('');

    const settings = m.settings.map(s => `
      <div class="mt-knob">
        <span class="mt-knob-k">${esc(s.k)}</span>
        <span class="mt-knob-v">${esc(s.v)}</span>
        <span class="mt-knob-why">${esc(s.why)}</span>
      </div>`).join('');

    const principles = p.principles.map((pr, i) => `
      <li><span class="mt-num">${String(i + 1).padStart(2, '0')}</span><div><strong>${esc(pr.t)}</strong><span>${esc(pr.why)}</span></div></li>`).join('');

    const sources = sourceLinks(m.sources.concat(p.sources.filter(s => m.sources.indexOf(s) === -1)));

    $('#mt-guide').innerHTML = `
      <div class="result-area mt-hero" style="--hue:${esc(p.hue)}">
        <div class="mt-hero-top">
          ${markTile(p, 'lg')}
          <div class="mt-hero-copy">
            <span class="mt-eyebrow">${esc(p.name)} · ${esc(p.maker)}</span>
            <h2 class="mt-hero-name">${esc(m.name)}</h2>
            <p class="mt-hero-tag">${esc(m.tagline)}</p>
          </div>
        </div>
        <div class="mt-hero-meta">
          ${m.apiId ? `<button type="button" class="mt-api" data-copy="${esc(m.apiId)}" title="Copy model ID">${esc(m.apiId)}</button>` : ''}
          <span class="mt-verified">Checked against ${esc(p.name)}’s docs · ${esc(fmtDate(G.verifiedOn))}</span>
        </div>
        <div class="mt-specs">${specs}</div>
        <div class="mt-bestfor"><span class="mt-label">Best for</span>${m.bestFor.map(b => `<span class="tag">${esc(b)}</span>`).join('')}</div>
      </div>

      <div class="result-area">
        <h3>Strengths &amp; trade-offs</h3>
        <div class="mt-split">
          <div><div class="mt-col-head is-pro">Strengths</div>${pointList(m.pros, 'pro')}</div>
          <div><div class="mt-col-head is-con">Trade-offs</div>${pointList(m.cons, 'con')}</div>
        </div>
      </div>

      <div class="result-area">
        <h3>Prompting ${esc(m.name)}</h3>
        <div class="mt-split">
          <div><div class="mt-col-head is-do">${ICON.check} Do</div>${pointList(m.dos, 'do')}</div>
          <div><div class="mt-col-head is-dont">${ICON.cross} Don’t</div>${pointList(m.donts, 'dont')}</div>
        </div>
      </div>

      <div class="result-area">
        <h3>Before → after · ${esc(m.example.label)}</h3>
        <div class="mt-ba">
          <div class="mt-ba-side is-before">
            <span class="mt-ba-tag">Less effective</span>
            <pre>${esc(m.example.before)}</pre>
          </div>
          <span class="mt-ba-arrow">${ICON.arrow}</span>
          <div class="mt-ba-side is-after">
            <span class="mt-ba-tag">More effective</span>
            <pre>${esc(m.example.after)}</pre>
            <button type="button" class="copy-btn-small" data-copy="${esc(m.example.after)}">Copy</button>
          </div>
        </div>
        <p class="mt-ba-why"><strong>Why it works.</strong> ${esc(m.example.why)}</p>
      </div>

      <div class="result-area">
        <h3>Settings that matter</h3>
        <div class="mt-knobs">${settings}</div>
      </div>

      <div class="result-area">
        <h3>How ${esc(p.maker)} reads a prompt · every model</h3>
        <p class="mt-blurb">${esc(p.blurb)}</p>
        <ol class="mt-principles">${principles}</ol>
      </div>

      <div class="result-area mt-sources-area">
        <h3>Sources</h3>
        <p class="mt-blurb">Summarised from ${esc(p.name)}’s own documentation. Specs and prices change; follow the links for the current figures.</p>
        <div class="mt-sources">${sources}</div>
      </div>`;
  }

  /* ── Stage: Lineup ──────────────────────────────────────────────────── */

  function specValue(m, keys) {
    const hit = m.specs.find(s => keys.indexOf(s.k) !== -1);
    return hit ? hit.v : '—';
  }

  function renderLineup() {
    const p = state.provider;
    const rows = p.models.map(m => `
      <tr class="${m === state.model ? 'is-current' : ''}" data-model="${esc(m.id)}" tabindex="0">
        <th scope="row"><span class="mt-lineup-name">${esc(m.name)}</span><span class="mt-lineup-tag">${esc(m.tagline)}</span></th>
        <td>${m.bestFor.map(esc).join('<br>')}</td>
        <td class="mono">${esc(specValue(m, ['Price in / out', 'Pricing', 'Weights']))}</td>
        <td class="mono">${esc(specValue(m, ['Context']))}</td>
      </tr>`).join('');

    const providers = G.providers.map(pp => `
      <button type="button" class="mt-glance${pp === p ? ' is-current' : ''}" data-provider="${esc(pp.id)}">
        ${markTile(pp)}
        <span><strong>${esc(pp.name)}</strong><span>${esc(pp.blurb)}</span></span>
      </button>`).join('');

    const excluded = G.excluded.map(x => `<li><strong>${esc(x.name)}</strong> — ${esc(x.why)}</li>`).join('');

    $('#mt-lineup').innerHTML = `
      <div class="result-area">
        <h3>${esc(p.name)} lineup · choose by job</h3>
        <div class="mt-table-wrap">
          <table class="mt-table">
            <thead><tr><th>Model</th><th>Best for</th><th>Price / weights</th><th>Context</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="mt-blurb">Select a row to open that model’s guide.</p>
      </div>

      <div class="result-area">
        <h3>Every provider at a glance</h3>
        <div class="mt-glance-list">${providers}</div>
      </div>

      <div class="result-area">
        <h3>Not included, and why</h3>
        <p class="mt-blurb">A model is listed only when its maker publishes prompting guidance that applies to it.</p>
        <ul class="mt-excluded">${excluded}</ul>
      </div>`;
  }

  /* ── Stage: Tuned prompt ────────────────────────────────────────────── */

  function renderTuned() {
    const host = $('#mt-tuned');
    const t = state.tuned;
    $('#mt-tuned-tab').classList.toggle('has-result', !!t);

    if (!t) {
      host.innerHTML = `
        <div class="stage-empty">
          <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path d="M24 30v60M60 30v60M96 30v60" stroke-linecap="round"/>
            <circle cx="24" cy="48" r="8" stroke="#E4622B" stroke-width="2"/>
            <circle cx="60" cy="72" r="8" stroke="#F0A93C" stroke-width="2"/>
            <circle cx="96" cy="42" r="8" stroke="#35B98C" stroke-width="2"/>
          </svg>
          <h4>Nothing tuned yet</h4>
          <p>Write a rough prompt on the left and press Tune. The rewrite appears here, with each rule it applied and the gaps only you can fill.</p>
        </div>`;
      return;
    }

    const stale = t.model !== state.model;
    const block = (label, id, text) => `
      <div class="mt-out">
        <div class="mt-out-head"><span>${label}</span><button type="button" class="copy-btn-small" data-copy-from="${id}">Copy</button></div>
        <div class="mt-out-body" id="${id}" contenteditable="true" spellcheck="false">${esc(text)}</div>
      </div>`;

    const changes = (t.changes || []).map(c => `
      <li><span class="tag format">${esc(c.rule || 'guideline')}</span><span>${esc(c.why || '')}</span></li>`).join('');

    const gaps = (t.gaps || []).map(g => `<li>${esc(g)}</li>`).join('');

    const settings = t.model.settings.map(s =>
      `<div class="mt-knob"><span class="mt-knob-k">${esc(s.k)}</span><span class="mt-knob-v">${esc(s.v)}</span><span class="mt-knob-why">${esc(s.why)}</span></div>`).join('');

    const venice = state.venice && !stale
      ? `<button type="button" class="action-btn secondary" id="mt-test-btn">Test on Venice · ${esc(W.modelLabel(state.venice))}</button>`
      : '';

    host.innerHTML = `
      ${stale ? `<div class="mt-stale">This prompt was tuned for <strong>${esc(t.model.name)}</strong>. Press Tune to rewrite it for ${esc(state.model.name)}.</div>` : ''}

      <div class="result-area" style="--hue:${esc(t.provider.hue)}">
        <h3>Tuned for ${esc(t.model.name)}</h3>
        ${t.system ? block('System prompt', 'mt-out-system', t.system) : ''}
        ${block(t.system ? 'User prompt' : 'Prompt', 'mt-out-prompt', t.prompt)}
        <div class="mt-actions">
          <button type="button" class="action-btn" id="mt-copy-all">Copy all</button>
          <a class="action-btn secondary" href="${esc(t.provider.chat.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(t.provider.chat.label)} ↗</a>
          ${venice}
          <button type="button" class="action-btn secondary" id="mt-download">Download .md</button>
        </div>
        <div id="mt-answer" class="mt-answer" style="display:none;"></div>
      </div>

      ${changes ? `<div class="result-area"><h3>What changed and why</h3><ul class="mt-changes">${changes}</ul></div>` : ''}

      ${gaps ? `<div class="result-area"><h3>Fill these in</h3><p class="mt-blurb">The prompt marks these as {{PLACEHOLDERS}}. Only you know the answers, so nothing was guessed.</p><ul class="mt-gaps">${gaps}</ul></div>` : ''}

      <div class="result-area"><h3>Run it with these settings</h3><div class="mt-knobs">${settings}</div></div>`;
  }

  /* ── Venice: can the target model be test-run here? ─────────────────── */

  function matchVenice() {
    const list = window.VeniceCatalogue || [];
    let found = null;
    if (state.model && state.model.venice && list.length) {
      const re = new RegExp(state.model.venice, 'i');
      found = list.find(m => re.test(m.id) || re.test(W.modelLabel(m))) || null;
    }
    state.venice = found;
  }

  /* ── Compile ────────────────────────────────────────────────────────── */

  const DIALECT = {
    xml: 'Separate the parts of the prompt with descriptive XML tags (for example <context>, <instructions>, <input>, <examples>, <output_format>). When the prompt carries long input data, place it above the instructions and put the question last.',
    markdown: 'Organise the prompt in short Markdown sections with clear headings, or consistent XML-style tags. Keep each section brief and add detail only where it changes behaviour.',
    plain: 'Write plain, direct prose. Describe the task and its acceptance criteria. Do not script the model’s reasoning, and keep everything in the user prompt: leave "system" empty.'
  };

  const TASK = {
    general:    '',
    writing:    'Writing task: pin down audience, purpose, tone, structure, and length as a concrete measure (words, sentences, sections).',
    coding:     'Coding task: name the language, framework and versions; define done as a check that can actually run (tests, type-check, build); state what is out of scope.',
    agentic:    'Agentic task: state the goal, what counts as done and how to verify it, which actions need the user’s confirmation, and when to stop.',
    extraction: 'Extraction or classification task: give the exact output schema or closed label set, require null (or a stated value) for anything missing, and forbid inferring values.',
    analysis:   'Analysis task: bound the evidence the model may use, fix the shape of the answer, and say how to state uncertainty.'
  };

  function compilerSystem(p, m, task) {
    const lines = (arr, mark) => arr.map(x => `${mark} ${x.t} — ${x.why}`).join('\n');
    return `You are a prompt engineer who specialises in ${p.name} ${m.name}. Rewrite the user's rough prompt into a production-ready prompt that will run on ${m.name}, following ${p.name}'s own published guidance below. Apply the guidance that fits this task; do not pad the prompt with rules it does not need.

<provider_guidance>
${lines(p.principles, '-')}
</provider_guidance>

<model_guidance model="${m.name}">
Do:
${lines(m.dos, '+')}
Don't:
${lines(m.donts, 'x')}
Known trade-offs to compensate for:
${lines(m.cons, '!')}
</model_guidance>

<format>
${DIALECT[m.dialect] || DIALECT.markdown}
</format>
${TASK[task] ? `\n<task_type>\n${TASK[task]}\n</task_type>\n` : ''}
<rules>
- Preserve the user's intent. Never invent facts, names, numbers, data or examples about the user's world. Where the prompt needs information only the user has, insert a clear {{PLACEHOLDER}} and list it in "gaps".
- Keep it proportionate: a simple request gets a compact prompt, not a template with every section.
- Use a system prompt only where the guidance favours one (role, standing rules, output format). Otherwise leave "system" empty.
- You are writing the prompt, not answering it.
</rules>

Return JSON only, no prose before or after:
{"system": "system prompt or empty string", "prompt": "the user prompt", "changes": [{"rule": "short name of the guideline applied", "why": "what you changed and why, one sentence"}], "gaps": ["{{PLACEHOLDER}} — what the user should supply"]}`;
  }

  async function runTune() {
    const input = ($('#mt-prompt').value || '').trim();
    if (!input) { toast('Write a rough prompt first.'); $('#mt-prompt').focus(); return; }

    const p = state.provider, m = state.model;
    const task = (($$('#mt-task .chip.selected')[0] || {}).dataset || {}).task || 'general';
    const compiler = $('#mt-model').value;

    const btn = $('#mt-run-btn');
    const status = $('#mt-inline-status');
    btn.disabled = true;
    status.style.display = '';
    status.classList.add('running');
    W.pulse(TAB, 'live', 'Tuning');
    W.meterStart(TAB, STEPS);
    W.meterStage(TAB, 'compile');

    try {
      const out = await W.chatJson(compiler, compilerSystem(p, m, task),
        `Target model: ${m.name}\nTask type: ${task}\n\nRough prompt:\n"""\n${input}\n"""`,
        { max_tokens: 6000, temperature: 0.4 }, ['prompt', 'system', 'changes', 'gaps']);

      const prompt = typeof out.prompt === 'string' ? out.prompt.trim() : '';
      if (!prompt) throw new Error('The compiler returned no prompt. Try again or pick another compiler model.');

      state.tuned = {
        provider: p, model: m, input: input, task: task,
        system: typeof out.system === 'string' ? out.system.trim() : '',
        prompt: prompt,
        changes: Array.isArray(out.changes) ? out.changes.filter(c => c && (c.rule || c.why)) : [],
        gaps: Array.isArray(out.gaps) ? out.gaps.filter(g => typeof g === 'string' && g.trim()) : []
      };

      W.meterDone(TAB, 'compile');
      W.meterFinish(TAB, true);
      W.pulse(TAB, 'done', 'Tuned');
      renderTuned();
      showView('tuned');
      toast('Prompt tuned for ' + m.name + '.');
    } catch (err) {
      console.error('[model-tuner]', err);
      W.meterFinish(TAB, false);
      W.pulse(TAB, null, 'Failed');
      toast(err.message || 'Tuning failed.');
    } finally {
      btn.disabled = false;
      status.style.display = 'none';
      status.classList.remove('running');
    }
  }

  async function testOnVenice() {
    const t = state.tuned;
    if (!t || !state.venice) return;
    const box = $('#mt-answer');
    const btn = $('#mt-test-btn');
    box.style.display = '';
    box.innerHTML = `<div class="mt-answer-head">Answer from ${esc(W.modelLabel(state.venice))}</div><p class="thinking">Running the tuned prompt…</p>`;
    btn.disabled = true;
    W.pulse(TAB, 'live', 'Testing');

    try {
      /* Read the edited text, not the stored copy: the boxes are editable. */
      const sys = $('#mt-out-system') ? $('#mt-out-system').innerText.trim() : '';
      const usr = $('#mt-out-prompt').innerText.trim();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.venice.id,
          max_tokens: 4000,
          venice_parameters: { include_venice_system_prompt: false },
          messages: (sys ? [{ role: 'system', content: sys }] : []).concat([{ role: 'user', content: usr }])
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && (data.error || data.message)) || ('Venice returned ' + res.status));
      const text = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      if (!text) throw new Error('Venice returned an empty completion.');
      box.innerHTML = `<div class="mt-answer-head">Answer from ${esc(W.modelLabel(state.venice))}</div><div class="mt-answer-body">${esc(text)}</div>`;
      W.pulse(TAB, 'done', 'Tested');
    } catch (err) {
      box.innerHTML = `<div class="mt-answer-head">Test run failed</div><p class="mt-blurb">${esc(typeof err.message === 'string' ? err.message : 'Unknown error')}</p>`;
      W.pulse(TAB, null, 'Failed');
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Markdown exports ───────────────────────────────────────────────── */

  function guideMarkdown(p, m) {
    const pts = (arr, mark) => arr.map(x => `${mark} **${x.t}** — ${x.why}`).join('\n');
    return [
      `# Prompting ${m.name}`,
      `_${m.tagline}_ · ${p.name}${m.apiId ? ` · \`${m.apiId}\`` : ''} · checked ${G.verifiedOn}`,
      '',
      '## Specs', m.specs.map(s => `- ${s.k}: ${s.v}`).join('\n'),
      '', '## Best for', m.bestFor.map(b => `- ${b}`).join('\n'),
      '', '## Strengths', pts(m.pros, '-'),
      '', '## Trade-offs', pts(m.cons, '-'),
      '', '## Do', pts(m.dos, '- ✅'),
      '', '## Don’t', pts(m.donts, '- ❌'),
      '', `## Before → after (${m.example.label})`,
      '**Less effective**', '```text', m.example.before, '```',
      '**More effective**', '```text', m.example.after, '```',
      m.example.why,
      '', '## Settings', m.settings.map(s => `- \`${s.k}\`: ${s.v} — ${s.why}`).join('\n'),
      '', `## Every ${p.maker} model`, p.principles.map((x, i) => `${i + 1}. **${x.t}** — ${x.why}`).join('\n'),
      '', '## Sources', m.sources.concat(p.sources.filter(s => m.sources.indexOf(s) === -1)).map(s => `- [${s.label}](${s.url})`).join('\n'),
      ''
    ].join('\n');
  }

  function tunedMarkdown() {
    const t = state.tuned;
    const sys = $('#mt-out-system') ? $('#mt-out-system').innerText.trim() : t.system;
    const usr = $('#mt-out-prompt') ? $('#mt-out-prompt').innerText.trim() : t.prompt;
    return [
      `# Prompt tuned for ${t.model.name}`,
      `${t.provider.name} · task: ${t.task}`,
      '',
      sys ? '## System prompt\n\n```text\n' + sys + '\n```\n' : '',
      `## ${sys ? 'User prompt' : 'Prompt'}\n\n\`\`\`text\n${usr}\n\`\`\``,
      t.changes.length ? '\n## What changed and why\n' + t.changes.map(c => `- **${c.rule}** — ${c.why}`).join('\n') : '',
      t.gaps.length ? '\n## Fill these in\n' + t.gaps.map(g => `- ${g}`).join('\n') : '',
      '\n## Settings\n' + t.model.settings.map(s => `- \`${s.k}\`: ${s.v} — ${s.why}`).join('\n'),
      '\n## Original draft\n\n> ' + t.input.replace(/\n/g, '\n> '),
      '\n---\n\n' + guideMarkdown(t.provider, t.model)
    ].join('\n');
  }

  /* ── Views ──────────────────────────────────────────────────────────── */

  function showView(view) {
    state.view = view;
    $$('[data-mt-view]').forEach(b => {
      const on = b.dataset.mtView === view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    $('#mt-guide').style.display = view === 'guide' ? '' : 'none';
    $('#mt-lineup').style.display = view === 'lineup' ? '' : 'none';
    $('#mt-tuned').style.display = view === 'tuned' ? '' : 'none';
    const body = $('#model-tuner .stage-body');
    if (body) body.scrollTop = 0;
  }

  /* ── Wiring ─────────────────────────────────────────────────────────── */

  function boot() {
    /* First visit opens on the model Anthropic names as the default starting
       point, not simply the first row. */
    const saved = recall() || { p: 'anthropic', m: 'claude-opus-5-5' };
    select(saved.p, saved.m);
    showView('guide');

    $('#mt-providers').addEventListener('click', e => {
      const row = e.target.closest('[data-provider]');
      if (row) select(row.dataset.provider);
    });

    $('#mt-models').addEventListener('click', e => {
      const row = e.target.closest('[data-model]');
      if (row) select(state.provider.id, row.dataset.model);
    });

    $$('#mt-task .chip').forEach(chip => chip.addEventListener('click', () => {
      $$('#mt-task .chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    }));

    $$('[data-mt-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.mtView)));

    $('#mt-run-btn').addEventListener('click', runTune);
    $('#mt-prompt').addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runTune();
    });

    $('#mt-cheatsheet-btn').addEventListener('click', () => {
      download(slug(state.model.name, 'model') + '-prompting-guide.md', guideMarkdown(state.provider, state.model), 'text/markdown');
      toast('Cheat sheet downloaded.');
    });

    $('#mt-lineup').addEventListener('click', e => {
      const glance = e.target.closest('[data-provider]');
      if (glance) { select(glance.dataset.provider); showView('guide'); return; }
      const row = e.target.closest('tr[data-model]');
      if (row) { select(state.provider.id, row.dataset.model); showView('guide'); }
    });
    $('#mt-lineup').addEventListener('keydown', e => {
      const row = e.target.closest('tr[data-model]');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(state.provider.id, row.dataset.model); showView('guide'); }
    });

    /* Copy buttons inside the stage, delegated so re-renders keep working. */
    $('#model-tuner .stage-body').addEventListener('click', e => {
      const direct = e.target.closest('[data-copy]');
      if (direct) return copyText(direct.dataset.copy, direct.classList.contains('mt-api') ? null : direct);
      const from = e.target.closest('[data-copy-from]');
      if (from) { const el = document.getElementById(from.dataset.copyFrom); if (el) copyText(el.innerText, from); return; }
      if (e.target.closest('#mt-copy-all')) {
        const sys = $('#mt-out-system') ? $('#mt-out-system').innerText.trim() : '';
        const usr = $('#mt-out-prompt').innerText.trim();
        return copyText(sys ? `SYSTEM PROMPT\n${sys}\n\nUSER PROMPT\n${usr}` : usr, e.target.closest('#mt-copy-all'));
      }
      if (e.target.closest('#mt-download')) {
        download(slug(state.tuned.model.name, 'prompt') + '-tuned-prompt.md', tunedMarkdown(), 'text/markdown');
        return toast('Tuned prompt downloaded.');
      }
      if (e.target.closest('#mt-test-btn')) testOnVenice();
    });

    /* The catalogue lands after boot; re-check whether Venice serves the target. */
    document.addEventListener('venice:catalogue', () => {
      matchVenice();
      if (state.tuned) renderTuned();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
