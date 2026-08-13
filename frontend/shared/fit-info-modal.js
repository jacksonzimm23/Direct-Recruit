// ============================================================
// FIT INFO MODAL — "What is AI Match?" explainer + match breakdown
// ============================================================
// The ⓘ button next to the fit rating on the coach-only recruiting-profile
// banner opens this modal. Full-screen on mobile (<=768px) per lesson #75.
// Depends on fit-display.js (FitDisplay.tierOf / TIERS / FIT_SHOW_PERCENT) and
// fit-info-modal.css. Load order: api.js -> fit-display.js -> fit-info-modal.js.
//
// The real score + computed match reasons are passed in via
// FitInfoModal.open({ score, matches }). When score is null (the player hasn't
// filled out enough recruiting-profile info to be rated against the viewing
// coach's program), the player-mode modal shows a "not enough profile
// information yet" explanation instead of a number — never a placeholder.
//
// PUBLIC API (window.FitInfoModal):
//   open(opts) — PLAYER mode (default, coach viewing a player):
//                opts.score (number|null — null renders the not-yet-rated state),
//                opts.playerName (string, optional),
//                opts.matches ([{ label, detail }], optional — defaults to sample)
//              — SCHOOL mode (opts.mode === 'school', player viewing a school; Plan 7C):
//                opts.score, opts.schoolName, opts.division, opts.matches
//                ([{label,detail}] reworded school→player), opts.staff
//                ([{first_name,last_name,username,position_title,profile_image_url}]),
//                opts.coachCount (number — when > staff.length, show "some private" note),
//                opts.coachHref (fn(username) -> url for the coach profile link).
//   close()
// ============================================================

