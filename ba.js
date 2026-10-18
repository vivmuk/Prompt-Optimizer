/* ══════════════════════════════════════════════════════════════════════════
   ba.js — "Be Ambitious Prompting" tab.
   Self-contained API layer (app.js helpers live inside its closure and are
   unreachable); falls back to app.js showToast if present.
   All engine prompts derive from Felix Rieseberg's article (13 Oct 2026)
   and the RoboNuggets be-ambitious skill (MIT).
   ══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const BA_MODEL_DEFAULT = '';
  const el = (id) => document.getElementById(id);
  const promptBox = el('ba-prompt');
  const goBtn = el('ba-go');
  const outBox = el('ba-output');
  const statusP = el('ba-status');
  const modelSel = el('ba-model');
  const dlBtn = el('ba-dl-skill');
  if (!goBtn) return;

  /* ── self-contained API + toast layer ── */
  function baToast(msg) {
    if (typeof showToast === 'function') { try { showToast(msg); return; } catch (e) {} }
    statusP.textContent = msg;
    statusP.hidden = false;
  }

  async function baCall(endpoint, body) {
    const userKey = (window.getVeniceKey && window.getVeniceKey()) || '';
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' },
          userKey ? { 'x-venice-key': userKey } : {}),
        body: JSON.stringify(body)
      });
    } catch (error) {
      return { __error: 'Cannot reach the server.', __status: 0 };
    }
    const ctype = response.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      return { __error: 'Server returned a non-JSON response (deploy may be stale).', __status: response.status };
    }
    let data;
    try { data = await response.json(); }
    catch (e) { return { __error: 'Invalid JSON from server.', __status: response.status }; }
    if (!response.ok) {
      return { __error: (data && data.error) || ('Server error ' + response.status), __status: response.status };
    }
    return data;
  }

  function baFailed(r) {
    return !r || !!r.__error || !r.choices || !r.choices[0];
  }

  /* ── model dropdown: mirror the app's loaded text models, fall back quietly ── */
  function fillModels() {
    if (!modelSel) return;
    const models = (typeof loadedModels !== 'undefined' && Array.isArray(loadedModels)) ? loadedModels : [];
    if (!models.length) return;
    const prev = modelSel.value;
    const labelFor = (model) =>
      (model.model_spec && model.model_spec.name) || model.name || model.id;
    modelSel.innerHTML = models
      .map((m) => `<option value="${m.id}">${labelFor(m)}</option>`).join('');
    if (prev && models.some((m) => m.id === prev)) modelSel.value = prev;
  }
  fillModels();
  // populateModelDropdowns() runs after loadVeniceModels() resolves; re-sync then.
  setTimeout(fillModels, 3000);
  setTimeout(fillModels, 8000);

  // Venice text models that are always present and don't burn the budget on
  // hidden reasoning. Used when the shared dropdown hasn't loaded.
  const BA_FALLBACK_MODELS = ['openai-gpt-oss-120b', 'qwen-3-42b', 'llama-3.3-70b'];
  let resolvedModel = null;

  function selectedModel() {
    return (modelSel && modelSel.value) || resolvedModel || BA_MODEL_DEFAULT;
  }

  async function resolveDefaultModel() {
    if (selectedModel()) return;
    const resp = await fetch('/api/models?type=text', {
      headers: (window.getVeniceKey && window.getVeniceKey()) ? { 'x-venice-key': window.getVeniceKey() } : {}
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      const ids = (data && data.data ? data.data : data || []).map((m) => m.id || m);
      for (const cand of BA_FALLBACK_MODELS) {
        if (ids.includes(cand)) { resolvedModel = cand; return; }
      }
      if (ids.length) resolvedModel = ids[0];
      return;
    }
    resolvedModel = BA_FALLBACK_MODELS[0];
  }

  /* ── the engine: three passes composed into one chat call ── */
  const SYSTEM = [
    'You are an ambition-multiplier prompt engineer. Your method comes from Felix Rieseberg\'s article "How to be more ambitious: a tutorial for humans with models" (13 Oct 2026) and the MIT-licensed be-ambitious skill.',
    '',
    'CORE RULES (never violate):',
    '1. Better, not bigger. Never add deliverables, features or side quests. If a change makes the job larger without making it better, drop it.',
    '2. Do what the expert does, not how they talk. Methods and instruments, never role-play vocabulary.',
    '3. An outside judge decides if it worked. The rewritten prompt MUST end with a concrete outside judge — a tool, test, benchmark, reproduction, held-out data or measurement — and what counts as a pass. Never the model judging itself.',
    '4. Treat hard targets as reasonable. State a specific, numeric hard goal. Do not hedge it.',
    '5. Get the access, don\'t fake it. Name required data/tools/access and mark each as present or missing. Never invent sources.',
    '',
    'TYPES OF AMBITION (use only those the user enabled):',
    '- ALTITUDE: infer the goal beyond the goal ("what should happen next?"). Build a 3-rung ladder from the stated task up to the outcome: (1) understand instead of fill in, (2) get to the decisions, (3) replace the ritual with something that achieves the underlying goal durably. If the top rung has no outside judge, stop one rung lower and say so.',
    '- DEPTH: run the Deeper-Not-Bigger meta-prompt: (a) what a top professional would do that the prompt doesn\'t ask for; (b) the rawest material they would start from instead of pre-digested input; (c) the specific methods and tools they would use; (d) what, other than the model or the user, would show the result is right. Set an "unreasonable" goal and treat it as reasonable. Adversarially test the task\'s stated assumptions against raw data. Look for one piece of new knowledge (an unknown early signal, blind spot or simulation) when data allows.',
    '- RANGE: replace the nouns with verbs to name the real activity ("a deck" -> "getting busy people to believe a story and decide under uncertainty in 30 minutes"). Assemble the crew: 2-4 unexpected fields, each with the concrete job they would do and the method or tool they bring. Do, don\'t play — the rewritten prompt must instruct performing the field\'s METHOD, not imitating its voice.',
    '',
    'OUTPUT FORMAT — exactly six labelled sections, plain text, no markdown headers:',
    'GOAL-BEYOND-THE-GOAL: one line.',
    'TYPES: which of the requested types you applied and one line each on why; name skipped types and why.',
    'PLAN: the concrete plan per type (ladder for Altitude; the four meta-prompt answers + hard target for Depth; verbs + crew with methods for Range). Use short bullet lines.',
    'NEEDS: data/tools/access required, each marked [have] or [missing]; empty if none.',
    'REWRITTEN-PROMPT: the full upgraded prompt, between <<<PROMPT>>> and <<<END>>> markers, written as the user would type it, ending with the outside judge and pass criteria.',
    'CHECKLIST: one line reporting the five pre-flight checks (goal, instruments, judge, hard-target, not-bigger) as 5/5 or list which failed and the fix.',
    '',
    'Answer directly with the six sections. Do NOT output a thinking or reasoning section. If your model supports disabling thinking, do so.'
  ].join('\n');

  function userMessage(task, types) {
    const typeLine = types.length
      ? types.map((t) => t[0].toUpperCase() + t.slice(1)).join(', ')
      : 'none selected — still produce the best single-pass rewrite';
    return `Original prompt to upgrade:\n"""\n${task}\n"""\n\nApply ONLY these ambition types: ${typeLine}.\nFollow the OUTPUT FORMAT exactly.`;
  }

  function extract(text) {
    const grab = (label) => {
      const m = new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Z-]+:|$)`, 'i').exec(text);
      return m ? m[1].trim() : '';
    };
    let rewritten = '';
    const pm = /<<<PROMPT>>>([\s\S]*?)(?:<<<END>>>|$)/.exec(text);
    if (pm) rewritten = pm[1].trim();
    return {
      goal: grab('GOAL-BEYOND-THE-GOAL'),
      types: grab('TYPES'),
      plan: grab('PLAN'),
      needs: grab('NEEDS'),
      rewritten,
      judge: grab('OUTSIDE JUDGE') || (rewritten ? 'see end of rewritten prompt' : ''),
      checklist: grab('CHECKLIST')
    };
  }

  /* ── run ── */
  async function run() {
    const task = (promptBox.value || '').trim();
    if (!task) { baToast('Type the prompt you want to make more ambitious.'); return; }
    const types = ['altitude', 'depth', 'range'].filter((t) => el(`ba-${t}`) && el(`ba-${t}`).checked);
    if (!types.length) { baToast('Select at least one ambition type.'); return; }

    goBtn.disabled = true;
    statusP.hidden = false;
    statusP.textContent = 'Multiplying ambition…';
    outBox.hidden = true;

    const endpoint = '/api/chat';
    await resolveDefaultModel();
    const model = selectedModel();
    const body = {
      model: model || undefined,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage(task, types) }
      ],
      temperature: 0.7,
      max_tokens: 3000
    };

    let resp = await baCall(endpoint, body);
    // Reasoning-mode models can burn the entire token budget on thinking and
    // return empty content with finish_reason 'length'. Detect and retry once
    // with double budget before giving up.
    const emptyThinking = (r) => r && !r.__error && r.choices && r.choices[0] &&
      r.choices[0].finish_reason === 'length' &&
      ((r.choices[0].message && r.choices[0].message.content) || '').trim().length < 40;
    if (emptyThinking(resp)) {
      statusP.textContent = 'Model spent its budget thinking; retrying with double…';
      resp = await baCall(endpoint, Object.assign({}, body, { max_tokens: (body.max_tokens || 3000) * 2 }));
    }
    goBtn.disabled = false;
    if (baFailed(resp)) {
      statusP.textContent = resp && resp.__error ? resp.__error : 'The model returned no usable output. Try again or pick another model.';
      return;
    }
    const text = resp.choices[0].message.content || '';
    const out = extract(text);

    if (!out.rewritten) {
      statusP.textContent = 'The model did not return a rewritten prompt. Retrying once with a stricter format request…';
      body.messages.push({ role: 'assistant', content: text });
      body.messages.push({ role: 'user', content: 'You omitted the <<<PROMPT>>>…<<<END>>> block. Regenerate the full six-section output with the rewritten prompt inside <<<PROMPT>>> and <<<END>>> markers. Output nothing else.' });
      const resp2 = await baCall(endpoint, body);
      if (baFailed(resp2)) {
        statusP.textContent = 'Retry failed. Try another model.';
        return;
      }
      Object.assign(out, extract(resp2.choices[0].message.content));
      if (!out.rewritten) { statusP.textContent = 'No rewritten prompt produced. Try another model.'; return; }
    }

    el('ba-goal').textContent = out.goal || '—';
    el('ba-plan').textContent = [out.types, '', out.plan, out.needs ? `\nNeeds: ${out.needs}` : '']
      .filter(Boolean).join('\n');
    el('ba-rewritten').textContent = out.rewritten;
    el('ba-judge').textContent = out.judge || '—';
    statusP.textContent = out.checklist || 'Done.';
    outBox.hidden = false;

    el('ba-rewritten').onclick = () => {
      navigator.clipboard.writeText(out.rewritten).then(
        () => baToast('Ambitious prompt copied.'),
        () => showToast('Copy failed — select the text manually.')
      );
    };
  }
  goBtn.addEventListener('click', () => {
    run().catch((e) => {
      goBtn.disabled = false;
      statusP.hidden = false;
      statusP.textContent = 'Engine error: ' + (e && e.message ? e.message : e);
    });
  });
  promptBox.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
  });

  /* ── skill download ── */
  if (dlBtn) {
    dlBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = 'skills/be-ambitious/SKILL.md';
      a.download = 'be-ambitious-SKILL.md';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  /* ── skill library cards (one per tab) ── */
  const LIB = [
    { id: 'be-ambitious', title: 'Be Ambitious', desc: 'Altitude/Depth/Range multiplies any prompt or task. v2 improved edition: pre-flight checklist, fallback judge ladder, JSON mode.' },
    { id: 'prompt-optimizer', title: 'Prompt Optimizer', desc: 'Turns a rough draft into an engineered prompt: role, context, constraints, output contract and self-check.' },
    { id: 'model-tuner', title: 'Model Tuner', desc: 'Pick the right model per task and rewrite the prompt the way that model reads best.' },
    { id: 'agent-builder', title: 'Agent Builder', desc: 'Design a complete agent spec: charter, tool table, operating loop, stop conditions and guardrails.' },
    { id: 'harness-builder', title: 'Harness Builder', desc: 'Design the full harness environment: rules, playbooks, hooks, MCP wiring and failure policy.' },
    { id: 'skill-creator', title: 'Skill Creator', desc: 'Author robust SKILL.md packages — trigger-rich descriptions, literals, verification — validated by cold execution.' },
    { id: 'agent-rules', title: 'Agent Rules', desc: 'Write AGENTS.md-style rules agents actually obey: scope, literal verification commands, safety, escalation.' },
    { id: 'plugin-builder', title: 'Plugin Builder', desc: 'Package agent plugins: manifest, commands, skills, hooks and MCP config with acceptance tests.' },
    { id: 'loop-design', title: 'Loop Design', desc: 'Design automation loops: diffable triggers, proof artifacts, state schemas and poison-pill rules.' },
    { id: 'content-loop', title: 'Content Loop', desc: 'Run a research→draft→critique→revise content engine that consumes last cycle\'s metrics.' },
    { id: 'gauntlet-loop', title: 'Gauntlet Loop', desc: 'Fan-out parallel dimension owners and an adversarial critic with blind-comparison exit gate.' }
  ];
  const lib = el('skill-library');
  if (lib) {
    lib.innerHTML = LIB.map((s) => `
      <div class="ba-card">
        <h4>${s.title}</h4>
        <p>${s.desc}</p>
        <a href="skills/viv-${s.id}/SKILL.md" download="viv-${s.id}.md">⬇︎ Download viv-${s.id}.md</a>
      </div>`).join('');
  }
});


/* ═══ Skill Vault tab ═══ */
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('vault-grid');
  if (!grid) return;
  const CAT = {
    'be-ambitious': 'Ambition', 'prompt-optimizer': 'Compose', 'model-tuner': 'Compose',
    'agent-builder': 'Package', 'harness-builder': 'Package', 'skill-creator': 'Package',
    'agent-rules': 'Package', 'plugin-builder': 'Package', 'loop-design': 'Loops',
    'content-loop': 'Loops', 'gauntlet-loop': 'Loops'
  };
  grid.innerHTML = LIB.map((s) => `
    <div class="vault-card">
      <h4>${s.title}</h4>
      <p>${s.desc}</p>
      <span class="vault-file">skills/viv-${s.id}/SKILL.md · ${CAT[s.id] || 'General'}</span>
      <a href="skills/viv-${s.id}/SKILL.md" download="viv-${s.id}.md">⬇ Download viv-${s.id}.md</a>
    </div>`).join('');

  const zipBtn = document.getElementById('vault-dl-all');
  if (zipBtn) zipBtn.addEventListener('click', async () => {
    zipBtn.disabled = true;
    const old = zipBtn.textContent;
    zipBtn.textContent = 'Zipping…';
    try {
      if (!window.JSZip) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const zip = new window.JSZip();
      const results = await Promise.all(LIB.map(async (s) => {
        const r = await fetch(`skills/viv-${s.id}/SKILL.md`);
        if (!r.ok) throw new Error(`viv-${s.id}: ${r.status}`);
        zip.file(`viv-${s.id}/SKILL.md`, await r.text());
      }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'viv-skills-pack.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      zipBtn.textContent = old;
      zipBtn.disabled = false;
    } catch (e) {
      zipBtn.textContent = 'Zip failed — download individually';
      setTimeout(() => { zipBtn.textContent = old; zipBtn.disabled = false; }, 3000);
    }
  });
});
