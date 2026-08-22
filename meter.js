/* ══════════════════════════════════════════════════════════════════════════
   meter.js — run progress and cost metering, shared by every generator.

   Two jobs:

   1. PROGRESS. A determinate bar driven by weighted stages. Within a stage
      the bar eases toward that stage's ceiling but never reaches it until the
      stage actually reports done, so the bar can only be ahead of reality by
      less than one stage — never behind it, and never stuck at 100%.

   2. COST. Venice publishes per-model pricing on /models. We read it, show a
      pre-run estimate beside each model picker, then instrument fetch to
      capture the real `usage` block off every completion and price it. The
      instrumentation is why cost works on the tabs app.js owns without
      touching app.js.

   Loaded before app.js so the fetch wrapper is in place for every call.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ── Pricing catalogue ──────────────────────────────────────────────────
     model_spec.pricing shapes we care about:
       text  → input.usd / output.usd, per 1,000,000 tokens
               (+ optional cache_input, and an extended.* tier that kicks in
                above extended.context_token_threshold input tokens)
       image → generation.usd flat per image, or resolutions.<1K|2K|4K>.usd
     Pricing is absent on some free/internal models — every read guards. */

  const pricing = new Map();   // modelId -> normalised price record
  let pricingReady = false;

  function normalisePricing(model) {
    const spec = model.model_spec || {};
    const p = spec.pricing;
    if (!p) return null;

    if (p.input || p.output) {
      return {
        kind: 'text',
        name: spec.name || model.id,
        inPerM: num(p.input && p.input.usd),
        outPerM: num(p.output && p.output.usd),
        cachedPerM: num(p.cache_input && p.cache_input.usd),
        extended: p.extended && p.extended.context_token_threshold ? {
          threshold: Number(p.extended.context_token_threshold),
          inPerM: num(p.extended.input && p.extended.input.usd),
          outPerM: num(p.extended.output && p.extended.output.usd)
        } : null
      };
    }

    if (p.generation || p.resolutions) {
      return {
        kind: 'image',
        name: spec.name || model.id,
        perImage: num(p.generation && p.generation.usd),
        byResolution: p.resolutions || null
      };
    }
    return null;
  }

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  async function loadCatalogue(query) {
    const res = await fetch('/api/models' + query);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    (data && data.data ? data.data : []).forEach(m => {
      const rec = normalisePricing(m);
      if (rec) pricing.set(m.id, rec);
    });
  }

  async function loadPricing() {
    /* Text and image rates live in separate catalogues. Asking for each by
       name is why an image model can be priced at all — a single unfiltered
       request is not guaranteed to carry both. */
    const results = await Promise.allSettled([
      loadCatalogue('?type=text'),
      loadCatalogue('?type=image')
    ]);
    if (results.every(r => r.status === 'rejected')) {
      /* No catalogue means no numbers — the UI says "unpriced" rather than
         inventing a figure. */
      console.warn('[meter] pricing unavailable:', results[0].reason && results[0].reason.message);
    }
    pricingReady = true;
    document.dispatchEvent(new CustomEvent('meter:pricing'));
    refreshAllEstimates();
  }

  function priceText(modelId, inTok, outTok, cachedTok) {
    const p = pricing.get(modelId);
    if (!p || p.kind !== 'text') return null;
    const tier = (p.extended && inTok > p.extended.threshold) ? p.extended : p;
    const billableIn = Math.max(0, inTok - (cachedTok || 0));
    return (billableIn / 1e6) * tier.inPerM
         + (outTok / 1e6) * tier.outPerM
         + ((cachedTok || 0) / 1e6) * (p.cachedPerM || tier.inPerM);
  }

  function priceImage(modelId, count, resolution) {
    const p = pricing.get(modelId);
    if (!p || p.kind !== 'image') return null;
    if (p.byResolution) {
      const tier = p.byResolution[resolution || '1K'] || Object.values(p.byResolution)[0];
      return count * num(tier && tier.usd);
    }
    return count * p.perImage;
  }

  function fmtUsd(v) {
    if (v == null) return '—';
    if (v === 0) return '$0.00';
    if (v < 0.01) return '$' + v.toFixed(4);
    if (v < 1) return '$' + v.toFixed(3);
    return '$' + v.toFixed(2);
  }

  function fmtTokens(n) {
    if (n == null) return '—';
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  }

  /* ── Run profiles ───────────────────────────────────────────────────────
     Typical token volume per generator, used only for the pre-run estimate.
     Measured from representative runs; the meter replaces every one of these
     with real usage the moment a call returns. */

  const PROFILES = {
    'optimizer':        { calls: 1, inTok: 1100, outTok: 800 },
    'agent-builder':    { calls: 1, inTok: 700,  outTok: 1400 },
    'anthropic-skills': { calls: 2, inTok: 2400, outTok: 4200 },
    'agent-rules':      { calls: 2, inTok: 3000, outTok: 2600 },
    'harness-builder':  { calls: 2, inTok: 4200, outTok: 11000 },
    'plugin-builder':   { calls: 5, inTok: 4000, outTok: 4500 },
    'loop-design':      { calls: 2, inTok: 4200, outTok: 5000 },
    'content-loop':     { calls: 3, inTok: 5200, outTok: 7000 },
    'gauntlet-loop':    { calls: 2, inTok: 3600, outTok: 6500 }
  };

  /* Which model picker drives which tab's estimate, and whether the tab also
     spends on images. */
  const TAB_MODEL_SELECT = {
    'optimizer':        '#model-select',
    'agent-builder':    '#agent-model-select',
    'anthropic-skills': '#anthropic-model-select',
    'plugin-builder':   '#plugin-model-select',
    'loop-design':      '#loop-model-select',
    'content-loop':     '#cl-model',
    'gauntlet-loop':    '#gl-model',
    'agent-rules':      '#ar-model',
    'harness-builder':  '#hb-model'
  };

  /* ── Cost ledger ────────────────────────────────────────────────────────
     One ledger per tab, reset when that tab starts a run. */

  const ledgers = new Map();   // tabId -> {entries:[], total:number}

  function ledger(tabId) {
    if (!ledgers.has(tabId)) ledgers.set(tabId, { entries: [], total: 0, unpriced: 0 });
    return ledgers.get(tabId);
  }

  function resetLedger(tabId) {
    ledgers.set(tabId, { entries: [], total: 0, unpriced: 0 });
    renderCost(tabId);
  }

  function record(tabId, entry) {
    const l = ledger(tabId);
    l.entries.push(entry);
    if (entry.usd == null) l.unpriced++;
    else l.total += entry.usd;
    renderCost(tabId);
  }

  /* ── fetch instrumentation ──────────────────────────────────────────────
     Every /api/chat and /api/image response is priced and attributed to
     whichever tab is active when it returns. Bodies are read off a clone so
     the caller's own read is untouched. */

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isChat  = /\/api\/chat\b/.test(url);
    const isImage = /\/api\/image\b/.test(url);
    if (!isChat && !isImage) return nativeFetch(input, init);

    let requestedModel = null;
    let requestedResolution = null;
    try {
      const raw = (init && init.body) || (input && input.body);
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        requestedModel = parsed.model || null;
        requestedResolution = parsed.resolution || null;
      }
    } catch (e) { /* not our concern — pricing just falls back to unpriced */ }

    const startedAt = performance.now();
    const tabId = activeTab();

    return nativeFetch(input, init).then(res => {
      if (!res.ok) return res;

      /* A streamed completion is an event stream, not JSON. Read the clone as
         text and pull `usage` out of the frames — without this the streaming
         generators would report no cost at all. */
      const streamed = /event-stream/i.test(res.headers.get('content-type') || '');
      if (isChat && streamed) {
        meterStreamedChat(res.clone(), tabId, requestedModel, startedAt);
        return res;
      }

      res.clone().json().then(data => {
        const elapsed = Math.round(performance.now() - startedAt);

        if (isChat) {
          const u = data && data.usage;
          const model = (data && data.model) || requestedModel;
          const inTok = u ? Number(u.prompt_tokens || 0) : null;
          const outTok = u ? Number(u.completion_tokens || 0) : null;
          const cachedTok = u && u.prompt_tokens_details
            ? Number(u.prompt_tokens_details.cached_tokens || 0) : 0;
          record(tabId, {
            kind: 'chat',
            model: model,
            inTok: inTok,
            outTok: outTok,
            cachedTok: cachedTok,
            ms: elapsed,
            usd: (u && model) ? priceText(model, inTok, outTok, cachedTok) : null
          });
        } else {
          const count = (data && data.images && data.images.length) || 1;
          record(tabId, {
            kind: 'image',
            model: requestedModel,
            count: count,
            ms: elapsed,
            usd: requestedModel ? priceImage(requestedModel, count, requestedResolution) : null
          });
        }
      }).catch(() => { /* non-JSON response — nothing to meter */ });
      return res;
    });
  };

  /* Drain a cloned event stream and record whatever usage it reported.
     Venice emits a final usage frame when stream_options.include_usage is set;
     when it does not, the call is still recorded so the operator can see it
     happened, just marked unpriced rather than silently dropped. */
  async function meterStreamedChat(clone, tabId, requestedModel, startedAt) {
    let usage = null;
    let model = requestedModel;
    try {
      const text = await clone.text();
      text.split('\n').forEach(line => {
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        let parsed;
        try { parsed = JSON.parse(payload); } catch (e) { return; }
        if (parsed.usage) usage = parsed.usage;
        if (parsed.model) model = parsed.model;
      });
    } catch (e) { /* stream aborted — record what we know */ }

    const inTok = usage ? Number(usage.prompt_tokens || 0) : null;
    const outTok = usage ? Number(usage.completion_tokens || 0) : null;
    const cachedTok = usage && usage.prompt_tokens_details
      ? Number(usage.prompt_tokens_details.cached_tokens || 0) : 0;

    record(tabId, {
      kind: 'chat',
      model: model,
      inTok: inTok,
      outTok: outTok,
      cachedTok: cachedTok,
      streamed: true,
      ms: Math.round(performance.now() - startedAt),
      usd: (usage && model) ? priceText(model, inTok, outTok, cachedTok) : null
    });
  }

  function activeTab() {
    const sec = $('main > .section.active');
    return sec ? sec.id : 'optimizer';
  }

  /* ── Progress engine ────────────────────────────────────────────────────
     `runs` holds live state per tab. `shown` is what the bar currently
     displays; it eases toward `ceiling` (the top of the active stage) so the
     bar keeps moving during a long call without ever claiming a stage is
     finished before it is. */

  const runs = new Map();
  let ticker = null;

  function totalWeight(stages) {
    return stages.reduce((n, s) => n + (s.weight || 1), 0) || 1;
  }

  function floorOf(run, index) {
    let acc = 0;
    for (let i = 0; i < index; i++) acc += run.stages[i].weight || 1;
    return acc / run.total;
  }

  function start(tabId, stages, opts) {
    const run = {
      stages: stages.map(s => ({ key: s.key, label: s.label, weight: s.weight || 1 })),
      index: -1,
      shown: 0,
      ceiling: 0,
      startedAt: Date.now(),
      finished: false,
      failed: false,
      label: (opts && opts.label) || 'Starting'
    };
    run.total = totalWeight(run.stages);
    runs.set(tabId, run);
    resetLedger(tabId);
    ensureTicker();
    render(tabId);
  }

  function stage(tabId, key, label) {
    const run = runs.get(tabId);
    if (!run) return;
    const i = run.stages.findIndex(s => s.key === key);
    if (i < 0) return;
    run.index = i;
    run.label = label || run.stages[i].label;
    /* The bar may sit anywhere inside this stage, but never past its top. */
    run.shown = Math.max(run.shown, floorOf(run, i));
    run.ceiling = floorOf(run, i) + (run.stages[i].weight / run.total) * 0.92;
    render(tabId);
  }

  function stageDone(tabId, key) {
    const run = runs.get(tabId);
    if (!run) return;
    const i = run.stages.findIndex(s => s.key === key);
    if (i < 0) return;
    const top = floorOf(run, i) + run.stages[i].weight / run.total;
    run.shown = Math.max(run.shown, top);
    run.ceiling = run.shown;
    render(tabId);
  }

  function finish(tabId, ok, label) {
    const run = runs.get(tabId);
    if (!run) return;
    run.finished = true;
    run.failed = !ok;
    run.shown = ok ? 1 : run.shown;
    run.ceiling = run.shown;
    run.label = label || (ok ? 'Complete' : 'Failed');
    render(tabId);
  }

  function ensureTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      let live = false;
      runs.forEach((run, tabId) => {
        if (run.finished) return;
        live = true;
        if (run.shown < run.ceiling) {
          /* Ease: cover a fifth of the remaining gap each tick, so movement is
             visible early in a stage and slows as it approaches the ceiling. */
          run.shown += (run.ceiling - run.shown) * 0.055;
          render(tabId);
        } else {
          renderElapsed(tabId);
        }
      });
      if (!live) { clearInterval(ticker); ticker = null; }
    }, 180);
  }

  /* ── Legacy binding ─────────────────────────────────────────────────────
     app.js already animates a percentage into #<tab>-progress and toggles a
     loader. We read those rather than reimplementing the flows. */

  function bindLegacy(tabId, progressId, loaderId, resultIds, statusId) {
    const progressEl = document.getElementById(progressId);
    const loaderEl = document.getElementById(loaderId);
    const statusEl = statusId ? document.getElementById(statusId) : null;
    const resultEls = (resultIds || []).map(id => document.getElementById(id)).filter(Boolean);
    if (!progressEl || !loaderEl) return;

    const visible = el => !!el && el.style.display !== 'none';
    let running = false;

    /* Several of these tabs narrate their own steps into a status line.
       Where one exists it is a better label than a generic "Generating". */
    const currentLabel = () => {
      const text = statusEl ? String(statusEl.textContent || '').trim() : '';
      return text ? text.replace(/[.…]+$/, '') : 'Generating';
    };

    const sync = () => {
      const nowRunning = visible(loaderEl);
      const done = resultEls.some(visible);

      if (nowRunning && !running) {
        running = true;
        start(tabId, [{ key: 'run', label: currentLabel(), weight: 1 }]);
        stage(tabId, 'run', currentLabel());
      }

      if (nowRunning) {
        const run = runs.get(tabId);
        const pct = parseFloat(String(progressEl.textContent).replace('%', ''));
        if (run) {
          run.label = currentLabel();
          if (isFinite(pct)) {
            /* app.js caps its own counter at 90; treat that as the ceiling so
               the bar behaves like every other tab and never claims done. */
            run.ceiling = Math.min(0.92, pct / 100);
          }
          render(tabId);
        }
      } else if (running) {
        running = false;
        finish(tabId, done, done ? 'Complete' : 'Idle');
      }
    };

    new MutationObserver(sync).observe(progressEl, { childList: true, characterData: true, subtree: true });
    if (statusEl) new MutationObserver(sync).observe(statusEl, { childList: true, characterData: true, subtree: true });
    const mo = new MutationObserver(sync);
    [loaderEl].concat(resultEls).forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['style'] }));
    sync();
  }

  /* ── Rendering ──────────────────────────────────────────────────────────
     One meter per section, injected under the stage header. */

  function meterMarkup(tabId) {
    return `
      <div class="meter" data-meter-for="${tabId}">
        <div class="meter-track"><i class="meter-fill"></i></div>
        <div class="meter-row">
          <span class="meter-stage">Idle</span>
          <span class="meter-pct">0%</span>
          <span class="meter-sep"></span>
          <span class="meter-elapsed">0.0s</span>
          <button type="button" class="meter-cost" data-cost-toggle aria-expanded="false">
            <span class="meter-cost-value">—</span>
            <span class="meter-cost-label">est.</span>
          </button>
        </div>
        <div class="meter-breakdown" hidden></div>
      </div>`;
  }

  function mountMeters() {
    $$('main > .section').forEach(section => {
      const head = $('.stage-head', section);
      if (!head || $('.meter', section)) return;
      head.insertAdjacentHTML('afterend', meterMarkup(section.id));
    });

    $$('[data-cost-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const meter = btn.closest('.meter');
        const panel = $('.meter-breakdown', meter);
        const open = !panel.hidden;
        panel.hidden = open;
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  function meterOf(tabId) { return $(`.meter[data-meter-for="${tabId}"]`); }

  function render(tabId) {
    const meter = meterOf(tabId);
    const run = runs.get(tabId);
    if (!meter || !run) return;

    const pct = Math.max(0, Math.min(1, run.shown));
    const fill = $('.meter-fill', meter);
    fill.style.width = (pct * 100).toFixed(1) + '%';

    meter.classList.toggle('is-running', !run.finished);
    meter.classList.toggle('is-done', run.finished && !run.failed);
    meter.classList.toggle('is-failed', run.failed);

    $('.meter-pct', meter).textContent = Math.round(pct * 100) + '%';
    const multi = run.stages.length > 1;
    $('.meter-stage', meter).textContent = (run.failed || run.finished || run.index < 0 || !multi)
      ? run.label
      : `${run.index + 1}/${run.stages.length} · ${run.label}`;

    renderElapsed(tabId);
  }

  function renderElapsed(tabId) {
    const meter = meterOf(tabId);
    const run = runs.get(tabId);
    if (!meter || !run) return;
    const secs = (Date.now() - run.startedAt) / 1000;
    $('.meter-elapsed', meter).textContent = secs < 60
      ? secs.toFixed(1) + 's'
      : Math.floor(secs / 60) + 'm ' + Math.round(secs % 60) + 's';
  }

  function renderCost(tabId) {
    const meter = meterOf(tabId);
    if (!meter) return;
    const l = ledger(tabId);
    const value = $('.meter-cost-value', meter);
    const label = $('.meter-cost-label', meter);
    const panel = $('.meter-breakdown', meter);

    if (!l.entries.length) {
      const est = estimateFor(tabId);
      value.textContent = est == null ? '—' : '~' + fmtUsd(est);
      label.textContent = 'est.';
      meter.classList.remove('has-cost');
      panel.innerHTML = est == null
        ? '<p class="meter-note">Model pricing unavailable — costs will show once the catalogue loads.</p>'
        : `<p class="meter-note">Estimate for a typical run on the selected model. Replaced by measured usage as soon as the first call returns.</p>`;
      return;
    }

    value.textContent = fmtUsd(l.total);
    label.textContent = l.unpriced ? 'actual*' : 'actual';
    meter.classList.add('has-cost');

    const rows = l.entries.map((e, i) => {
      const cells = e.kind === 'chat'
        ? `<span class="bd-tokens">${e.inTok == null
             ? 'streamed · usage not reported'
             : `${fmtTokens(e.inTok)} in · ${fmtTokens(e.outTok)} out${e.cachedTok ? ` · ${fmtTokens(e.cachedTok)} cached` : ''}`}</span>`
        : `<span class="bd-tokens">${e.count} image${e.count === 1 ? '' : 's'}</span>`;
      return `
        <div class="bd-row">
          <span class="bd-index">${String(i + 1).padStart(2, '0')}</span>
          <span class="bd-model">${escape(e.model || 'unknown model')}</span>
          ${cells}
          <span class="bd-ms">${(e.ms / 1000).toFixed(1)}s</span>
          <span class="bd-usd">${e.usd == null ? '—' : fmtUsd(e.usd)}</span>
        </div>`;
    }).join('');

    const totIn = l.entries.reduce((n, e) => n + (e.inTok || 0), 0);
    const totOut = l.entries.reduce((n, e) => n + (e.outTok || 0), 0);

    panel.innerHTML = rows + `
      <div class="bd-row bd-total">
        <span class="bd-index"></span>
        <span class="bd-model">${l.entries.length} call${l.entries.length === 1 ? '' : 's'}</span>
        <span class="bd-tokens">${fmtTokens(totIn)} in · ${fmtTokens(totOut)} out</span>
        <span class="bd-ms"></span>
        <span class="bd-usd">${fmtUsd(l.total)}</span>
      </div>` +
      (l.unpriced ? `<p class="meter-note">* ${l.unpriced} call${l.unpriced === 1 ? '' : 's'} could not be priced — either Venice publishes no rate for that model, or a streamed response reported no usage.</p>` : '');
  }

  function escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Pre-run estimate ───────────────────────────────────────────────── */

  function selectedModelFor(tabId) {
    const sel = TAB_MODEL_SELECT[tabId];
    const el = (typeof sel === 'string') ? $(sel) : null;
    if (el && el.value) return el.value;
    /* Tabs without their own picker follow the Optimizer's model, which is
       what app.js sends for them. */
    const fallback = $('#model-select');
    return fallback ? fallback.value : null;
  }

  function estimateFor(tabId) {
    const profile = PROFILES[tabId];
    const model = selectedModelFor(tabId);
    if (!profile || !model) return null;
    let est = priceText(model, profile.inTok, profile.outTok);
    if (est == null) return null;

    if (tabId === 'harness-builder') {
      const on = $('#hb-image');
      const imgModel = $('#hb-image-model');
      if (on && on.checked && imgModel) {
        const img = priceImage(imgModel.value, 1, '1K');
        if (img != null) est += img;
      }
    }

    /* Content Loop also spends on images when visuals are switched on. */
    if (tabId === 'content-loop') {
      const on = $('#cl-visuals');
      const imgModel = $('#cl-image-model');
      if (on && on.checked && imgModel) {
        const img = priceImage(imgModel.value, 4, '1K');
        if (img != null) est += img;
      }
    }
    return est;
  }

  function refreshAllEstimates() {
    Object.keys(PROFILES).forEach(tabId => {
      if (!ledger(tabId).entries.length) renderCost(tabId);
    });
  }

  function watchModelPickers() {
    const ids = new Set(Object.values(TAB_MODEL_SELECT).concat(['#model-select']));

    ids.forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('change', refreshAllEstimates);
      /* Every picker is filled asynchronously — app.js repopulates its own
         once the catalogue lands, generators.js fills the newer tabs' — and a
         programmatic fill raises no change event. Watch the options instead,
         or a tab whose picker is still empty when pricing resolves would show
         a dash forever. */
      new MutationObserver(refreshAllEstimates).observe(el, { childList: true });
    });

    ['#cl-visuals', '#cl-image-model', '#hb-image', '#hb-image-model'].forEach(sel => {
      const el = $(sel);
      if (el) el.addEventListener('change', refreshAllEstimates);
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */

  function boot() {
    mountMeters();
    watchModelPickers();
    loadPricing();
    refreshAllEstimates();

    bindLegacy('optimizer', 'optimizer-progress', 'optimizer-loader', ['optimizer-result']);
    bindLegacy('agent-builder', 'agent-progress', 'agent-loader', ['agent-result']);
    bindLegacy('anthropic-skills', 'anthropic-progress', 'anthropic-skill-loader', ['anthropic-skill-result', 'anthropic-skill-analysis'], 'anthropic-skill-status');
    bindLegacy('plugin-builder', 'plugin-progress', 'plugin-loader', ['plugin-result'], 'plugin-status');
    bindLegacy('loop-design', 'loop-progress', 'loop-loader', ['loop-result'], 'loop-status');
  }

  window.RunMeter = {
    start: start,
    stage: stage,
    stageDone: stageDone,
    finish: finish,
    fmtUsd: fmtUsd,
    refreshEstimates: refreshAllEstimates
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
