const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { coachRequestLimiter, authLimiter } = require('../middleware/rateLimit');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { sendCoachRequestNotification } = require('../utils/email');

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'jackson@directrecruit.net';
const RESUBMIT_COOLDOWN_HOURS = 24;
const TEAM_SWITCH_COOLDOWN_HOURS = 72;
const VALID_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isEduEmail(email) {
  return typeof email === 'string' && /\.edu(?:\.[a-z]{2})?$/i.test(email.trim());
}

// POST /api/coach-signup/request — public contact form submission.
// Soft-auth: anonymous (new signup) OR authenticated (profile-type switch OR
// intra-collegecoach team switch). The `is_team_switch` branch forks early
// because the request shape and validation rules differ enough that mixing
// them into the new-signup path would be hard to read.
router.post('/request', coachRequestLimiter, optionalAuthMiddleware, async (req, res) => {
  try {
    // Fork: intra-collegecoach team switch (existing college coach changing schools).
    // Distinct from `is_switch` (profile-type switch into collegecoach).
    if (req.body && req.body.is_team_switch === true) {
      return handleTeamSwitchRequest(req, res);
    }

    const {
      first_name,
      last_name,
      school,
      division,
      position,
      phone,
      edu_email,
      personal_email,
      notes,
      is_switch: clientIsSwitch
    } = req.body || {};

    // Determine if this is a switch request. ONLY trust is_switch when the user
    // is actually authenticated — otherwise force false to prevent spoofing.
    const isSwitch = !!(req.user && clientIsSwitch);
    const existingUserId = isSwitch ? req.user.id : null;
    // For switches, server-trust the personal_email — must equal the authenticated user's email
    const effectivePersonalEmail = isSwitch ? req.user.email : personal_email;

    // Server-side validation
    if (!first_name || !last_name || !school || !division || !position || !edu_email || !effectivePersonalEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Division is free-text on the public form (admin canonicalizes via the lock step) —
    // just guard against an absurdly long string.
    if (typeof division !== 'string' || division.length > 50) {
      return res.status(400).json({ error: 'Invalid division' });
    }
    if (!isEduEmail(edu_email)) {
      return res.status(400).json({ error: 'A valid .edu email address is required' });
    }
    if (!isValidEmail(effectivePersonalEmail)) {
      return res.status(400).json({ error: 'Personal email is invalid' });
    }
    if (notes && typeof notes === 'string' && notes.length > 150) {
      return res.status(400).json({ error: 'Notes must be 150 characters or less' });
    }
    // Switch requests can't already be on collegecoach
    if (isSwitch && req.user.role === 'coach') {
      // We need to check the subtype — fetch the coach profile
      const CoachProfile = require('../models/CoachProfile');
      const existing = await CoachProfile.findByUserId(req.user.id);
      if (existing && existing.college_division) {
        return res.status(400).json({ error: 'You are already a College Coach' });
      }
    }

    const normalizedEdu = edu_email.trim().toLowerCase();
    const ip = (req.ip || req.connection?.remoteAddress || '').slice(0, 45);

    // Check if a NON-ARCHIVED request for this edu_email already exists.
    // Archived rows (deleted_at IS NOT NULL) are left behind when a coach
    // deletes their account or switches profile type away from collegecoach —
    // they should NOT block a fresh resubmission from the same .edu address.
    const existing = await pool.query(
      `SELECT id, status, created_at FROM coach_signup_requests
         WHERE edu_email = $1 AND deleted_at IS NULL`,
      [normalizedEdu]
    );

    let shouldSendEmail = false;
    let requestId;

    if (!existing.rows[0]) {
      // Brand new request
      const ins = await pool.query(
        `INSERT INTO coach_signup_requests
          (first_name, last_name, school, division, position, phone, edu_email, personal_email, notes, ip_address, is_switch, existing_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id`,
        [first_name.trim(), last_name.trim(), school.trim(), division.trim(),
         position.trim(), phone ? phone.trim() : null, normalizedEdu,
         effectivePersonalEmail.trim(), notes ? notes.trim() : null, ip,
         isSwitch, existingUserId]
      );
      requestId = ins.rows[0].id;
      shouldSendEmail = true;
    } else {
      const row = existing.rows[0];
      requestId = row.id;
      if (row.status === 'pending') {
        // Check 24h cooldown
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        const hours = ageMs / (1000 * 60 * 60);
        if (hours > RESUBMIT_COOLDOWN_HOURS) {
          // Refresh request with new submission and re-notify
          await pool.query(
            `UPDATE coach_signup_requests
               SET first_name=$1, last_name=$2, school=$3, division=$4, position=$5, phone=$6,
                   personal_email=$7, notes=$8, ip_address=$9, created_at=CURRENT_TIMESTAMP,
                   is_switch=$10, existing_user_id=$11
             WHERE id=$12`,
            [first_name.trim(), last_name.trim(), school.trim(), division.trim(),
             position.trim(), phone ? phone.trim() : null, effectivePersonalEmail.trim(),
             notes ? notes.trim() : null, ip, isSwitch, existingUserId, requestId]
          );
          shouldSendEmail = true;
        }
        // else: silent — within cooldown window, don't spam Jackson
      }
      // status === 'approved' or 'rejected' → silent, return success without email
    }

    if (shouldSendEmail) {
      try {
        await sendCoachRequestNotification(ADMIN_NOTIFY_EMAIL, {
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          school: school.trim(),
          division: division.trim(),
          position: position.trim(),
          phone: phone ? phone.trim() : '',
          edu_email: normalizedEdu,
          personal_email: effectivePersonalEmail.trim(),
          notes: notes ? notes.trim() : '',
          is_switch: isSwitch
        });
      } catch (emailErr) {
        // Don't fail the request if email sending fails — request is saved
        logger.error('[coach-signup] failed to send notification email:', emailErr);
      }
    }

    return res.json({
      success: true,
      message: "Thanks — we'll review your request and be in touch within 48 hours."
    });
  } catch (err) {
    logger.error('[coach-signup] request error:', err);
    return res.status(500).json({ error: 'Failed to submit request' });
  }
});

// GET /api/coach-signup/validate-token?token=... — used by create-profile page on load
router.get('/validate-token', authLimiter, async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.status(404).json({ valid: false, reason: 'invalid' });
    }

    // One lookup without filters to classify reason (expired vs used vs revoked vs invalid).
    // LEFT JOIN to coach_signup_requests so we can surface the team-switch "from"
    // snapshot (old_team_name) without an extra roundtrip from the confirm page.
    const r = await pool.query(
      `SELECT i.id, i.first_name, i.last_name, i.school, i.division, i.edu_email, i.position,
              i.expires_at, i.used_at, i.revoked_at, i.is_switch, i.is_team_switch,
              r.existing_user_id, r.old_team_name, r.old_division
         FROM coach_invites i
         LEFT JOIN coach_signup_requests r ON r.id = i.request_id
         WHERE i.token = $1`,
      [token]
    );
    if (!r.rows[0]) {
      return res.status(404).json({ valid: false, reason: 'invalid' });
    }
    const row = r.rows[0];
    if (row.used_at) return res.status(404).json({ valid: false, reason: 'used' });
    if (row.revoked_at) return res.status(404).json({ valid: false, reason: 'revoked' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(404).json({ valid: false, reason: 'expired' });
    }

    return res.json({
      valid: true,
      first_name: row.first_name,
      last_name: row.last_name,
      school: row.school,
      division: row.division,
      edu_email: row.edu_email,
      position: row.position,
      is_switch: !!row.is_switch,
      is_team_switch: !!row.is_team_switch,
      existing_user_id: row.existing_user_id,
      old_team_name: row.old_team_name,
      old_division: row.old_division
    });
  } catch (err) {
    logger.error('[coach-signup] validate-token error:', err);
    return res.status(500).json({ valid: false, reason: 'error' });
  }
});

