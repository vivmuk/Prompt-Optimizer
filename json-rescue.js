/* ══════════════════════════════════════════════════════════════════════════
   json-rescue.js — recover a JSON object from whatever a model actually sent.

   Models do not reliably return bare JSON. In practice a response arrives as
   one of: clean JSON; JSON in a ```json fence; JSON after a reasoning
   preamble; JSON inside or after a <thinking> block; JSON followed by
   "hope this helps"; or JSON cut off mid-string because the completion hit
   its token ceiling.

   The naive approach — slice from the first "{" to the last "}" — handles the
   first two and fails the rest. A reasoning model that writes
   "the schema needs {loop_type, goal}" before answering defeats it outright,
   and a truncated response defeats it silently.

   So: strip the wrappers, then try every plausible starting brace with a
   string-aware balance scan, keep whichever candidates actually parse, and
   prefer the richest one. If nothing parses, close the open structures and
   parse the repair, which turns a truncated response into the fields that did
   arrive rather than a hard failure.
   ══════════════════════════════════════════════════════════════════════════ */

(function (root) {
  'use strict';

  /* Reasoning traces. Venice surfaces these for thinking models, and their
     contents routinely include braces that are not part of the answer. */
  function stripThinking(text) {
    return String(text == null ? '' : text)
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, ' ')
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, ' ')
      /* An unclosed trace means the answer never arrived; drop the rest. */
      .replace(/<(?:thinking|think|reasoning)>[\s\S]*$/i, ' ');
  }

  function stripFences(text) {
    return String(text == null ? '' : text)
      .replace(/```(?:json|javascript|js)?/gi, '')
      .replace(/```/g, '');
  }

  /* Walk the text from `start`, string- and escape-aware.

     Returns where the structure closed, and — because a truncated payload
     never closes — a list of checkpoints: every index at which the JSON was
     in a state that could legally be closed, paired with what was open there.
     Repair then works backwards through those instead of guessing. */
  function scan(text, start) {
    const openCh = text[start];
    if (openCh !== '{' && openCh !== '[') return null;

    const stack = [];
    const checkpoints = [];
    let inStr = false, escaped = false;

    const mark = (i) => checkpoints.push({ at: i, stack: stack.slice() });

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { if (inStr) escaped = true; continue; }

      if (ch === '"') {
        inStr = !inStr;
        if (!inStr) mark(i);              /* a string just completed */
        continue;
      }
      if (inStr) continue;

      if (ch === '{' || ch === '[') { stack.push(ch); continue; }

      if (ch === '}' || ch === ']') {
        stack.pop();
        if (!stack.length) return { end: i, complete: true, checkpoints: checkpoints };
        mark(i);                          /* a nested value completed */
        continue;
      }

      if (ch === 'e' || ch === 'E' || ch === '+' || ch === '.' || ch === '-' || (ch >= '0' && ch <= '9')) {
        const next = text[i + 1];
        if (next === undefined || /[\s,}\]]/.test(next)) mark(i);
        continue;
      }

      for (const lit of ['true', 'false', 'null']) {
        if (text.startsWith(lit, i)) { i += lit.length - 1; mark(i); break; }
      }
    }

    return { end: text.length - 1, complete: false, checkpoints: checkpoints };
  }

  /* Rank candidates by how much of the response they span. Counting keys
     instead would let one fat element of an array outrank the array itself,
     and a decoy object outrank the real payload only by accident. */
  function span(start, end) { return end - start; }

  function usable(value) {
    return value && typeof value === 'object' &&
      (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0);
  }

  /* Close the structures that were still open at a checkpoint and parse the
     result. Works newest checkpoint first, so the repair keeps as much of the
     response as will actually parse. */
  function repair(text, start, checkpoints) {
    for (let k = checkpoints.length - 1; k >= 0 && k >= checkpoints.length - 300; k--) {
      const cp = checkpoints[k];
      if (!cp.stack.length) continue;

      let body = text.slice(start, cp.at + 1);

      /* A key with no value cannot be closed over. */
      body = body.replace(/,?\s*"[^"]*"\s*:\s*$/, '').replace(/,\s*$/, '');
      if (!body.trim()) continue;

      const closers = cp.stack.slice().reverse()
        .map(ch => (ch === '{' ? '}' : ']')).join('');

      try {
        const parsed = JSON.parse(body + closers);
        if (usable(parsed)) return parsed;
      } catch (e) { /* step further back */ }
    }
    return null;
  }

  /**
   * Recover a JSON value from raw model output.
   * @param {string} raw            the model's message content
   * @param {string[]} [expectKeys] keys that identify the object we want
   * @returns {{value:*, repaired:boolean, matched:boolean}|null}
   */
  function rescue(raw, expectKeys) {
    const text = stripFences(stripThinking(raw));
    if (!text.trim()) return null;

    const wanted = Array.isArray(expectKeys) ? expectKeys : [];
    const hasWanted = v =>
      v && typeof v === 'object' && !Array.isArray(v) &&
      wanted.some(k => Object.prototype.hasOwnProperty.call(v, k));

    const candidates = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{' || text[i] === '[') candidates.push(i);
    }
    if (!candidates.length) return null;

    let matched = null, matchedScore = -1;   /* parses and carries a wanted key */
    let anyParse = null, anyScore = -1;      /* parses at all */
    let firstIncomplete = null;

    for (const start of candidates) {
      const state = scan(text, start);
      if (!state) continue;

      if (!state.complete) {
        if (firstIncomplete === null) {
          firstIncomplete = { start: start, checkpoints: state.checkpoints };
        }
        continue;
      }

      let parsed;
      try { parsed = JSON.parse(text.slice(start, state.end + 1)); } catch (e) { continue; }
      if (!usable(parsed)) continue;

      const sc = span(start, state.end);
      if (sc > anyScore) { anyParse = parsed; anyScore = sc; }
      if (wanted.length && hasWanted(parsed) && sc > matchedScore) {
        matched = parsed; matchedScore = sc;
      }
    }

    if (matched !== null) return { value: matched, repaired: false, matched: true };

    /* Nothing carried the expected keys. A complete parse is still worth
       handing back — the caller validates and can say what was missing. */
    if (anyParse !== null && (!wanted.length || firstIncomplete === null)) {
      return { value: anyParse, repaired: false, matched: !wanted.length };
    }

    /* Almost certainly cut off by a token ceiling. */
    if (firstIncomplete) {
      const fixed = repair(text, firstIncomplete.start, firstIncomplete.checkpoints);
      if (fixed) {
        return { value: fixed, repaired: true, matched: !wanted.length || hasWanted(fixed) };
      }
    }

    if (anyParse !== null) return { value: anyParse, repaired: false, matched: false };
    return null;
  }

  root.JsonRescue = { rescue: rescue, stripThinking: stripThinking, stripFences: stripFences };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.JsonRescue;
})(typeof window !== 'undefined' ? window : globalThis);
