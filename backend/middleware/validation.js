const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const sanitizeHtmlLib = require('sanitize-html');

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

function stripHtml(str) {
  if (typeof str !== 'string') return str;
  if (str.length === 0) return str;
  return sanitizeHtmlLib(str, SANITIZE_OPTS);
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
];

const validateCoachProfile = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  body('first_name').trim().notEmpty().withMessage('First name required').isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').trim().notEmpty().withMessage('Last name required').isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('college_division').optional({ nullable: true }).trim(),
  body('position_title').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Position title must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
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
];

const validateCoachProfileUpdate = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
  body('first_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('college_division').optional({ nullable: true }).trim(),
  body('position_title').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Position title must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
];

const validateOtherProfileUpdate = [
  body('username').optional().trim().isLength({ max: 15 }).withMessage('Username must be 15 characters or less'),
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
  escapeLikePattern
};
