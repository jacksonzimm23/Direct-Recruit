// ============================================================
// FIT SCORE — deterministic AI Match engine (Plan 7, Phase A)
// ============================================================
// Pure, symmetric scorer: compares ONE player to ONE coach's program profile
// across the 7 matched-pair dimensions and returns a 0–99 score + per-dimension
// breakdown. No I/O — callers pass already-loaded profile rows.
//
//   computeFit(player, coach) -> {
//     score:      Number 0–99 | null,        // null = below the display floor
//     tier:       { color, label } | null,   // from FitDisplay tiers (mirrored here)
//     confidence: { n, of, label },          // how many criteria were scoreable
//     dimensions: [ { key, label, weight, present, score, detail, missing } ]
//   }
//
// SINGLE SOURCE OF TRUTH: the CRITERIA array below. The coach modal match-list,
// the AI Rep school modal, and the AI Rep "missing dimensions" nudge all read the
// same criterion keys/labels — keep them here so nothing drifts (lesson #19).
//
// FIVE CRITERIA, mirroring the recruiting-profile subtabs on BOTH sides so the
// modal reads the same as the forms the two users actually filled in:
//
//   Criterion               Player subtab            Coach subtab
//   ----------------------- ------------------------ ---------------------
//   Academics               Academics                Admissions
//   Level & Location        Level & Location         Program & Location
//   Major & Goals           Major & Goals            Academics & Majors
//   Financial Fit           Financial Fit            Cost & Aid
//   Priorities & Athletics  Priorities & Athletics   Scheme & Fit
//
// Level & Location is a GROUP of three scored parts (level / region / campus);
// the other four are single-part. Athletics (other sports, track times) has no
// matched coach field, so it is display-only on the profile and does NOT score —
// criterion 5 scores on the player's priority sliders vs the coach's
// development-vs-plug-and-play setting.
//
// ALWAYS RETURNS ALL FIVE. A criterion with no data on one or both sides comes
// back present:false with `missing` set to 'player' | 'coach' | 'both' | null so
// the UI can render an honest "not rated yet" row that names WHICH side is
// missing, instead of silently dropping it (which read as "this player only
// matches you on 3 things"). Absent criteria are still EXCLUDED from the
// weighted average — a blank profile on either side must not be scored as a
// mismatch.
//
// Symmetric: the SAME function powers coach->player (RA/discover cards, profile
// banner) AND player->school (AI Rep best-fit), so build/maintain it once.
//
// PRIVACY (locked): `detail` strings describe the MATCH in soft terms only —
// never raw PII (home ZIP, raw aid wording) or a school's raw thresholds.
//
// Scoring constants (weights, ramps, matrices) are intentionally centralized at
// the top so they're easy to calibrate after the Phase-A numbers review.
// ============================================================

const MATCH = require('./match-constants');

// ---- Tier map (mirrors frontend FitDisplay.TIERS; keep in sync) ----
const TIERS = [
  { min: 90, label: 'Elite Fit',  color: 'var(--fit-6)' },
  { min: 75, label: 'Strong Fit', color: 'var(--fit-5)' },
  { min: 60, label: 'Good Fit',   color: 'var(--fit-4)' },
  { min: 45, label: 'Fair Fit',   color: 'var(--fit-3)' },
  { min: 30, label: 'Low Fit',    color: 'var(--fit-2)' },
  { min: 0,  label: 'Poor Fit',   color: 'var(--fit-1)' }
];

function tierOf(score) {
  for (const t of TIERS) if (score >= t.min) return { color: t.color, label: t.label };
  return TIERS[TIERS.length - 1];
}

// ---- Criterion weights. HIGH = gatekeepers (can you get in / can you play here) ----
const W = { high: 3.0, medium: 2.0, low: 1.0 };

// ---- Sub-part weights INSIDE the grouped Level & Location criterion ----
// Same relative ordering the flat engine used (level 3 / region 2 / campus 1), but
// now normalized within the group so the group as a whole carries W.high rather
// than the sum of its parts — otherwise Level & Location alone would be 46% of
// the score and campus-setting preference would outweigh academics.
const SUB = { level: 3.0, region: 2.0, campus: 1.0 };

// ---- Display floor (locked): >=3 scoreable criteria AND >=1 core ----
// A score must rest on at least three of the five criteria. Note this is
// effectively STRICTER than the old flat engine's "3 of 7", because level,
// region and campus now collapse into a single criterion — a pair that scored
// on academic+level+geographic used to count 3 and now counts 2.
//
// When a well-filled player still comes back unrated, the cause is almost always
// the VIEWING COACH's Program Profile (Admissions / Academics & Majors / Cost &
// Aid), not the player: every criterion needs data on both sides. The modal now
// says which side is missing rather than dropping the row, so that is diagnosable
// from the UI instead of looking like a broken score.
const MIN_CRITERIA = 3;
const CORE_KEYS = ['academics', 'levelLocation'];

