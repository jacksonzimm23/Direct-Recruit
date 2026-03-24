const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Strip HTML tags from a string (prevents stored XSS)
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

// Middleware: strip HTML tags from all string fields in req.body
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = stripHtml(req.body[key]);
      }
    }
  }
  next();
};

const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['player', 'coach', 'other']).withMessage('Role must be player, coach, or other'),
];

const validatePlayerProfile = [
  body('first_name').trim().notEmpty().withMessage('First name required').isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').trim().notEmpty().withMessage('Last name required').isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
  body('graduation_year').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined) return true;
    const year = parseInt(value);
    if (year < 2020 || year > 2035) throw new Error('Graduation year must be between 2020 and 2035');
    return true;
  }),
  body('position').optional({ nullable: true }).custom((value) => {
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
  }),
  body('gpa').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined) return true;
    const gpa = parseFloat(value);
    if (gpa < 0 || gpa > 5) throw new Error('GPA must be between 0 and 5');
    return true;
  }),
  body('sat_score').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined) return true;
    const score = parseInt(value);
    if (score < 400 || score > 1600) throw new Error('SAT score must be between 400 and 1600');
    return true;
  }),
  body('act_score').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined) return true;
    const score = parseInt(value);
    if (score < 1 || score > 36) throw new Error('ACT score must be between 1 and 36');
    return true;
  }),
];

const validateCoachProfile = [
  body('first_name').trim().notEmpty().withMessage('First name required').isLength({ max: 50 }).withMessage('First name must be 50 characters or less'),
  body('last_name').trim().notEmpty().withMessage('Last name required').isLength({ max: 50 }).withMessage('Last name must be 50 characters or less'),
  body('team_name').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Team name must be 100 characters or less'),
  body('college_division').optional({ nullable: true }).trim(),
  body('position_title').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Position title must be 100 characters or less'),
  body('bio').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Bio must be 1000 characters or less'),
];

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
  handleValidationErrors,
  sanitizeBody
};