// ===========================================================================
// Team switch — intra-collegecoach school change (Plan: team-switch flow).
// ===========================================================================

// Compute the team-switch eligibility for a given authenticated user. Returns
// { eligible, reason, next_eligible_at, pending_request_id, current_team_name,
//   current_division, current_state }. Used by both GET /team-switch/eligibility
// and the request handler itself (single source of truth so the UI and the
// server agree on what's blocked).
async function computeTeamSwitchEligibility(userId) {
  // Must be a college coach
  const CoachProfile = require('../models/CoachProfile');
  const profile = await CoachProfile.findByUserId(userId);
  if (!profile || !profile.college_division) {
    return { eligible: false, reason: 'wrong_role', next_eligible_at: null, pending_request_id: null };
  }

  // One in-flight switch at a time
  const pending = await pool.query(
    `SELECT id FROM coach_signup_requests
       WHERE existing_user_id = $1 AND is_team_switch = true
         AND status = 'pending' AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (pending.rows[0]) {
    return {
      eligible: false,
      reason: 'pending_request',
      next_eligible_at: null,
      pending_request_id: pending.rows[0].id,
      current_team_name: profile.team_name,
      current_division: profile.college_division,
      current_state: profile.state,
      first_name: profile.first_name,
      last_name: profile.last_name
    };
  }

  // 72h cooldown since last successful switch
  const lastSwitch = await pool.query(
    `SELECT switched_at FROM coach_team_switch_history
       WHERE user_id = $1 ORDER BY switched_at DESC LIMIT 1`,
    [userId]
  );
  if (lastSwitch.rows[0]) {
    const last = new Date(lastSwitch.rows[0].switched_at).getTime();
    const hours = (Date.now() - last) / (1000 * 60 * 60);
    if (hours < TEAM_SWITCH_COOLDOWN_HOURS) {
      const nextEligibleAt = new Date(last + TEAM_SWITCH_COOLDOWN_HOURS * 60 * 60 * 1000);
      return {
        eligible: false,
        reason: 'cooldown',
        next_eligible_at: nextEligibleAt.toISOString(),
        pending_request_id: null,
        current_team_name: profile.team_name,
        current_division: profile.college_division,
        current_state: profile.state,
        first_name: profile.first_name,
        last_name: profile.last_name
      };
    }
  }

  return {
    eligible: true,
    reason: null,
    next_eligible_at: null,
    pending_request_id: null,
    current_team_name: profile.team_name,
    current_division: profile.college_division,
    current_state: profile.state,
    first_name: profile.first_name,
    last_name: profile.last_name
  };
}

// Handler invoked from POST /request when is_team_switch === true.
async function handleTeamSwitchRequest(req, res) {
  // Hard-require authentication for team switches (the public path is
  // optionalAuthMiddleware, which lets unauthed requests through with
  // req.user === undefined).
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Sign in required to request a team switch' });
  }

  const {
    new_team_name,
    new_division,
    new_state,
    new_position,
    new_edu_email,
    notes
  } = req.body || {};

  if (!new_team_name || !new_division || !new_state || !new_position || !new_edu_email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof new_division !== 'string' || new_division.length > 50) {
    return res.status(400).json({ error: 'Invalid division' });
  }
  if (typeof new_team_name !== 'string' || new_team_name.length > 200) {
    return res.status(400).json({ error: 'Invalid school name' });
  }
  if (typeof new_state !== 'string' || new_state.length > 50) {
    return res.status(400).json({ error: 'Invalid state' });
  }
  if (typeof new_position !== 'string' || new_position.length > 200) {
    return res.status(400).json({ error: 'Invalid position' });
  }
  if (!isEduEmail(new_edu_email)) {
    return res.status(400).json({ error: 'A valid .edu email address is required' });
  }
  if (notes && typeof notes === 'string' && notes.length > 150) {
    return res.status(400).json({ error: 'Notes must be 150 characters or less' });
  }

  // New .edu must not collide with another user's login email.
  const normalizedEdu = new_edu_email.trim().toLowerCase();
  if (normalizedEdu === (req.user.email || '').toLowerCase()) {
    return res.status(400).json({ error: 'New .edu email must be different from your current account email' });
  }
  const collision = await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [normalizedEdu]);
  if (collision.rows[0]) {
    return res.status(400).json({ error: 'That .edu email is already associated with another account' });
  }

  // Eligibility gate (role + cooldown + single in-flight). Also gives us
  // the current coach_profile snapshot — first_name + last_name aren't on
  // req.user (User.findById doesn't select them), so we read them off the
  // CoachProfile row that computeTeamSwitchEligibility already fetched.
  const elig = await computeTeamSwitchEligibility(req.user.id);
  if (!elig.eligible) {
    const messages = {
      wrong_role: 'Only college coaches can request a team switch',
      pending_request: 'You already have a team-switch request in review',
      cooldown: `You can switch teams again after ${elig.next_eligible_at}`
    };
    return res.status(400).json({ error: messages[elig.reason] || 'Not eligible', reason: elig.reason, next_eligible_at: elig.next_eligible_at });
  }

  const ip = (req.ip || req.connection?.remoteAddress || '').slice(0, 45);

  // NOTE: we intentionally do NOT soft-archive prior approved/rejected rows
  // for the same edu_email here — we want every team-switch in the admin
  // history to remain visible. The partial unique index on edu_email WHERE
  // deleted_at IS NULL only collides if the coach reuses the *exact same*
  // new .edu for a second switch — surfaced as a friendly 400 below.
  const existingEdu = await pool.query(
    `SELECT 1 FROM coach_signup_requests
       WHERE LOWER(edu_email) = $1 AND deleted_at IS NULL`,
    [normalizedEdu]
  );
  if (existingEdu.rows[0]) {
    return res.status(400).json({ error: 'That .edu email is already on file from a previous request. Please use a different .edu address.' });
  }

  const ins = await pool.query(
    `INSERT INTO coach_signup_requests
       (first_name, last_name, school, division, position, phone, edu_email, personal_email,
        notes, ip_address, is_switch, existing_user_id,
        is_team_switch, old_team_name, old_division, old_state, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      elig.first_name || '', elig.last_name || '',
      new_team_name.trim(), new_division.trim(), new_position.trim(),
      null,                       // phone — not collected on team-switch
      normalizedEdu,
      req.user.email,             // personal_email = current login email
      notes ? notes.trim() : null,
      ip,
      false,                      // is_switch (profile-type switch) — explicitly false
      req.user.id,
      true,                       // is_team_switch
      elig.current_team_name,
      elig.current_division,
      elig.current_state,
      new_state.trim()            // the new state the coach is moving to
    ]
  );

  try {
    await sendCoachRequestNotification(ADMIN_NOTIFY_EMAIL, {
      first_name: elig.first_name || '',
      last_name: elig.last_name || '',
      school: new_team_name.trim(),
      division: new_division.trim(),
      position: new_position.trim(),
      phone: '',
      edu_email: normalizedEdu,
      personal_email: req.user.email,
      notes: notes ? notes.trim() : '',
      is_switch: false,
      is_team_switch: true,
      old_team_name: elig.current_team_name,
      old_division: elig.current_division
    });
  } catch (emailErr) {
    logger.error('[coach-signup] team-switch notification email failed:', emailErr);
  }

  return res.json({
    success: true,
    request_id: ins.rows[0].id,
    message: "Request submitted. We'll review within 24-48 hours and email your new .edu address once approved.",
    current_team_name: elig.current_team_name
  });
}

