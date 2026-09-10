#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   doctor.js — answer "is the Venice API actually working?" directly.

   Run:  node doctor.js            (checks the API through your key)
         node doctor.js --server   (also checks a running local server)

   Every check prints what it tried, what came back, and what to do about it.
   ══════════════════════════════════════════════════════════════════════════ */

require('dotenv').config();

const BASE = 'https://api.venice.ai/api/v1';
const SERVER = process.env.DOCTOR_SERVER || 'http://localhost:3000';
const checkServer = process.argv.includes('--server');

let pass = 0, warn = 0, fail = 0;

const ok   = (t, d) => { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${t}${d ? '\n        ' + d : ''}`); };
const wrn  = (t, d) => { warn++; console.log(`  \x1b[33mWARN\x1b[0m  ${t}${d ? '\n        ' + d : ''}`); };
const bad  = (t, d) => { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${t}${d ? '\n        ' + d : ''}`); };
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

function key() {
    let k = process.env.VENICE_API_KEY;
    if (!k) return null;
    return k.replace(/['"]/g, '').trim();
}

async function venice(path, init) {
    const res = await fetch(BASE + path, Object.assign({
        headers: { 'Authorization': `Bearer ${key()}`, 'Content-Type': 'application/json' }
    }, init || {}));
    const raw = await res.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (e) { /* keep raw */ }
    return { status: res.status, ok: res.ok, body, raw, headers: res.headers };
}

async function main() {
    console.log('\x1b[1mPrompt Optimizer — API doctor\x1b[0m');

    /* ── 1. the key ─────────────────────────────────────────────────────── */
    head('1. API key');
    const k = key();
    if (!k) {
        bad('VENICE_API_KEY is not set',
            'Create a .env file next to server.js containing:\n        VENICE_API_KEY=your-key-here');
        summarise();
        return;
    }
    ok(`VENICE_API_KEY present (${k.length} chars, starts "${k.slice(0, 6)}…")`);
    if (/^["']|["']$/.test(process.env.VENICE_API_KEY || '')) {
        wrn('The key in .env is wrapped in quotes',
            'The server strips them, but drop them to avoid confusion.');
    }

    /* ── 2. reachability + auth ─────────────────────────────────────────── */
    head('2. Reachability and auth');
    let models;
    try {
        models = await venice('/models?type=text');
    } catch (e) {
        bad('Cannot reach api.venice.ai', `${e.message}\n        Check network access and any outbound proxy.`);
        summarise();
        return;
    }
    if (models.status === 401) {
        bad('Venice rejected the key (401)', 'The key is wrong, revoked, or not an INFERENCE key.');
        summarise();
        return;
    }
    if (!models.ok) {
        bad(`GET /models returned ${models.status}`, (models.raw || '').slice(0, 300));
        summarise();
        return;
    }
    const textModels = (models.body && models.body.data) || [];
    ok(`GET /models?type=text → ${textModels.length} models`);

    const offline = textModels.filter(m => m.model_spec && m.model_spec.offline);
    if (offline.length) {
        wrn(`${offline.length} text model(s) are offline`, offline.map(m => m.id).join(', '));
    }

    /* ── 3. completion budgets: the loop tab's failure mode ────────────── */
    head('3. Completion budgets (why a big spec truncates)');
    const tight = textModels
        .map(m => ({ id: m.id, max: m.model_spec && m.model_spec.maxCompletionTokens }))
        .filter(m => typeof m.max === 'number' && m.max < 8000);
    if (tight.length) {
        wrn(`${tight.length} model(s) cap completions below the 8000 the loop compiler asks for`,
            tight.map(m => `${m.id} → ${m.max}`).join('\n        ') +
            '\n        Pick one of the roomier models for Loop Design and Harness Builder.');
    } else {
        ok('Every listed text model can produce at least 8000 completion tokens');
    }

    /* ── 4. image catalogue ────────────────────────────────────────────── */
    head('4. Image catalogue');
    const imgs = await venice('/models?type=image');
    if (imgs.ok) {
        const list = (imgs.body && imgs.body.data) || [];
        ok(`GET /models?type=image → ${list.length} models`);
        const priced = list.filter(m => m.model_spec && m.model_spec.pricing);
        if (priced.length < list.length) {
            wrn(`${list.length - priced.length} image model(s) publish no price`,
                'Those runs will show as "unpriced" in the cost meter.');
        }
    } else {
        wrn(`GET /models?type=image returned ${imgs.status}`, 'Image generation and its cost estimate will be unavailable.');
    }

    /* ── 5. a real completion ──────────────────────────────────────────── */
    head('5. A real chat completion');
    const probeModel = (textModels.find(m => !(m.model_spec && m.model_spec.offline)) || {}).id;
    if (!probeModel) {
        bad('No usable text model to probe with');
    } else {
        const chat = await venice('/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                model: probeModel,
                max_tokens: 64,
                messages: [{ role: 'user', content: 'Reply with the single word: ok' }]
            })
        });
        if (chat.ok && chat.body && chat.body.choices) {
            ok(`POST /chat/completions on ${probeModel}`,
               `finish_reason=${chat.body.choices[0].finish_reason}, usage=${JSON.stringify(chat.body.usage || {})}`);
        } else {
            bad(`POST /chat/completions returned ${chat.status}`, (chat.raw || '').slice(0, 300));
        }

        /* ── 6. does this model honour JSON mode? ──────────────────────── */
        head('6. JSON mode (response_format)');
        const js = await venice('/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                model: probeModel,
                max_tokens: 200,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: 'Return {"status":"ok"} and nothing else.' }]
            })
        });
        if (js.ok && js.body && js.body.choices) {
            const content = js.body.choices[0].message.content || '';
            let parsed = null;
            try { parsed = JSON.parse(content.trim()); } catch (e) { /* not clean */ }
            if (parsed) ok(`${probeModel} honours response_format: json_object`);
            else wrn(`${probeModel} accepted response_format but did not return bare JSON`,
                     'json-rescue will recover it; nothing to fix.');
        } else {
            wrn(`response_format rejected (${js.status}) on ${probeModel}`,
                'The app still works — json-rescue extracts JSON from prose.');
        }

        /* ── 7. streamed usage: needed to cost the Harness Builder ────── */
        head('7. Streamed usage reporting');
        const st = await venice('/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                model: probeModel,
                max_tokens: 64,
                stream: true,
                stream_options: { include_usage: true },
                messages: [{ role: 'user', content: 'Count to three.' }]
            })
        });
        if (!st.ok) {
            wrn(`Streaming returned ${st.status}`, 'The Harness Builder falls back to a non-streamed call.');
        } else if (/"usage"\s*:/.test(st.raw || '')) {
            ok('The stream carries a usage frame — streamed runs will be costed');
        } else {
            wrn('The stream carried no usage frame',
                'Harness Builder runs will show as "unpriced" rather than wrong.');
        }
    }

    /* ── 8. the local server, optionally ───────────────────────────────── */
    if (checkServer) {
        head('8. Local server');
        try {
            const h = await fetch(SERVER + '/api/health');
            const body = await h.json();
            if (body && body.status === 'ok' && body.env_check && body.env_check.has_key) {
                ok(`${SERVER} is up and sees the key`);
            } else {
                bad(`${SERVER}/api/health did not report a key`, JSON.stringify(body));
            }
            for (const route of ['/api/models?type=text']) {
                const r = await fetch(SERVER + route);
                r.ok ? ok(`GET ${route} via the server`) : bad(`GET ${route} via the server → ${r.status}`);
            }
        } catch (e) {
            bad(`${SERVER} is not reachable`, `${e.message}\n        Start it with: npm start`);
        }
    } else {
        head('8. Local server');
        console.log('        skipped — re-run with --server while `npm start` is running');
    }

    summarise();
}

function summarise() {
    console.log(`\n\x1b[1m${pass} passed · ${warn} warnings · ${fail} failures\x1b[0m`);
    if (fail) {
        console.log('\nThe API is not usable as configured. Fix the failures above first.');
        process.exitCode = 1;
    } else if (warn) {
        console.log('\nThe API works. The warnings are worth knowing but nothing is broken.');
    } else {
        console.log('\nEverything checks out.');
    }
}

main().catch(e => {
    console.error('\nThe doctor itself failed:', e);
    process.exitCode = 1;
});
