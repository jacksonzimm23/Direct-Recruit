const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeBody } = require('../middleware/validation');
const { questionnaireGetLimiter, questionnaireSubmitLimiter } = require('../middleware/rateLimit');
const { sendQuestionnaireConfirmation } = require('../utils/email');
const { uploadToS3, generateTranscriptKey } = require('../utils/s3');

// Multer config dedicated to the anonymous-public transcript upload. Memory
// storage (not disk) so the PDF buffer goes straight to S3 without touching
// the EC2 disk. PDF-only via mimetype + extension check; magic-byte sniffing
// happens inside the route handler before we hit S3.
const TRANSCRIPT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const transcriptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TRANSCRIPT_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    if (file.mimetype !== 'application/pdf' || ext !== 'pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  }
});

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

// Cloudflare Turnstile verification. The submit endpoint is public, so it's
// exposed to bot spam — a script that learns a school's slug could flood that
// school's team pool with fake recruits. Turnstile is invisible to most real
// users (CF auto-decides; managed widget mode) and adds a token to the submit
// payload that we verify against CF's siteverify endpoint.
//
// Behavior by env:
//   - TURNSTILE_SECRET_KEY missing in production  -> fail CLOSED (reject all
//     submissions with 500). Loud-by-design so the operator notices.
//   - TURNSTILE_SECRET_KEY missing in development -> skip verification with a
//     one-time console warning. Local dev shouldn't need the integration.
//   - Token missing / invalid                    -> 400 with a friendly error.
async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, fatal: true, status: 500, error: 'Verification is misconfigured. Please contact support.' };
    }
    if (!verifyTurnstile._warned) {
      logger.warn('TURNSTILE_SECRET_KEY not set — skipping Turnstile verification (dev only).');
      verifyTurnstile._warned = true;
    }
    return { ok: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, status: 400, error: 'Please complete the verification challenge.' };
  }
  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteIp) params.append('remoteip', remoteIp);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = await resp.json();
    if (data && data.success === true) return { ok: true };
    logger.warn('Turnstile verification rejected', { codes: data && data['error-codes'] });
    return { ok: false, status: 400, error: 'Verification failed. Please try again.' };
  } catch (err) {
    logger.error('Turnstile siteverify network error:', err);
    return { ok: false, status: 503, error: 'Verification service unavailable. Please try again.' };
  }
}

// GET /api/questionnaire/:slug — public, no auth.
// Returns team identity (school name, division, state, city) so the public
// page can render its branded header. The field schema is hardcoded on the
// frontend (per the locked schema in pipeline.md) so we don't ship it here.
router.get('/:slug', questionnaireGetLimiter, async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(404).json({ error: 'Questionnaire not found' });

    // 1) Resolve the questionnaire row (school_key is the source of truth).
    const qResult = await pool.query(
      `SELECT slug, school_key
         FROM team_questionnaires
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!qResult.rows[0]) return res.status(404).json({ error: 'Questionnaire not found' });
    const { slug: q_slug, school_key } = qResult.rows[0];

    // 2) Find any current coach at this school to source the metadata
    // (logo lookup uses team_name; division/state/city come from any matching
    // coach_profile). If no coach currently matches the school_key (the
    // historical case after every coach has left), fall back to the
    // school_key itself.
    let teamName = school_key;
    let collegeDivision = null;
    let state = null;
    let city = null;

    const coachLookup = await pool.query(
      `SELECT team_name, college_division, state, city
         FROM coach_profiles
        WHERE LOWER(TRIM(team_name)) = $1
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [school_key]
    );
    if (coachLookup.rows[0]) {
      teamName = coachLookup.rows[0].team_name || teamName;
      collegeDivision = coachLookup.rows[0].college_division;
      state = coachLookup.rows[0].state;
      city = coachLookup.rows[0].city;
    }

    res.json({
      slug: q_slug,
      school: {
        team_name: teamName,
        college_division: collegeDivision,
        state,
        city
      },
      // Public site key for the Turnstile widget on the form. Null when not
      // configured (dev / unset env) — frontend treats null as "skip widget".
      turnstile_site_key: process.env.TURNSTILE_SITE_KEY || null
    });
  } catch (err) {
    logger.error('Public questionnaire GET error:', err);
    res.status(500).json({ error: 'Failed to load questionnaire' });
  }
});

