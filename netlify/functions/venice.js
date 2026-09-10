/* ══════════════════════════════════════════════════════════════════════════
   venice.js — the Venice proxy for the deployed site.

   server.js only runs locally. On Netlify there was no handler for /api/*, so
   every generator on the deployed site failed: the request fell through to the
   static 404 page and the browser tried to parse HTML as JSON.

   This mirrors server.js's chat, models and image routes so the deployed site
   behaves the same way. The key stays server-side, exactly as it does locally.

   Streaming is not offered here — Netlify's function response is buffered, so
   `stream: true` is stripped and the equivalent non-streamed call is made
   instead. The client already falls back to that path when the response is not
   an event stream, so the Harness Builder still works; it just fills in at the
   end rather than layer by layer.
   ══════════════════════════════════════════════════════════════════════════ */

const VENICE = 'https://api.venice.ai/api/v1';

function getKey() {
  const raw = process.env.VENICE_API_KEY;
  if (!raw) return null;
  return raw.replace(/['"]/g, '').trim();
}

function reply(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}),
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

exports.handler = async function (event) {
  const key = getKey();
  if (!key) {
    return reply(500, { error: 'Configuration Error: VENICE_API_KEY is not set on the site.' });
  }

  /* /.netlify/functions/venice/chat  ->  "chat" */
  const path = (event.path || '').replace(/^.*\/venice\/?/, '').replace(/\/+$/, '');
  const auth = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    if (path === 'models') {
      const type = (event.queryStringParameters || {}).type;
      const url = VENICE + '/models' + (type ? `?type=${encodeURIComponent(type)}` : '');
      const res = await fetch(url, { headers: { 'Authorization': auth.Authorization } });
      return reply(res.status, await res.text());
    }

    if (path === 'health') {
      return reply(200, {
        status: 'ok',
        env_check: { has_key: true, key_length: key.length, key_start: `${key.slice(0, 4)}...` }
      });
    }

    if (event.httpMethod !== 'POST') {
      return reply(405, { error: `${path || '(root)'} expects POST` });
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return reply(400, { error: 'Request body was not valid JSON.' }); }

    if (path === 'chat') {
      /* A buffered function cannot relay an event stream. */
      if (body.stream) {
        delete body.stream;
        delete body.stream_options;
      }
      const res = await fetch(VENICE + '/chat/completions', {
        method: 'POST', headers: auth, body: JSON.stringify(body)
      });
      return reply(res.status, await res.text());
    }

    if (path === 'image') {
      if (!body.model || !body.prompt) {
        return reply(400, { error: 'Both "model" and "prompt" are required.' });
      }
      const res = await fetch(VENICE + '/image/generate', {
        method: 'POST', headers: auth, body: JSON.stringify(body)
      });
      return reply(res.status, await res.text());
    }

    return reply(404, { error: `No proxy route for "${path}".` });
  } catch (err) {
    return reply(502, { error: `Could not reach Venice: ${err.message}` });
  }
};
