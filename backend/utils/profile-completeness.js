// ============================================================
// PROFILE COMPLETENESS — "has this side filled out its recruiting profile?"
// ============================================================
// SINGLE SOURCE OF TRUTH for whether a player's Recruiting Profile or a college
// coach's Program Profile is filled in. Consumed by:
//   - GET /api/ai-rep/profile-completion   (the player's Profile Optimization list)
//   - GET /api/profile/fit/:playerUserId   (coach-side AI Match modal disclaimer)
//   - GET /api/ai-rep/best-fit-schools     (player-side AI Match modal disclaimer)
//
// Sections mirror the recruiting-profile SUBTABS on each side, one entry per
// subtab, so a "missing" label is something the user can navigate straight to:
//
//   Player subtab            Coach subtab
//   ------------------------ ---------------------
//   Academics                Admissions
//   Major & Goals            Academics & Majors
//   Financial Fit            Cost & Aid
//   Level & Location         Program & Location
//   Priorities               Scheme & Fit
//
// WHAT COUNTS: only the fields that can actually move an AI Match score. Optional
// and edge fields are deliberately EXCLUDED so the nudge is never busywork:
//   player — class rank, AP/IB, weighted GPA, "what I'm looking for" free text,
//            Pell/first-gen, home ZIP, athletics (other sports, track times)
//   coach  — offensive/defensive scheme, academic support, roster % on aid,
//            affiliation, HS tier recruited, "what a great fit looks like" text
// Keep that rule in mind before adding a field here: if it does not feed
// backend/utils/fit-score.js, it does not belong.
// ============================================================

const arrHas = (v) => Array.isArray(v) && v.length > 0;
const has = (v) => v != null && v !== '';

// fit_preferences arrives as a JSON string or an object depending on the caller.
function fitPrefs(row) {
  const fp = row && row.fit_preferences;
  if (fp == null) return {};
  if (typeof fp === 'object') return fp;
  try { return JSON.parse(fp) || {}; } catch (e) { return {}; }
}

// ---- Player: the five Recruiting Profile subtabs ----
function playerSections(player) {
  const p = player || {};
  const fp = fitPrefs(p);
  const slider = (k) => has(fp[k]);
  return [
    // Academics: GPA + at least one test score.
    { label: 'Academics', complete: !!p.gpa && (!!p.sat_score || !!p.act_score) },
    // Major & Goals: intended major (the free-text "looking for" does NOT count).
    { label: 'Major & Goals', complete: arrHas(p.intended_major) },
    // Financial Fit: both aid questions answered.
    { label: 'Financial Fit', complete: !!p.needs_financial_aid && !!p.needs_scholarship },
    // Level & Location: levels + regions + campus setting all set. Campus setting
    // counts when it is an explicit 'no-preference' answer too.
    { label: 'Level & Location', complete: arrHas(p.levels_open) && arrHas(p.preferred_regions) && !!p.preferred_campus_setting },
    // Priorities: all four importance sliders rated.
    { label: 'Priorities', complete: slider('importance_playing_time') && slider('importance_close_to_home') && slider('importance_academics_vs_football') && slider('importance_competition_level') }
  ];
}

// ---- College coach: the five Program Profile subtabs ----
function coachSections(coach) {
  const c = coach || {};
  const fp = fitPrefs(c);
  const range = (a, b) => has(c[a]) && has(c[b]);
  return [
    // Admissions: admitted GPA range, plus a test range unless the school is
    // test-optional (in which case demanding SAT/ACT bands would be busywork).
    {
      label: 'Admissions',
      complete: range('admitted_gpa_min', 'admitted_gpa_max') &&
                (c.test_optional === true || range('sat_min', 'sat_max') || range('act_min', 'act_max'))
    },
    // Academics & Majors: both major lists (academic support does not score).
    { label: 'Academics & Majors', complete: arrHas(c.football_player_majors) && arrHas(c.top_programs) },
    // Cost & Aid: all three scoring inputs (roster % on aid does not score).
    { label: 'Cost & Aid', complete: has(c.offers_athletic_aid) && has(c.aid_generosity) && has(c.affordability_band) },
    // Program & Location: campus setting + how far the program recruits
    // (HS tier and affiliation do not score).
    { label: 'Program & Location', complete: has(c.campus_setting) && has(c.distance_profile) },
    // Scheme & Fit: the development slider (schemes do not score).
    { label: 'Scheme & Fit', complete: has(fp.dev_vs_plug_and_play) }
  ];
}

// Collapse a section list into the summary the AI Match modal renders.
function summarize(sections) {
  const missing = sections.filter(s => !s.complete).map(s => s.label);
  return {
    complete: missing.length === 0,
    missing,
    completedCount: sections.length - missing.length,
    of: sections.length
  };
}

const playerCompleteness = (player) => summarize(playerSections(player));
const coachCompleteness = (coach) => summarize(coachSections(coach));

module.exports = {
  playerSections,
  coachSections,
  playerCompleteness,
  coachCompleteness
};