// GET /api/coach-signup/team-switch/eligibility — gates the "Change Team" button.
router.get('/team-switch/eligibility', authMiddleware, async (req, res) => {
  try {
    const elig = await computeTeamSwitchEligibility(req.user.id);
    return res.json(elig);
  } catch (err) {
    logger.error('[coach-signup] eligibility error:', err);
    return res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// POST /api/coach-signup/confirm-team-switch — consumes a team-switch invite
// token after the coach signs in. Updates the existing coach_profiles row via
// CoachProfile.update() so the Plan 5A pipeline-handoff auto-cancel hook
// fires on school change. The .edu address is NOT written to users.email —
// it's verification-only. Coaches keep their personal login email.
//
// SECURITY: req.body.team_name / college_division are IGNORED. The canonical
// values come from coach_invites.school + .division (locked at admin-approve
// time). DevTools tampering can't redirect the switch to a different school.
router.post('/confirm-team-switch', authMiddleware, async (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  const CoachProfile = require('../models/CoachProfile');

  // One read: invite + originating request row joined. coach_invites stores
  // the locked school + division; coach_signup_requests stores the new state
  // + position + existing_user_id (since invites don't carry those).
  const r = await pool.query(
    `SELECT i.id          AS invite_id,
            i.school      AS to_team_name,
            i.division    AS to_division,
            i.is_team_switch, i.used_at, i.revoked_at, i.expires_at,
            r.existing_user_id, r.position AS new_position, r.state AS new_state
       FROM coach_invites i
       LEFT JOIN coach_signup_requests r ON r.id = i.request_id
       WHERE i.token = $1`,
    [token]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Invalid token' });
  const inv = r.rows[0];

  if (!inv.is_team_switch) return res.status(400).json({ error: 'This token is not a team-switch token' });
  if (inv.used_at)         return res.status(400).json({ error: 'This switch has already been confirmed' });
  if (inv.revoked_at)      return res.status(400).json({ error: 'This invite has been revoked' });
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This invite has expired' });
  }
  if (!inv.existing_user_id || inv.existing_user_id !== req.user.id) {
    return res.status(403).json({ error: 'This switch token does not belong to your account' });
  }

  const current = await CoachProfile.findByUserId(req.user.id);
  if (!current || !current.college_division) {
    return res.status(400).json({ error: 'You are not currently a college coach' });
  }

  const fromTeamName = current.team_name;
  const fromDivision = current.college_division;

  // Atomically mark the token used FIRST, with a guard against double-spend.
  // If two requests race, only one UPDATE will return a row; the loser bails.
  const claim = await pool.query(
    `UPDATE coach_invites SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
       RETURNING id`,
    [inv.invite_id]
  );
  if (!claim.rows[0]) {
    return res.status(400).json({ error: 'This switch has already been confirmed' });
  }

  // Update via CoachProfile.update() so the Plan 5A pipeline-handoff cleanup
  // hook fires (CoachProfile.js:71-95). Pass position_title only if the
  // request carried a non-empty value; otherwise keep the current value.
  const updatePayload = {
    team_name: inv.to_team_name,
    college_division: inv.to_division,
    state: inv.new_state || current.state
  };
  if (inv.new_position && inv.new_position.trim()) {
    updatePayload.position_title = inv.new_position.trim();
  }
  const updated = await CoachProfile.update(req.user.id, updatePayload);

  // Log the successful switch — drives the 72h cooldown for the next request.
  try {
    await pool.query(
      `INSERT INTO coach_team_switch_history
         (user_id, from_team_name, from_division, to_team_name, to_division, invite_token)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, fromTeamName, fromDivision, inv.to_team_name, inv.to_division, token]
    );
  } catch (histErr) {
    // Cooldown enforcement is the only consumer of this row; failure here is
    // recoverable (the switch already succeeded). Log and move on.
    logger.error('[coach-signup] team_switch_history insert failed:', histErr);
  }

  return res.json({
    success: true,
    new_team_name: updated.team_name,
    new_college_division: updated.college_division,
    new_state: updated.state
  });
});

module.exports = router;
