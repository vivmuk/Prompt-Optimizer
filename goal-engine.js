/* ══════════════════════════════════════════════════════════════════════════
   goal-engine.js — goal engineering for the Prompt Optimizer.

   The Optimizer starts with a draft. This module asks the question the draft
   skips: what would make this outcome true, and how would a stranger know?

   It produces a compact charter — an engineered goal, observable evidence,
   non-goals, assumptions, constraints, a weighted rubric and a named operator
   — then hands a plain-text version of that charter to whichever generator
   runs next. One module, used by the Goal Engineering tab, the Optimizer and
   the Harness Builder.
   ══════════════════════════════════════════════════════════════════════════ */

(function (root) {
  'use strict';

  const DEFAULT_MODEL = 'deepseek-v4-1-flash-1017';
  const CACHE_LIMIT = 8;
  const cache = new Map();

  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Copied to clipboard');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = original; }, 1600);
      }
    }).catch(() => toast('Copy failed — select and copy manually.'));
  }

  function download(name, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ── Prompt ─────────────────────────────────────────────────────────── */

  function systemPrompt(sanskrit) {
    const identity = sanskrit
      ? `"agent": {"name": "a short Sanskrit name in transliteration", "devanagari": "the same name in Devanagari", "meaning": "the literal meaning", "role": "one sentence on what this operator is responsible for"}`
      : `"agent": {"name": "a plain role name, e.g. Ramp Coordinator", "devanagari": "", "meaning": "", "role": "one sentence on what this operator is responsible for"}`;

    return `You are Sankalpa, a goal-engineering architect. A goal is not a wish. It is a testable commitment that a stranger could audit.

Turn the raw intention into an engineered charter. Apply these rules without exception:

1. OUTCOME, NOT ACTIVITY. The goal statement names a changed state in the world, not a task list. "Ship the onboarding flow" is activity. "A new hire completes week-one setup without asking a human for access" is an outcome.
2. EVIDENCE A STRANGER COULD CHECK. Success evidence names an artifact, event, measurement or observable behaviour — not "the user is happy". If the intention cannot produce evidence, say what must be built to produce it.
3. EXPLICIT EXCLUSIONS. Non-goals are real exclusions, not caveats. Name what this goal deliberately does not cover, especially adjacent work that would otherwise creep in.
4. SMALLEST HONEST ASSUMPTIONS. List only assumptions that could be wrong and would change the plan. Never invent facts the intention does not contain. If something is unknowable, put it in assumptions rather than guessing.
5. HARD BOUNDARIES. Constraints are non-negotiable limits: time, budget, tools, permissions, compliance, quality floors.
6. RUBRIC, NOT VIBES. Write 4–6 evaluation criteria. Every weight is a number greater than 0 and the weights MUST sum to exactly 1.0. Each criterion has a pass condition and a way to measure it. The rubric must be able to fail the work.
7. RULES TRACE TO FAILURES. Write 8–12 operating rules as markdown bullets. Every rule names a specific mistake it prevents. Delete aspirational advice.
8. PLAYBOOK WITH GATES. Write 5–8 numbered steps. Mark the points where the operator must stop and confirm, and what evidence closes each step.

${identity}

Output strictly valid JSON matching this schema, and nothing else — no prose, no code fences:

{
  "agent": {"name": "...", "devanagari": "...", "meaning": "...", "role": "..."},
  "domain": "short domain label, 1–4 words",
  "summary": "2–3 sentences on what this operator is for and what it refuses to do",
  "goal": {
    "statement": "one observable outcome",
    "successEvidence": ["3–5 artifacts, events or measurements"],
    "nonGoals": ["2–5 explicit exclusions"],
    "assumptions": ["2–5 assumptions that could be wrong"],
    "constraints": ["2–5 hard limits"]
  },
  "evals": [
    {"criterion": "...", "weight": 0.3, "pass": "the condition that counts as passing", "measure": "how a reviewer checks it"}
  ],
  "rules": "markdown bullets for AGENTS.md",
  "playbook": "markdown numbered steps with gates"
}`;
  }

  function userPrompt(goal, context) {
    return `RAW INTENTION
"""
${clean(goal)}
"""

${context ? `CONTEXT THE OPERATOR ALREADY HAS\n"""\n${clean(context)}\n"""\n\n` : ''}Engineer this into a charter. Do not simply restate the intention — make it testable, bounded and auditable.`;
  }

  /* ── Transport ──────────────────────────────────────────────────────── */

  async function post(body) {
    const userKey = (root.getVeniceKey && root.getVeniceKey()) || '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      return await fetch('/api/chat', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' },
          userKey ? { 'x-venice-key': userKey } : {}),
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(opts) {
    const goal = clean(opts && opts.goal);
    if (!goal) throw new Error('Write the intention first.');

    const sanskrit = !(opts && opts.sanskrit === false);
    const model = (opts && opts.model) || DEFAULT_MODEL;
    const messages = [
      { role: 'system', content: systemPrompt(sanskrit) },
      { role: 'user', content: userPrompt(goal, opts && opts.context) }
    ];

    const base = {
      model: model,
      temperature: 0.45,
      max_tokens: 3600,
      venice_parameters: { include_venice_system_prompt: false, enable_web_search: 'off' },
      messages: messages
    };

    let res = await post(Object.assign({}, base, { response_format: { type: 'json_object' } }));

    /* Not every Venice model accepts response_format. Retry once without it
       rather than turning a capable model into a broken one. */
    if (res.status === 400) {
      res = await post(base);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data && (data.error || data.message ||
        (data.details && data.details.message));
      throw new Error(typeof detail === 'string' ? detail : 'Venice returned ' + res.status);
    }

    const content = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('The model returned an empty charter.');

    const rescued = root.JsonRescue && root.JsonRescue.rescue
      ? root.JsonRescue.rescue(content, ['goal', 'agent'])
      : null;
    if (!rescued || !rescued.value) throw new Error('The model did not return a usable charter. Try again.');

    return normalize(rescued.value, { goal: goal, sanskrit: sanskrit, model: model });
  }

  /* ── Normalisation ──────────────────────────────────────────────────── */

  function lines(v) {
    if (Array.isArray(v)) return v.map(clean).filter(Boolean);
    if (typeof v === 'string') {
      return v.split(/\n+/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    }
    return [];
  }

  function normalize(raw, meta) {
    const source = raw || {};
    const goalRaw = source.goal && typeof source.goal === 'object'
      ? source.goal
      : { statement: clean(source.goal) };
    const agentRaw = source.agent && typeof source.agent === 'object' ? source.agent : {};
    const sanskrit = !(meta && meta.sanskrit === false);

    const statement = clean(goalRaw.statement || source.statement || (meta && meta.goal));
    const evidence = lines(goalRaw.successEvidence || goalRaw.evidence);
    const nonGoals = lines(goalRaw.nonGoals || goalRaw.non_goals);
    const assumptions = lines(goalRaw.assumptions);
    const constraints = lines(goalRaw.constraints);

    let evals = Array.isArray(source.evals) ? source.evals : [];
    evals = evals.map((e, i) => {
      if (typeof e === 'string') {
        return { criterion: clean(e), weight: 1, pass: '', measure: '' };
      }
      const item = e || {};
      return {
        criterion: clean(item.criterion || item.name || item.label || 'Criterion ' + (i + 1)),
        weight: Number(item.weight),
        pass: clean(item.pass || item.passCondition || item.passing),
        measure: clean(item.measure || item.measurement || item.how)
      };
    }).filter(e => e.criterion);

    if (!evals.length) {
      evals = [
        { criterion: 'Outcome achieved', weight: 0.4, pass: 'The goal statement is true in the world.', measure: 'A reviewer checks the named evidence.' },
        { criterion: 'Evidence is verifiable', weight: 0.35, pass: 'Every success claim points to an artifact or measurement.', measure: 'Trace each claim to its evidence.' },
        { criterion: 'Constraints respected', weight: 0.25, pass: 'No hard boundary was crossed.', measure: 'Audit against the constraint list.' }
      ];
    }

    /* Weights must sum to 1. If the model ignored the instruction, scale them
       rather than presenting a rubric that cannot be scored. */
    let sum = evals.reduce((n, e) => n + (Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1), 0);
    evals = evals.map(e => Object.assign({}, e, {
      weight: Number((((Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1) / sum)).toFixed(3))
    }));
    const drift = Number((1 - evals.reduce((n, e) => n + e.weight, 0)).toFixed(3));
    if (drift !== 0) evals[evals.length - 1].weight = Number((evals[evals.length - 1].weight + drift).toFixed(3));

    evals.forEach(e => {
      if (!e.pass) e.pass = 'Met when the success evidence is present and checkable.';
      if (!e.measure) e.measure = 'A reviewer inspects the named evidence.';
    });

    const name = clean(agentRaw.name) || (sanskrit ? 'Sankalpa' : 'Goal Operator');

    return {
      agent: {
        name: name,
        devanagari: sanskrit ? clean(agentRaw.devanagari) : '',
        meaning: clean(agentRaw.meaning),
        role: clean(agentRaw.role) || 'Owns the engineered goal and its evidence.'
      },
      domain: clean(source.domain) || 'General',
      summary: clean(source.summary) || `A charter for: ${statement}`,
      goal: {
        statement: statement || clean(meta && meta.goal),
        successEvidence: evidence.length ? evidence : ['A reviewer can verify the stated outcome from an artifact or measurement.'],
        nonGoals: nonGoals,
        assumptions: assumptions,
        constraints: constraints
      },
      evals: evals,
      rules: typeof source.rules === 'string' ? source.rules.trim() : lines(source.rules).map(x => '- ' + x).join('\n'),
      playbook: typeof source.playbook === 'string' ? source.playbook.trim() : lines(source.playbook).map((x, i) => (i + 1) + '. ' + x).join('\n'),
      meta: { model: (meta && meta.model) || DEFAULT_MODEL, generatedAt: new Date().toISOString() }
    };
  }

  /* ── Cache ──────────────────────────────────────────────────────────── */

  function keyOf(goal, context, sanskrit) {
    return [clean(goal), clean(context), sanskrit === false ? '0' : '1'].join('||');
  }

  function getCached(goal, context, sanskrit) {
    return cache.get(keyOf(goal, context, sanskrit)) || null;
  }

  async function engineerCached(opts) {
    const key = keyOf(opts.goal, opts.context, opts.sanskrit);
    if (cache.has(key)) return cache.get(key);
    const spec = await call(opts);
    cache.set(key, spec);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return spec;
  }

  /* ── Plain text for downstream prompts ──────────────────────────────── */

  function bulletText(title, items, fallback) {
    if (!items || !items.length) return '';
    return title + '\n' + items.map(x => '- ' + x).join('\n') + '\n';
  }

  function forPrompt(spec) {
    if (!spec) return '';
    const g = spec.goal;
    let out = `AGENT\n${spec.agent.name}${spec.agent.devanagari ? ' (' + spec.agent.devanagari + ')' : ''} — ${spec.agent.role}\n\n`;
    out += `ENGINEERED GOAL\n${g.statement}\n\n`;
    out += bulletText('SUCCESS EVIDENCE', g.successEvidence);
    out += bulletText('NON-GOALS (do not do these)', g.nonGoals);
    out += bulletText('ASSUMPTIONS (verify before relying on them)', g.assumptions);
    out += bulletText('HARD CONSTRAINTS', g.constraints);
    out += 'EVALUATION RUBRIC (weights must sum to 1.0)\n' +
      spec.evals.map(e => `- ${e.criterion} — ${Math.round(e.weight * 100)}% | pass: ${e.pass} | measure: ${e.measure}`).join('\n') + '\n';
    return out.trim();
  }

  /* ── Markdown ───────────────────────────────────────────────────────── */

  function toMarkdown(spec) {
    if (!spec) return '';
    const g = spec.goal;
    let md = `# ${spec.agent.name}${spec.agent.devanagari ? ' · ' + spec.agent.devanagari : ''}\n\n`;
    if (spec.agent.meaning) md += `*${spec.agent.meaning}*\n\n`;
    md += `${spec.agent.role}\n\n`;
    md += `**Domain:** ${spec.domain}\n\n${spec.summary}\n\n`;
    md += `## Engineered goal\n\n${g.statement}\n\n`;
    md += `### Success evidence\n\n` + (g.successEvidence.length ? g.successEvidence.map(x => '- ' + x).join('\n') : '_None stated._') + '\n\n';
    md += `### Non-goals\n\n` + (g.nonGoals.length ? g.nonGoals.map(x => '- ' + x).join('\n') : '_None stated._') + '\n\n';
    md += `### Assumptions\n\n` + (g.assumptions.length ? g.assumptions.map(x => '- ' + x).join('\n') : '_None stated._') + '\n\n';
    md += `### Constraints\n\n` + (g.constraints.length ? g.constraints.map(x => '- ' + x).join('\n') : '_None stated._') + '\n\n';
    md += `## Evaluation rubric\n\n| Criterion | Weight | Pass condition | How it is measured |\n|---|---:|---|---|\n`;
    spec.evals.forEach(e => {
      const safe = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      md += `| ${safe(e.criterion)} | ${Math.round(e.weight * 100)}% | ${safe(e.pass)} | ${safe(e.measure)} |\n`;
    });
    if (spec.rules) md += `\n## Operating rules\n\n${spec.rules}\n`;
    if (spec.playbook) md += `\n## Playbook\n\n${spec.playbook}\n`;
    return md.trim() + '\n';
  }

  /* ── HTML ───────────────────────────────────────────────────────────── */

  function listHtml(items, empty, cls) {
    if (!items || !items.length) return `<p class="ge-muted">${esc(empty || 'None stated.')}</p>`;
    return `<ul class="ge-list${cls ? ' ' + cls : ''}">` + items.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
  }

  function rubricTable(spec) {
    return `<div class="ge-table-wrap"><table class="ge-table"><thead><tr><th>Criterion</th><th class="ge-num">Weight</th><th>Pass condition</th><th>How it is measured</th></tr></thead><tbody>` +
      spec.evals.map(e => `<tr><td class="ge-criterion">${esc(e.criterion)}</td>` +
        `<td class="ge-num"><div class="ge-weight"><span style="width:${Math.max(2, Math.round(e.weight * 100))}%"></span></div>${Math.round(e.weight * 100)}%</td>` +
        `<td>${esc(e.pass)}</td><td>${esc(e.measure)}</td></tr>`).join('') +
      `</tbody></table></div>`;
  }

  function dossier(spec) {
    if (!spec) return '';
    const g = spec.goal;
    return `<div class="ge-dossier">
      <div class="ge-identity">
        <div class="ge-agent">
          ${spec.agent.devanagari ? `<div class="ge-deva">${esc(spec.agent.devanagari)}</div>` : ''}
          <h3 class="ge-name">${esc(spec.agent.name)}</h3>
          ${spec.agent.meaning ? `<div class="ge-meaning">${esc(spec.agent.meaning)}</div>` : ''}
          <p class="ge-role">${esc(spec.agent.role)}</p>
        </div>
        <div class="ge-domain"><div class="ge-domain-note">Domain</div><span class="tag">${esc(spec.domain)}</span></div>
      </div>
      <p class="ge-summary">${esc(spec.summary)}</p>
      <div class="ge-block">
        <div class="ge-label">The engineered goal</div>
        <p class="ge-statement">${esc(g.statement)}</p>
      </div>
      <div class="ge-split">
        <div class="ge-block"><div class="ge-label">Success evidence</div>${listHtml(g.successEvidence, 'No evidence stated — this goal is not yet testable.')}</div>
        <div class="ge-block"><div class="ge-label">Non-goals</div>${listHtml(g.nonGoals, 'None stated.', 'ge-list-muted')}</div>
      </div>
      <div class="ge-split">
        <div class="ge-block"><div class="ge-label">Assumptions</div>${listHtml(g.assumptions)}</div>
        <div class="ge-block"><div class="ge-label">Constraints</div>${listHtml(g.constraints)}</div>
      </div>
      <div class="ge-block">
        <div class="ge-label">Evaluation rubric <span class="ge-label-note">weights sum to 100%</span></div>
        ${rubricTable(spec)}
      </div>
      ${spec.rules ? `<details class="ge-details"><summary>Operating rules</summary><pre class="ge-code">${esc(spec.rules)}</pre></details>` : ''}
      ${spec.playbook ? `<details class="ge-details"><summary>Playbook</summary><pre class="ge-code">${esc(spec.playbook)}</pre></details>` : ''}
    </div>`;
  }

  function compact(spec) {
    if (!spec) return '';
    const g = spec.goal;
    return `<details class="ge-inline">
      <summary class="ge-inline-summary">
        <div class="ge-inline-head">
          <span class="ge-eyebrow">Engineered goal</span>
          <strong>${esc(spec.agent.name)}</strong>
          ${spec.agent.devanagari ? `<span class="ge-inline-deva">${esc(spec.agent.devanagari)}</span>` : ''}
          <span class="tag">${spec.evals.length} evals</span>
        </div>
        <p class="ge-inline-statement">${esc(g.statement)}</p>
      </summary>
      <div class="ge-inline-body">
        <div class="ge-inline-grid">
          <div><div class="ge-inline-label">Evidence</div>${listHtml(g.successEvidence.slice(0, 3))}</div>
          <div><div class="ge-inline-label">Non-goals</div>${listHtml(g.nonGoals.slice(0, 3))}</div>
        </div>
      </div>
    </details>`;
  }

  function renderInto(el, spec) {
    if (!el) return;
    el.innerHTML = dossier(spec);
    el.style.display = 'block';
  }

  /* ── New-tab controller ─────────────────────────────────────────────── */

  async function fillModelSelect(sel) {
    if (!sel) return;
    const fallback = [
      { id: DEFAULT_MODEL, name: 'DeepSeek v4.1 Flash' },
      { id: 'zai-org-glm-4.7', name: 'GLM 4.7' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' }
    ];
    let models = fallback;
    try {
      const userKey = (root.getVeniceKey && root.getVeniceKey()) || '';
      const res = await fetch('/api/models?type=text', {
        headers: userKey ? { 'x-venice-key': userKey } : {}
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : (data.models || []);
        if (list.length) {
          models = list.map(m => ({
            id: m.id,
            name: (m.model_spec && m.model_spec.name) || m.name || m.id
          })).filter(m => m.id);
        }
      }
    } catch (e) { /* offline: keep the fallback */ }

    const seen = new Set();
    sel.innerHTML = models.filter(m => seen.has(m.id) ? false : seen.add(m.id))
      .map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    if (models.some(m => m.id === DEFAULT_MODEL)) sel.value = DEFAULT_MODEL;
  }

  function initTab() {
    const goalEl = document.getElementById('ge-goal');
    if (!goalEl) return;

    const contextEl = document.getElementById('ge-context');
    const sanskritEl = document.getElementById('ge-sanskrit');
    const modelEl = document.getElementById('ge-model');
    const runBtn = document.getElementById('ge-run-btn');
    const loader = document.getElementById('ge-loader');
    const loaderText = document.getElementById('ge-loader-text');
    const result = document.getElementById('ge-result');
    const output = document.getElementById('ge-output');
    const inline = document.getElementById('ge-inline-status');
    const progress = document.getElementById('ge-progress');
    const panel = document.getElementById('goal-engineering');
    const empty = panel && panel.querySelector('[data-empty-for="goal-engineering"]');
    const pulse = (state, text) => {
      const p = panel && panel.querySelector('[data-pulse-for="goal-engineering"]');
      if (!p) return;
      p.classList.toggle('is-live', state === 'live');
      p.classList.toggle('is-done', state === 'done');
      const t = p.querySelector('.pulse-text');
      if (t) t.textContent = text;
    };

    if (modelEl) fillModelSelect(modelEl);

    let lastSpec = null;
    let lastGoal = '';
    let lastContext = '';

    runBtn.addEventListener('click', async () => {
      const goal = (goalEl.value || '').trim();
      const context = (contextEl && contextEl.value || '').trim();
      if (goal.length < 8) { toast('Write a real intention first — at least a sentence.'); goalEl.focus(); return; }

      runBtn.disabled = true;
      result.style.display = 'none';
      loader.style.display = 'block';
      if (loaderText) loaderText.textContent = 'Engineering the goal…';
      if (inline) { inline.style.display = 'block'; progress.textContent = '0%'; }
      if (empty) empty.style.display = 'none';
      pulse('live', 'Engineering');

      let pct = 0;
      const timer = setInterval(() => {
        pct = Math.min(90, pct + Math.floor(Math.random() * 5) + 1);
        if (progress) progress.textContent = pct + '%';
      }, 300);

      try {
        const spec = await call({
          goal: goal,
          context: context,
          sanskrit: sanskritEl ? sanskritEl.checked : true,
          model: modelEl ? modelEl.value : DEFAULT_MODEL
        });
        lastSpec = spec;
        lastGoal = goal;
        lastContext = context;
        clearInterval(timer);
        if (progress) progress.textContent = '100%';
        loader.style.display = 'none';
        if (inline) inline.style.display = 'none';
        renderInto(output, spec);
        result.style.display = 'block';
        pulse('done', 'Complete');
        toast('Goal engineered.');
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        clearInterval(timer);
        loader.style.display = 'none';
        if (inline) inline.style.display = 'none';
        runBtn.disabled = false;
        pulse(null, 'Failed');
        toast('Goal engineering failed: ' + err.message);
      } finally {
        clearInterval(timer);
        runBtn.disabled = false;
      }
    });

    const copyBtn = document.getElementById('ge-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      if (!lastSpec) return toast('Engineer a goal first.');
      copyText(toMarkdown(lastSpec), copyBtn);
    });

    const mdBtn = document.getElementById('ge-download-md');
    if (mdBtn) mdBtn.addEventListener('click', () => {
      if (!lastSpec) return toast('Engineer a goal first.');
      download((lastSpec.agent.name || 'goal').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-charter.md',
        toMarkdown(lastSpec), 'text/markdown');
    });

    const jsonBtn = document.getElementById('ge-download-json');
    if (jsonBtn) jsonBtn.addEventListener('click', () => {
      if (!lastSpec) return toast('Engineer a goal first.');
      download((lastSpec.agent.name || 'goal').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-charter.json',
        JSON.stringify(lastSpec, null, 2), 'application/json');
    });

    const toOptimizer = document.getElementById('ge-to-optimizer');
    if (toOptimizer) toOptimizer.addEventListener('click', () => {
      if (!lastSpec) return toast('Engineer a goal first.');
      const draft = document.getElementById('basic-prompt');
      if (draft) draft.value = lastGoal;
      const toggle = document.getElementById('optimizer-goal-toggle');
      if (toggle) toggle.checked = true;
      const tab = document.querySelector('.tab-btn[data-tab="optimizer"]');
      if (tab) tab.click();
      toast('Goal handed to the Optimizer.');
    });

    const toHarness = document.getElementById('ge-to-harness');
    if (toHarness) toHarness.addEventListener('click', () => {
      if (!lastSpec) return toast('Engineer a goal first.');
      const useCase = document.getElementById('hb-usecase');
      if (useCase) useCase.value = lastGoal;
      const toggle = document.getElementById('hb-goal-toggle');
      if (toggle) toggle.checked = true;
      const tab = document.querySelector('.tab-btn[data-tab="harness-builder"]');
      if (tab) tab.click();
      toast('Goal handed to the Harness Builder.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTab);
  } else {
    initTab();
  }

  root.GoalEngine = {
    DEFAULT_MODEL: DEFAULT_MODEL,
    engineer: call,
    engineerCached: engineerCached,
    getCached: getCached,
    normalize: normalize,
    toMarkdown: toMarkdown,
    dossier: dossier,
    rubricTable: rubricTable,
    compact: compact,
    forPrompt: forPrompt,
    renderInto: renderInto,
    toast: toast
  };
})(typeof window !== 'undefined' ? window : globalThis);
