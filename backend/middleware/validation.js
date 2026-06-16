const { body, validationResult } = require('express-validator');
const validator = require('validator');
const logger = require('../utils/logger');
const sanitizeHtmlLib = require('sanitize-html');
const MATCH = require('../utils/match-constants'); // AI Fit-Matching allowlists (Plan 2)

// Canonical email normalizer. Wraps the SAME validator.normalizeEmail() that
// express-validator's .normalizeEmail() uses, so it is byte-identical to the
// normalization validateRegistration applies. Registration stores accounts in
// this normalized form (lowercased; for Gmail, dots + "+tags" stripped), so
// every other auth path (login, forgot/reset/verify/resend) MUST normalize the
// same way or case/dot variants fail to match — that was the login bug.
// Returns '' for missing/non-string input so callers' own "email required"
// checks still fire instead of throwing here.
function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim();
  // validator.normalizeEmail does NOT validate — it blindly transforms, so junk
  // like "notanemail" comes back as "@notanemail". Only run it on input that
  // actually validates as an email; otherwise return a clean trimmed-lowercase
  // so callers' own "email required"/format checks reject it instead of a query
  // ever seeing "@garbage". Empty string -> '' so `if (!email)` guards fire.
  if (!trimmed) return '';
  if (!validator.isEmail(trimmed)) return trimmed.toLowerCase();
  const normalized = validator.normalizeEmail(trimmed);
  return normalized === false ? trimmed.toLowerCase() : normalized;
}

// Strip ALL HTML tags. Plain text only — every frontend render path uses
// escapeHtml() or textContent, so no markup is intentionally preserved.
// allowedTags:[] tokenizes input and emits text nodes verbatim, preserving
// newlines and whitespace. Closes the regex bypass that missed unclosed tags.
const SANITIZE_OPTS = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  allowedSchemes: [],
  parseStyleAttributes: false,
};

// sanitize-html (with allowedTags:[]) strips every tag but, as a side effect of
// tokenizing, entity-ENCODES the bare characters it leaves behind: &->&amp;,
// <->&lt;, >->&gt;. That corrupts plain-text values at rest (e.g. a school named
// "West Texas A&M University" was stored as "...A&amp;M..."), which breaks any
// exact-string match downstream (school-logos.json key lookups, invite preselect).
// We decode those entities back AFTER stripping so literal text is preserved.
// This does NOT weaken XSS protection: tags are still removed here, and every
// frontend render path escapes at output time (escapeHtml()/textContent). The
// at-rest encoding was redundant, not load-bearing.
//
// ORDER MATTERS: decode &amp; LAST. sanitize-html turns a user's literal "&lt;"
// into "&amp;lt;"; decoding &amp; first would collapse that to "<" and fabricate
// a tag. Decoding &amp; last restores the literal "&lt;" string instead.
function decodeBasicEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // MUST be last
}

function stripHtml(str) {
  if (typeof str !== 'string') return str;
  if (str.length === 0) return str;
  return decodeBasicEntities(sanitizeHtmlLib(str, SANITIZE_OPTS));
}

// Escape Postgres LIKE/ILIKE pattern metacharacters so user input is matched
// literally as a substring instead of as a wildcard pattern. `%` matches any
// run of characters and `_` matches one character; backslash escapes the
// escape character itself. Caller still wraps the result in `%...%` for the
// substring search.
function escapeLikePattern(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// Recursive walker. Mutates input in place to preserve req.body identity.
// WeakSet cycle guard + depth cap of 10 (legitimate req.body never exceeds ~4).
function deepStripHtml(value, seen = new WeakSet(), depth = 0) {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return stripHtml(value);

  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    for (let i = 0; i < value.length; i++) {
      value[i] = deepStripHtml(value[i], seen, depth + 1);
    }
    return value;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return value;
    if (value.constructor && value.constructor !== Object) return value;
    seen.add(value);
    for (const key of Object.keys(value)) {
      value[key] = deepStripHtml(value[key], seen, depth + 1);
    }
    return value;
  }

  return value;
}

const sanitizeBody = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      deepStripHtml(req.body);
    }
  } catch (err) {
    logger.error('sanitizeBody error', { error: err.message, requestId: req.requestId });
  }
  next();
};

// --- Shared custom validator functions ---

const validateGraduationYear = (value) => {
  if (value === null || value === undefined) return true;
  const year = parseInt(value);
  if (year < 2020 || year > 2035) throw new Error('Graduation year must be between 2020 and 2035');
  return true;
};

