/* ══════════════════════════════════════════════════════════════════════════
   generators.js — Content Loop + Gauntlet Loop, and the orchestration
   plumbing shared by every workspace.

   Additive only. app.js owns the Optimizer, Agent Builder, Skills, Plugin
   Builder and Loop Design tabs and is not modified by this file; the code
   below observes those tabs rather than reaching into them.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Small shared helpers ───────────────────────────────────────────── */

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Copied to clipboard!');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1800);
      }
    }).catch(() => toast('Copy failed — select and copy manually.'));
  }

  function download(filename, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function slug(s, fallback) {
    const out = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 48);
    return out || fallback || 'output';
  }

  /* Pull the first balanced JSON object or array out of a model response. */
  function extractJson(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/```json/gi, '```').replace(/```/g, '');
    const starts = [text.indexOf('{'), text.indexOf('[')].filter(i => i >= 0);
    if (!starts.length) return null;
    const start = Math.min.apply(null, starts);
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, escNext = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escNext) { escNext = false; continue; }
      if (ch === '\\') { escNext = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
        }
      }
    }
    try { return JSON.parse(text.slice(start)); } catch (e) { return null; }
  }

  /* ── Venice transport ───────────────────────────────────────────────── */

  async function chat(model, system, user, opts) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        model: model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.7,
        max_tokens: 4000
      }, opts || {}))
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || ('Venice returned ' + res.status));
    }
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (!content) throw new Error('Venice returned an empty completion.');
    return content;
  }

  async function chatJson(model, system, user, opts) {
    const content = await chat(model, system, user, opts);
    const parsed = extractJson(content);
    if (!parsed) throw new Error('Model did not return parseable JSON.');
    return parsed;
  }

  /* Aspect-ratio models (nano-banana family) and width/height models take
     different sizing idioms — send whichever the chosen model understands. */
  async function generateImage(model, prompt, aspect) {
    const body = { model: model, prompt: String(prompt).slice(0, 1400), format: 'webp', safe_mode: true };
    if (/^nano-banana/.test(model)) {
      body.aspect_ratio = aspect || '16:9';
      body.resolution = '1K';
    } else {
      const dims = (aspect === '1:1') ? [1024, 1024] : [1216, 704];
      body.width = dims[0];
      body.height = dims[1];
    }
    const res = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('Image API returned ' + res.status));
    const b64 = data && data.images && data.images[0];
    if (!b64) throw new Error('No image returned.');
    return 'data:' + sniffImageMime(b64) + ';base64,' + b64;
  }

  /* We ask Venice for webp, but a model is free to hand back png or jpeg.
     Read the magic bytes off the base64 rather than trusting the request. */
  function sniffImageMime(b64) {
    if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (b64.startsWith('/9j/')) return 'image/jpeg';
    if (b64.startsWith('R0lGOD')) return 'image/gif';
    return 'image/webp';
  }

  /* ── Pipeline tracker ───────────────────────────────────────────────── */

  function Pipeline(mountId, steps) {
    const mount = $('#' + mountId);
    this.steps = steps.slice();
    this.mount = mount;
    this.render();
  }

  Pipeline.prototype.render = function () {
    if (!this.mount) return;
    this.mount.innerHTML = this.steps.map((s, i) => `
      <div class="pipeline-step" data-step="${esc(s.key)}">
        <span class="pipeline-marker">${String(i + 1).padStart(2, '0')}</span>
        <span class="pipeline-label">${esc(s.label)}</span>
        <span class="pipeline-note">Queued</span>
      </div>`).join('');
  };

  Pipeline.prototype.set = function (key, state, note) {
    if (!this.mount) return;
    const row = $(`[data-step="${key}"]`, this.mount);
    if (!row) return;
    row.classList.remove('is-active', 'is-done', 'is-failed');
    if (state) row.classList.add('is-' + state);
    const noteEl = $('.pipeline-note', row);
    if (noteEl) {
      noteEl.textContent = note || ({
        active: 'Running', done: 'Done', failed: 'Failed'
      }[state] || 'Queued');
    }
    if (state === 'done') {
      const marker = $('.pipeline-marker', row);
      if (marker) marker.textContent = '✓';
    }
  };

  Pipeline.prototype.reset = function () { this.render(); };

  /* ── Stage pulse: reflects run state in each orchestration header ────── */

  function pulse(tabId, state, text) {
    const el = $(`.stage-pulse[data-pulse-for="${tabId}"]`);
    if (!el) return;
    el.classList.remove('is-live', 'is-done');
    if (state) el.classList.add('is-' + state);
    const label = $('.pulse-text', el);
    if (label) label.textContent = text || (state === 'live' ? 'Running' : state === 'done' ? 'Complete' : 'Idle');
  }

  function hideEmpty(tabId) {
    const el = $(`.stage-empty[data-empty-for="${tabId}"]`);
    if (el) el.style.display = 'none';
  }

  /* Mirror the legacy tabs' loaders/results into the orchestration header
     and dismiss their empty states — without touching app.js. */
  function observeLegacyTabs() {
    const map = [
      { tab: 'optimizer',        loader: 'optimizer-loader',        results: ['optimizer-result'] },
      { tab: 'agent-builder',    loader: 'agent-loader',            results: ['agent-result'] },
      { tab: 'anthropic-skills', loader: 'anthropic-skill-loader',  results: ['anthropic-skill-analysis', 'anthropic-skill-result'] },
      { tab: 'plugin-builder',   loader: 'plugin-loader',           results: ['plugin-result'] },
      { tab: 'loop-design',      loader: 'loop-loader',             results: ['loop-result'] }
    ];

    const visible = el => !!el && el.style.display !== 'none' && el.offsetParent !== null;

    map.forEach(entry => {
      const loader = document.getElementById(entry.loader);
      const results = entry.results.map(id => document.getElementById(id)).filter(Boolean);
      const watched = [loader].concat(results).filter(Boolean);
      if (!watched.length) return;

      const sync = () => {
        const running = visible(loader);
        const done = results.some(visible);
        if (running || done) hideEmpty(entry.tab);
        if (running) pulse(entry.tab, 'live', 'Running');
        else if (done) pulse(entry.tab, 'done', 'Complete');
        else pulse(entry.tab, null, 'Idle');
      };

      const mo = new MutationObserver(sync);
      watched.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['style'] }));
      sync();
    });
  }

  /* ── Model dropdowns for the new tabs ───────────────────────────────── */

  const FALLBACK_MODELS = [
    { id: 'deepseek-r1-671b-thinking', name: 'DeepSeek R1 671B' },
    { id: 'zai-org-glm-4.7', name: 'GLM 4.7' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'qwen3-235b-a22b-thinking-2507', name: 'Qwen 3 235B' },
    { id: 'venice-uncensored', name: 'Venice Uncensored' }
  ];

  function fillModels(select, models, preferred) {
    if (!select) return;
    select.innerHTML = '';
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name || m.id;
      select.appendChild(o);
    });
    const match = models.find(m => m.id === preferred);
    if (match) select.value = match.id;
  }

  async function loadModels() {
    const dot = $('#api-dot');
    let text = [], models = FALLBACK_MODELS;
    try {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (data && Array.isArray(data.data) && data.data.length) {
        text = data.data.filter(m => !m.type || m.type === 'text');
        models = text.length ? text : data.data;
        if (dot) dot.classList.remove('is-down');
      }
    } catch (e) {
      if (dot) { dot.classList.add('is-down'); dot.title = 'Venice proxy unreachable — using default model list'; }
    }
    fillModels($('#cl-model'), models, 'zai-org-glm-4.7');
    fillModels($('#gl-model'), models, 'deepseek-r1-671b-thinking');
  }

  /* ── Generic control wiring: chips, segmented, ranges ───────────────── */

  function wireChips(containerId, multi) {
    const box = $('#' + containerId);
    if (!box) return;
    $$('.chip', box).forEach(chip => {
      chip.addEventListener('click', () => {
        if (multi) {
          chip.classList.toggle('selected');
          if (!$$('.chip.selected', box).length) chip.classList.add('selected');
        } else {
          $$('.chip', box).forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        }
      });
    });
  }

  function chipValues(containerId, attr) {
    const box = $('#' + containerId);
    if (!box) return [];
    return $$('.chip.selected', box).map(c => c.dataset[attr]);
  }

  function wireSegmented(containerId) {
    const box = $('#' + containerId);
    if (!box) return;
    $$('button', box).forEach(btn => {
      btn.addEventListener('click', () => {
        $$('button', box).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function segmentedValue(containerId, fallback) {
    const active = $(`#${containerId} button.active`);
    return active ? active.dataset.heat : fallback;
  }

  function wireRange(inputId, outputId) {
    const input = $('#' + inputId), out = $('#' + outputId);
    if (!input || !out) return;
    const sync = () => { out.textContent = input.value; };
    input.addEventListener('input', sync);
    sync();
  }

  /* ══════════════════════════════════════════════════════════════════════
     CONTENT LOOP
     ══════════════════════════════════════════════════════════════════════ */

  const CL_STEPS = [
    { key: 'strategy', label: 'Compile content strategy' },
    { key: 'calendar', label: 'Lay out the cycle calendar' },
    { key: 'drafts',   label: 'Write channel-native drafts' },
    { key: 'visuals',  label: 'Generate key visuals' },
    { key: 'assemble', label: 'Assemble automation spec' }
  ];

  const CL_STRATEGIST = `You are a Content Loop Architect. You do not write one-off posts — you design a repeatable content ENGINE that a human or an autonomous agent can run every cycle, forever, and that gets measurably better each turn.

An engine has five moving parts:
1. PILLARS — the 3-5 recurring territories the brand owns. Each pillar carries a promise and the proof sources that keep it honest.
2. CADENCE — when the loop fires and how much it produces per cycle.
3. PRODUCTION — how one core idea becomes many channel-native artifacts.
4. MEASUREMENT — the specific numbers that decide what gets repeated and what gets killed.
5. FEEDBACK — how this cycle's data changes next cycle's inputs. Without this it is a calendar, not a loop.

Rules:
- Be specific to the subject given. Generic marketing filler is a failure.
- Every KPI must name the instrument that reads it.
- kill_criteria must be numeric and unambiguous.
- Never invent statistics or cite sources you cannot name.

Respond with ONLY this JSON object, no prose and no code fences:
{
  "engine_name": "short memorable name for this content engine",
  "positioning": "one sentence on the conversation this engine is trying to own",
  "audience": "who this reaches, precisely",
  "voice": "3-6 words describing the voice",
  "pillars": [{"name":"", "promise":"", "proof_sources":[""]}],
  "cadence": {"rhythm":"", "per_cycle": 0, "best_times":[""]},
  "trigger": "what starts each cycle",
  "kpis": [{"metric":"", "target":"", "instrument":""}],
  "repurpose_chain": [{"from":"", "to":"", "transform":""}],
  "feedback_loop": {"collect":[""], "decide":[""], "adjust":[""], "kill_criteria":[""]},
  "memory": ["what the engine must remember between cycles"],
  "stop_conditions": ["when a human must be pulled in"]
}`;

  const CL_CALENDAR = `You are the scheduling half of a Content Loop. Given a content strategy, lay out one full cycle as concrete, dated slots.

Rules:
- Produce exactly the number of items requested.
- Spread items across the requested channels and pillars — do not stack one channel.
- The hook is the actual first line the audience sees. Make it earn the second line.
- image_prompt describes a single still image with no text in it, in plain visual language a text-to-image model can render.

Respond with ONLY a JSON array, no prose and no code fences:
[{"slot":"Cycle 1 · Mon AM","pillar":"","channel":"","format":"","hook":"","angle":"","cta":"","image_prompt":""}]`;

  const CL_DRAFTS = `You are the drafting half of a Content Loop. Turn calendar slots into finished, channel-native copy.

Rules:
- Match each channel's real conventions: LinkedIn breathes with line breaks, X is compressed, a newsletter has a subject line and a body, a blog needs structure, video formats need a beat-by-beat script.
- Open with the given hook, or a sharper version of it.
- No invented statistics, no fake case studies, no fabricated quotes.
- notes says what a human must verify or supply before this ships.

Respond with ONLY a JSON array, no prose and no code fences:
[{"channel":"","title":"","body":"","hashtags":[""],"notes":""}]`;

  let clState = null;
  let clPipeline = null;

  function clRender(view) {
    const out = $('#cl-output');
    if (!out || !clState) return;

    if (view === 'calendar') {
      out.innerHTML = '<div class="calendar-list">' + (clState.calendar || []).map(item => `
        <div class="calendar-row">
          <div class="calendar-slot">${esc(item.slot || '—')}</div>
          <div>
            <div class="calendar-hook">${esc(item.hook || '(no hook)')}</div>
            <div class="calendar-meta">
              ${item.channel ? `<span class="tag channel">${esc(item.channel)}</span>` : ''}
              ${item.pillar ? `<span class="tag pillar">${esc(item.pillar)}</span>` : ''}
              ${item.format ? `<span class="tag format">${esc(item.format)}</span>` : ''}
            </div>
            ${item.angle ? `<div class="calendar-angle">${esc(item.angle)}</div>` : ''}
            ${item.cta ? `<div class="calendar-cta"><strong>CTA</strong>${esc(item.cta)}</div>` : ''}
          </div>
        </div>`).join('') + '</div>';
      return;
    }

    if (view === 'drafts') {
      const drafts = clState.drafts || [];
      if (!drafts.length) { out.innerHTML = '<p class="prose">No drafts generated.</p>'; return; }
      out.innerHTML = drafts.map((d, i) => `
        <div class="draft">
          <div class="draft-head">
            <span class="tag channel">${esc(d.channel || '—')}</span>
            <h4>${esc(d.title || 'Untitled')}</h4>
            <button class="copy-btn" data-copy-draft="${i}">Copy</button>
          </div>
          <div class="draft-body">${esc(d.body || '')}</div>
          ${(d.hashtags && d.hashtags.length) ? `<div class="draft-foot">${esc(d.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' '))}</div>` : ''}
          ${d.notes ? `<div class="draft-foot">Before shipping: ${esc(d.notes)}</div>` : ''}
        </div>`).join('');
      $$('[data-copy-draft]', out).forEach(btn => {
        btn.addEventListener('click', () => {
          const d = drafts[Number(btn.dataset.copyDraft)];
          copyText([d.title, '', d.body, '', (d.hashtags || []).join(' ')].join('\n').trim(), btn);
        });
      });
      return;
    }

    if (view === 'visuals') {
      const visuals = clState.visuals || [];
      if (!visuals.length) {
        out.innerHTML = '<p class="prose">Visual generation was switched off for this run. Turn on <em>Generate key visuals with Venice</em> and recompile.</p>';
        return;
      }
      out.innerHTML = '<div class="visual-grid">' + visuals.map(v => `
        <div class="visual">
          <div class="visual-frame${v.src ? '' : (v.error ? '' : ' is-pending')}">
            ${v.src
              ? `<img src="${v.src}" alt="${esc(v.slot || 'Generated visual')}">`
              : `<span class="visual-fallback">${esc(v.error || 'Generating…')}</span>`}
          </div>
          <div class="visual-caption">
            <strong>${esc(v.slot || 'Visual')}</strong>
            ${esc(v.prompt || '')}
          </div>
        </div>`).join('') + '</div>';
      return;
    }

    if (view === 'blueprint') {
      out.innerHTML = '<div class="prose">' + clBlueprintHtml() + '</div>';
      return;
    }

    out.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(JSON.stringify(clExport(), null, 2))}</pre>`;
  }

  function clBlueprintHtml() {
    const s = clState.strategy || {};
    const list = arr => '<ul>' + (arr || []).map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
    let h = '';
    h += `<h4>${esc(s.engine_name || 'Content Engine')}</h4>`;
    if (s.positioning) h += `<p>${esc(s.positioning)}</p>`;
    h += `<h4>Audience &amp; voice</h4><p>${esc(s.audience || '—')}<br><code>${esc(s.voice || '—')}</code></p>`;

    h += '<h4>Pillars</h4><ul>' + (s.pillars || []).map(p =>
      `<li><strong>${esc(p.name)}</strong> — ${esc(p.promise)}${(p.proof_sources && p.proof_sources.length)
        ? `<br><em>Proof:</em> ${esc(p.proof_sources.join(', '))}` : ''}</li>`).join('') + '</ul>';

    const c = s.cadence || {};
    h += `<h4>Cadence</h4><p>${esc(c.rhythm || '—')} · ${esc(c.per_cycle || 0)} pieces per cycle`;
    if (c.best_times && c.best_times.length) h += `<br>Best times: ${esc(c.best_times.join(', '))}`;
    h += `</p>`;
    if (s.trigger) h += `<p><strong>Trigger:</strong> ${esc(s.trigger)}</p>`;

    h += '<h4>KPIs</h4><ul>' + (s.kpis || []).map(k =>
      `<li><strong>${esc(k.metric)}</strong> → ${esc(k.target)} <em>(${esc(k.instrument)})</em></li>`).join('') + '</ul>';

    h += '<h4>Repurpose chain</h4><ul>' + (s.repurpose_chain || []).map(r =>
      `<li><code>${esc(r.from)}</code> → <code>${esc(r.to)}</code> — ${esc(r.transform)}</li>`).join('') + '</ul>';

    const f = s.feedback_loop || {};
    h += '<h4>Feedback loop</h4>';
    h += '<p><strong>Collect</strong></p>' + list(f.collect);
    h += '<p><strong>Decide</strong></p>' + list(f.decide);
    h += '<p><strong>Adjust</strong></p>' + list(f.adjust);
    h += '<p><strong>Kill criteria</strong></p>' + list(f.kill_criteria);

    if (s.memory) h += '<h4>Cycle memory</h4>' + list(s.memory);
    if (s.stop_conditions) h += '<h4>Escalate to a human when</h4>' + list(s.stop_conditions);
    return h;
  }

  function clExport() {
    if (!clState) return {};
    return {
      generated_at: new Date().toISOString(),
      inputs: clState.inputs,
      strategy: clState.strategy,
      calendar: clState.calendar,
      drafts: clState.drafts,
      visual_prompts: (clState.visuals || []).map(v => ({ slot: v.slot, prompt: v.prompt, generated: !!v.src }))
    };
  }

  function clMarkdown() {
    const s = clState.strategy || {};
    let md = `# ${s.engine_name || 'Content Loop'}\n\n`;
    md += `> ${s.positioning || ''}\n\n`;
    md += `**Audience:** ${s.audience || '—'}  \n**Voice:** ${s.voice || '—'}\n\n`;

    md += `## Pillars\n\n`;
    (s.pillars || []).forEach(p => {
      md += `### ${p.name}\n${p.promise}\n\n`;
      if (p.proof_sources && p.proof_sources.length) md += `_Proof sources:_ ${p.proof_sources.join(', ')}\n\n`;
    });

    const c = s.cadence || {};
    md += `## Cadence\n\n${c.rhythm || '—'} · ${c.per_cycle || 0} pieces per cycle\n\n`;
    if (s.trigger) md += `**Trigger:** ${s.trigger}\n\n`;

    md += `## KPIs\n\n| Metric | Target | Instrument |\n| --- | --- | --- |\n`;
    (s.kpis || []).forEach(k => { md += `| ${k.metric} | ${k.target} | ${k.instrument} |\n`; });
    md += `\n`;

    md += `## Calendar\n\n`;
    (clState.calendar || []).forEach(i => {
      md += `### ${i.slot} — ${i.channel}\n`;
      md += `**Hook:** ${i.hook}\n\n`;
      if (i.angle) md += `${i.angle}\n\n`;
      md += `- Pillar: ${i.pillar}\n- Format: ${i.format}\n- CTA: ${i.cta}\n`;
      if (i.image_prompt) md += `- Visual: ${i.image_prompt}\n`;
      md += `\n`;
    });

    md += `## Drafts\n\n`;
    (clState.drafts || []).forEach(d => {
      md += `### ${d.channel} — ${d.title}\n\n${d.body}\n\n`;
      if (d.hashtags && d.hashtags.length) md += `${d.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')}\n\n`;
      if (d.notes) md += `> Before shipping: ${d.notes}\n\n`;
    });

    const f = s.feedback_loop || {};
    md += `## Feedback loop\n\n`;
    ['collect', 'decide', 'adjust', 'kill_criteria'].forEach(k => {
      if (f[k] && f[k].length) {
        md += `**${k.replace('_', ' ')}**\n`;
        f[k].forEach(x => { md += `- ${x}\n`; });
        md += `\n`;
      }
    });

    if (s.memory && s.memory.length) {
      md += `## Cycle memory\n\n`;
      s.memory.forEach(m => { md += `- ${m}\n`; });
      md += `\n`;
    }
    if (s.stop_conditions && s.stop_conditions.length) {
      md += `## Escalate to a human when\n\n`;
      s.stop_conditions.forEach(m => { md += `- ${m}\n`; });
      md += `\n`;
    }
    return md;
  }

  async function runContentLoop() {
    const topic = ($('#cl-topic').value || '').trim();
    if (!topic) { toast('Describe the brand, product or topic first.'); $('#cl-topic').focus(); return; }

    const inputs = {
      topic: topic,
      audience: ($('#cl-audience').value || '').trim() || 'not specified — infer a plausible primary audience',
      channels: chipValues('cl-channels', 'channel'),
      cadence: $('#cl-cadence').value,
      count: Number($('#cl-count').value),
      tone: ($('#cl-tone').value || '').trim() || 'clear, specific, no hype',
      visuals: $('#cl-visuals').checked,
      imageStyle: ($('#cl-image-style').value || '').trim() || 'clean editorial photography, natural light, no text in image',
      model: $('#cl-model').value,
      imageModel: $('#cl-image-model').value
    };

    const btn = $('#cl-run-btn');
    const status = $('#cl-inline-status');
    btn.disabled = true;
    status.style.display = '';
    status.classList.add('running');
    $('#cl-progress').textContent = 'Running';
    hideEmpty('content-loop');
    pulse('content-loop', 'live', 'Running');

    $('#cl-run').style.display = 'block';
    $('#cl-result').style.display = 'none';
    $('#cl-metrics-panel').style.display = 'none';
    clPipeline.reset();
    clState = { inputs: inputs, visuals: [] };

    try {
      /* 1 — strategy */
      clPipeline.set('strategy', 'active');
      clState.strategy = await chatJson(inputs.model, CL_STRATEGIST,
        `SUBJECT\n${inputs.topic}\n\nAUDIENCE\n${inputs.audience}\n\nCHANNELS\n${inputs.channels.join(', ')}\n\nCADENCE\n${inputs.cadence}, ${inputs.count} pieces per cycle\n\nVOICE\n${inputs.tone}\n\nDesign the content engine.`);
      clPipeline.set('strategy', 'done', (clState.strategy.pillars || []).length + ' pillars');

      renderClMetrics();

      /* 2 — calendar */
      clPipeline.set('calendar', 'active');
      const cal = await chatJson(inputs.model, CL_CALENDAR,
        `STRATEGY\n${JSON.stringify(clState.strategy)}\n\nCHANNELS\n${inputs.channels.join(', ')}\n\nCADENCE\n${inputs.cadence}\n\nProduce exactly ${inputs.count} calendar items for one full cycle.`);
      clState.calendar = Array.isArray(cal) ? cal.slice(0, inputs.count) : (cal.calendar || []);
      clPipeline.set('calendar', 'done', clState.calendar.length + ' slots');

      /* 3 — drafts */
      clPipeline.set('drafts', 'active');
      const drafts = await chatJson(inputs.model, CL_DRAFTS,
        `VOICE\n${inputs.tone}\n\nAUDIENCE\n${clState.strategy.audience || inputs.audience}\n\nSLOTS\n${JSON.stringify(clState.calendar)}\n\nWrite one finished draft per slot, in the same order.`,
        { max_tokens: 6000 });
      clState.drafts = Array.isArray(drafts) ? drafts : (drafts.drafts || []);
      clPipeline.set('drafts', 'done', clState.drafts.length + ' drafts');

      /* 4 — visuals */
      if (inputs.visuals) {
        clPipeline.set('visuals', 'active');
        const targets = clState.calendar.filter(i => i.image_prompt).slice(0, 4);
        if (!targets.length) {
          clPipeline.set('visuals', 'done', 'none requested');
        } else {
          clState.visuals = targets.map(t => ({ slot: t.slot, prompt: t.image_prompt }));
          let made = 0;
          for (let i = 0; i < clState.visuals.length; i++) {
            const v = clState.visuals[i];
            clPipeline.set('visuals', 'active', `${i + 1} of ${clState.visuals.length}`);
            try {
              v.src = await generateImage(inputs.imageModel, `${v.prompt}. Style: ${inputs.imageStyle}.`, '16:9');
              made++;
            } catch (err) {
              v.error = 'Not generated — ' + err.message;
            }
            if ($('.out-tab.active[data-cl-out="visuals"]')) clRender('visuals');
          }
          clPipeline.set('visuals', made ? 'done' : 'failed', made + ' of ' + clState.visuals.length);
        }
      } else {
        clPipeline.set('visuals', 'done', 'skipped');
      }

      /* 5 — assemble */
      clPipeline.set('assemble', 'active');
      renderClMetrics();
      $('#cl-result').style.display = 'block';
      clRender(activeClView());
      clPipeline.set('assemble', 'done', 'ready');

      pulse('content-loop', 'done', 'Complete');
      toast('Content loop compiled.');
    } catch (err) {
      console.error('[content-loop]', err);
      const active = $('#cl-pipeline .pipeline-step.is-active');
      if (active) clPipeline.set(active.dataset.step, 'failed', 'Failed');
      pulse('content-loop', null, 'Failed');
      toast('Content loop failed: ' + err.message);
    } finally {
      btn.disabled = false;
      status.classList.remove('running');
      status.style.display = 'none';
    }
  }

  function renderClMetrics() {
    const s = clState.strategy || {};
    const panel = $('#cl-metrics-panel');
    if (!panel) return;
    panel.style.display = 'block';
    $('#cl-metrics').innerHTML = `
      <div class="metric"><div class="metric-value accent">${(s.pillars || []).length}</div><div class="metric-label">Pillars</div></div>
      <div class="metric"><div class="metric-value">${(clState.calendar || []).length || clState.inputs.count}</div><div class="metric-label">Slots</div></div>
      <div class="metric"><div class="metric-value">${clState.inputs.channels.length}</div><div class="metric-label">Channels</div></div>
      <div class="metric"><div class="metric-value jade">${(s.kpis || []).length}</div><div class="metric-label">KPIs</div></div>`;
    $('#cl-strategy-summary').innerHTML =
      `<h4>${esc(s.engine_name || 'Content Engine')}</h4><p>${esc(s.positioning || '')}</p>`;
  }

  function activeClView() {
    const t = $('.out-tab.active[data-cl-out]');
    return t ? t.dataset.clOut : 'calendar';
  }

  /* ══════════════════════════════════════════════════════════════════════
     GAUNTLET LOOP
     ══════════════════════════════════════════════════════════════════════ */

  const GL_STEPS = [
    { key: 'forge',    label: 'Forge the gauntlet spec' },
    { key: 'harden',   label: 'Adversarial critic pass' },
    { key: 'assemble', label: 'Assemble the runnable prompt' }
  ];

  const GL_FORGE = `You are a Gauntlet Architect. A GAUNTLET is a quality loop that refuses to accept "good enough": work is fanned out to parallel specialist sub-agents, then judged by an adversarial critic against a named gold standard, and the loop only exits when the critic — who is trying to fail it — cannot.

You are not building the thing. You are designing the gauntlet that forces the thing to become excellent.

Design principles you must honour:
- Every sub-agent owns exactly ONE dimension. Overlapping mandates produce mush.
- Every sub-agent has a deliverable that can be inspected, and a done_when that a third party could check.
- The rubric turns "looks good" into scored dimensions with weights that sum to 100.
- The critic is adversarial: its job is to find the tell that gives the work away as amateur.
- Every stop condition is observable. "Until it feels right" is a failure.
- Anti-gaming rules stop the loop from being satisfied by self-report. Evidence, not claims.

Respond with ONLY this JSON object, no prose and no code fences:
{
  "gauntlet_name": "short name",
  "objective": "one sentence restating what must be built",
  "benchmark": {
    "name": "the gold standard being matched or beaten",
    "why_it_wins": ["the specific things the gold standard does well"],
    "observable_tells": ["concrete signals that separate professional work from amateur work in this domain"]
  },
  "agents": [{"name":"", "mandate":"", "owns":[""], "deliverable":"", "done_when":""}],
  "rubric": [{"dimension":"", "what_good_looks_like":"", "weight":0, "pass_bar":0}],
  "pass_threshold": 0,
  "blind_protocol": ["ordered steps for judging the build against the benchmark without knowing which is which"],
  "loop_control": {
    "max_iterations": 0,
    "per_round": ["what happens on every iteration, in order"],
    "escalation": ["what changes when a round fails to improve the score"],
    "stop_conditions": [{"kind":"pass|fail|loop", "condition":""}]
  },
  "evidence_requirements": ["what each round must produce as proof"],
  "anti_gaming_rules": ["rules that stop the loop declaring victory without earning it"]
}`;

  const GL_CRITIC = `You are the Gauntlet Critic — a hostile reviewer of gauntlet designs. You have watched a hundred of these loops declare victory on mediocre work. Assume this one will too, and find out how.

Interrogate the spec for:
- Rubric dimensions vague enough to be self-graded generously.
- Weights that do not sum to 100, or a pass_threshold that is trivially clearable.
- Sub-agents with overlapping mandates, or a dimension of quality with no owner at all.
- done_when conditions that cannot be checked by anyone but the agent that wrote them.
- A blind protocol that is not actually blind — anything that leaks which artifact is which.
- Stop conditions that let the loop exit on effort ("tried 5 times") rather than on quality.
- Missing evidence requirements: any round that can pass on assertion alone.

Then repair the spec yourself. Return the fully corrected spec, not advice.

Respond with ONLY this JSON object, no prose and no code fences:
{
  "verdict": "approved | revised | rejected",
  "findings": [{"severity":"high|medium|low", "category":"", "issue":"", "fix_applied":""}],
  "final_spec": { ...the complete corrected gauntlet spec, same schema as the input... }
}`;

  let glState = null;
  let glPipeline = null;

  function glBuildPrompt(spec, inputs) {
    const b = spec.benchmark || {};
    const lc = spec.loop_control || {};
    const heat = {
      fair:   'Be a fair but demanding reviewer.',
      harsh:  'Be a harsh critic. Withhold approval by default; make the work earn it.',
      brutal: 'Be a brutal critic. Assume the work is mediocre until proven otherwise, and say so in specific, unflattering detail.'
    }[inputs.heat] || 'Be a harsh critic.';

    let p = '';
    p += `# ${spec.gauntlet_name || 'Gauntlet Loop'}\n\n`;
    p += `## Objective\n${spec.objective || inputs.objective}\n\n`;
    if (inputs.constraints) p += `**Constraints:** ${inputs.constraints}\n\n`;

    p += `## The standard you must beat\n**${b.name || inputs.benchmark}**\n\n`;
    if (b.why_it_wins && b.why_it_wins.length) {
      p += `It wins because:\n`;
      b.why_it_wins.forEach(x => { p += `- ${x}\n`; });
      p += `\n`;
    }
    if (b.observable_tells && b.observable_tells.length) {
      p += `Signals that separate professional from amateur work here:\n`;
      b.observable_tells.forEach(x => { p += `- ${x}\n`; });
      p += `\n`;
    }

    p += `## Fan out\nSpawn these ${(spec.agents || []).length} sub-agents in parallel. Each owns exactly one dimension and reports back with an inspectable deliverable.\n\n`;
    (spec.agents || []).forEach((a, i) => {
      p += `### ${i + 1}. ${a.name}\n`;
      p += `- **Mandate:** ${a.mandate}\n`;
      if (a.owns && a.owns.length) p += `- **Owns:** ${a.owns.join(', ')}\n`;
      p += `- **Deliverable:** ${a.deliverable}\n`;
      p += `- **Done when:** ${a.done_when}\n\n`;
    });

    p += `## The critic\nSpawn a separate critic sub-agent. It must not be the agent that produced the work. ${heat}\n\nScore every round against this rubric:\n\n`;
    p += `| Dimension | Weight | Pass bar | What good looks like |\n| --- | --- | --- | --- |\n`;
    (spec.rubric || []).forEach(r => {
      p += `| ${r.dimension} | ${r.weight} | ${r.pass_bar}/10 | ${r.what_good_looks_like} |\n`;
    });
    p += `\n**Overall pass threshold: ${spec.pass_threshold}/10 weighted, and no single dimension below its pass bar.**\n\n`;

    if (inputs.blind && spec.blind_protocol && spec.blind_protocol.length) {
      p += `## Blind comparison\nEvery round ends with a blind head-to-head against **${b.name || inputs.benchmark}**:\n\n`;
      spec.blind_protocol.forEach((s, i) => { p += `${i + 1}. ${s}\n`; });
      p += `\nThe critic states which artifact is better **before** learning which is which. If it does not pick ours, the round has failed.\n\n`;
    }

    p += `## The loop\nRepeat until the exit condition is met, up to ${lc.max_iterations || inputs.iterations} iterations.\n\n`;
    if (lc.per_round && lc.per_round.length) {
      p += `Each round, in order:\n`;
      lc.per_round.forEach((s, i) => { p += `${i + 1}. ${s}\n`; });
      p += `\n`;
    }
    if (lc.escalation && lc.escalation.length) {
      p += `If a round does not improve the score:\n`;
      lc.escalation.forEach(s => { p += `- ${s}\n`; });
      p += `\n`;
    }

    p += `## Exit conditions\n`;
    (lc.stop_conditions || []).forEach(s => {
      const label = { pass: 'SHIP', fail: 'ESCALATE', loop: 'ITERATE' }[s.kind] || String(s.kind || '').toUpperCase();
      p += `- **${label}** — ${s.condition}\n`;
    });
    p += `\n`;

    if (inputs.evidence && spec.evidence_requirements && spec.evidence_requirements.length) {
      p += `## Evidence required each round\nA round that produces no evidence did not happen.\n\n`;
      spec.evidence_requirements.forEach(s => { p += `- ${s}\n`; });
      p += `\n`;
    }

    if (spec.anti_gaming_rules && spec.anti_gaming_rules.length) {
      p += `## Anti-gaming rules\n`;
      spec.anti_gaming_rules.forEach(s => { p += `- ${s}\n`; });
      p += `\n`;
    }

    p += `## Non-negotiable\n`;
    p += `- Do not stop early because the work is "good enough". The exit conditions above are the only way out.\n`;
    p += `- Do not let a sub-agent grade its own deliverable.\n`;
    p += `- Report the weighted score after every round, with the per-dimension breakdown.\n`;
    p += `- If ${lc.max_iterations || inputs.iterations} iterations pass without clearing the threshold, stop and report the highest score reached, the dimension blocking it, and what you would need to clear it.\n`;
    return p;
  }

  function glRender(view) {
    const out = $('#gl-output');
    if (!out || !glState) return;
    const spec = glState.spec || {};

    if (view === 'prompt') {
      out.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(glState.prompt || '')}</pre>`;
      return;
    }

    if (view === 'roster') {
      out.innerHTML = '<div class="roster">' + (spec.agents || []).map((a, i) => `
        <div class="agent-row">
          <div class="agent-index">${String(i + 1).padStart(2, '0')}</div>
          <div>
            <div class="agent-name">${esc(a.name)}</div>
            <div class="agent-mandate">${esc(a.mandate)}</div>
            ${(a.owns && a.owns.length) ? `<div class="calendar-meta">${a.owns.map(o => `<span class="tag">${esc(o)}</span>`).join('')}</div>` : ''}
            <div class="agent-deliverable">${esc(a.deliverable)}</div>
            <div class="agent-deliverable">Done when: ${esc(a.done_when)}</div>
          </div>
        </div>`).join('') + '</div>';
      return;
    }

    if (view === 'rubric') {
      const rows = spec.rubric || [];
      const total = rows.reduce((n, r) => n + (Number(r.weight) || 0), 0);
      const heaviest = rows.reduce((n, r) => Math.max(n, Number(r.weight) || 0), 1);
      out.innerHTML = '<div class="rubric">' + rows.map(r => {
        const w = Number(r.weight) || 0;
        return `
        <div class="rubric-row">
          <div class="rubric-name">${esc(r.dimension)} <span class="tag">${w}%</span><span>${esc(r.what_good_looks_like)}</span></div>
          <div class="rubric-bar" title="Weight ${w} of ${total}"><i style="width:${Math.max(6, Math.round(w * 100 / heaviest))}%"></i></div>
          <div class="rubric-score">${esc(r.pass_bar)}/10</div>
        </div>`; }).join('') + '</div>' +
        `<div class="gate"><strong>Gate</strong> Weighted ${esc(spec.pass_threshold)}/10 overall, and no dimension below its own bar. Weights sum to ${total}${total === 100 ? '' : ' — not 100, so the weighted score is skewed'}.</div>`;
      return;
    }

    if (view === 'blind') {
      const b = spec.benchmark || {};
      out.innerHTML = `
        <div class="versus">
          <div class="versus-side is-build">
            <div class="versus-tag">Artifact A</div>
            <div class="versus-name">${esc(spec.gauntlet_name || 'Our build')}</div>
          </div>
          <div class="versus-mid">vs</div>
          <div class="versus-side is-reference">
            <div class="versus-tag">Artifact B</div>
            <div class="versus-name">${esc(b.name || glState.inputs.benchmark)}</div>
          </div>
        </div>
        <div class="protocol">` +
        (spec.blind_protocol || []).map(s => `<div class="protocol-step">${esc(s)}</div>`).join('') +
        `</div>` +
        ((b.observable_tells && b.observable_tells.length)
          ? `<h4 style="margin-top:24px;font-family:var(--font-mono);font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--fog-500);">Tells the critic looks for</h4><div class="prose"><ul>` +
            b.observable_tells.map(t => `<li>${esc(t)}</li>`).join('') + `</ul></div>`
          : '');
      return;
    }

    if (view === 'control') {
      const lc = spec.loop_control || {};
      let h = '<div class="prose">';
      h += `<h4>Per round</h4><ol>${(lc.per_round || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
      h += `<h4>Escalation</h4><ul>${(lc.escalation || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
      h += '</div>';
      h += '<div class="stop-list" style="margin-top:16px;">' + (lc.stop_conditions || []).map(s => `
        <div class="stop-row is-${esc(s.kind || 'loop')}">
          <div class="stop-kind">${esc(s.kind || 'loop')}</div>
          <div>${esc(s.condition)}</div>
        </div>`).join('') + '</div>';
      if (spec.anti_gaming_rules && spec.anti_gaming_rules.length) {
        h += `<div class="prose" style="margin-top:20px;"><h4>Anti-gaming rules</h4><ul>` +
          spec.anti_gaming_rules.map(s => `<li>${esc(s)}</li>`).join('') + `</ul></div>`;
      }
      out.innerHTML = h;
      return;
    }

    out.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(JSON.stringify(glExport(), null, 2))}</pre>`;
  }

  function glExport() {
    if (!glState) return {};
    return {
      generated_at: new Date().toISOString(),
      inputs: glState.inputs,
      spec: glState.spec,
      critic: glState.critique,
      runnable_prompt: glState.prompt
    };
  }

  function glMarkdown() {
    const spec = glState.spec || {};
    let md = glState.prompt + '\n\n---\n\n## Critic review of this gauntlet\n\n';
    const findings = (glState.critique && glState.critique.findings) || [];
    if (!findings.length) {
      md += 'No high-impact issues found. Gauntlet approved as forged.\n\n';
    } else {
      findings.forEach(f => {
        md += `- **[${String(f.severity || 'medium').toUpperCase()}] ${f.category || 'issue'}** — ${f.issue || ''}`;
        if (f.fix_applied) md += ` _Fix applied:_ ${f.fix_applied}`;
        md += `\n`;
      });
      md += `\n`;
    }
    md += '---\n\n## Machine-readable spec\n\n```json\n' + JSON.stringify(spec, null, 2) + '\n```\n';
    return md;
  }

  function renderGlMatchup() {
    const spec = glState.spec || {};
    const b = spec.benchmark || {};
    const panel = $('#gl-versus-panel');
    if (!panel) return;
    panel.style.display = 'block';
    $('#gl-versus').innerHTML = `
      <div class="versus-side is-build">
        <div class="versus-tag">The build</div>
        <div class="versus-name">${esc(spec.gauntlet_name || glState.inputs.objective.slice(0, 60))}</div>
      </div>
      <div class="versus-mid">vs</div>
      <div class="versus-side is-reference">
        <div class="versus-tag">Gold standard</div>
        <div class="versus-name">${esc(b.name || glState.inputs.benchmark)}</div>
      </div>`;

    const findings = (glState.critique && glState.critique.findings) || [];
    $('#gl-metrics').innerHTML = `
      <div class="metric"><div class="metric-value accent">${(spec.agents || []).length}</div><div class="metric-label">Sub-agents</div></div>
      <div class="metric"><div class="metric-value">${(spec.rubric || []).length}</div><div class="metric-label">Dimensions</div></div>
      <div class="metric"><div class="metric-value">${esc(spec.pass_threshold || '—')}</div><div class="metric-label">Pass bar</div></div>
      <div class="metric"><div class="metric-value">${esc((spec.loop_control || {}).max_iterations || glState.inputs.iterations)}</div><div class="metric-label">Max rounds</div></div>
      <div class="metric"><div class="metric-value jade">${findings.length}</div><div class="metric-label">Critic fixes</div></div>`;
  }

  async function runGauntlet() {
    const objective = ($('#gl-objective').value || '').trim();
    if (!objective) { toast('Describe what should be built first.'); $('#gl-objective').focus(); return; }

    const inputs = {
      objective: objective,
      benchmark: ($('#gl-benchmark').value || '').trim() || 'the best-in-class reference in this domain',
      constraints: ($('#gl-constraints').value || '').trim(),
      domain: (chipValues('gl-domains', 'domain')[0]) || 'software',
      agents: Number($('#gl-agents').value),
      iterations: Number($('#gl-iterations').value),
      heat: segmentedValue('gl-heat', 'harsh'),
      blind: $('#gl-blind').checked,
      evidence: $('#gl-evidence').checked,
      model: $('#gl-model').value
    };

    const btn = $('#gl-run-btn');
    const status = $('#gl-inline-status');
    btn.disabled = true;
    status.style.display = '';
    status.classList.add('running');
    $('#gl-progress').textContent = 'Running';
    hideEmpty('gauntlet-loop');
    pulse('gauntlet-loop', 'live', 'Running');

    $('#gl-run').style.display = 'block';
    $('#gl-result').style.display = 'none';
    $('#gl-versus-panel').style.display = 'none';
    glPipeline.reset();
    glState = { inputs: inputs };

    const brief =
      `OBJECTIVE\n${inputs.objective}\n\n` +
      `GOLD STANDARD TO BEAT\n${inputs.benchmark}\n\n` +
      `DOMAIN\n${inputs.domain}\n\n` +
      (inputs.constraints ? `CONSTRAINTS\n${inputs.constraints}\n\n` : '') +
      `PARALLEL SUB-AGENTS\nExactly ${inputs.agents}\n\n` +
      `MAX ITERATIONS\n${inputs.iterations}\n\n` +
      `CRITIC SEVERITY\n${inputs.heat}\n\n` +
      `BLIND COMPARISON REQUIRED\n${inputs.blind ? 'yes' : 'no'}\n\n` +
      `ARTIFACT EVIDENCE REQUIRED EACH ROUND\n${inputs.evidence ? 'yes' : 'no'}\n\n` +
      `Design the gauntlet.`;

    try {
      glPipeline.set('forge', 'active');
      const forged = await chatJson(inputs.model, GL_FORGE, brief, { max_tokens: 6000 });
      glPipeline.set('forge', 'done', (forged.agents || []).length + ' agents');

      glPipeline.set('harden', 'active');
      let critique = { verdict: 'approved', findings: [] };
      let spec = forged;
      try {
        const reviewed = await chatJson(inputs.model, GL_CRITIC,
          `GAUNTLET SPEC UNDER REVIEW\n${JSON.stringify(forged)}\n\nInterrogate it, then return the corrected spec.`,
          { max_tokens: 6000, temperature: 0.4 });
        critique = { verdict: reviewed.verdict || 'revised', findings: reviewed.findings || [] };
        if (reviewed.final_spec && reviewed.final_spec.agents) spec = reviewed.final_spec;
        glPipeline.set('harden', 'done', critique.findings.length + ' findings');
      } catch (err) {
        /* The critic is a hardening pass, not a hard dependency — keep the
           forged spec and say plainly that the pass did not land. */
        console.warn('[gauntlet] critic pass failed:', err);
        glPipeline.set('harden', 'failed', 'skipped');
        toast('Critic pass failed — showing the unhardened spec.');
      }

      glState.spec = spec;
      glState.critique = critique;

      glPipeline.set('assemble', 'active');
      glState.prompt = glBuildPrompt(spec, inputs);
      renderGlMatchup();
      $('#gl-result').style.display = 'block';
      glRender(activeGlView());
      glPipeline.set('assemble', 'done', 'ready');

      pulse('gauntlet-loop', 'done', 'Complete');
      toast('Gauntlet forged.');
    } catch (err) {
      console.error('[gauntlet-loop]', err);
      const active = $('#gl-pipeline .pipeline-step.is-active');
      if (active) glPipeline.set(active.dataset.step, 'failed', 'Failed');
      pulse('gauntlet-loop', null, 'Failed');
      toast('Gauntlet failed: ' + err.message);
    } finally {
      btn.disabled = false;
      status.classList.remove('running');
      status.style.display = 'none';
    }
  }

  function activeGlView() {
    const t = $('.out-tab.active[data-gl-out]');
    return t ? t.dataset.glOut : 'prompt';
  }

  /* ══════════════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════════════ */

  function boot() {
    observeLegacyTabs();
    loadModels();

    /* Content Loop */
    clPipeline = new Pipeline('cl-pipeline', CL_STEPS);
    wireChips('cl-channels', true);
    wireRange('cl-count', 'cl-count-value');
    $('#cl-run-btn').addEventListener('click', runContentLoop);
    $('#cl-regenerate').addEventListener('click', runContentLoop);

    $$('.out-tab[data-cl-out]').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.out-tab[data-cl-out]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        clRender(tab.dataset.clOut);
      });
    });

    $('#cl-copy-btn').addEventListener('click', function () {
      if (!clState) return toast('Compile a content loop first.');
      const view = activeClView();
      copyText(view === 'json' ? JSON.stringify(clExport(), null, 2) : clMarkdown(), this);
    });

    $('#cl-download-md').addEventListener('click', () => {
      if (!clState) return toast('Compile a content loop first.');
      download(slug((clState.strategy || {}).engine_name, 'content-loop') + '-kit.md', clMarkdown(), 'text/markdown');
      toast('Content kit downloaded.');
    });

    $('#cl-download-json').addEventListener('click', () => {
      if (!clState) return toast('Compile a content loop first.');
      download(slug((clState.strategy || {}).engine_name, 'content-loop') + '.json',
        JSON.stringify(clExport(), null, 2), 'application/json');
      toast('JSON downloaded.');
    });

    /* Gauntlet Loop */
    glPipeline = new Pipeline('gl-pipeline', GL_STEPS);
    wireChips('gl-domains', false);
    wireSegmented('gl-heat');
    wireRange('gl-agents', 'gl-agents-value');
    wireRange('gl-iterations', 'gl-iterations-value');
    $('#gl-run-btn').addEventListener('click', runGauntlet);
    $('#gl-regenerate').addEventListener('click', runGauntlet);

    $$('.out-tab[data-gl-out]').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.out-tab[data-gl-out]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        glRender(tab.dataset.glOut);
      });
    });

    $('#gl-copy-btn').addEventListener('click', function () {
      if (!glState) return toast('Forge a gauntlet first.');
      const view = activeGlView();
      copyText(view === 'json' ? JSON.stringify(glExport(), null, 2) : (glState.prompt || ''), this);
    });

    $('#gl-download-md').addEventListener('click', () => {
      if (!glState) return toast('Forge a gauntlet first.');
      download(slug((glState.spec || {}).gauntlet_name, 'gauntlet') + '.md', glMarkdown(), 'text/markdown');
      toast('Gauntlet spec downloaded.');
    });

    $('#gl-download-json').addEventListener('click', () => {
      if (!glState) return toast('Forge a gauntlet first.');
      download(slug((glState.spec || {}).gauntlet_name, 'gauntlet') + '.json',
        JSON.stringify(glExport(), null, 2), 'application/json');
      toast('JSON downloaded.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
