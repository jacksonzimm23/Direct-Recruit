// ============================================================
// FIT DISPLAY — shared "AI Match" fit-score badge renderer
// ============================================================
// Renders the locked AI-Match badge (design #5: "stacked bar + spark") used by
// the college-coach-facing player surfaces (Discover HS cards, Transfer Portal
// cards, AI Recruiting Assistant output, AI Portal Intelligence cards).
//
// ONE data contract, TWO responsive layouts (handled in fit-display.css):
//   desktop (>768px) -> compact horizontal badge to the RIGHT of player info
//   mobile  (<=768px) -> slim full-width bar UNDER the info (own row)
// The markup is identical; CSS reflows it by breakpoint, so callers insert ONE
// element and never branch on screen size.
//
// Load order in HTML:  api.js  ->  fit-display.js  ->  page JS
// (fit-display.css must also be <link>ed; tier colors --fit-1..--fit-6 live in
// landingpage/styles.css :root, loaded on every page.)
//
// PLAN 6 = shell only: callers pass FitDisplay.PLACEHOLDER_SCORE so every badge
// shows a realistic sample. PLAN 7 swaps in the real computed score by targeting
// the [data-fit-slot][data-fit-player-id] element and calling FitDisplay.fill().
//
// PUBLIC API (window.FitDisplay):
//   FIT_SHOW_PERCENT  : boolean — single toggle for the '%' suffix (default off)
//   PLACEHOLDER_SCORE : number  — temp sample score used until Plan 7
//   tierOf(score)     -> { color }  (CSS var string; muted when score == null)
//   badgeHTML(score, { playerId }) -> html string for ONE badge element
//   fill(el, { score, reason })     -> repopulate an existing badge in place
// ============================================================

(function () {
  var FIT_SHOW_PERCENT = false;   // owner: '%' is "maybe" — flip here only
  var PLACEHOLDER_SCORE = 87;     // Plan 6 sample; Plan 7 replaces with real score

  // 6-tier scale (best -> worst). Cutoffs are placeholders (Plan 7 calibrates).
  // `color` is a CSS custom-property ref so the palette stays in styles.css :root.
  // `label` is the human-facing fit rating shown on the recruiting-profile banner/modal.
  // TIERS is ordered best -> worst and is the single source for the legend/key too.
  var TIERS = [
    { min: 90, label: 'Elite Fit',  color: 'var(--fit-6)', range: '90 to 99' },
    { min: 75, label: 'Strong Fit', color: 'var(--fit-5)', range: '75 to 89' },
    { min: 60, label: 'Good Fit',   color: 'var(--fit-4)', range: '60 to 74' },
    { min: 45, label: 'Fair Fit',   color: 'var(--fit-3)', range: '45 to 59' },
    { min: 30, label: 'Low Fit',    color: 'var(--fit-2)', range: '30 to 44' },
    { min: 0,  label: 'Poor Fit',   color: 'var(--fit-1)', range: 'Below 30' }
  ];

  function tierOf(score) {
    if (score == null || score === '' || isNaN(score)) {
      return { color: 'rgba(254,252,251,0.55)', label: '' };
    }
    var s = Number(score);
    for (var i = 0; i < TIERS.length; i++) {
      if (s >= TIERS[i].min) return { color: TIERS[i].color, label: TIERS[i].label };
    }
    return TIERS[TIERS.length - 1];
  }

  // Inner content of the badge (label + number + track w/ fill + spark).
  // Shared by badgeHTML() and fill() so the two never drift.
  function _inner(score) {
    var t = tierOf(score);
    var hasScore = !(score == null || score === '' || isNaN(score));
    var numText, fillPct;
    if (hasScore) {
      var n = Number(score);
      numText = String(n) + (FIT_SHOW_PERCENT ? '<span class="fit-pct">%</span>' : '');
      fillPct = Math.max(4, Math.min(100, n)); // min sliver so a fill is always visible
    } else {
      numText = '—'; // em dash
      fillPct = 0;
    }
    var fillHtml = hasScore
      ? '<div class="fit-fill" style="width:' + fillPct + '%;background:' + t.color + ';color:' + t.color + '"></div>' +
        '<div class="fit-spark" style="left:' + fillPct + '%;color:' + t.color + '"></div>'
      : '';
    return '' +
      '<span class="fit-label">AI Match</span>' +
      '<span class="fit-num" style="color:' + t.color + '">' + numText + '</span>' +
      '<div class="fit-track">' + fillHtml + '</div>';
  }

  // Returns the full badge element HTML. Caller drops this inside a card, under
  // the player info block (no separator — the card's own border divides cards).
  // opts.playerId stamps data-fit-player-id so Plan 7 can find + refill it.
  // opts.variant:
  //   'auto' (default) — compact horizontal badge on desktop (sits right of a
  //                      flex row), full-width bar under info on mobile.
  //   'bar'            — always the full-width "label · bar · number" layout,
  //                      for vertical/stacked cards (e.g. Portal Intelligence)
  //                      where there is no row to sit beside.
  function badgeHTML(score, opts) {
    opts = opts || {};
    var pid = opts.playerId != null ? String(opts.playerId) : '';
    var variantClass = opts.variant === 'bar' ? ' fit-badge--bar' : '';
    return '<div class="fit-badge' + variantClass + '" data-fit-slot data-fit-player-id="' + pid + '">' +
      _inner(score) + '</div>';
  }

  // Plan 7 hook: repopulate an existing badge element in place (no relayout).
  function fill(el, data) {
    if (!el) return;
    data = data || {};
    el.innerHTML = _inner(data.score);
    if (data.reason != null) el.setAttribute('data-fit-reason', String(data.reason));
  }

  window.FitDisplay = {
    get FIT_SHOW_PERCENT() { return FIT_SHOW_PERCENT; },
    set FIT_SHOW_PERCENT(v) { FIT_SHOW_PERCENT = !!v; },
    PLACEHOLDER_SCORE: PLACEHOLDER_SCORE,
    TIERS: TIERS,            // ordered best -> worst; drives the modal legend/key
    tierOf: tierOf,
    badgeHTML: badgeHTML,
    fill: fill
  };
})();
