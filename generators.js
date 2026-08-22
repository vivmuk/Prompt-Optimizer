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

  /* Stream a completion, calling onDelta with the whole buffer so far.

     The Venice proxy pipes server-sent events straight through, so a caller
     can render fields as they arrive rather than waiting for the full object.
     Falls back to a normal completion if the response is not an event stream —
     a proxy without the passthrough still works, just without the reveal. */
  async function chatStream(model, system, user, opts, onDelta) {
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
        max_tokens: 8000,
        stream: true
      }, opts || {}))
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error((err && (err.error || err.message)) || ('Venice returned ' + res.status));
    }

    const contentType = res.headers.get('content-type') || '';
    if (!/event-stream/i.test(contentType) || !res.body) {
      const data = await res.json().catch(() => null);
      const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      if (!content) throw new Error('Venice returned an empty completion.');
      if (onDelta) onDelta(content);
      return content;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });

      /* SSE frames are separated by a blank line; keep the trailing partial. */
      const frames = carry.split('\n\n');
      carry = frames.pop() || '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let parsed;
          try { parsed = JSON.parse(payload); } catch (e) { continue; }
          const delta = parsed.choices && parsed.choices[0] &&
            (parsed.choices[0].delta || parsed.choices[0].message);
          if (delta && typeof delta.content === 'string') {
            buffer += delta.content;
            if (onDelta) onDelta(buffer);
          }
        }
      }
    }

    if (!buffer.trim()) throw new Error('Venice returned an empty completion.');
    return buffer;
  }

  /* Pull whatever top-level string fields are readable out of a JSON object
     that is still being written. Values arrive character by character, so the
     last field is normally an unterminated string — that partial value is
     returned too, which is the whole point of the progressive reveal. */
  function extractPartialFields(buffer, fields) {
    const text = String(buffer || '').replace(/```json/gi, '').replace(/```/g, '');
    const out = {};

    fields.forEach(field => {
      const key = '"' + field + '"';
      const at = text.indexOf(key);
      if (at === -1) return;

      /* Step over the key, its colon and the opening quote. */
      let i = at + key.length;
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] !== ':') return;
      i++;
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] !== '"') return;
      i++;

      let value = '';
      let complete = false;
      for (; i < text.length; i++) {
        const ch = text[i];
        if (ch === '\\') {
          const next = text[i + 1];
          if (next === undefined) break;          // escape split across chunks
          value += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })[next] ||
                   (next === 'u' ? unescapeUnicode(text, i) : next);
          i += (next === 'u') ? 5 : 1;
          continue;
        }
        if (ch === '"') { complete = true; break; }
        value += ch;
      }

      if (value.trim()) out[field] = { text: value, complete: complete };
    });

    return out;
  }

  function unescapeUnicode(text, i) {
    const hex = text.slice(i + 2, i + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) return '';
    return String.fromCharCode(parseInt(hex, 16));
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

  /* Adapters onto meter.js. The meter is optional — if it failed to load the
     generators still run, they just lose the bar. */

  function meterStart(tabId, steps, skipKey) {
    if (!window.RunMeter) return;
    /* A skipped stage still needs a slot so the bar's arithmetic holds, but it
       carries almost no weight. */
    const stages = steps.map(s => ({
      key: s.key,
      label: s.label,
      weight: s.key === skipKey ? 0.05 : (s.weight || 1)
    }));
    window.RunMeter.start(tabId, stages);
  }

  function meterStage(tabId, key) {
    if (window.RunMeter) window.RunMeter.stage(tabId, key);
  }

  function meterDone(tabId, key) {
    if (window.RunMeter) window.RunMeter.stageDone(tabId, key);
  }

  function meterFinish(tabId, ok) {
    if (window.RunMeter) window.RunMeter.finish(tabId, ok);
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
    fillModels($('#ar-model'), models, 'zai-org-glm-4.7');
    fillModels($('#hb-model'), models, 'deepseek-r1-671b-thinking');
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

  /* Weights approximate how long each stage actually takes, so the bar moves
     at a roughly even rate instead of jumping a fifth per step. */
  const CL_STEPS = [
    { key: 'strategy', label: 'Compile content strategy',  weight: 1.2 },
    { key: 'calendar', label: 'Lay out the cycle calendar', weight: 1 },
    { key: 'drafts',   label: 'Write channel-native drafts', weight: 2.2 },
    { key: 'visuals',  label: 'Generate key visuals',       weight: 1.6 },
    { key: 'assemble', label: 'Assemble automation spec',   weight: 0.2 }
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
    meterStart('content-loop', CL_STEPS, inputs.visuals ? null : 'visuals');
    clState = { inputs: inputs, visuals: [] };

    try {
      /* 1 — strategy */
      clPipeline.set('strategy', 'active');
      meterStage('content-loop', 'strategy');
      clState.strategy = await chatJson(inputs.model, CL_STRATEGIST,
        `SUBJECT\n${inputs.topic}\n\nAUDIENCE\n${inputs.audience}\n\nCHANNELS\n${inputs.channels.join(', ')}\n\nCADENCE\n${inputs.cadence}, ${inputs.count} pieces per cycle\n\nVOICE\n${inputs.tone}\n\nDesign the content engine.`);
      clPipeline.set('strategy', 'done', (clState.strategy.pillars || []).length + ' pillars');
      meterDone('content-loop', 'strategy');

      renderClMetrics();

      /* 2 — calendar */
      clPipeline.set('calendar', 'active');
      meterStage('content-loop', 'calendar');
      const cal = await chatJson(inputs.model, CL_CALENDAR,
        `STRATEGY\n${JSON.stringify(clState.strategy)}\n\nCHANNELS\n${inputs.channels.join(', ')}\n\nCADENCE\n${inputs.cadence}\n\nProduce exactly ${inputs.count} calendar items for one full cycle.`);
      clState.calendar = Array.isArray(cal) ? cal.slice(0, inputs.count) : (cal.calendar || []);
      clPipeline.set('calendar', 'done', clState.calendar.length + ' slots');
      meterDone('content-loop', 'calendar');

      /* 3 — drafts */
      clPipeline.set('drafts', 'active');
      meterStage('content-loop', 'drafts');
      const drafts = await chatJson(inputs.model, CL_DRAFTS,
        `VOICE\n${inputs.tone}\n\nAUDIENCE\n${clState.strategy.audience || inputs.audience}\n\nSLOTS\n${JSON.stringify(clState.calendar)}\n\nWrite one finished draft per slot, in the same order.`,
        { max_tokens: 6000 });
      clState.drafts = Array.isArray(drafts) ? drafts : (drafts.drafts || []);
      clPipeline.set('drafts', 'done', clState.drafts.length + ' drafts');
      meterDone('content-loop', 'drafts');

      /* 4 — visuals */
      if (inputs.visuals) {
        clPipeline.set('visuals', 'active');
        meterStage('content-loop', 'visuals');
        const targets = clState.calendar.filter(i => i.image_prompt).slice(0, 4);
        if (!targets.length) {
          clPipeline.set('visuals', 'done', 'none requested');
          meterDone('content-loop', 'visuals');
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
          meterDone('content-loop', 'visuals');
        }
      } else {
        clPipeline.set('visuals', 'done', 'skipped');
        meterDone('content-loop', 'visuals');
      }

      /* 5 — assemble */
      clPipeline.set('assemble', 'active');
      meterStage('content-loop', 'assemble');
      renderClMetrics();
      $('#cl-result').style.display = 'block';
      clRender(activeClView());
      clPipeline.set('assemble', 'done', 'ready');
      meterDone('content-loop', 'assemble');

      pulse('content-loop', 'done', 'Complete');
      meterFinish('content-loop', true);
      toast('Content loop compiled.');
    } catch (err) {
      console.error('[content-loop]', err);
      const active = $('#cl-pipeline .pipeline-step.is-active');
      if (active) clPipeline.set(active.dataset.step, 'failed', 'Failed');
      pulse('content-loop', null, 'Failed');
      meterFinish('content-loop', false);
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
    { key: 'forge',    label: 'Forge the gauntlet spec',     weight: 1.6 },
    { key: 'harden',   label: 'Adversarial critic pass',     weight: 1.6 },
    { key: 'assemble', label: 'Assemble the runnable prompt', weight: 0.2 }
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
    meterStart('gauntlet-loop', GL_STEPS);
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
      meterStage('gauntlet-loop', 'forge');
      const forged = await chatJson(inputs.model, GL_FORGE, brief, { max_tokens: 6000 });
      glPipeline.set('forge', 'done', (forged.agents || []).length + ' agents');
      meterDone('gauntlet-loop', 'forge');

      glPipeline.set('harden', 'active');
      meterStage('gauntlet-loop', 'harden');
      let critique = { verdict: 'approved', findings: [] };
      let spec = forged;
      try {
        const reviewed = await chatJson(inputs.model, GL_CRITIC,
          `GAUNTLET SPEC UNDER REVIEW\n${JSON.stringify(forged)}\n\nInterrogate it, then return the corrected spec.`,
          { max_tokens: 6000, temperature: 0.4 });
        critique = { verdict: reviewed.verdict || 'revised', findings: reviewed.findings || [] };
        if (reviewed.final_spec && reviewed.final_spec.agents) spec = reviewed.final_spec;
        glPipeline.set('harden', 'done', critique.findings.length + ' findings');
        meterDone('gauntlet-loop', 'harden');
      } catch (err) {
        /* The critic is a hardening pass, not a hard dependency — keep the
           forged spec and say plainly that the pass did not land. */
        console.warn('[gauntlet] critic pass failed:', err);
        glPipeline.set('harden', 'failed', 'skipped');
        meterDone('gauntlet-loop', 'harden');
        toast('Critic pass failed — showing the unhardened spec.');
      }

      glState.spec = spec;
      glState.critique = critique;

      glPipeline.set('assemble', 'active');
      meterStage('gauntlet-loop', 'assemble');
      glState.prompt = glBuildPrompt(spec, inputs);
      renderGlMatchup();
      $('#gl-result').style.display = 'block';
      glRender(activeGlView());
      glPipeline.set('assemble', 'done', 'ready');
      meterDone('gauntlet-loop', 'assemble');

      pulse('gauntlet-loop', 'done', 'Complete');
      meterFinish('gauntlet-loop', true);
      toast('Gauntlet forged.');
    } catch (err) {
      console.error('[gauntlet-loop]', err);
      const active = $('#gl-pipeline .pipeline-step.is-active');
      if (active) glPipeline.set(active.dataset.step, 'failed', 'Failed');
      pulse('gauntlet-loop', null, 'Failed');
      meterFinish('gauntlet-loop', false);
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
     HARNESS BUILDER

     Ported from vivmuk/harness-engineering: the recipe model, the streaming
     progressive reveal, per-section refinement and the repo-shaped bundle.

     Extended where that model predates current practice. The original seven
     layers (rules, playbooks, agents, skills, execution, state, anti-patterns)
     describe what an agent should DO; they say nothing about what stops it
     doing the wrong thing. Five layers added for that: MCP wiring, hooks,
     permissions, evals and a context budget.
     ══════════════════════════════════════════════════════════════════════ */

  const HB_STEPS = [
    { key: 'core',     label: 'Write the operating layers', weight: 2.2 },
    { key: 'controls', label: 'Write the control layers',   weight: 2.2 },
    { key: 'image',    label: 'Render the architecture',    weight: 1 },
    { key: 'assemble', label: 'Assemble the bundle',        weight: 0.2 }
  ];

  /* Every layer: which call writes it, its label, and where it lands in a repo.
     `path: null` means the layer is guidance that ships as documentation. */
  const HB_LAYERS = [
    { key: 'rules',         stage: 'core',     label: 'Rules',          path: 'AGENTS.md' },
    { key: 'playbook',      stage: 'core',     label: 'Playbooks',      path: '.claude/commands/{slug}.md' },
    { key: 'agents',        stage: 'core',     label: 'Subagents',      path: '.claude/agents/README.md' },
    { key: 'skills',        stage: 'core',     label: 'Skills',         path: '.claude/skills/{slug}/SKILL.md' },
    { key: 'executionLayer',stage: 'core',     label: 'Execution',      path: 'docs/execution-layer.md' },
    { key: 'stateSchema',   stage: 'core',     label: 'State',          path: 'docs/state-schema.md' },
    { key: 'mcp',           stage: 'controls', label: 'MCP',            path: 'docs/mcp-servers.md' },
    { key: 'hooks',         stage: 'controls', label: 'Hooks',          path: 'docs/hooks.md' },
    { key: 'permissions',   stage: 'controls', label: 'Permissions',    path: 'docs/permissions.md' },
    { key: 'evals',         stage: 'controls', label: 'Evals',          path: 'docs/evals.md' },
    { key: 'contextBudget', stage: 'controls', label: 'Context budget', path: 'docs/context-budget.md' },
    { key: 'antiPatterns',  stage: 'controls', label: 'Anti-patterns',  path: 'anti-patterns.md' },
    { key: 'qhxLoop',       stage: 'controls', label: 'QHX loop',       path: 'qhx-loop.md' },
    { key: 'modelRouting',  stage: 'controls', label: 'Model routing',  path: 'docs/model-routing.md' }
  ];

  const HB_CORE_FIELDS = ['domain', 'summary'].concat(
    HB_LAYERS.filter(l => l.stage === 'core').map(l => l.key));
  const HB_CONTROL_FIELDS = HB_LAYERS.filter(l => l.stage === 'controls').map(l => l.key)
    .concat(['mermaidDiagram', 'diagramPrompt']);

  const HB_DOCTRINE = `A harness is not a prompt. It is the environment that turns an agent into a repeatable operator: rules it reads first, playbooks it runs, specialists it delegates to, skills it loads, typed code it calls, state it saves and resumes from, and a record of every way it has failed before.

Hold to these, which are what separate a harness that works once from one that gets better every run:

- AGENT INTERFACE FIRST. Design backward from the operator's first message. Decide what the agent does without asking, and exactly where it must stop and confirm.
- EVERY RULE TRACES TO A FAILURE. If you cannot name the specific mistake a rule prevents, delete it. Zero aspirational rules — "write clean code" is noise that dilutes the rules that matter.
- STATE OVER MEMORY. A harness is reusable because it saves and resumes. Name real files and real schemas.
- COMPRESS BEFORE REASONING. Video, audio and large corpora do not go into context. Convert them to compact structured text and reach for the raw media only when needed.
- CONFIRM AT GATES, NOT EVERYWHERE. Constant confirmation is as useless as none.
- NEVER GUESS PARAMETERS. If the agent calls an API, it reads a capability registry that knows the supported fields, limits and costs.
- SPECIFICITY OR SILENCE. Real file names, real command names, real flags. If the use case does not tell you something, say so rather than inventing it.`;

  const HB_CORE_PROMPT = `You are a senior harness engineering architect. Turn the operator's use case into the operating layers of a production harness.

${HB_DOCTRINE}

Output strictly valid JSON matching this schema, and nothing else — no prose, no code fences:
{
  "domain": "short domain label, 1-4 words",
  "summary": "2-3 sentences on what this harness does and what it refuses to do",
  "rules": "markdown for AGENTS.md — the file the agent reads first. Global behaviour, defaults, non-negotiables, and where it must stop and confirm. Every line must trace to a failure it prevents.",
  "playbook": "markdown for .claude/commands/<name>.md — the one-line commands that run recurring pipelines, with the steps each expands into",
  "agents": "markdown listing the specialist subagents, each with a narrow role, the context it is given, and what it returns. Subagents are a context pressure valve as much as a specialisation: say which ones exist to keep the main context clean.",
  "skills": "markdown for a portable SKILL.md — packaged domain knowledge loadable by Claude Code, Codex CLI, Cursor or Gemini CLI. Procedural knowledge only, not background the model already has.",
  "executionLayer": "markdown for the typed code layer: the clients, the capability registry, and what the code enforces that a prompt cannot",
  "stateSchema": "markdown for the state files — project config, ground truth, intermediate artifacts, final outputs, provenance. Name the files and their fields."
}

Be concrete and dense. Keep every section to a few bullet-rich paragraphs so the whole object fits the token budget.`;

  const HB_CONTROLS_PROMPT = `You are a senior harness engineering architect. You have written a harness's operating layers. Now write the control layers — the parts that stop it doing the wrong thing, and the parts that make it improve.

${HB_DOCTRINE}

Triage rule for where a fix belongs, and apply it consistently:
- The agent VIOLATED a known rule → a hook. Deterministic, not advisory.
- The agent LACKED information → a skill or an MCP server.
- The agent USED something dangerous → a permission restriction.

Output strictly valid JSON matching this schema, and nothing else — no prose, no code fences:
{
  "mcp": "markdown on the MCP servers this harness wires in — which external systems, which tools each exposes, and what stays out of MCP because typed code does it better",
  "hooks": "markdown on the deterministic hooks — the event each fires on (PreToolUse, PostToolUse, Stop and so on), what it checks, and the specific failure it exists to prevent",
  "permissions": "markdown on the permission and sandbox posture — what is allowlisted, what always prompts, what is denied outright, and what the agent may never reach",
  "evals": "markdown on the eval suite that gates changes to this harness: the regression cases, how a run is scored, and the security checks — prompt-injection resistance, timeout resilience, and whether the agent requests tools it does not need. Measure before adding autonomy.",
  "contextBudget": "markdown on the context strategy — what is loaded eagerly versus on demand, what gets compacted and when, and which work is pushed to subagents to keep the main context clean",
  "antiPatterns": "markdown listing 6-10 concrete anti-patterns as a living log. Each names the failure, why it happened, and the fix. These are the seeds of the rules file.",
  "qhxLoop": "markdown on the QHX loop — Quality, Human feedback, eXecution. What gets logged after every run, who reviews it, and how the next session starts smarter than the last.",
  "modelRouting": "markdown on model routing — which model handles which step and why, with the cheap-model-first path and the escalation trigger",
  "mermaidDiagram": "Mermaid flowchart source (flowchart TD) of this harness: rules feeding playbooks, playbooks fanning to subagents and skills, the execution layer with its hooks and permissions, state files, and the QHX loop closing back to the rules. Short node labels, subgraphs per layer, valid Mermaid only, no code fences.",
  "diagramPrompt": "a prompt for a text-to-image model illustrating this harness as a dark, diagrammatic infographic — layered nodes, flowing connections, deep teal ground with ember and amber accents. Abstract, no text labels, no words in the image."
}`;

  const HB_REFINE_PROMPT = `You are a senior harness engineering architect refining one layer of an existing harness. You get the whole harness as context, the layer to rewrite, and an instruction.

Rewrite ONLY that layer. Stay consistent with every other layer — if the instruction would contradict one, honour the instruction and note the tension in a line at the end. Keep the same markdown shape and density.

Output strictly valid JSON with exactly one key, no code fences: {"<layerKey>": "the rewritten layer"}`;

  let hbState = null;
  let hbPipeline = null;
  let hbAbort = null;

  function hbSlug() {
    return slug((hbState && hbState.recipe && hbState.recipe.domain) || 'harness', 'harness');
  }

  function hbActiveView() {
    const t = $('.out-tab.active[data-hb-out]');
    return t ? t.dataset.hbOut : 'rules';
  }

  function hbRenderTabs() {
    const strip = $('#hb-out-tabs');
    const copyBtn = $('#hb-copy-btn');
    if (!strip || !hbState) return;
    const present = HB_LAYERS.filter(l => hbState.recipe[l.key]);
    const extras = [];
    if (hbState.recipe.mermaidDiagram) extras.push({ key: 'diagram', label: 'Diagram' });
    if (hbState.image) extras.push({ key: 'image', label: 'Illustration' });
    extras.push({ key: 'bundle', label: 'Bundle' });
    extras.push({ key: 'json', label: 'JSON' });

    const active = hbActiveView();
    strip.innerHTML = present.concat(extras).map(l =>
      `<button class="out-tab${l.key === active ? ' active' : ''}" data-hb-out="${l.key}">${esc(l.label)}</button>`
    ).join('');
    strip.appendChild(copyBtn);

    if (!$('.out-tab.active[data-hb-out]', strip) && strip.firstElementChild) {
      strip.firstElementChild.classList.add('active');
    }

    $$('.out-tab[data-hb-out]', strip).forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.out-tab[data-hb-out]', strip).forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        hbRender(tab.dataset.hbOut);
      });
    });
  }

  function hbRender(view) {
    const out = $('#hb-output');
    if (!out || !hbState) return;
    const recipe = hbState.recipe;
    const refineBar = $('#hb-refine-bar');
    const layer = HB_LAYERS.find(l => l.key === view);

    /* Refinement only makes sense on a written layer, not on a derived view. */
    if (refineBar) refineBar.style.display = layer ? 'block' : 'none';

    if (view === 'json') {
      out.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(JSON.stringify(hbExport(), null, 2))}</pre>`;
      return;
    }

    if (view === 'bundle') {
      out.innerHTML = '<div class="protocol">' + hbFiles().map(f =>
        `<div class="protocol-step"><strong>${esc(f.path)}</strong><br>${esc(f.note || '')}</div>`
      ).join('') + '</div>';
      return;
    }

    if (view === 'diagram') {
      out.innerHTML = `<div id="hb-mermaid" class="mermaid-container" style="border-radius:var(--r-md);"></div>` +
        `<details style="margin-top:16px;"><summary class="meter-note" style="cursor:pointer;">Mermaid source</summary>` +
        `<pre class="output-pre" style="padding:12px 0 0;">${esc(recipe.mermaidDiagram || '')}</pre></details>`;
      renderMermaidInto('hb-mermaid', recipe.mermaidDiagram || '');
      return;
    }

    if (view === 'image') {
      out.innerHTML = hbState.image
        ? `<div class="visual"><div class="visual-frame" style="aspect-ratio:16/9;"><img src="${hbState.image}" alt="Harness architecture"></div>` +
          `<div class="visual-caption"><strong>Architecture</strong>${esc(recipe.diagramPrompt || '')}</div></div>`
        : '<p class="prose">No illustration was generated for this run.</p>';
      return;
    }

    const value = recipe[view];
    if (!value) { out.innerHTML = '<p class="prose">This layer has not been written yet.</p>'; return; }
    const streaming = hbState.streaming && hbState.streaming[view];
    out.innerHTML =
      (layer ? `<div class="calendar-meta" style="margin-bottom:16px;"><span class="tag format">${esc(hbPath(layer))}</span>${streaming ? '<span class="tag">writing…</span>' : ''}</div>` : '') +
      `<pre class="output-pre" style="padding:0;">${esc(value)}</pre>`;
  }

  function hbPath(layer) {
    return layer.path.replace('{slug}', hbSlug());
  }

  async function renderMermaidInto(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!code) { el.innerHTML = '<p class="meter-note">No diagram generated.</p>'; return; }
    try {
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
        const { svg } = await window.mermaid.render(id + '-svg-' + Date.now(), code);
        el.innerHTML = svg;
      } else {
        el.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(code)}</pre>`;
      }
    } catch (err) {
      el.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(code)}</pre>`;
    }
  }

  /* The bundle, laid out the way the repo should look on disk.

     Split in two so the README can list the other files without the two
     functions calling each other. */
  function hbFiles() {
    const files = hbLayerFiles();
    files.push({ path: 'README.md', content: hbReadme(files), note: 'How to run the harness.' });
    return files;
  }

  function hbLayerFiles() {
    if (!hbState) return [];
    const recipe = hbState.recipe;
    const slugged = hbSlug();
    const files = [];

    HB_LAYERS.forEach(layer => {
      if (!recipe[layer.key]) return;
      files.push({
        path: hbPath(layer),
        content: recipe[layer.key],
        note: layer.key === 'rules'
          ? 'Read first by Codex CLI, Cursor, Copilot, Gemini CLI, Aider, Windsurf and Zed.'
          : layer.label
      });
    });

    /* Claude Code reads CLAUDE.md; point it at AGENTS.md rather than
       duplicating the rules into a file that will drift. */
    if (recipe.rules) {
      files.push({
        path: 'CLAUDE.md',
        content: `# ${recipe.domain || 'Harness'}\n\nThe operating rules for this harness live in [AGENTS.md](./AGENTS.md). Read that first.\n\nThis file exists so Claude Code finds the rules by its own convention. Keep it a pointer — two rule files that drift apart are worse than one.\n\n## Personal overrides\n\nMachine-specific settings belong in \`CLAUDE.local.md\` (gitignored), not here.\n`,
        note: 'Pointer to AGENTS.md, so Claude Code finds the rules without duplicating them.'
      });
    }

    if (recipe.mermaidDiagram) {
      files.push({ path: 'docs/architecture.mmd', content: recipe.mermaidDiagram, note: 'Architecture diagram (Mermaid source).' });
    }

    return files;
  }

  function hbReadme(files) {
    const recipe = hbState.recipe;
    const slugged = hbSlug();
    let md = `# ${recipe.domain || 'Harness'}\n\n${recipe.summary || ''}\n\n`;
    md += `## Quick start\n\n1. Open this folder in Claude Code, Codex CLI, Cursor or any agent that reads AGENTS.md.\n`;
    md += `2. The agent reads \`AGENTS.md\` first for the operating rules.\n`;
    md += `3. Run the playbook: \`/${slugged}\`\n`;
    md += `4. Confirm at the gates the rules define.\n\n`;
    md += `## Layers\n\n`;
    files.forEach(f => { md += `- \`${f.path}\` — ${f.note}\n`; });
    md += `- \`README.md\` — this file.\n`;
    md += `\n## Keeping it sharp\n\nAfter every production run, log what broke in \`anti-patterns.md\`. Anything that broke twice becomes a rule in \`AGENTS.md\` or a hook in \`docs/hooks.md\`. Every rule should trace to a real failure — if you cannot name the mistake a line prevents, delete it.\n`;
    return md;
  }

  function hbExport() {
    if (!hbState) return {};
    const out = {
      generated_at: new Date().toISOString(),
      inputs: hbState.inputs,
      recipe: Object.assign({}, hbState.recipe),
      files: hbFiles().map(f => ({ path: f.path, bytes: f.content.length }))
    };
    return out;
  }

  function hbMarkdown() {
    const recipe = hbState.recipe;
    let md = `# ${recipe.domain || 'Harness'}\n\n${recipe.summary || ''}\n\n`;
    hbFiles().forEach(f => {
      md += `---\n\n## ${f.path}\n\n_${f.note}_\n\n`;
      md += '````markdown\n' + f.content + '\n````\n\n';
    });
    return md;
  }

  function hbRenderSummary() {
    const recipe = hbState.recipe;
    const panel = $('#hb-summary-panel');
    if (!panel) return;
    panel.style.display = 'block';
    const written = HB_LAYERS.filter(l => recipe[l.key]).length;
    $('#hb-metrics').innerHTML = `
      <div class="metric"><div class="metric-value accent">${written}</div><div class="metric-label">Layers</div></div>
      <div class="metric"><div class="metric-value">${hbFiles().length}</div><div class="metric-label">Files</div></div>
      <div class="metric"><div class="metric-value">${(recipe.antiPatterns || '').split('\n').filter(l => /^\s*[-*\d]/.test(l)).length || '—'}</div><div class="metric-label">Anti-patterns</div></div>
      <div class="metric"><div class="metric-value jade">${hbState.inputs.autonomy}</div><div class="metric-label">Autonomy</div></div>`;
    $('#hb-summary').innerHTML =
      `<h4>${esc(recipe.domain || 'Harness')}</h4><p>${esc(recipe.summary || '')}</p>`;
  }

  /* Fold a streamed buffer into the recipe and repaint whatever is on screen. */
  function hbAbsorb(buffer, fields) {
    const found = extractPartialFields(buffer, fields);
    let changed = false;
    hbState.streaming = hbState.streaming || {};

    Object.keys(found).forEach(key => {
      const entry = found[key];
      if (hbState.recipe[key] !== entry.text) {
        hbState.recipe[key] = entry.text;
        changed = true;
      }
      hbState.streaming[key] = !entry.complete;
    });

    if (!changed) return;
    hbRenderTabs();
    if (hbState.recipe.domain || hbState.recipe.summary) hbRenderSummary();

    /* Follow the layer currently being written, unless the reader has clicked
       away to read something already finished. */
    const view = hbActiveView();
    if (!hbState.userPinned) {
      const writing = Object.keys(hbState.streaming).filter(k => hbState.streaming[k]);
      const target = writing.length ? writing[writing.length - 1] : view;
      if (target !== view && HB_LAYERS.some(l => l.key === target)) {
        $$('.out-tab[data-hb-out]').forEach(t => t.classList.toggle('active', t.dataset.hbOut === target));
        hbRender(target);
        return;
      }
    }
    hbRender(view);
  }

  async function runHarness() {
    const useCase = ($('#hb-usecase').value || '').trim();
    if (!useCase) { toast('Describe the workflow first.'); $('#hb-usecase').focus(); return; }

    const inputs = {
      useCase: useCase,
      stack: ($('#hb-stack').value || '').trim(),
      autonomy: segmentedValue('hb-autonomy', 'balanced'),
      targets: chipValues('hb-targets', 'target'),
      diagram: $('#hb-diagram').checked,
      image: $('#hb-image').checked,
      model: $('#hb-model').value,
      imageModel: $('#hb-image-model').value
    };

    const btn = $('#hb-run-btn');
    const stopBtn = $('#hb-stop-btn');
    const status = $('#hb-inline-status');
    btn.disabled = true;
    stopBtn.style.display = '';
    status.style.display = '';
    status.classList.add('running');
    $('#hb-progress').textContent = 'Running';
    hideEmpty('harness-builder');
    pulse('harness-builder', 'live', 'Running');

    $('#hb-run').style.display = 'block';
    $('#hb-result').style.display = 'block';
    $('#hb-summary-panel').style.display = 'none';
    hbPipeline.reset();

    const steps = HB_STEPS.map(st => Object.assign({}, st,
      st.key === 'image' && !inputs.image ? { weight: 0.05 } : {}));
    meterStart('harness-builder', steps);

    hbState = { inputs: inputs, recipe: {}, streaming: {}, userPinned: false, image: null };
    hbRenderTabs();

    const autonomyBrief = {
      supervised: 'The operator wants to confirm every step. Gates are frequent and explicit.',
      balanced: 'The operator wants confirmation at meaningful gates only — irreversible actions, spend, and anything that publishes.',
      autonomous: 'The operator wants the harness to run to completion unattended. That raises the bar on evals, permissions and rollback: say what makes unattended running safe here.'
    }[inputs.autonomy];

    const brief =
      `USE CASE\n${useCase}\n\n` +
      (inputs.stack ? `TOOLS AND SERVICES IT MUST DRIVE\n${inputs.stack}\n\n` : '') +
      `AUTONOMY\n${autonomyBrief}\n\n` +
      `TARGET HARNESSES\n${inputs.targets.join(', ') || 'Claude Code'}\n\n` +
      `Design the harness.`;

    try {
      /* 1 — operating layers */
      hbPipeline.set('core', 'active');
      meterStage('harness-builder', 'core');
      await chatStream(inputs.model, HB_CORE_PROMPT, brief,
        { max_tokens: 9000, response_format: { type: 'json_object' } },
        buf => hbAbsorb(buf, HB_CORE_FIELDS));
      hbState.streaming = {};
      hbPipeline.set('core', 'done', HB_LAYERS.filter(l => l.stage === 'core' && hbState.recipe[l.key]).length + ' layers');
      meterDone('harness-builder', 'core');

      /* 2 — control layers, given the operating layers as context */
      hbPipeline.set('controls', 'active');
      meterStage('harness-builder', 'controls');
      const context = {};
      HB_CORE_FIELDS.forEach(f => { if (hbState.recipe[f]) context[f] = hbState.recipe[f]; });
      await chatStream(inputs.model, HB_CONTROLS_PROMPT,
        `OPERATING LAYERS ALREADY WRITTEN\n${JSON.stringify(context)}\n\nAUTONOMY\n${autonomyBrief}\n\nWrite the control layers.`,
        { max_tokens: 9000, response_format: { type: 'json_object' } },
        buf => hbAbsorb(buf, HB_CONTROL_FIELDS));
      hbState.streaming = {};
      hbPipeline.set('controls', 'done', HB_LAYERS.filter(l => l.stage === 'controls' && hbState.recipe[l.key]).length + ' layers');
      meterDone('harness-builder', 'controls');

      if (!inputs.diagram) delete hbState.recipe.mermaidDiagram;

      /* 3 — illustration */
      if (inputs.image && hbState.recipe.diagramPrompt) {
        hbPipeline.set('image', 'active');
        meterStage('harness-builder', 'image');
        try {
          hbState.image = await generateImage(inputs.imageModel, hbState.recipe.diagramPrompt, '16:9');
          hbPipeline.set('image', 'done', 'rendered');
        } catch (err) {
          hbPipeline.set('image', 'failed', 'not rendered');
          toast('Illustration failed — the harness itself is fine.');
        }
        meterDone('harness-builder', 'image');
      } else {
        hbPipeline.set('image', 'done', 'skipped');
        meterDone('harness-builder', 'image');
      }

      /* 4 — assemble */
      hbPipeline.set('assemble', 'active');
      meterStage('harness-builder', 'assemble');
      hbRenderTabs();
      hbRenderSummary();
      hbRender(hbActiveView());
      hbPipeline.set('assemble', 'done', hbFiles().length + ' files');
      meterDone('harness-builder', 'assemble');

      pulse('harness-builder', 'done', 'Complete');
      meterFinish('harness-builder', true);
      toast('Harness built.');
    } catch (err) {
      console.error('[harness-builder]', err);
      const active = $('#hb-pipeline .pipeline-step.is-active');
      if (active) hbPipeline.set(active.dataset.step, 'failed', 'Failed');
      pulse('harness-builder', null, 'Failed');
      meterFinish('harness-builder', false);
      toast('Harness build failed: ' + err.message);
    } finally {
      btn.disabled = false;
      stopBtn.style.display = 'none';
      status.classList.remove('running');
      status.style.display = 'none';
      hbAbort = null;
    }
  }

  async function refineHarnessLayer() {
    if (!hbState || !hbState.recipe.domain) return toast('Build a harness first.');
    const view = hbActiveView();
    const layer = HB_LAYERS.find(l => l.key === view);
    if (!layer) return toast('Pick a layer to refine.');

    const input = $('#hb-refine-input');
    const instruction = (input.value || '').trim();
    if (!instruction) { toast('Say what should change.'); input.focus(); return; }

    const btn = $('#hb-refine-btn');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Rewriting…';
    pulse('harness-builder', 'live', 'Refining');

    const context = Object.assign({}, hbState.recipe);
    delete context.mermaidDiagram;

    try {
      const result = await chatJson(hbState.inputs.model,
        HB_REFINE_PROMPT.replace('<layerKey>', layer.key),
        `FULL HARNESS (context)\n${JSON.stringify(context, null, 2)}\n\nLAYER TO REWRITE\n"${layer.key}"\n\nINSTRUCTION\n${instruction}`,
        { max_tokens: 6000, temperature: 0.6 });

      const value = result && result[layer.key];
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('The model did not return the rewritten layer.');
      }
      hbState.recipe[layer.key] = value;
      hbRender(layer.key);
      hbRenderSummary();
      input.value = '';
      toast(layer.label + ' rewritten.');
    } catch (err) {
      console.error('[harness-refine]', err);
      toast('Refine failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
      pulse('harness-builder', 'done', 'Complete');
    }
  }

  async function downloadHarnessZip() {
    if (!hbState || !hbState.recipe.domain) return toast('Build a harness first.');
    const files = hbFiles().map(f => ({ path: f.path, content: f.content }));
    try {
      const res = await fetch('/api/harness-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: hbSlug(), files: files })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err && err.error) || ('Bundle endpoint returned ' + res.status));
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = hbSlug() + '-harness.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Harness downloaded.');
    } catch (err) {
      console.error('[harness-zip]', err);
      /* The zip needs the Node server; fall back to the markdown bundle so a
         static deploy still hands the operator every file. */
      toast('Zip unavailable — downloading Markdown instead.');
      download(hbSlug() + '-harness.md', hbMarkdown(), 'text/markdown');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     AGENT RULES

     AGENTS.md is the open standard and is read natively by Codex CLI,
     Cursor, Copilot, Gemini CLI, Aider, Windsurf and Zed. Everything else
     here is a harness-native variant derived from the same source, so the
     repo cannot end up with two sets of rules that disagree.
     ══════════════════════════════════════════════════════════════════════ */

  const AR_STEPS = [
    { key: 'analyse', label: 'Read the project brief',   weight: 1 },
    { key: 'author',  label: 'Author the AGENTS.md',     weight: 1.8 },
    { key: 'derive',  label: 'Derive harness variants',  weight: 0.3 }
  ];

  /* path      — where the file belongs in the repo
     reads     — true when the harness already reads AGENTS.md unmodified
     transform — builds the file body from the spec and the canonical body */
  const HARNESSES = {
    agents: {
      name: 'AGENTS.md',
      tool: 'Open standard',
      path: 'AGENTS.md',
      note: 'Repo root. Codex CLI, Cursor, Copilot, Gemini CLI, Aider, Windsurf and Zed all read this natively. A deeper AGENTS.md in a subdirectory overrides the one above it.',
      transform: (spec, body) => body
    },
    claude: {
      name: 'CLAUDE.md',
      tool: 'Claude Code',
      path: 'CLAUDE.md',
      note: 'Repo root. Claude Code layers three files: ~/.claude/CLAUDE.md for personal defaults, ./CLAUDE.md committed for the team, and ./CLAUDE.local.md gitignored for your own overrides.',
      transform: (spec, body) => body + claudeAddendum(spec)
    },
    cursor: {
      name: 'project-rules.mdc',
      tool: 'Cursor',
      path: '.cursor/rules/project-rules.mdc',
      note: 'Project rules live in .cursor/rules/ and must use the .mdc extension. alwaysApply:true keeps the stack and layout in context; add sibling files with narrower globs for area-specific rules.',
      transform: (spec, body) => cursorFrontmatter(spec) + body
    },
    copilot: {
      name: 'copilot-instructions.md',
      tool: 'GitHub Copilot',
      path: '.github/copilot-instructions.md',
      note: 'Copilot reads this from .github/ across the editor and the coding agent.',
      transform: (spec, body) => body
    },
    gemini: {
      name: 'GEMINI.md',
      tool: 'Gemini CLI',
      path: 'GEMINI.md',
      note: 'Repo root. Gemini CLI reads AGENTS.md too — add this only if you want Gemini-specific guidance that the other harnesses should not see.',
      transform: (spec, body) => body
    },
    windsurf: {
      name: 'project-rules.md',
      tool: 'Windsurf',
      path: '.windsurf/rules/project-rules.md',
      note: 'Windsurf reads rule files from .windsurf/rules/.',
      transform: (spec, body) => body
    },
    aider: {
      name: 'CONVENTIONS.md',
      tool: 'Aider',
      path: 'CONVENTIONS.md',
      note: 'Repo root. Load it with `aider --read CONVENTIONS.md`, or add it to .aider.conf.yml so every session picks it up.',
      transform: (spec, body) => body
    }
  };

  function cursorFrontmatter(spec) {
    return [
      '---',
      `description: ${(spec.summary || 'Project-wide conventions and commands.').replace(/\n/g, ' ')}`,
      'globs:',
      'alwaysApply: true',
      '---',
      '',
      ''
    ].join('\n');
  }

  function claudeAddendum(spec) {
    const lines = ['', '', '## Memory layering', '',
      'This file is the team-wide layer. Personal preferences belong in',
      '`~/.claude/CLAUDE.md`; machine-specific overrides belong in',
      '`./CLAUDE.local.md`, which should stay gitignored.'];
    if (spec.directory_notes && spec.directory_notes.length) {
      lines.push('', '## Directory notes', '');
      spec.directory_notes.forEach(d => lines.push(`- \`${d.path}\` — ${d.note}`));
    }
    return lines.join('\n');
  }

  const AR_ANALYST = `You are a Repository Rules Analyst. You read a project brief and turn it into the structured facts a coding agent needs before it is allowed to change anything.

What separates a rules file that works from one that gets ignored:
- EXACT COMMANDS. "Run the tests" is useless. "pnpm test --run" is not. Never invent a command that was not given to you; if a command is missing, leave it out rather than guessing at a script name.
- GUARDRAILS THAT NAME PATHS. "Be careful with payments" is decoration. "Never edit db/migrations by hand — generate them with pnpm db:migrate" is enforceable.
- NON-OBVIOUS ONLY. The agent already knows how TypeScript works. It does not know that your /v1 routes are frozen.
- NO INVENTED FACTS. If the brief does not say what the CI does, say nothing about CI.

Respond with ONLY this JSON object, no prose and no code fences:
{
  "project": "the repo name",
  "summary": "one sentence an agent could read to know what this codebase is",
  "stack": [""],
  "commands": [{"label":"setup|build|test|lint|run|other", "command":"", "when":"when an agent should run it"}],
  "conventions": [{"rule":"", "why":""}],
  "guardrails": [{"rule":"", "scope":"the path or area it applies to"}],
  "architecture_notes": ["things about the layout that are not obvious from the file tree"],
  "directory_notes": [{"path":"", "note":""}],
  "pr_rules": ["what must be true before a change is proposed"],
  "open_questions": ["anything the brief left ambiguous that a human should fill in"]
}`;

  const AR_AUTHOR = `You are writing the AGENTS.md for a repository — the file every coding agent reads before touching the code.

Format rules:
- Plain Markdown. No YAML frontmatter, no HTML.
- Open with an H1 naming the project, then one or two sentences on what it is.
- Use these H2 sections, and omit any section you have no real content for: Setup, Commands, Architecture, Conventions, Guardrails, Pull requests.
- Put commands in fenced bash blocks, one command per line, exactly as given.
- Write in the imperative, addressed to the agent. "Run", "Never", "Prefer".
- Be short. A rules file nobody reads to the end is a rules file that does not work. Aim well under 150 lines.
- Include nothing that was not in the spec. No invented commands, no invented CI, no filler like "write clean code".

Return ONLY the Markdown file content — no commentary, no code fence around the whole thing.`;

  let arState = null;
  let arPipeline = null;

  function arSelectedHarnesses() {
    const picked = chipValues('ar-harnesses', 'harness');
    /* AGENTS.md is the source every variant is derived from, so it is always
       generated even when the user only asked for a native format. */
    return picked.indexOf('agents') === -1 ? ['agents'].concat(picked) : picked;
  }

  function arRenderTabs() {
    const strip = $('#ar-out-tabs');
    const copyBtn = $('#ar-copy-btn');
    if (!strip || !arState) return;
    const keys = arState.harnesses;
    strip.innerHTML = keys.map((k, i) =>
      `<button class="out-tab${i === 0 ? ' active' : ''}" data-ar-out="${k}">${esc(HARNESSES[k].name)}</button>`
    ).join('') + `<button class="out-tab" data-ar-out="install">Install</button>` +
      `<button class="out-tab" data-ar-out="json">JSON</button>`;
    strip.appendChild(copyBtn);

    $$('.out-tab[data-ar-out]', strip).forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.out-tab[data-ar-out]', strip).forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        arRender(tab.dataset.arOut);
      });
    });
  }

  function activeArView() {
    const t = $('.out-tab.active[data-ar-out]');
    return t ? t.dataset.arOut : (arState ? arState.harnesses[0] : 'agents');
  }

  function arRender(view) {
    const out = $('#ar-output');
    if (!out || !arState) return;

    if (view === 'json') {
      out.innerHTML = `<pre class="output-pre" style="padding:0;">${esc(JSON.stringify(arExport(), null, 2))}</pre>`;
      return;
    }

    if (view === 'install') {
      out.innerHTML = '<div class="protocol">' + arState.harnesses.map(k => {
        const h = HARNESSES[k];
        return `<div class="protocol-step"><strong>${esc(h.tool)}</strong> — write to <code>${esc(h.path)}</code><br>${esc(h.note)}</div>`;
      }).join('') + '</div>' +
      `<div class="prose" style="margin-top:20px;"><h4>Keeping them in sync</h4><p>Every file here is derived from the same spec. When the project changes, regenerate rather than hand-editing one file — two rules files that disagree are worse than one that is slightly out of date.</p></div>`;
      return;
    }

    const file = arState.files[view];
    if (!file) { out.innerHTML = '<p class="prose">Nothing generated for that harness.</p>'; return; }
    out.innerHTML =
      `<div class="calendar-meta" style="margin-bottom:16px;"><span class="tag format">${esc(HARNESSES[view].path)}</span><span class="tag">${esc(HARNESSES[view].tool)}</span></div>` +
      `<pre class="output-pre" style="padding:0;">${esc(file)}</pre>`;
  }

  function arExport() {
    if (!arState) return {};
    return {
      generated_at: new Date().toISOString(),
      inputs: arState.inputs,
      spec: arState.spec,
      files: arState.harnesses.map(k => ({
        harness: HARNESSES[k].tool,
        path: HARNESSES[k].path,
        content: arState.files[k]
      }))
    };
  }

  /* One download carrying every file, each under its real repo path. */
  function arBundle() {
    let md = `# Agent rules for ${arState.spec.project || arState.inputs.name}\n\n`;
    md += `Generated ${new Date().toISOString().split('T')[0]}. Write each block to the path in its heading.\n\n`;
    arState.harnesses.forEach(k => {
      const h = HARNESSES[k];
      md += `---\n\n## ${h.path}\n\n_${h.tool} — ${h.note}_\n\n`;
      md += '````markdown\n' + arState.files[k] + '\n````\n\n';
    });
    if (arState.spec.open_questions && arState.spec.open_questions.length) {
      md += `---\n\n## Left for a human\n\n`;
      arState.spec.open_questions.forEach(q => { md += `- ${q}\n`; });
    }
    return md;
  }

  function arRenderSummary() {
    const spec = arState.spec || {};
    const panel = $('#ar-summary-panel');
    if (!panel) return;
    panel.style.display = 'block';
    $('#ar-metrics').innerHTML = `
      <div class="metric"><div class="metric-value accent">${(spec.commands || []).length}</div><div class="metric-label">Commands</div></div>
      <div class="metric"><div class="metric-value">${(spec.conventions || []).length}</div><div class="metric-label">Conventions</div></div>
      <div class="metric"><div class="metric-value">${(spec.guardrails || []).length}</div><div class="metric-label">Guardrails</div></div>
      <div class="metric"><div class="metric-value jade">${arState.harnesses.length}</div><div class="metric-label">Files</div></div>`;

    let h = `<h4>${esc(spec.project || arState.inputs.name)}</h4><p>${esc(spec.summary || '')}</p>`;
    if (spec.open_questions && spec.open_questions.length) {
      h += `<h4>Left for a human</h4><ul>` +
        spec.open_questions.map(q => `<li>${esc(q)}</li>`).join('') + `</ul>`;
    }
    $('#ar-summary').innerHTML = h;
  }

  async function runAgentRules() {
    const description = ($('#ar-description').value || '').trim();
    if (!description) { toast('Describe the project first.'); $('#ar-description').focus(); return; }

    const inputs = {
      name: ($('#ar-name').value || '').trim() || 'this repository',
      description: description,
      stack: ($('#ar-stack').value || '').trim(),
      commands: ($('#ar-commands').value || '').trim(),
      conventions: ($('#ar-conventions').value || '').trim(),
      harnesses: arSelectedHarnesses(),
      model: $('#ar-model').value
    };

    const btn = $('#ar-run-btn');
    const status = $('#ar-inline-status');
    btn.disabled = true;
    status.style.display = '';
    status.classList.add('running');
    $('#ar-progress').textContent = 'Running';
    hideEmpty('agent-rules');
    pulse('agent-rules', 'live', 'Running');

    $('#ar-run').style.display = 'block';
    $('#ar-result').style.display = 'none';
    $('#ar-summary-panel').style.display = 'none';
    arPipeline.reset();
    meterStart('agent-rules', AR_STEPS);
    arState = { inputs: inputs, harnesses: inputs.harnesses, files: {} };

    const brief =
      `PROJECT\n${inputs.name}\n\n` +
      `BRIEF\n${inputs.description}\n\n` +
      (inputs.stack ? `STACK\n${inputs.stack}\n\n` : '') +
      (inputs.commands ? `COMMANDS GIVEN (use these verbatim, invent none)\n${inputs.commands}\n\n` : 'COMMANDS GIVEN\nnone — omit the Commands section entirely\n\n') +
      (inputs.conventions ? `HOUSE RULES\n${inputs.conventions}\n\n` : '') +
      `Extract the spec.`;

    try {
      arPipeline.set('analyse', 'active');
      meterStage('agent-rules', 'analyse');
      arState.spec = await chatJson(inputs.model, AR_ANALYST, brief, { max_tokens: 4000, temperature: 0.4 });
      arPipeline.set('analyse', 'done', (arState.spec.commands || []).length + ' commands');
      meterDone('agent-rules', 'analyse');
      arRenderSummary();

      arPipeline.set('author', 'active');
      meterStage('agent-rules', 'author');
      let body = await chat(inputs.model, AR_AUTHOR,
        `SPEC\n${JSON.stringify(arState.spec)}\n\nWrite the AGENTS.md.`,
        { max_tokens: 4000, temperature: 0.5 });
      /* Models like to wrap a whole document in a fence despite being asked not to. */
      body = body.replace(/^\s*```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
      arPipeline.set('author', 'done', body.split('\n').length + ' lines');
      meterDone('agent-rules', 'author');

      arPipeline.set('derive', 'active');
      meterStage('agent-rules', 'derive');
      arState.harnesses.forEach(k => {
        arState.files[k] = HARNESSES[k].transform(arState.spec, body);
      });
      arRenderTabs();
      $('#ar-result').style.display = 'block';
      arRender(arState.harnesses[0]);
      arPipeline.set('derive', 'done', arState.harnesses.length + ' files');
      meterDone('agent-rules', 'derive');

      pulse('agent-rules', 'done', 'Complete');
      meterFinish('agent-rules', true);
      toast('Agent rules written.');
    } catch (err) {
      console.error('[agent-rules]', err);
      const active = $('#ar-pipeline .pipeline-step.is-active');
      if (active) arPipeline.set(active.dataset.step, 'failed', 'Failed');
      pulse('agent-rules', null, 'Failed');
      meterFinish('agent-rules', false);
      toast('Agent rules failed: ' + err.message);
    } finally {
      btn.disabled = false;
      status.classList.remove('running');
      status.style.display = 'none';
    }
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

    /* Harness Builder */
    hbPipeline = new Pipeline('hb-pipeline', HB_STEPS);
    wireChips('hb-targets', true);
    wireSegmented('hb-autonomy');
    $('#hb-run-btn').addEventListener('click', runHarness);
    $('#hb-regenerate').addEventListener('click', runHarness);
    $('#hb-refine-btn').addEventListener('click', refineHarnessLayer);
    $('#hb-refine-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); refineHarnessLayer(); }
    });

    /* Clicking a tab mid-stream means the reader wants to stay put. */
    $('#hb-out-tabs').addEventListener('click', e => {
      if (e.target.closest('.out-tab')) hbState && (hbState.userPinned = true);
    });

    const hbImageToggle = $('#hb-image');
    if (hbImageToggle) {
      const syncImageModel = () => {
        $('#hb-image-model-group').style.display = hbImageToggle.checked ? '' : 'none';
      };
      hbImageToggle.addEventListener('change', syncImageModel);
      syncImageModel();
    }

    $('#hb-copy-btn').addEventListener('click', function () {
      if (!hbState) return toast('Build a harness first.');
      const view = hbActiveView();
      if (view === 'json') return copyText(JSON.stringify(hbExport(), null, 2), this);
      if (view === 'bundle') return copyText(hbMarkdown(), this);
      if (view === 'diagram') return copyText(hbState.recipe.mermaidDiagram || '', this);
      copyText(hbState.recipe[view] || '', this);
    });

    $('#hb-download-zip').addEventListener('click', downloadHarnessZip);

    $('#hb-download-md').addEventListener('click', () => {
      if (!hbState || !hbState.recipe.domain) return toast('Build a harness first.');
      download(hbSlug() + '-harness.md', hbMarkdown(), 'text/markdown');
      toast('Markdown downloaded.');
    });

    $('#hb-download-json').addEventListener('click', () => {
      if (!hbState || !hbState.recipe.domain) return toast('Build a harness first.');
      download(hbSlug() + '-harness.json', JSON.stringify(hbExport(), null, 2), 'application/json');
      toast('JSON downloaded.');
    });

    /* Agent Rules */
    arPipeline = new Pipeline('ar-pipeline', AR_STEPS);
    wireChips('ar-harnesses', true);
    $('#ar-run-btn').addEventListener('click', runAgentRules);
    $('#ar-regenerate').addEventListener('click', runAgentRules);

    $('#ar-copy-btn').addEventListener('click', function () {
      if (!arState) return toast('Write the rules first.');
      const view = activeArView();
      if (view === 'json') return copyText(JSON.stringify(arExport(), null, 2), this);
      if (view === 'install') return copyText(arBundle(), this);
      copyText(arState.files[view] || '', this);
    });

    $('#ar-download-bundle').addEventListener('click', () => {
      if (!arState) return toast('Write the rules first.');
      download(slug((arState.spec || {}).project, 'agent-rules') + '-rules.md', arBundle(), 'text/markdown');
      toast('Rule files downloaded.');
    });

    $('#ar-download-json').addEventListener('click', () => {
      if (!arState) return toast('Write the rules first.');
      download(slug((arState.spec || {}).project, 'agent-rules') + '-rules.json',
        JSON.stringify(arExport(), null, 2), 'application/json');
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