const validatePosition = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const validPositions = [
    // Offense - Skill Positions
    'QB', 'RB', 'FB', 'WR', 'TE',
    // Offense - Line
    'OT', 'OG', 'C', 'OL',
    // Defense - Line
    'DE', 'DT', 'NT', 'DL',
    // Defense - Linebackers
    'OLB', 'ILB', 'MLB', 'LB',
    // Defense - Secondary
    'CB', 'S', 'FS', 'SS', 'DB',
    // Special Teams
    'K', 'P', 'LS', 'KR', 'PR',
    // Two-Way & Athletes
    'ATH'
  ];
  // Support multi-position values like "CB/WR" or "QB/ATH"
  const positions = value.split('/').map(p => p.trim());
  for (const pos of positions) {
    if (!validPositions.includes(pos)) {
      throw new Error(`Invalid position: ${pos}`);
    }
  }
  return true;
};

const validateGpa = (value) => {
  if (value === null || value === undefined) return true;
  const gpa = parseFloat(value);
  if (gpa < 0 || gpa > 5) throw new Error('GPA must be between 0 and 5');
  return true;
};

const validateSatScore = (value) => {
  if (value === null || value === undefined) return true;
  const score = parseInt(value);
  if (score < 400 || score > 1600) throw new Error('SAT score must be between 400 and 1600');
  return true;
};

const validateActScore = (value) => {
  if (value === null || value === undefined) return true;
  const score = parseInt(value);
  if (score < 1 || score > 36) throw new Error('ACT score must be between 1 and 36');
  return true;
};

const validatePffGrade = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const grade = Number(value);
  if (!Number.isFinite(grade)) throw new Error('PFF Grade must be numeric');
  if (grade < 0 || grade > 100) throw new Error('PFF Grade must be between 0 and 100');
  if (Math.round(grade * 10) / 10 !== grade) {
    throw new Error('PFF Grade must have at most 1 decimal place');
  }
  return true;
};

// --- AI Fit-Matching field validators (Plan 2) ---
// Categorical/array values are checked against the canonical allowlist Sets
// derived in backend/utils/match-constants.js (lesson #113).

const validateWeightedGpa = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const g = parseFloat(value);
  if (!Number.isFinite(g) || g < 0 || g > 6) throw new Error('Weighted GPA must be between 0 and 6');
  return true;
};

const validateApIbCount = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0 || n > 40) throw new Error('AP/IB count must be between 0 and 40');
  return true;
};

const validateHomeZip = (value) => {
  if (value === null || value === undefined || value === '') return true;
  if (!/^\d{5}$/.test(String(value))) throw new Error('Home ZIP must be a 5-digit code');
  return true;
};

// Factory: value (or each array element) must be in the given allowlist Set.
const inSet = (set, label) => (value) => {
  if (value === null || value === undefined || value === '') return true;
  const items = Array.isArray(value) ? value : [value];
  for (const v of items) {
    if (!set.has(v)) throw new Error(`Invalid ${label}: ${v}`);
  }
  return true;
};

const validateIntendedMajor = (value) => {
  if (value === null || value === undefined) return true;
  if (!Array.isArray(value)) throw new Error('intended_major must be an array');
  if (value.length > 3) throw new Error('Select at most 3 majors');
  return inSet(MATCH.VALID_MAJORS, 'major')(value);
};

const validateSliderRange = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Importance must be between 1 and 5');
  return true;
};

// fit_preferences is a JSONB blob — validate its known keys (all optional).
const validateFitPreferences = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fit_preferences must be an object');
  }
  ['importance_playing_time', 'importance_close_to_home',
   'importance_academics_vs_football', 'importance_competition_level'].forEach(k => {
    if (value[k] !== null && value[k] !== undefined) validateSliderRange(value[k]);
  });
  if (value.looking_for_text != null) {
    if (typeof value.looking_for_text !== 'string') throw new Error('looking_for_text must be a string');
    if (value.looking_for_text.length > 280) throw new Error('looking_for_text must be 280 characters or less');
  }
  return true;
};

// --- Coach "Program Profile" / "Program Fit" validators (Plan 3) ---

// Typical admitted GPA — col is NUMERIC(3,2): 0–4, at most 2 decimals.
// (player's validateWeightedGpa allows 0–6, so coach needs its own bound.)
const validateAdmittedGpa = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const g = parseFloat(value);
  if (!Number.isFinite(g) || g < 0 || g > 4) throw new Error('Admitted GPA must be between 0 and 4');
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Admitted GPA may have at most 2 decimal places');
  return true;
};

