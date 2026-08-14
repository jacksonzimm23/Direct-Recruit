// ============================================================
// AI REPLY PARSING — shared by the Recruiting Assistant and Portal Intelligence
// ============================================================
// Both surfaces ask Claude for ONE JSON object and then show `message` to the
// coach. When that object fails to parse, the old code fell back to printing the
// RAW model text, which put things like
//
//     ```json { "signal_filters": null, "summary": null, "message": "I help ...
//
// straight into the chat as if it were the answer. A coach must never see JSON,
// a code fence, or a field name — if we cannot produce clean prose, we say so.
//
// Three real failure modes this handles, in order:
//   1. FENCED   — the object arrives wrapped in ```json ... ``` .
//   2. PROSE-WRAPPED — a sentence before/after the object.
//   3. BAD ESCAPE — Claude emits a bare "\" inside a string as a paragraph
//      break ("...hit the portal.\ I monitor..."). "\ " is not a legal JSON
//      escape, so JSON.parse throws on the whole object even though the content
//      is fine. This is the one that produced the screenshot.
//
// parseAiJsonReply(text) -> { parsed, message }
//   parsed  : the object when we got one (caller still validates it), else null
//   message : clean prose salvaged from the reply, else null. NEVER JSON/code.
// ============================================================

// Backslashes are only legal in JSON immediately before one of " \ / b f n r t u.
// Anything else is Claude using "\" as punctuation; dropping it restores valid
// JSON and reads correctly ("portal.\ I monitor" -> "portal. I monitor").
const BAD_ESCAPE = /\\(?!["\\/bfnrtu])/g;

// Does this text look like machine output rather than something to show a user?
// Used as the last gate before any raw text could reach the chat.
function looksLikeCode(s) {
  if (!s) return false;
  const t = String(s).trim();
  return t.startsWith('```') ||
         t.startsWith('{') ||
         t.startsWith('[') ||
         /```/.test(t) ||
         /"(signal_filters|filters|summary|reasoning|message)"\s*:/.test(t);
}

// Remove a leading/trailing markdown code fence, with or without a language tag.
function stripFences(text) {
  let t = String(text || '').trim();
  const fenced = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();
  // Unbalanced fence (model opened one and never closed it).
  t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '');
  return t.trim();
}

function tryParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// Pull just the `message` string out of a JSON-ish blob that would not parse,
// so a usable answer still reaches the coach instead of an error.
function salvageMessage(text) {
  const m = String(text || '').match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  const body = tryParse('"' + m[1] + '"');
  if (typeof body === 'string' && body.trim()) return body.trim();
  const loose = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(BAD_ESCAPE, '').trim();
  return loose || null;
}

function parseAiJsonReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return { parsed: null, message: null };

  const unfenced = stripFences(raw);

  // 1. straight parse, 2. same text with bad escapes repaired
  let parsed = tryParse(unfenced) || tryParse(unfenced.replace(BAD_ESCAPE, ''));

  // 3. outermost {...} carved out of surrounding prose, both ways again
  if (!parsed) {
    const braced = unfenced.match(/\{[\s\S]*\}/);
    if (braced) parsed = tryParse(braced[0]) || tryParse(braced[0].replace(BAD_ESCAPE, ''));
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { parsed, message: null };
  }

  // Could not get an object. Salvage the message field if it is in there.
  const salvaged = salvageMessage(unfenced);
  if (salvaged && !looksLikeCode(salvaged)) return { parsed: null, message: salvaged };

  // Genuinely conversational reply that was never JSON at all -> pass it through.
  if (!looksLikeCode(unfenced)) return { parsed: null, message: unfenced };

  // Machine output we could not rescue. The caller supplies a friendly line;
  // returning null here is what guarantees no JSON reaches the chat.
  return { parsed: null, message: null };
}

module.exports = { parseAiJsonReply, looksLikeCode, stripFences, salvageMessage };