// ---- small helpers ----
const num = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? null : Number(v);
const arr = (v) => Array.isArray(v) ? v.filter(x => x != null && x !== '') : [];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// normalizeDivision: tolerate legacy "FBS"/"FCS" stored without the "D1 " prefix.
function normDivision(d) {
  if (!d) return null;
  if (d === 'FBS') return 'D1 FBS';
  if (d === 'FCS') return 'D1 FCS';
  return d;
}

// State is stored in BOTH formats across rows (e.g. "Mississippi" AND "MS").
// REGION_BY_STATE keys by full name, so normalize abbreviations first, then look
// up the region. Returns null if the state is unknown/empty.
const STATE_ABBR = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};
function regionOf(state) {
  if (!state) return null;
  const s = String(state).trim();
  const full = s.length === 2 ? (STATE_ABBR[s.toUpperCase()] || s) : s;
  return MATCH.REGION_BY_STATE[full] || null;
}

// fit_preferences can arrive as a JSON string or an object.
function fitPrefs(profile) {
  const fp = profile && profile.fit_preferences;
  if (fp == null) return {};
  if (typeof fp === 'object') return fp;
  try { return JSON.parse(fp) || {}; } catch (e) { return {}; }
}

// ============================================================
// Per-dimension scorers. Each returns { present, score(0–1), detail } and must
// return present:false when EITHER side lacks the data (so we normalize over
// present signals only).
// ============================================================

// --- ACADEMIC: player gpa/sat/act vs coach admitted ranges -------------------
function scoreAcademic(p, c) {
  const parts = [];

  // GPA: player gpa vs coach admitted_gpa_min/max (4.0 scale).
  // Reward position within/above the band so a player comfortably above the range
  // scores higher than one sitting right at the floor (spreads the curve).
  const pGpa = num(p.gpa);
  const cMin = num(c.admitted_gpa_min);
  const cMax = num(c.admitted_gpa_max);
  if (pGpa != null && (cMin != null || cMax != null)) {
    const lo = cMin != null ? cMin : 0;
    const hi = cMax != null ? cMax : (cMin != null ? cMin + 0.5 : 4.0);
    let s;
    if (pGpa >= hi) s = 1.0;                       // at/above top of admitted band
    else if (pGpa >= lo) s = 0.8 + 0.2 * ((pGpa - lo) / Math.max(hi - lo, 0.01)); // 0.8..1.0 within band
    else s = clamp01(0.8 - (lo - pGpa) / 1.0);     // below floor: ramp down from 0.8
    parts.push(s);
  }

  // Test scores: SAT and/or ACT vs coach ranges. test_optional softens absence.
  const testOptional = c.test_optional === true;
  const addTest = (pv, cmin, cmax) => {
    const v = num(pv), mn = num(cmin), mx = num(cmax);
    if (v != null && (mn != null || mx != null)) {
      const lo = mn != null ? mn : 0;
      const hi = mx != null ? mx : (mn != null ? mn * 1.15 : lo + 1);
      const span = Math.max(hi - lo, 1);
      let s;
      if (v >= hi) s = 1.0;                                  // at/above top of range
      else if (v >= lo) s = 0.8 + 0.2 * ((v - lo) / span);  // 0.8..1.0 within range
      else s = clamp01(0.8 - (lo - v) / span);              // below floor
      parts.push(s);
    }
  };
  addTest(p.sat_score, c.sat_min, c.sat_max);
  addTest(p.act_score, c.act_min, c.act_max);

  if (!parts.length) return { present: false };
  let score = parts.reduce((a, b) => a + b, 0) / parts.length;
  // If the school is test-optional and we only had test data (no GPA), don't let a
  // weak test score dominate — nudge toward neutral.
  if (testOptional && pGpa == null) score = clamp01(0.5 + score * 0.5);

  const detail = score >= 0.85 ? 'Academics line up with your admitted profile'
    : score >= 0.5 ? 'Academics are near your admitted range'
    : 'Academics are below your typical admitted range';
  return { present: true, score, detail };
}