// coach fit_preferences is a JSONB blob — validate its known keys (all optional).
const validateCoachFitPreferences = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fit_preferences must be an object');
  }
  if (value.dev_vs_plug_and_play != null) validateSliderRange(value.dev_vs_plug_and_play);
  inSet(MATCH.VALID_ROSTER_PCT_ON_AID, 'roster % on aid')(value.roster_pct_on_aid);
  inSet(MATCH.VALID_SCHEMES_OFFENSE, 'offensive scheme')(value.offensive_scheme);
  inSet(MATCH.VALID_SCHEMES_DEFENSE, 'defensive scheme')(value.defensive_scheme);
  inSet(MATCH.VALID_ACADEMIC_SUPPORT, 'academic support')(value.academic_support);
  if (value.affiliation != null) {
    if (!Array.isArray(value.affiliation)) throw new Error('affiliation must be an array');
    inSet(MATCH.VALID_AFFILIATIONS, 'affiliation')(value.affiliation);
  }
  if (value.great_fit_text != null) {
    if (typeof value.great_fit_text !== 'string') throw new Error('great_fit_text must be a string');
    if (value.great_fit_text.length > 280) throw new Error('great_fit_text must be 280 characters or less');
  }
  return true;
};

// Reusable chain for the AI Fit-Matching player fields, spread into both the
// create and update validator arrays (lesson #2 — same validation both paths).
const fitMatchingPlayerValidators = [
  body('weighted_gpa').optional({ nullable: true }).custom(validateWeightedGpa),
  body('has_ap_ib').optional({ nullable: true }).isBoolean().withMessage('has_ap_ib must be boolean'),
  body('ap_ib_count').optional({ nullable: true }).custom(validateApIbCount),
  body('class_rank').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Class rank must be 50 characters or less'),
  body('intended_major').optional({ nullable: true }).custom(validateIntendedMajor),
  body('home_zip').optional({ nullable: true }).custom(validateHomeZip),
  body('needs_financial_aid').optional({ nullable: true }).custom(inSet(MATCH.VALID_YES_NO_UNSURE, 'financial aid option')),
  body('needs_scholarship').optional({ nullable: true }).custom(inSet(MATCH.VALID_YES_NO_UNSURE, 'scholarship option')),
  body('pell_or_first_gen').optional({ nullable: true }).isBoolean().withMessage('pell_or_first_gen must be boolean'),
  body('levels_open').optional({ nullable: true }).isArray().withMessage('levels_open must be an array'),
  body('levels_open').optional({ nullable: true }).custom(inSet(MATCH.VALID_LEVELS, 'level')),
  body('preferred_regions').optional({ nullable: true }).isArray().withMessage('preferred_regions must be an array'),
  body('preferred_regions').optional({ nullable: true }).custom(inSet(MATCH.VALID_REGIONS, 'region')),
  body('preferred_campus_setting').optional({ nullable: true }).custom(inSet(MATCH.VALID_CAMPUS_SETTINGS, 'campus setting')),
  body('fit_preferences').optional({ nullable: true }).custom(validateFitPreferences),
];

// Reusable chain for the AI Fit-Matching coach "Program Profile" / "Program Fit"
// fields, spread into both the create and update coach validator arrays (lesson #2).
const fitMatchingCoachValidators = [
  body('admitted_gpa_min').optional({ nullable: true }).custom(validateAdmittedGpa),
  body('admitted_gpa_max').optional({ nullable: true }).custom(validateAdmittedGpa),
  body('test_optional').optional({ nullable: true }).isBoolean().withMessage('test_optional must be boolean'),
  body('sat_min').optional({ nullable: true }).custom(validateSatScore),
  body('sat_max').optional({ nullable: true }).custom(validateSatScore),
  body('act_min').optional({ nullable: true }).custom(validateActScore),
  body('act_max').optional({ nullable: true }).custom(validateActScore),
  body('top_programs').optional({ nullable: true }).isArray().withMessage('top_programs must be an array'),
  body('top_programs').optional({ nullable: true }).custom(inSet(MATCH.VALID_MAJORS, 'major')),
  body('football_player_majors').optional({ nullable: true }).isArray().withMessage('football_player_majors must be an array'),
  body('football_player_majors').optional({ nullable: true }).custom(inSet(MATCH.VALID_MAJORS, 'major')),
  body('affordability_band').optional({ nullable: true }).custom(inSet(MATCH.VALID_AFFORDABILITY_BANDS, 'affordability band')),
  body('offers_athletic_aid').optional({ nullable: true }).custom(inSet(MATCH.VALID_ATHLETIC_AID_OPTIONS, 'athletic aid option')),
  body('aid_generosity').optional({ nullable: true }).custom(inSet(MATCH.VALID_AID_GENEROSITY, 'aid generosity')),
  body('campus_setting').optional({ nullable: true }).custom(inSet(MATCH.VALID_CAMPUS_SETTINGS, 'campus setting')),
  body('distance_profile').optional({ nullable: true }).custom(inSet(MATCH.VALID_DISTANCE_PROFILES, 'distance profile')),
  body('hs_tier_recruited').optional({ nullable: true }).custom(inSet(MATCH.VALID_HS_TIERS, 'HS tier')),
  body('fit_preferences').optional({ nullable: true }).custom(validateCoachFitPreferences),
];

