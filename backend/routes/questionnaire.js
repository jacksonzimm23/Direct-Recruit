const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeBody } = require('../middleware/validation');
const { questionnaireGetLimiter, questionnaireSubmitLimiter } = require('../middleware/rateLimit');
const { sendQuestionnaireConfirmation } = require('../utils/email');

// Build the DR signup CTA URL — pattern matches buildInviteLink in
// admin-coach-verification.js and buildQuestionnaireUrl in recruiting-board.js.
function buildSignupUrl(email) {
  const isProd = process.env.NODE_ENV === 'production';
  const appUrl = process.env.APP_URL || (isProd ? 'https://directrecruit.net' : 'http://localhost:5500');
  const prefix = process.env.FRONTEND_PATH_PREFIX !== undefined
    ? process.env.FRONTEND_PATH_PREFIX
    : (isProd ? '' : '/frontend');
  return `${appUrl}${prefix}/landingpage/get-started.html?email=${encodeURIComponent(email)}`;
}

// Bounded string check used by the submit validator.
function ensureMaxLen(value, max) {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  return value.length <= max;
}

// GET /api/questionnaire/:slug — public, no auth.
// Returns team identity (school name, division, state, city) so the public
// page can render its branded header. The field schema is hardcoded on the
// frontend (per the locked schema in pipeline.md) so we don't ship it here.
router.get('/:slug', questionnaireGetLimiter, async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(404).json({ error: 'Questionnaire not found' });

    const result = await pool.query(
      `SELECT tq.slug, cp.team_name, cp.college_division, cp.state, cp.city
         FROM team_questionnaires tq
         JOIN board_groups bg ON bg.id = tq.group_id
         JOIN coach_profiles cp ON cp.user_id = bg.owner_user_id
        WHERE tq.slug = $1
        LIMIT 1`,
      [slug]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Questionnaire not found' });

    const row = result.rows[0];
    res.json({
      slug: row.slug,
      school: {
        team_name: row.team_name,
        college_division: row.college_division,
        state: row.state,
        city: row.city
      }
    });
  } catch (err) {
    logger.error('Public questionnaire GET error:', err);
    res.status(500).json({ error: 'Failed to load questionnaire' });
  }
});