// --- MAJOR: player intended_major vs coach football majors / top programs ----
function scoreMajor(p, c) {
  const majors = arr(p.intended_major);
  const football = arr(c.football_player_majors);
  const top = arr(c.top_programs);
  if (!majors.length || (!football.length && !top.length)) return { present: false };

  const inFootball = majors.some(m => football.includes(m));
  const inTop = majors.some(m => top.includes(m));
  let score, detail;
  if (inFootball) { score = 1.0; detail = 'Wants a major common among your football players'; }
  else if (inTop) { score = 0.65; detail = 'Wants a major your school is strong in'; }
  else { score = 0.1; detail = 'Intended major is outside your highlighted programs'; }
  return { present: true, score, detail };
}

// --- LEVEL (core gatekeeper): coach division in player's open levels ----------
function scoreLevel(p, c) {
  const levels = arr(p.levels_open);
  const div = normDivision(c.college_division);
  if (!levels.length || !div) return { present: false };
  const open = levels.map(normDivision).includes(div);
  return {
    present: true,
    score: open ? 1.0 : 0.0,
    detail: open ? 'Open to playing at your level' : 'Not currently open to your level'
  };
}

// --- GEOGRAPHIC: coach's region in player's preferred regions -----------------
function scoreGeographic(p, c) {
  const prefs = arr(p.preferred_regions);
  const coachRegion = regionOf(c.state);
  if (!prefs.length || !coachRegion) return { present: false };

  const inRegion = prefs.includes(coachRegion);
  if (inRegion) return { present: true, score: 1.0, detail: 'Open to playing in your region' };
  // distance_profile: national => recruits everywhere, soften the miss.
  if (c.distance_profile === 'national') {
    return { present: true, score: 0.6, detail: 'Outside their top regions, but you recruit nationally' };
  }
  return { present: true, score: 0.15, detail: 'Prefers a different region' };
}

// --- FINANCIAL: player aid needs vs coach aid offering ------------------------
function scoreFinancial(p, c) {
  const needAid = p.needs_financial_aid;           // yes | no | unsure
  const needSchol = p.needs_scholarship;           // yes | no | unsure
  const offers = c.offers_athletic_aid;            // full | partial | none
  const generosity = c.aid_generosity;             // need-met | strong | limited
  const hasPlayer = !!(needAid || needSchol);
  const hasCoach = !!(offers || generosity || c.affordability_band);
  if (!hasPlayer || !hasCoach) return { present: false };

  // No need => fit is neutral-positive regardless of what the school offers.
  if (needAid === 'no' && (needSchol === 'no' || !needSchol)) {
    return { present: true, score: 1.0, detail: 'Aid needs are flexible' };
  }

  // Athletic scholarship need vs what the program offers (strongest signal).
  let score = 0.5;
  if (needSchol === 'yes') {
    if (offers === 'full') score = 1.0;
    else if (offers === 'partial') score = 0.6;
    else if (offers === 'none') score = 0.1;
  } else if (needAid === 'yes') {
    if (generosity === 'need-met') score = 1.0;
    else if (generosity === 'strong') score = 0.8;
    else if (generosity === 'limited') score = 0.4;
    else if (c.affordability_band === 'low') score = 0.8;
    else if (c.affordability_band === 'high') score = 0.3;
    else score = 0.6;
  } else {
    score = 0.7; // "unsure" on either side -> mild positive
  }
  const detail = score >= 0.8 ? 'Your aid can meet their financial needs'
    : score >= 0.5 ? 'Some overlap on financial needs'
    : 'Financial needs may be hard to meet';
  return { present: true, score, detail };
}

// --- ENVIRONMENT: campus setting match (with adjacency) ----------------------
const CAMPUS_ORDER = ['urban', 'suburban', 'small-town', 'rural']; // continuum
function scoreEnvironment(p, c) {
  const pc = p.preferred_campus_setting;
  const cc = c.campus_setting;
  if (!pc || !cc) return { present: false };
  // Explicit "no preference" is an ANSWER, not a blank: any campus works, so it
  // is a full match wherever the coach's setting lands. Mirrors the Financial
  // scorer's "no aid need -> neutral-positive 1.0" rule. Must be handled before
  // the CAMPUS_ORDER lookup below, which would otherwise miss (-1) and score 0.4.
  if (pc === MATCH.NO_CAMPUS_PREFERENCE) {
    return { present: true, score: 1.0, detail: 'Open to any campus setting' };
  }
  if (pc === cc) return { present: true, score: 1.0, detail: 'Prefers a campus setting like yours' };
  const i = CAMPUS_ORDER.indexOf(pc), j = CAMPUS_ORDER.indexOf(cc);
  if (i === -1 || j === -1) return { present: true, score: 0.4, detail: 'Different campus setting' };
  const dist = Math.abs(i - j); // 1..3 on the continuum
  const score = clamp01(1 - dist * 0.33);
  const detail = score >= 0.6 ? 'Campus setting is close to their preference' : 'Different campus setting';
  return { present: true, score, detail };
}

