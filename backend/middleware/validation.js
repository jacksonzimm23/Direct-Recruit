const { body, validationResult } = require('express-validator');

const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['player', 'coach', 'other']).withMessage('Role must be player, coach, or other'),
];

const validatePlayerProfile = [
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('last_name').trim().notEmpty().withMessage('Last name required'),
  body('high_school').optional({ nullable: true }).trim(),
  body('graduation_year').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined) return true;
    const year = parseInt(value);
    if (year < 2020 || year > 2035) throw new Error('Graduation year must be between 2020 and 2035');
    return true;
  }),
  body('position').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined) return true;
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
    if (!validPositions.includes(value)) throw new Error('Invalid position');
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
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('last_name').trim().notEmpty().withMessage('Last name required'),
  body('college_name').optional({ nullable: true }).trim(),
  body('college_division').optional({ nullable: true }).trim(),
  body('position_title').optional({ nullable: true }).trim(),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    console.error('Validation errors:', errors.array());
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
  handleValidationErrors
};
