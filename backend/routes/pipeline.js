const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const PipelineRecruit = require('../models/PipelineRecruit');
const PipelineHandoff = require('../models/PipelineHandoff');
const RecruitingBoard = require('../models/RecruitingBoard');
const TeamQuestionnaire = require('../models/TeamQuestionnaire');
const logger = require('../utils/logger');

/**
 * Resolve the requesting coach's normalized school_key from coach_profiles.team_name.
 * Mirrors the guard pattern used by /api/recruiting-board/my-pool — returns null
 * (caller responds 400) if the coach has no team_name set.
 */
async function resolveCoachSchoolKey(coachUserId) {
  const result = await pool.query(
    `SELECT team_name FROM coach_profiles WHERE user_id = $1 LIMIT 1`,
    [coachUserId]
  );
  const teamName = result.rows[0] && result.rows[0].team_name;
  if (!teamName || !teamName.trim()) return null;
  return TeamQuestionnaire.normalizeSchoolKey(teamName);
}

// GET /my — full pipeline for the requesting coach
router.get('/my', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const recruits = await PipelineRecruit.getPipelineForCoach(req.userId);
    res.json({ recruits });
  } catch (err) {
    logger.error('GET /pipeline/my error:', err);
    res.status(500).json({ error: 'Failed to load pipeline' });
  }
});

// GET /contains?player_user_id=... — is this DR player already in my pipeline?
// Lightweight lookup used by player-profile pages to render the "Add to
// Pipeline" button in its correct state on initial load (instead of the
// default "Add to Pipeline" that would mislead the coach into clicking again).
router.get('/contains', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { player_user_id } = req.query;
    if (!player_user_id) return res.status(400).json({ error: 'player_user_id is required' });
    const result = await PipelineRecruit.containsLinkedPlayerForCoach(req.userId, player_user_id);
    // result: { in_pipeline, recruit_id } — recruit_id is null when not in pipeline.
    res.json(result);
  } catch (err) {
    logger.error('GET /pipeline/contains error:', err);
    res.status(500).json({ error: 'Failed to check pipeline status' });
  }
});

// GET /evaluations?pool_entry_id=...&linked_player_user_id=... — live list of
// every coach at the requester's current school who has this recruit in their
// pipeline with a grade/color/notes set. Used by the on-board Info modal's
// History tab so it reflects the current state of the staff's evaluations,
// not the frozen snapshot taken at promote time.
router.get('/evaluations', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.json({ evaluations: [] });
    const { pool_entry_id, linked_player_user_id } = req.query;
    if (!pool_entry_id && !linked_player_user_id) {
      return res.status(400).json({ error: 'pool_entry_id or linked_player_user_id is required' });
    }
    const evaluations = await PipelineRecruit.getEvaluationsAtSchool(schoolKey, {
      poolEntryId: pool_entry_id || null,
      linkedPlayerUserId: linked_player_user_id || null,
    });
    // Decorate with is_mine so the frontend can highlight the viewer's own row
    // and short-circuit the Add/Edit Grade button label resolution.
    const decorated = evaluations.map(e => ({ ...e, is_mine: e.coach_id === req.userId }));
    res.json({ evaluations: decorated });
  } catch (err) {
    logger.error('GET /pipeline/evaluations error:', err);
    res.status(500).json({ error: 'Failed to load evaluations' });
  }
});

// GET /board-promotions?pool_entry_id=...&linked_player_user_id=... — every
// shared board the requesting coach is a member of that contains this recruit
// in its players JSONB. Drives the Final Grade tab in the unified info modal.
// Personal boards intentionally excluded (private per coach). Each promotion
// returns position + can_edit so the frontend knows whether to enable the
// Save Final Grade button without inspecting any other state.
router.get('/board-promotions', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { pool_entry_id, linked_player_user_id } = req.query;
    if (!pool_entry_id && !linked_player_user_id) {
      return res.status(400).json({ error: 'pool_entry_id or linked_player_user_id is required' });
    }
    const promotions = await RecruitingBoard.getBoardPromotionsForRecruit(req.userId, {
      poolEntryId: pool_entry_id || null,
      linkedPlayerUserId: linked_player_user_id || null,
    });
    res.json({ promotions });
  } catch (err) {
    logger.error('GET /pipeline/board-promotions error:', err);
    res.status(500).json({ error: 'Failed to load board promotions' });
  }
});