// --- DEVELOPMENT: player playing-time/competition wants vs coach dev model ----
function scoreDevelopment(p, c) {
  const prefs = fitPrefs(p);
  const cPrefs = fitPrefs(c);
  const playingTime = num(prefs.importance_playing_time);        // 1..5 (player)
  const competition = num(prefs.importance_competition_level);   // 1..5 (player)
  const dev = num(cPrefs.dev_vs_plug_and_play);                  // 1=develop .. 5=plug&play (coach)
  if (dev == null || (playingTime == null && competition == null)) return { present: false };

  // A player who prioritizes EARLY PLAYING TIME pairs with a PLUG-AND-PLAY program (high dev).
  // A player who prioritizes LEVEL OF COMPETITION pairs with a DEVELOPMENT program (low dev).
  const pieces = [];
  if (playingTime != null) {
    // both on 1..5; align playingTime-high with dev-high
    pieces.push(1 - Math.abs((playingTime - 3) - (dev - 3)) / 4);
  }
  if (competition != null) {
    // competition-high aligns with dev-LOW => invert dev
    pieces.push(1 - Math.abs((competition - 3) - ((6 - dev) - 3)) / 4);
  }
  const score = clamp01(pieces.reduce((a, b) => a + b, 0) / pieces.length);
  const detail = score >= 0.7 ? 'Your development approach fits how they want to be used'
    : 'Development approach is a partial fit';
  return { present: true, score, detail };
}

// ============================================================
// CRITERIA — single source of truth (order = display order)
// ============================================================
// `parts`      : scored sub-dimensions; the criterion is present when >=1 part is.
// `playerHas` / `coachHas`: cheap "did this side fill the section at all" probes,
//                used ONLY to attribute an absent criterion to a side in the UI.
//                They never affect the score — presence always comes from the
//                scorers themselves.
// `playerSection` / `coachSection`: the subtab name to send someone to.
const CRITERIA = [
  {
    key: 'academics',
    label: 'Academics',
    weight: W.high,
    playerSection: 'Academics',
    coachSection: 'Admissions',
    playerHas: (p) => num(p.gpa) != null || num(p.sat_score) != null || num(p.act_score) != null,
    coachHas: (c) => num(c.admitted_gpa_min) != null || num(c.admitted_gpa_max) != null ||
                     num(c.sat_min) != null || num(c.sat_max) != null ||
                     num(c.act_min) != null || num(c.act_max) != null,
    parts: [{ weight: 1, score: scoreAcademic }]
  },
  {
    key: 'levelLocation',
    label: 'Level & Location',
    weight: W.high,
    playerSection: 'Level & Location',
    coachSection: 'Program & Location',
    playerHas: (p) => arr(p.levels_open).length > 0 || arr(p.preferred_regions).length > 0 ||
                      !!p.preferred_campus_setting,
    coachHas: (c) => !!c.college_division || !!c.state || !!c.campus_setting,
    parts: [
      { weight: SUB.level,  score: scoreLevel },
      { weight: SUB.region, score: scoreGeographic },
      { weight: SUB.campus, score: scoreEnvironment }
    ]
  },
  {
    key: 'majorGoals',
    label: 'Major & Goals',
    weight: W.medium,
    playerSection: 'Major & Goals',
    coachSection: 'Academics & Majors',
    // "What I'm looking for in a program" is free text and deliberately does NOT
    // count — intended major is the only matchable field in this section.
    playerHas: (p) => arr(p.intended_major).length > 0,
    coachHas: (c) => arr(c.football_player_majors).length > 0 || arr(c.top_programs).length > 0,
    parts: [{ weight: 1, score: scoreMajor }]
  },
  {
    key: 'financial',
    label: 'Financial Fit',
    weight: W.low,
    playerSection: 'Financial Fit',
    coachSection: 'Cost & Aid',
    playerHas: (p) => !!p.needs_financial_aid || !!p.needs_scholarship,
    coachHas: (c) => !!c.offers_athletic_aid || !!c.aid_generosity || !!c.affordability_band,
    parts: [{ weight: 1, score: scoreFinancial }]
  },
  {
    key: 'priorities',
    label: 'Priorities & Athletics',
    weight: W.low,
    playerSection: 'Priorities & Athletics',
    coachSection: 'Scheme & Fit',
    // Only the two sliders the development scorer pairs on — close-to-home and
    // academics-vs-football have no coach counterpart yet.
    playerHas: (p) => {
      const fp = fitPrefs(p);
      return num(fp.importance_playing_time) != null || num(fp.importance_competition_level) != null;
    },
    coachHas: (c) => num(fitPrefs(c).dev_vs_plug_and_play) != null,
    parts: [{ weight: 1, score: scoreDevelopment }]
  }
];

