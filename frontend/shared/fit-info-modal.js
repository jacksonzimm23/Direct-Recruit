// ============================================================
// FIT INFO MODAL — "What is AI Match?" explainer + match breakdown
// ============================================================
// The ⓘ button next to the fit rating on the coach-only recruiting-profile
// banner opens this modal. Full-screen on mobile (<=768px) per lesson #75.
// Depends on fit-display.js (FitDisplay.tierOf / TIERS / FIT_SHOW_PERCENT) and
// fit-info-modal.css. Load order: api.js -> fit-display.js -> fit-info-modal.js.
//
// PLAN 6 = hardcoded sample data so the owner can see it. PLAN 7 passes the real
// score + computed match reasons via FitInfoModal.open({ score, matches }).
//
// PUBLIC API (window.FitInfoModal):
//   open(opts) — opts.score (number), opts.playerName (string, optional),
//                opts.matches ([{ label, detail }], optional — defaults to sample)
//   close()
// ============================================================

(function () {
  var OVERLAY_ID = 'fitInfoOverlay';

  // Hardcoded sample "what this player matches you on" rows (Plan 6 placeholder).
  // Plan 7 replaces via opts.matches. Each row: { label, detail }.
  var SAMPLE_MATCHES = [
    { label: 'Academics',        detail: 'GPA falls within your typical admitted range' },
    { label: 'Major',            detail: 'Interested in a major your program is strong in' },
    { label: 'Test scores',      detail: 'SAT/ACT align with your admitted profile' },
    { label: 'Level',            detail: 'Open to playing at your division' },
    { label: 'Location',         detail: 'Open to playing in your recruiting region' },
    { label: 'Campus setting',   detail: 'Prefers a campus environment like yours' },
    { label: 'Financial fit',    detail: 'Aid needs line up with what your program offers' }
  ];

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function _hasFit() { return typeof FitDisplay !== 'undefined'; }

  function _tierKeyHTML() {
    if (!_hasFit() || !FitDisplay.TIERS) return '';
    var rows = FitDisplay.TIERS.map(function (t) {
      return '<div class="fim-key-item">' +
        '<span class="fim-key-dot" style="background:' + t.color + ';color:' + t.color + '"></span>' +
        '<span class="fim-key-range">' + _esc(t.range) + '</span>' +
        '<span class="fim-key-label">' + _esc(t.label) + '</span>' +
        '</div>';
    }).join('');
    return '<div class="fim-key">' + rows + '</div>';
  }

  function open(opts) {
    opts = opts || {};
    var score = (opts.score != null) ? opts.score
      : (_hasFit() ? FitDisplay.PLACEHOLDER_SCORE : null);
    var matches = (opts.matches && opts.matches.length) ? opts.matches : SAMPLE_MATCHES;
    var tier = _hasFit() ? FitDisplay.tierOf(score) : { color: '#1282a2', label: '' };
    var showPct = _hasFit() && FitDisplay.FIT_SHOW_PERCENT;
    var scoreText = (score == null) ? 'N/A' : (String(score) + (showPct ? '%' : ''));
    var who = opts.playerName ? _esc(opts.playerName) : 'This player';

    close(); // ensure only one

    var overlay = document.createElement('div');
    overlay.className = 'fim-overlay';
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
      '<div class="fim-modal" role="dialog" aria-modal="true" aria-label="About AI Match">' +
        '<div class="fim-header">' +
          '<h2 class="fim-title">AI Match</h2>' +
          '<button class="fim-close" id="fimCloseBtn" aria-label="Close">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +
        '<div class="fim-body">' +

          // --- intro: what AI Match is + why it matters (no algorithm details) ---
          '<div class="fim-intro">' +
            '<p>AI Match looks beyond the on-field measurables to estimate how well a ' +
            'player fits <strong>your program specifically</strong>. It weighs the things ' +
            'that decide whether a recruit will actually thrive and commit: academics, ' +
            'intended major, the level and location they’re open to, campus environment, ' +
            'and financial fit.</p>' +
            '<p>A higher score means a stronger two-way fit between this player’s goals ' +
            'and what your program offers, helping you prioritize recruits who are likely ' +
            'to be a great long term fit, not just talented on tape.</p>' +
          '</div>' +

          // --- score + rating ---
          '<div class="fim-scoreline">' +
            '<span class="fim-score" style="color:' + tier.color + '">' + _esc(scoreText) + '</span>' +
            '<span class="fim-rating" style="color:' + tier.color + '">' + _esc(tier.label) + '</span>' +
          '</div>' +
          '<p class="fim-scoresub">' + who + ' has an AI Match score of <strong>' +
            _esc(scoreText) + '</strong>' + (tier.label ? ', a <strong>' + _esc(tier.label) + '</strong>' : '') +
            ' for your program.</p>' +

          // --- 6-tier key ---
          '<div class="fim-section-label">Rating scale</div>' +
          _tierKeyHTML() +

          // --- match breakdown ---
          '<div class="fim-section-label">What this player matches you on</div>' +
          '<div class="fim-matches">' +
            matches.map(function (m) {
              return '<div class="fim-match-row">' +
                '<svg class="fim-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
                '<div class="fim-match-text"><span class="fim-match-label">' + _esc(m.label) + '</span>' +
                '<span class="fim-match-detail">' + _esc(m.detail) + '</span></div>' +
                '</div>';
            }).join('') +
          '</div>' +

          '<p class="fim-disclaimer">AI Match is a guide to help surface best fit recruits. ' +
          'It complements your own evaluation and never replaces it.</p>' +

        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    var btn = document.getElementById('fimCloseBtn');
    if (btn) btn.addEventListener('click', close);
    document.addEventListener('keydown', _escKey);
  }

  function _escKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _escKey);
  }

  window.FitInfoModal = { open: open, close: close };
})();