// --- Registration validation ---

const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['player', 'coach', 'other']).withMessage('Role must be player, coach, or other'),
];

// --- Profile creation validators (required fields enforced) ---

const validatePlayerProfile = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  body('first_name').trim().notEmpty().withMessage('First name required').isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').trim().notEmpty().withMessage('Last name required').isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
  body('graduation_year').optional({ nullable: true }).custom(validateGraduationYear),
  body('position').optional({ nullable: true }).custom(validatePosition),
  body('gpa').optional({ nullable: true }).custom(validateGpa),
  body('sat_score').optional({ nullable: true }).custom(validateSatScore),
  body('act_score').optional({ nullable: true }).custom(validateActScore),
  body('other_sports').optional({ nullable: true }).isArray().withMessage('other_sports must be an array'),
  body('other_sports.*').optional().isString().isLength({ max: 100 }).withMessage('Each sport must be 100 characters or less'),
  body('track_100m').optional({ nullable: true }).isNumeric().withMessage('track_100m must be numeric'),
  body('track_200m').optional({ nullable: true }).isNumeric().withMessage('track_200m must be numeric'),
  body('pff_grade').optional({ nullable: true }).custom(validatePffGrade),
  ...fitMatchingPlayerValidators,
];

const validateCoachProfile = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  body('first_name').trim().notEmpty().withMessage('First name required').isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').trim().notEmpty().withMessage('Last name required').isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('college_division').optional({ nullable: true }).trim(),
  body('position_title').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Position title must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
  ...fitMatchingCoachValidators,
];

const validateOtherProfile = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  body('first_name').trim().notEmpty().withMessage('First name required').isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').trim().notEmpty().withMessage('Last name required').isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('subheader').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Subheader must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
];

// --- Profile update validators (all fields optional for partial updates) ---

const validatePlayerProfileUpdate = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  // Contact email on the player profile (player_profiles.email — separate from
  // the login email). checkFalsy lets an empty string through so the field can
  // be cleared from the edit modal.
  body('email').optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage('Contact email must be a valid email address').isLength({ max: 255 }).withMessage('Contact email must be 255 characters or less'),
  body('first_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
  body('graduation_year').optional({ nullable: true }).custom(validateGraduationYear),
  body('position').optional({ nullable: true }).custom(validatePosition),
  body('gpa').optional({ nullable: true }).custom(validateGpa),
  body('sat_score').optional({ nullable: true }).custom(validateSatScore),
  body('act_score').optional({ nullable: true }).custom(validateActScore),
  body('other_sports').optional({ nullable: true }).isArray().withMessage('other_sports must be an array'),
  body('other_sports.*').optional().isString().isLength({ max: 100 }).withMessage('Each sport must be 100 characters or less'),
  body('track_100m').optional({ nullable: true }).isNumeric().withMessage('track_100m must be numeric'),
  body('track_200m').optional({ nullable: true }).isNumeric().withMessage('track_200m must be numeric'),
  body('pff_grade').optional({ nullable: true }).custom(validatePffGrade),
  ...fitMatchingPlayerValidators,
];

const validateCoachProfileUpdate = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  // Contact email (coach_profiles.email — separate from the login email).
  body('email').optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage('Contact email must be a valid email address').isLength({ max: 255 }).withMessage('Contact email must be 255 characters or less'),
  body('first_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('college_division').optional({ nullable: true }).trim(),
  body('position_title').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Position title must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
  ...fitMatchingCoachValidators,
];

const validateOtherProfileUpdate = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  // Contact email (other_profiles.email — separate from the login email).
  body('email').optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage('Contact email must be a valid email address').isLength({ max: 255 }).withMessage('Contact email must be 255 characters or less'),
  body('first_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('subheader').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Subheader must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
];

// --- Error handler ---

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    logger.error('Validation errors:', errors.array());
    return res.status(400).json({
      error: errorMessages,
      details: errors.array()
    });
  }
  next();
};

module.exports = {
  validateRegistration,
  validatePlayerProfile,
  validateCoachProfile,
  validateOtherProfile,
  validatePlayerProfileUpdate,
  validateCoachProfileUpdate,
  validateOtherProfileUpdate,
  handleValidationErrors,
  sanitizeBody,
  stripHtml,
  escapeLikePattern,
  normalizeEmail
};
