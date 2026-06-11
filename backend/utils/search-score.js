// Search relevance score for the universal user search (/api/profile/search).
// Follows the popularity-score.js pattern: functions return SQL expression
// strings parameterized by field expressions, dropped into SELECT/ORDER BY.
//
// INVARIANT: the ORDER BY keys in the three search() methods
// (PlayerProfile / CoachProfile / OtherProfile) and compareSearchResults below
// must stay identical — (search_score DESC, followers_count DESC,
// created_at DESC, user_id). The route fetches a (limit + offset) prefix from
// each model and k-way merges them in JS; offset pagination ("Show more")
// only stays duplicate/skip-free if every model's SQL prefix is ordered by
// the exact same keys the route comparator uses.
//
// Index note: per-column GIN trgm indexes exist (add-fuzzy-search.sql). The
// full-name (first || ' ' || last) similarity/ILIKE recall arms are NOT
// index-backed — fine at current scale. If these tables grow large, add
// expression indexes like:
//   CREATE INDEX ... USING GIN ((COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) gin_trgm_ops)

const { escapeLikePattern } = require('../middleware/validation');

// Concatenated full name so multi-word queries ("Tripp Thomas") match as a unit.
function fullNameExpr(alias) {
  return `(COALESCE(${alias}.first_name, '') || ' ' || COALESCE(${alias}.last_name, ''))`;
}

// The 4 search params every search() pushes, in fixed order. Centralizes
// ILIKE wildcard escaping so no model can forget it on the new patterns.
// Order: [term, substring, prefix, word-boundary]
function searchTermParams(searchTerm) {
  const esc = escapeLikePattern(searchTerm);
  return [
    searchTerm,   // $term   — similarity() + LOWER() equality
    `%${esc}%`,   // $substr — substring recall (pre-existing behavior)
    `${esc}%`,    // $prefix — prefix-match tier
    `% ${esc}%`   // $word   — word-boundary tier (field is prepended with ' ')
  ];
}

// Tiered relevance score, GREATEST across the model's searchable fields.
// Bands (non-overlapping — a non-exact prefix/word match has similarity < 1.0):
//   4.0        exact match (case-insensitive)
//   3.0 - 4.0  prefix match            ("Tripp" -> "Trippton")
//   2.0 - 3.0  word-boundary match     ("Tripp" -> "Coach Tripp Academy")
//   1.2 - 2.0  trigram fuzzy           ("Tripp" -> "Tristan", typo tolerance)
//   0.0 - 0.2  substring-only residue  (matched WHERE via ILIKE only)
// NULL fields (team_name, subheader) fall through every WHEN to the ELSE.
// The ::float8 cast is load-bearing: GREATEST(numeric, real) resolves to
// numeric, which node-postgres returns as a STRING — the JS sort would
// silently compare strings without it.
// p = { term, prefix, word } — $N parameter indexes from the caller.
function searchScoreExpr(fieldExprs, p) {
  const component = (f) => `CASE
    WHEN LOWER(${f}) = LOWER($${p.term}) THEN 4.0
    WHEN ${f} ILIKE $${p.prefix} THEN 3.0 + similarity(${f}, $${p.term})
    WHEN (' ' || ${f}) ILIKE $${p.word} THEN 2.0 + similarity(${f}, $${p.term})
    WHEN similarity(${f}, $${p.term}) > 0.2 THEN 1.0 + similarity(${f}, $${p.term})
    ELSE COALESCE(similarity(${f}, $${p.term}), 0)
  END`;
  return `GREATEST(${fieldExprs.map(component).join(', ')})::float8`;
}

// Route-side comparator for the merged player/coach/other arrays. Stable
// total order (UUID string compare as the final key) so "Show more"
// pagination never duplicates or skips rows. Popularity is a pure
// tiebreaker: a high-follower fuzzy match (max 2.0) can never outrank a
// zero-follower exact match (4.0).
function compareSearchResults(a, b) {
  const sa = Number(a.search_score) || 0;
  const sb = Number(b.search_score) || 0;
  if (sb !== sa) return sb - sa;
  const fa = Number(a.followers_count) || 0;
  const fb = Number(b.followers_count) || 0;
  if (fb !== fa) return fb - fa;
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (cb !== ca) return cb - ca;
  return String(a.user_id) < String(b.user_id) ? -1 : (String(a.user_id) > String(b.user_id) ? 1 : 0);
}

module.exports = { fullNameExpr, searchTermParams, searchScoreExpr, compareSearchResults };