// POST /api/questionnaire/:slug/transcript — public, no auth, rate-limited.
// Accepts a single PDF (5 MB max), uploads it to S3, returns the S3 key. The
// frontend stashes the key in submission_data.academic.transcript_s3_keys
// and sends it along with the eventual /submit call.
//
// Defense layers:
//  - Multer file filter rejects non-PDF mimetype + non-.pdf extension
//  - 5 MB size cap enforced by multer
//  - Magic-byte sniff (%PDF-) defeats content-type spoofing
//  - Per-IP rate limit (reuses the submit limiter — same 1h / 5 req cap)
//  - Email param required + validated; S3 key shards by email-hash for traceability
router.post('/:slug/transcript', questionnaireSubmitLimiter, (req, res, next) => {
  transcriptUpload.single('transcript')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Transcript must be 5 MB or smaller.' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(404).json({ error: 'Questionnaire not found' });

    // Verify the slug exists. We don't need anything from it for the upload
    // itself, but this rejects scattershot uploads to garbage slugs early
    // (before paying for the S3 PutObject).
    const qLookup = await pool.query(
      `SELECT 1 FROM team_questionnaires WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (!qLookup.rows[0]) return res.status(404).json({ error: 'Questionnaire not found' });

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file received.' });
    }

    // Magic-byte sniff. Real PDFs start with the 5-byte ASCII sequence "%PDF-".
    // A spoofed content-type can fool multer's filter; the magic bytes can't
    // be faked without actually building a PDF (at which point we don't care).
    const buf = req.file.buffer;
    if (buf.length < 5 || buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46 || buf[4] !== 0x2D) {
      return res.status(400).json({ error: 'File does not look like a valid PDF.' });
    }

    // Pull the email from the form field. Required so the S3 key can shard
    // by recruit (same recruit's resubmissions group under the same hash).
    const emailRaw = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRaw || emailRaw.length > 255 || !emailRe.test(emailRaw)) {
      return res.status(400).json({ error: 'A valid email is required to upload a transcript.' });
    }

    const key = generateTranscriptKey(emailRaw, req.file.originalname || 'transcript.pdf');
    await uploadToS3(buf, key, 'application/pdf');

    return res.json({ success: true, s3_key: key });
  } catch (err) {
    logger.error('Transcript upload error:', err);
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// POST /api/questionnaire/:slug/submit — public, no auth, rate-limited, sanitized.
// Inserts an immutable submission row and upserts the pool entry. If the email
// matches an existing DR user, both rows are linked.
router.post('/:slug/submit', questionnaireSubmitLimiter, sanitizeBody, async (req, res) => {
  // Verify Turnstile FIRST so bot traffic never touches the DB. Runs before
  // the slug lookup to keep the failure path cheap (no pool client checkout).
  const turnstileResult = await verifyTurnstile(req.body && req.body.turnstile_token, req.ip);
  if (!turnstileResult.ok) {
    return res.status(turnstileResult.status).json({ error: turnstileResult.error });
  }

  const client = await pool.connect();
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(404).json({ error: 'Questionnaire not found' });

    // Look up the questionnaire by slug. school_key is the source of truth;
    // we resolve a display-friendly team_name by matching any current coach
    // at this school (preferred) or falling back to the school_key itself.
    const qLookup = await client.query(
      `SELECT id AS questionnaire_id, school_key
         FROM team_questionnaires
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!qLookup.rows[0]) return res.status(404).json({ error: 'Questionnaire not found' });
    const { questionnaire_id, school_key } = qLookup.rows[0];

    const coachLookup = await client.query(
      `SELECT team_name FROM coach_profiles
        WHERE LOWER(TRIM(team_name)) = $1
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [school_key]
    );
    const team_name = (coachLookup.rows[0] && coachLookup.rows[0].team_name) || school_key;

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
    // Test-score uploads still not supported.
    academic.test_score_s3_keys = [];
    // Transcript: accept at most one key, validate it's a recruit-uploaded PDF
    // key. The frontend uploads via /transcript and pastes the returned key
    // here — anything else is rejected so a hostile client can't reference
    // arbitrary S3 objects (e.g. profile images) and have the coach UI render
    // them as transcripts. Empty / missing → coerce to [].
    if (academic.transcript_s3_keys === undefined || academic.transcript_s3_keys === null) {
      academic.transcript_s3_keys = [];
    } else if (!Array.isArray(academic.transcript_s3_keys)) {
      return res.status(400).json({ error: 'transcript_s3_keys must be an array' });
    } else if (academic.transcript_s3_keys.length > 1) {
      return res.status(400).json({ error: 'Only one transcript is allowed' });
    } else {
      for (const k of academic.transcript_s3_keys) {
        if (typeof k !== 'string' || !k.startsWith('transcripts/anon/') || !k.toLowerCase().endsWith('.pdf') || k.length > 200) {
          return res.status(400).json({ error: 'Invalid transcript reference' });
        }
      }
    }

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