// Back-compat alias — some callers/tests imported DIMENSIONS.
const DIMENSIONS = CRITERIA;

// Coach-perspective copy for a criterion that could not be scored. The AI Rep
// rewords these player-side (SCHOOL_DIM_DETAIL in routes/ai-rep.js).
function absentDetail(cr, missing) {
  if (missing === 'coach') return `Add ${cr.coachSection} to your program profile to score this`;
  if (missing === 'player') return `This player hasn’t filled in ${cr.playerSection} yet`;
  if (missing === 'both') return 'Neither profile has this information yet';
  return 'Not enough overlapping information yet';
}

// Which side is responsible for an absent criterion (for the UI only).
function whoIsMissing(cr, player, coach) {
  let pHas = false, cHas = false;
  try { pHas = !!cr.playerHas(player); } catch (e) { pHas = false; }
  try { cHas = !!cr.coachHas(coach); } catch (e) { cHas = false; }
  if (!pHas && !cHas) return 'both';
  if (!pHas) return 'player';
  if (!cHas) return 'coach';
  return null; // both filled something, but no part could be paired
}

// Evaluate one criterion: run its parts, weight-average the present ones.
function evalCriterion(cr, player, coach) {
  const results = cr.parts.map(pt => {
    let r;
    try { r = pt.score(player, coach) || { present: false }; }
    catch (e) { r = { present: false }; }
    return { weight: pt.weight, present: !!r.present, score: r.present ? clamp01(r.score) : null, detail: r.detail };
  });

  const present = results.filter(r => r.present);
  if (!present.length) {
    const missing = whoIsMissing(cr, player, coach);
    return {
      key: cr.key, label: cr.label, weight: cr.weight,
      present: false, score: null, detail: absentDetail(cr, missing), missing
    };
  }

  const wsum = present.reduce((a, r) => a + r.weight, 0);
  const score = clamp01(present.reduce((a, r) => a + r.score * r.weight, 0) / wsum);
  // Grouped criteria read out every part that scored, so a coach can see the
  // level/region/campus breakdown behind one "Level & Location" row.
  const detail = present.map(r => r.detail).filter(Boolean).join(' · ');
  return {
    key: cr.key, label: cr.label, weight: cr.weight,
    present: true, score, detail, missing: null
  };
}

// ============================================================
// computeFit — the public entry point
// ============================================================
function computeFit(player, coach) {
  const of = CRITERIA.length;

  // No profile on one side at all: still return all five rows so the modal can
  // explain itself rather than rendering an empty list.
  if (!player || !coach) {
    const dims = CRITERIA.map(cr => ({
      key: cr.key, label: cr.label, weight: cr.weight,
      present: false, score: null, detail: absentDetail(cr, 'both'), missing: 'both'
    }));
    return { score: null, tier: null, confidence: { n: 0, of, label: `Based on 0 of ${of}` }, dimensions: dims };
  }

  const dims = CRITERIA.map(cr => evalCriterion(cr, player, coach));

  const present = dims.filter(d => d.present);
  const hasCore = present.some(d => CORE_KEYS.includes(d.key));

  // Floor: need >=MIN_CRITERIA present AND at least one core criterion.
  if (present.length < MIN_CRITERIA || !hasCore) {
    return {
      score: null,
      tier: null,
      confidence: { n: present.length, of, label: `Based on ${present.length} of ${of}` },
      dimensions: dims
    };
  }

  // Weighted average over PRESENT criteria only -> 0..1 -> 0..99.
  const wsum = present.reduce((a, d) => a + d.weight, 0);
  const weighted = present.reduce((a, d) => a + d.score * d.weight, 0) / wsum;
  const score = Math.round(clamp01(weighted) * 99);

  return {
    score,
    tier: tierOf(score),
    confidence: { n: present.length, of, label: `Based on ${present.length} of ${of}` },
    dimensions: dims
  };
}

module.exports = {
  computeFit,
  tierOf,
  CRITERIA,
  DIMENSIONS, // back-compat alias for CRITERIA
  // exported for tests / future calibration
  _scorers: { scoreAcademic, scoreMajor, scoreLevel, scoreGeographic, scoreFinancial, scoreEnvironment, scoreDevelopment },
  _config: { W, SUB, MIN_CRITERIA, CORE_KEYS }
};