// POST /from-pool — pull a team-pool entry into the coach's pipeline
router.post('/from-pool', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { pool_entry_id } = req.body || {};
    if (!pool_entry_id) return res.status(400).json({ error: 'pool_entry_id is required' });

    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.status(400).json({ error: 'Set your team name in My Profile.' });

    const recruit = await PipelineRecruit.addFromPool(req.userId, schoolKey, pool_entry_id);
    res.status(201).json({ recruit });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'CROSS_SCHOOL') return res.status(403).json({ error: err.message });
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    logger.error('POST /pipeline/from-pool error:', err);
    res.status(500).json({ error: 'Failed to add recruit to pipeline' });
  }
});

// POST /from-profile — add a DR player directly to the coach's pipeline
router.post('/from-profile', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { player_user_id } = req.body || {};
    if (!player_user_id) return res.status(400).json({ error: 'player_user_id is required' });

    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.status(400).json({ error: 'Set your team name in My Profile.' });

    const recruit = await PipelineRecruit.addFromDRProfile(req.userId, schoolKey, player_user_id);
    res.status(201).json({ recruit });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_TARGET') return res.status(400).json({ error: err.message });
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    logger.error('POST /pipeline/from-profile error:', err);
    res.status(500).json({ error: 'Failed to add recruit to pipeline' });
  }
});

// POST /from-board — used by the unified info modal's "Add to Pipeline" button
// when opened from a football-field card. Body accepts either pool_entry_id
// (questionnaire-only recruits) or linked_player_user_id (DR-linked); delegates
// to the same add* methods as /from-pool and /from-profile.
router.post('/from-board', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { pool_entry_id, linked_player_user_id } = req.body || {};
    if (!pool_entry_id && !linked_player_user_id) {
      return res.status(400).json({ error: 'pool_entry_id or linked_player_user_id is required' });
    }
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.status(400).json({ error: 'Set your team name in My Profile.' });

    const recruit = pool_entry_id
      ? await PipelineRecruit.addFromPool(req.userId, schoolKey, pool_entry_id)
      : await PipelineRecruit.addFromDRProfile(req.userId, schoolKey, linked_player_user_id);
    res.status(201).json({ recruit });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'CROSS_SCHOOL') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TARGET') return res.status(400).json({ error: err.message });
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    logger.error('POST /pipeline/from-board error:', err);
    res.status(500).json({ error: 'Failed to add recruit to pipeline' });
  }
});

// PUT /:recruitId — coach edits their own evaluation (grade + color + notes)
router.put('/:recruitId', authMiddleware, requireRole('coach'), validateUUID('recruitId'), async (req, res) => {
  try {
    const { grade, color_tag, notes } = req.body || {};
    const recruit = await PipelineRecruit.updateEvaluation(req.params.recruitId, req.userId, {
      grade,
      color_tag,
      notes,
    });
    res.json({ recruit });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_COLOR_TAG' || err.code === 'INVALID_GRADE') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('PUT /pipeline/:recruitId error:', err);
    res.status(500).json({ error: 'Failed to save evaluation' });
  }
});

// ---------- Hand-off routes (Plan 5A) ----------
//
// IMPORTANT ROUTE ORDER:
//   /handoffs/*  (plural)  — list / unread-count / mark-seen routes; literal segment
//   /handoff/:id/* (singular) — accept / reject routes; UUID-validated segment
//   /:recruitId/handoff      — send a new hand-off (Plan 4's UUID slot then literal)
//
// Express matches in registration order. The /handoffs/* routes are
// registered BEFORE /:recruitId/handoff so that "handoffs" never gets
// matched as a recruitId by the broader /:recruitId/handoff pattern.

// GET /handoffs/in — pending inbound hand-offs at my CURRENT school
router.get('/handoffs/in', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.json({ handoffs: [] });
    const handoffs = await PipelineHandoff.listIn(req.userId, schoolKey);
    res.json({ handoffs });
  } catch (err) {
    logger.error('GET /pipeline/handoffs/in error:', err);
    res.status(500).json({ error: 'Failed to load hand-offs' });
  }
});

// GET /handoffs/out — ALL outbound hand-offs (pending + accepted + rejected
// + rejected_duplicate) I sent from my CURRENT school.
router.get('/handoffs/out', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.json({ handoffs: [] });
    const handoffs = await PipelineHandoff.listOut(req.userId, schoolKey);
    res.json({ handoffs });
  } catch (err) {
    logger.error('GET /pipeline/handoffs/out error:', err);
    res.status(500).json({ error: 'Failed to load hand-offs' });
  }
});