// POST /api/questionnaire/:slug/submit — public, no auth, rate-limited, sanitized.
// Inserts an immutable submission row and upserts the pool entry. If the email
// matches an existing DR user, both rows are linked.
router.post('/:slug/submit', questionnaireSubmitLimiter, sanitizeBody, async (req, res) => {
  const client = await pool.connect();
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(404).json({ error: 'Questionnaire not found' });

    // Look up the questionnaire + the owner coach's team name (for the email)
    const qLookup = await client.query(
      `SELECT tq.id AS questionnaire_id, cp.team_name
         FROM team_questionnaires tq
         JOIN board_groups bg ON bg.id = tq.group_id
         JOIN coach_profiles cp ON cp.user_id = bg.owner_user_id
        WHERE tq.slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!qLookup.rows[0]) return res.status(404).json({ error: 'Questionnaire not found' });
    const { questionnaire_id, team_name } = qLookup.rows[0];

    // Validate top-level shape
    const submissionData = req.body && req.body.submission_data;
    if (!submissionData || typeof submissionData !== 'object' || Array.isArray(submissionData)) {
      return res.status(400).json({ error: 'submission_data is required' });
    }

    const personal = submissionData.personal && typeof submissionData.personal === 'object' ? submissionData.personal : null;
    if (!personal) return res.status(400).json({ error: 'personal section is required' });

    const firstName = typeof personal.first_name === 'string' ? personal.first_name.trim() : '';
    const lastName = typeof personal.last_name === 'string' ? personal.last_name.trim() : '';
    const emailRaw = typeof personal.email === 'string' ? personal.email.trim().toLowerCase() : '';

    if (!firstName || firstName.length > 50) return res.status(400).json({ error: 'First name is required (max 50 chars)' });
    if (!lastName || lastName.length > 50) return res.status(400).json({ error: 'Last name is required (max 50 chars)' });

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRaw || emailRaw.length > 255 || !emailRe.test(emailRaw)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Bounded-string checks for the rest of personal
    if (!ensureMaxLen(personal.mobile_phone, 20)) return res.status(400).json({ error: 'Mobile phone too long' });
    if (!ensureMaxLen(personal.birth_date, 10)) return res.status(400).json({ error: 'Invalid birth date' });
    if (!ensureMaxLen(personal.facebook_username, 100)) return res.status(400).json({ error: 'Facebook username too long' });
    if (!ensureMaxLen(personal.twitter_username, 100)) return res.status(400).json({ error: 'Twitter/X username too long' });
    if (!ensureMaxLen(personal.hobbies, 500)) return res.status(400).json({ error: 'Hobbies too long' });

    // Address
    const address = submissionData.address && typeof submissionData.address === 'object' ? submissionData.address : {};
    if (!ensureMaxLen(address.line_1, 200)) return res.status(400).json({ error: 'Address line 1 too long' });
    if (!ensureMaxLen(address.line_2, 200)) return res.status(400).json({ error: 'Address line 2 too long' });
    if (!ensureMaxLen(address.city, 100)) return res.status(400).json({ error: 'City too long' });
    if (!ensureMaxLen(address.state, 2)) return res.status(400).json({ error: 'Invalid state' });
    if (!ensureMaxLen(address.zip, 10)) return res.status(400).json({ error: 'Zip too long' });

    // Parents — must be an array of bounded objects
    const parents = Array.isArray(submissionData.parents) ? submissionData.parents : [];
    if (parents.length > 10) return res.status(400).json({ error: 'Too many parents/guardians (max 10)' });
    for (const p of parents) {
      if (!p || typeof p !== 'object') return res.status(400).json({ error: 'Invalid parent entry' });
      if (!ensureMaxLen(p.first_name, 50) || !ensureMaxLen(p.last_name, 50)) return res.status(400).json({ error: 'Parent name too long' });
      if (!ensureMaxLen(p.email, 255) || !ensureMaxLen(p.phone, 20)) return res.status(400).json({ error: 'Parent contact too long' });
      if (!ensureMaxLen(p.employment, 200) || !ensureMaxLen(p.college, 200)) return res.status(400).json({ error: 'Parent details too long' });
    }

    // Family
    const family = submissionData.family && typeof submissionData.family === 'object' ? submissionData.family : {};
    if (!ensureMaxLen(family.siblings, 1000)) return res.status(400).json({ error: 'Siblings text too long' });

    // Academic
    const academic = submissionData.academic && typeof submissionData.academic === 'object' ? submissionData.academic : {};
    if (!ensureMaxLen(academic.high_school, 200)) return res.status(400).json({ error: 'High school too long' });
    if (!ensureMaxLen(academic.intended_major, 200)) return res.status(400).json({ error: 'Intended major too long' });
    if (!ensureMaxLen(academic.ncaa_id, 20)) return res.status(400).json({ error: 'NCAA ID too long' });
    if (!ensureMaxLen(academic.honors, 500)) return res.status(400).json({ error: 'Academic honors too long' });
    // Plan 2 does NOT support file uploads — coerce key arrays to []
    academic.transcript_s3_keys = [];
    academic.test_score_s3_keys = [];

    // Athletic
    const athletic = submissionData.athletic && typeof submissionData.athletic === 'object' ? submissionData.athletic : {};
    if (!ensureMaxLen(athletic.positions, 100)) return res.status(400).json({ error: 'Positions too long' });
    if (!ensureMaxLen(athletic.honors, 500)) return res.status(400).json({ error: 'Athletic honors too long' });
    if (athletic.other_sports !== undefined && athletic.other_sports !== null) {
      if (!Array.isArray(athletic.other_sports)) return res.status(400).json({ error: 'Other sports must be an array' });
      if (athletic.other_sports.length > 20) return res.status(400).json({ error: 'Too many other sports' });
    }

    // Film & video
    const film = submissionData.film && typeof submissionData.film === 'object' ? submissionData.film : {};
    if (film.video_urls !== undefined && film.video_urls !== null) {
      if (!Array.isArray(film.video_urls)) return res.status(400).json({ error: 'Video URLs must be an array' });
      if (film.video_urls.length > 4) return res.status(400).json({ error: 'Too many video URLs (max 4)' });
      for (const u of film.video_urls) {
        if (!ensureMaxLen(u, 500)) return res.status(400).json({ error: 'Video URL too long' });
      }
    }
    film.video_s3_keys = [];

    // Persist the normalized email back so the submission_data is canonical
    personal.email = emailRaw;
    personal.first_name = firstName;
    personal.last_name = lastName;

    await client.query('BEGIN');

    const insertSub = await client.query(
      `INSERT INTO questionnaire_submissions (questionnaire_id, email, submission_data)
            VALUES ($1, $2, $3)
         RETURNING id`,
      [questionnaire_id, emailRaw, JSON.stringify(submissionData)]
    );
    const submissionId = insertSub.rows[0].id;

    const upsertPool = await client.query(
      `INSERT INTO pool_entries (
          questionnaire_id, email, latest_submission_id, submission_count, first_submitted_at, last_submitted_at
        ) VALUES ($1, $2, $3, 1, NOW(), NOW())
        ON CONFLICT (questionnaire_id, LOWER(email))
        DO UPDATE SET
          latest_submission_id = EXCLUDED.latest_submission_id,
          submission_count = pool_entries.submission_count + 1,
          last_submitted_at = NOW()
        RETURNING id, submission_count`,
      [questionnaire_id, emailRaw, submissionId]
    );
    const poolEntryId = upsertPool.rows[0].id;

    // Link to existing DR account if one exists for this email
    const userLookup = await client.query(
      `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [emailRaw]
    );
    if (userLookup.rows[0]) {
      const userId = userLookup.rows[0].id;
      await client.query(
        `UPDATE questionnaire_submissions SET linked_player_user_id = $1 WHERE id = $2`,
        [userId, submissionId]
      );
      await client.query(
        `UPDATE pool_entries SET linked_player_user_id = $1 WHERE id = $2`,
        [userId, poolEntryId]
      );
    }

    await client.query('COMMIT');

    // Fire-and-forget confirmation email
    sendQuestionnaireConfirmation(emailRaw, {
      firstName,
      schoolName: team_name,
      signupUrl: buildSignupUrl(emailRaw)
    }).catch((emailErr) => {
      logger.error('Questionnaire confirmation email failed (non-fatal):', emailErr);
    });

    return res.json({ success: true, message: 'Submission received' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    logger.error('Public questionnaire submit error:', err);
    return res.status(500).json({ error: 'Submission failed. Please try again.' });
  } finally {
    client.release();
  }
});

module.exports = router;