(function () {
  var OVERLAY_ID = 'fitInfoOverlay';

  // Fallback "what this player matches you on" rows, used only if a scored
  // player is opened without an explicit opts.matches array. Real calls pass the
  // computed per-criterion matches. Each row: { label, detail, score?, present? }.
  // Labels mirror the five recruiting-profile criteria in backend/utils/fit-score.js
  // (CRITERIA) — keep them in sync.
  var SAMPLE_MATCHES = [
    { label: 'Academics',              detail: 'GPA and test scores line up with your admitted profile' },
    { label: 'Level & Location',       detail: 'Open to your division, region and campus setting' },
    { label: 'Major & Goals',          detail: 'Interested in a major your program is strong in' },
    { label: 'Financial Fit',          detail: 'Aid needs line up with what your program offers' },
    { label: 'Priorities & Athletics', detail: 'Wants to be developed the way your program develops players' }
  ];

  // The five criteria as unrated rows, for when no computed breakdown reached us
  // (fetch failed, or a caller opened the modal without one).
  function _unratedMatches() {
    return SAMPLE_MATCHES.map(function (m) {
      return { label: m.label, detail: 'Not enough information yet', present: false };
    });
  }

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

  // SVG path bodies for the four match-strength icons.
  var _ICON_CHECK = '<polyline points="20 6 9 17 4 12"></polyline>';                 // strong (green)
  var _ICON_PARTIAL = '<circle cx="12" cy="12" r="9"></circle><line x1="8" y1="12" x2="16" y2="12"></line>'; // medium (yellow) ~
  var _ICON_X = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';     // weak (red)
  var _ICON_DASH = '<line x1="5" y1="12" x2="19" y2="12"></line>';                    // not rated (grey)

  // Flat green / yellow / red by score thirds, plus a grey dash for a criterion
  // that could not be scored at all. Each band has a distinct icon shape so it
  // reads even without color. No score on a PRESENT row (sample data) -> check.
  var _MATCH_GREEN = '#1f9d4d';
  var _MATCH_YELLOW = '#eab308';
  var _MATCH_RED = '#ef4444';
  var _MATCH_GREY = 'rgba(254,252,251,0.4)';
  function _matchIcon(score, present) {
    if (present === false) return { path: _ICON_DASH, color: _MATCH_GREY };  // not rated
    if (score == null) return { path: _ICON_CHECK, color: _MATCH_GREEN };
    if (score >= 0.67) return { path: _ICON_CHECK, color: _MATCH_GREEN };   // strong
    if (score >= 0.34) return { path: _ICON_PARTIAL, color: _MATCH_YELLOW }; // medium
    return { path: _ICON_X, color: _MATCH_RED };                            // weak
  }

  // Build the rows for the "what matches" list from
  // [{label, detail, score?, present?}]. ALL FIVE criteria are always rendered —
  // a criterion with no data on one side shows a muted "not rated" row naming
  // what is missing, never disappears (that read as a shorter match list).
  // `present` defaults to true so legacy callers passing only {label, detail}
  // keep working.
  function _matchRowsHTML(matches) {
    return matches.map(function (m) {
      var absent = (m.present === false);
      var ic = _matchIcon(m.score, m.present);
      return '<div class="fim-match-row' + (absent ? ' fim-match-row--absent' : '') + '">' +
        '<svg class="fim-check" style="color:' + ic.color + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + ic.path + '</svg>' +
        '<div class="fim-match-text"><span class="fim-match-label">' + _esc(m.label) + '</span>' +
        '<span class="fim-match-detail">' + _esc(m.detail) + '</span></div>' +
        '</div>';
    }).join('');
  }

  function open(opts) {
    opts = opts || {};
    if (opts.mode === 'school') return _openSchool(opts);
    return _openPlayer(opts);
  }

  // --- PLAYER mode (coach viewing a player) ---
  function _openPlayer(opts) {
    var score = (opts.score != null) ? opts.score : null;  // null => not enough data to rate
    var hasScore = (score != null);
    // Fall back to the all-green sample rows ONLY when there is a real score. With
    // no score, sample rows would claim matches that were never computed, so show
    // the five criteria as unrated instead.
    var matches = (opts.matches && opts.matches.length)
      ? opts.matches
      : (hasScore ? SAMPLE_MATCHES : _unratedMatches());
    var tier = (_hasFit() && hasScore) ? FitDisplay.tierOf(score) : { color: '#1282a2', label: '' };
    var showPct = _hasFit() && FitDisplay.FIT_SHOW_PERCENT;
    var scoreText = (String(score) + (showPct ? '%' : ''));
    var who = opts.playerName ? _esc(opts.playerName) : 'This player';

    // When the player hasn't filled out enough recruiting-profile information to
    // be compared against your program, there is no score. Explain that instead
    // of showing a number (no placeholder — lesson: never fake a fit score).
    var scoreSectionHTML = hasScore
      ? (
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
          '<div class="fim-matches">' + _matchRowsHTML(matches) + '</div>' +

          '<p class="fim-disclaimer">AI Match is a guide to help surface best fit recruits. ' +
          'It complements your own evaluation and never replaces it.</p>'
        )
      : (
          // --- not-yet-rated empty state ---
          // Still shows the full five-criterion breakdown, because the gap is very
          // often the COACH's own program profile, not the player's. Blaming the
          // player unconditionally sent coaches looking in the wrong place.
          '<div class="fim-noscore">' +
            '<div class="fim-noscore-icon">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
            '</div>' +
            '<div class="fim-noscore-title">Not enough profile information yet</div>' +
            '<p class="fim-noscore-text">An AI Match score needs at least three of the five ' +
            'criteria below, including Academics or Level &amp; Location. Anything marked ' +
            'below is waiting on information from one side or the other.</p>' +
          '</div>' +

          '<div class="fim-section-label">What this player matches you on</div>' +
          '<div class="fim-matches">' + _matchRowsHTML(matches) + '</div>' +

          '<p class="fim-disclaimer">AI Match is a guide to help surface best fit recruits. ' +
          'It complements your own evaluation and never replaces it.</p>'
        );

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

          // --- score + rating (or not-yet-rated empty state) ---
          scoreSectionHTML +

        '</div>' +
      '</div>';

    _mount(overlay);
  }

  // --- SCHOOL mode (player viewing a best-fit school) — Plan 7C, tabbed ---
  function _openSchool(opts) {
    var score = (opts.score != null) ? opts.score : null;
    var matches = (opts.matches && opts.matches.length) ? opts.matches : _unratedMatches();
    var staff = opts.staff || [];
    var tier = (_hasFit() && score != null) ? FitDisplay.tierOf(score) : { color: '#1282a2', label: '' };
    var showPct = _hasFit() && FitDisplay.FIT_SHOW_PERCENT;
    var scoreText = (score == null) ? 'N/A' : (String(score) + (showPct ? '%' : ''));
    var schoolName = opts.schoolName ? _esc(opts.schoolName) : 'This school';
    var division = opts.division ? _esc(opts.division) : '';
    var logoHTML = (typeof getSchoolLogoHTML === 'function' && opts.schoolName)
      ? getSchoolLogoHTML(opts.schoolName, '../../assets', 32) : '';
    var privateNote = (opts.coachCount && opts.coachCount > staff.length)
      ? '<p class="fim-staff-note">Some staff keep their profiles private.</p>' : '';

    var staffHTML = staff.length
      ? staff.map(function (c) {
          var name = _esc(((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.username || 'Coach');
          var title = c.position_title ? '<span class="fim-staff-title">' + _esc(c.position_title) + '</span>' : '';
          var avatar = c.profile_image_url
            ? '<img class="fim-staff-avatar" src="' + _esc(c.profile_image_url) + '" alt="">'
            : '<span class="fim-staff-avatar fim-staff-avatar--empty"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></span>';
          var href = (typeof opts.coachHref === 'function' && c.username) ? opts.coachHref(c.username) : null;
          var inner = avatar + '<div class="fim-staff-text"><span class="fim-staff-name">' + name + '</span>' + title + '</div>';
          return href
            ? '<a class="fim-staff-row" href="' + _esc(href) + '">' + inner + '</a>'
            : '<div class="fim-staff-row">' + inner + '</div>';
        }).join('')
      : '<p class="fim-staff-empty">No staff to show for this program yet.</p>';

    close();

    var overlay = document.createElement('div');
    overlay.className = 'fim-overlay';
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
      '<div class="fim-modal fim-modal--school" role="dialog" aria-modal="true" aria-label="School AI Match">' +
        '<div class="fim-header">' +
          '<div class="fim-school-head">' + logoHTML +
            '<div class="fim-school-headtext"><h2 class="fim-title">' + schoolName + '</h2>' +
            (division ? '<span class="fim-school-div">' + division + '</span>' : '') + '</div>' +
          '</div>' +
          '<button class="fim-close" id="fimCloseBtn" aria-label="Close">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +

        '<div class="fim-tabs" role="tablist">' +
          '<button class="fim-tab active" data-tab="fimMatchPane" type="button">Match</button>' +
          '<button class="fim-tab" data-tab="fimStaffPane" type="button">Staff</button>' +
        '</div>' +

        '<div class="fim-body">' +
          // --- Match tab ---
          '<div class="fim-tab-pane active" id="fimMatchPane">' +
            '<div class="fim-scoreline">' +
              '<span class="fim-score" style="color:' + tier.color + '">' + _esc(scoreText) + '</span>' +
              '<span class="fim-rating" style="color:' + tier.color + '">' + _esc(tier.label) + '</span>' +
            '</div>' +
            '<p class="fim-scoresub">' + schoolName + ' is a <strong>' + _esc(scoreText) + '</strong>' +
              (tier.label ? ' <strong>' + _esc(tier.label) + '</strong>' : '') + ' for you.</p>' +
            '<div class="fim-section-label">Rating scale</div>' +
            _tierKeyHTML() +
            '<div class="fim-section-label">What this school offers that matches you</div>' +
            '<div class="fim-matches">' + _matchRowsHTML(matches) + '</div>' +
            '<p class="fim-disclaimer">AI Match is a guide to help you find programs that fit you ' +
            'on and off the field. It complements your own research, never replaces it.</p>' +
          '</div>' +
          // --- Staff tab ---
          '<div class="fim-tab-pane" id="fimStaffPane">' +
            '<div class="fim-section-label">Coaching staff</div>' +
            '<div class="fim-staff-list">' + staffHTML + '</div>' +
            privateNote +
          '</div>' +
        '</div>' +
      '</div>';

    _mount(overlay);

    // Tab switching (mirror the data-tab/.active pattern used elsewhere).
    overlay.querySelectorAll('.fim-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        overlay.querySelectorAll('.fim-tab').forEach(function (t) { t.classList.remove('active'); });
        overlay.querySelectorAll('.fim-tab-pane').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var pane = overlay.querySelector('#' + tab.dataset.tab);
        if (pane) pane.classList.add('active');
      });
    });
  }

  // Append overlay + wire close handlers (shared by both modes).
  function _mount(overlay) {
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