// POST /handoffs/out/clear-resolved — delete every accepted/rejected outbound
// hand-off so the sender can prune the Sent list manually. Pending rows are
// untouched.
router.post('/handoffs/out/clear-resolved', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.json({ cleared: 0 });
    const cleared = await PipelineHandoff.clearResolvedOut(req.userId, schoolKey);
    res.json({ cleared });
  } catch (err) {
    logger.error('POST /pipeline/handoffs/out/clear-resolved error:', err);
    res.status(500).json({ error: 'Failed to clear resolved hand-offs' });
  }
});

// GET /handoffs/unread-count — drives the Plan 5B badge polling
router.get('/handoffs/unread-count', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.json({ count: 0 });
    const count = await PipelineHandoff.unreadCount(req.userId, schoolKey);
    res.json({ count });
  } catch (err) {
    logger.error('GET /pipeline/handoffs/unread-count error:', err);
    res.status(500).json({ error: 'Failed to load unread count' });
  }
});

// POST /handoffs/mark-seen — flips is_read=TRUE on all my pending inbound
// hand-offs at my current school. Rows stay listable in the modal.
router.post('/handoffs/mark-seen', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.json({ updated: 0 });
    const updated = await PipelineHandoff.markSeen(req.userId, schoolKey);
    res.json({ updated });
  } catch (err) {
    logger.error('POST /pipeline/handoffs/mark-seen error:', err);
    res.status(500).json({ error: 'Failed to mark hand-offs as seen' });
  }
});

// POST /handoff/:handoffId/accept — create receiver pipeline row, DELETE the handoff
router.post('/handoff/:handoffId/accept', authMiddleware, requireRole('coach'), validateUUID('handoffId'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.status(400).json({ error: 'Set your team name in My Profile.' });
    const result = await PipelineHandoff.accept(req.params.handoffId, req.userId, schoolKey);
    res.status(201).json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'CROSS_SCHOOL') return res.status(403).json({ error: err.message });
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    logger.error('POST /pipeline/handoff/:handoffId/accept error:', err);
    res.status(500).json({ error: 'Failed to accept hand-off' });
  }
});

// POST /handoff/:handoffId/reject — DELETE the handoff, flip source status back if last
router.post('/handoff/:handoffId/reject', authMiddleware, requireRole('coach'), validateUUID('handoffId'), async (req, res) => {
  try {
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.status(400).json({ error: 'Set your team name in My Profile.' });
    const result = await PipelineHandoff.reject(req.params.handoffId, req.userId, schoolKey);
    res.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'CROSS_SCHOOL') return res.status(403).json({ error: err.message });
    logger.error('POST /pipeline/handoff/:handoffId/reject error:', err);
    res.status(500).json({ error: 'Failed to reject hand-off' });
  }
});

// POST /:recruitId/handoff — send a hand-off to one or more recipients at my school
router.post('/:recruitId/handoff', authMiddleware, requireRole('coach'), validateUUID('recruitId'), async (req, res) => {
  try {
    const { to_coach_ids, message } = req.body || {};
    if (!Array.isArray(to_coach_ids) || to_coach_ids.length === 0) {
      return res.status(400).json({ error: 'to_coach_ids must be a non-empty array' });
    }
    const schoolKey = await resolveCoachSchoolKey(req.userId);
    if (!schoolKey) return res.status(400).json({ error: 'Set your team name in My Profile.' });

    const result = await PipelineHandoff.create(req.userId, schoolKey, req.params.recruitId, to_coach_ids, message);
    res.status(201).json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'CROSS_SCHOOL') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TARGET' || err.code === 'INVALID_STATE') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('POST /pipeline/:recruitId/handoff error:', err);
    res.status(500).json({ error: 'Failed to send hand-off' });
  }
});

// ---------- Plan 4 routes follow ----------

// DELETE /:recruitId — hard delete. Returns pool_entry_id +
// still_in_any_pipeline_at_school so the frontend can update the pool
// checkmark without a second roundtrip.
router.delete('/:recruitId', authMiddleware, requireRole('coach'), validateUUID('recruitId'), async (req, res) => {
  try {
    const deleted = await PipelineRecruit.delete(req.params.recruitId, req.userId);
    // After delete: how many other coaches at this school still have this recruit?
    const remaining = deleted.pool_entry_id
      ? await PipelineRecruit.countAtSchoolForPoolEntry(deleted.school_key, deleted.pool_entry_id)
      : 0;
    res.json({
      deleted: true,
      pool_entry_id: deleted.pool_entry_id,
      still_in_any_pipeline_at_school: remaining > 0,
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    logger.error('DELETE /pipeline/:recruitId error:', err);
    res.status(500).json({ error: 'Failed to remove recruit from pipeline' });
  }
});

module.exports = router;
