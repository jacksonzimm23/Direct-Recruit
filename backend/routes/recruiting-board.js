const express = require('express');
const router = express.Router();
const RecruitingBoard = require('../models/RecruitingBoard');
const BoardGroup = require('../models/BoardGroup');
const TeamQuestionnaire = require('../models/TeamQuestionnaire');
const PipelineRecruit = require('../models/PipelineRecruit');
const Notification = require('../models/Notification');
const { notifyUser } = require('../utils/notifications');
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const { escapeLikePattern } = require('../middleware/validation');
const pool = require('../config/database');
const { getSignedS3Url } = require('../utils/s3');
const logger = require('../utils/logger');

// Build the public questionnaire URL from a slug. Mirrors the pattern used by
// buildInviteLink in admin-coach-verification.js — APP_URL + FRONTEND_PATH_PREFIX
// with env-var fallbacks per NODE_ENV. Dev origin is Live Server (5500).
function buildQuestionnaireUrl(slug) {
  const isProd = process.env.NODE_ENV === 'production';
  const appUrl = process.env.APP_URL || (isProd ? 'https://directrecruit.net' : 'http://localhost:5500');
  const prefix = process.env.FRONTEND_PATH_PREFIX !== undefined
    ? process.env.FRONTEND_PATH_PREFIX
    : (isProd ? '' : '/frontend');
  return `${appUrl}${prefix}/questionnaire/index.html?slug=${encodeURIComponent(slug)}`;
}

// Locked 6-color palette used by the Pipeline / Add-to-Board final synthesis.
// Mirrors COLOR_HEX in frontend/collegecoach/tabs/recruiting-board.js. Any
// change here MUST be applied to that frontend constant too.
const VALID_FINAL_COLOR_TOKENS = ['dark_green', 'light_green', 'yellow', 'orange', 'red', 'dark_red'];

// Shared validator for the optional final-synthesis fields accepted by the
// add-to-board POST routes AND the update-final PUT routes. Mutates playerData
// in place (normalises numbers, trims notes). Returns { ok: true } on success
// or { ok: false, status, error } on failure so the caller can short-circuit
// with `return res.status(status).json({ error })`.
function validateFinalSynthesisFields(playerData) {
  if (playerData.final_grade != null) {
    const g = Number(playerData.final_grade);
    if (!Number.isInteger(g) || g < 0 || g > 100) {
      return { ok: false, status: 400, error: 'final_grade must be an integer 0-100 or null' };
    }
    playerData.final_grade = g;
  }
  if (playerData.final_color_tag != null && !VALID_FINAL_COLOR_TOKENS.includes(playerData.final_color_tag)) {
    return { ok: false, status: 400, error: 'final_color_tag must be one of: ' + VALID_FINAL_COLOR_TOKENS.join(', ') };
  }
  if (playerData.grading_history != null) {
    if (!Array.isArray(playerData.grading_history) || playerData.grading_history.length > 50) {
      return { ok: false, status: 400, error: 'grading_history must be an array (max 50 entries)' };
    }
  }
  if (playerData.final_notes != null && typeof playerData.final_notes === 'string') {
    playerData.final_notes = playerData.final_notes.slice(0, 2000);
  }
  return { ok: true };
}

// Stamp server-side audit fields on the playerData. Always overwrites whatever
// the client sent for promoted_by_user_id / promoted_at; accepts promoted_by_name
// from the body (because req.user — User.findById projection — doesn't carry
// first/last name from coach_profiles).
function stampPromotedAudit(playerData, req) {
  playerData.promoted_by_user_id = req.userId;
  if (typeof playerData.promoted_by_name === 'string') {
    playerData.promoted_by_name = playerData.promoted_by_name.slice(0, 200);
  } else {
    playerData.promoted_by_name = playerData.promoted_by_name || null;
  }
  playerData.promoted_at = new Date().toISOString();
}

// Helper function to add signed URLs to profiles/players
async function addSignedUrlsToPlayers(players) {
  if (!players || !Array.isArray(players)) return players;

  return await Promise.all(players.map(async (player) => {
    if (player.profile_image_url && player.profile_image_url.startsWith('profiles/')) {
      try {
        player.profile_image_url = await getSignedS3Url(player.profile_image_url);
      } catch (error) {
        logger.error('Error generating signed URL:', error);
        player.profile_image_url = null;
      }
    }
    return player;
  }));
}

// ==================== Named Personal Boards (multi-board) ====================
// New API used by the redesigned Personal Boards UI. A coach can have up to
// PERSONAL_BOARD_CAP named boards; each is keyed by its UUID, not by class year.
// The legacy single-board endpoints below stay alive for the player-profile
// "Add to Recruiting Board" call site, which will be migrated separately.

// List all named personal boards for the current coach
router.get('/personal', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const boards = await RecruitingBoard.listPersonalBoards(req.userId);
    res.json({ boards, cap: RecruitingBoard.PERSONAL_BOARD_CAP });
  } catch (error) {
    logger.error('Error listing personal boards:', error);
    res.status(500).json({ error: 'Failed to list personal boards' });
  }
});

// Create a new named personal board
router.post('/personal', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { boardName } = req.body;
    const board = await RecruitingBoard.createPersonalBoard(req.userId, boardName);
    res.json({ board });
  } catch (error) {
    const msg = error.message || 'Failed to create personal board';
    if (/required|characters|limit reached/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    logger.error('Error creating personal board:', error);
    res.status(500).json({ error: 'Failed to create personal board' });
  }
});

// Delete a named personal board
router.delete('/personal/:boardId', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    await RecruitingBoard.deletePersonalBoard(req.params.boardId, req.userId);
    res.json({ success: true });
  } catch (error) {
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    logger.error('Error deleting personal board:', error);
    res.status(500).json({ error: 'Failed to delete personal board' });
  }
});

// Rename a named personal board
router.put('/personal/:boardId/name', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardName } = req.body;
    const board = await RecruitingBoard.renamePersonalBoard(req.params.boardId, req.userId, boardName);
    res.json({ board });
  } catch (error) {
    const msg = error.message || 'Failed to rename personal board';
    if (/required|characters/i.test(msg)) return res.status(400).json({ error: msg });
    if (/not found/i.test(msg)) return res.status(404).json({ error: msg });
    logger.error('Error renaming personal board:', error);
    res.status(500).json({ error: 'Failed to rename personal board' });
  }
});

// Get position config for a specific personal board
router.get('/personal/:boardId/config', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const board = await RecruitingBoard.getPersonalBoardById(req.params.boardId, req.userId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({
      offensePositions: board.offense_positions,
      defensePositions: board.defense_positions
    });
  } catch (error) {
    logger.error('Error fetching personal board config:', error);
    res.status(500).json({ error: 'Failed to fetch position configuration' });
  }
});

// Save position config for a specific personal board
router.put('/personal/:boardId/config', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { offensePositions, defensePositions } = req.body;
    if (!offensePositions || !defensePositions) {
      return res.status(400).json({ error: 'Both offense and defense positions are required' });
    }
    await RecruitingBoard.savePersonalBoardConfig(req.params.boardId, req.userId, offensePositions, defensePositions);
    res.json({ message: 'Position configuration saved', offensePositions, defensePositions });
  } catch (error) {
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    logger.error('Error saving personal board config:', error);
    res.status(500).json({ error: 'Failed to save position configuration' });
  }
});

// Get players for a specific personal board (no class-year filter)
router.get('/personal/:boardId/players', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    let players = await RecruitingBoard.getPlayersFromPersonalBoardById(req.params.boardId, req.userId);
    players = await addSignedUrlsToPlayers(players);
    res.json(players);
  } catch (error) {
    logger.error('Error fetching personal board players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Add a player to a specific personal board. Accepts the standard player JSONB
// plus the same optional final-synthesis fields the shared-board route takes
// (final_grade, final_color_tag, final_notes, grading_history) — gives personal
// boards the same on-card swatch + grade badge as shared boards.
router.post('/personal/:boardId/players', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const playerData = req.body;
    // Accept either user_id (DR-account recruit) or pool_entry_id
    // (questionnaire-only recruit, pulled forward from Plan 6).
    if ((!playerData.user_id && !playerData.pool_entry_id) || !playerData.position) {
      return res.status(400).json({ error: 'Player identifier (user_id or pool_entry_id) and position are required' });
    }
    const v = validateFinalSynthesisFields(playerData);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    stampPromotedAudit(playerData, req);

    await RecruitingBoard.addPlayerToPersonalBoardById(req.params.boardId, req.userId, playerData);
    res.json({ message: 'Player added to recruiting board', player: playerData });
  } catch (error) {
    if (error.message === 'Player already on board for this position') {
      return res.status(400).json({ error: error.message });
    }
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    logger.error('Error adding player to personal board:', error);
    res.status(500).json({ error: 'Failed to add player to recruiting board' });
  }
});

// Remove a player from a specific personal board
router.delete('/personal/:boardId/players/:playerId', authMiddleware, requireRole('coach'), validateUUID('boardId', 'playerId'), async (req, res) => {
  try {
    const { position } = req.query;
    await RecruitingBoard.removePlayerFromPersonalBoardById(req.params.boardId, req.userId, req.params.playerId, position);
    res.json({ message: 'Player removed from recruiting board' });
  } catch (error) {
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    logger.error('Error removing player from personal board:', error);
    res.status(500).json({ error: 'Failed to remove player from recruiting board' });
  }
});

// Update a player's position on a specific personal board
router.put('/personal/:boardId/players/:playerId/position', authMiddleware, requireRole('coach'), validateUUID('boardId', 'playerId'), async (req, res) => {
  try {
    const { oldPosition, newPosition } = req.body;
    if (!oldPosition || !newPosition) {
      return res.status(400).json({ error: 'Both oldPosition and newPosition are required' });
    }
    await RecruitingBoard.updatePlayerPositionOnPersonalBoardById(
      req.params.boardId, req.userId, req.params.playerId, oldPosition, newPosition
    );
    res.json({ message: 'Player position updated' });
  } catch (error) {
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    logger.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position' });
  }
});

// Update final-synthesis fields (final_grade / final_color_tag / final_notes)
// on an existing player on a personal board. Body: { position, final_grade,
// final_color_tag, final_notes }. Re-stamps promoted_by_user_id / promoted_at
// to the editor each time. grading_history is NEVER mutated — it's a frozen
// audit trail from the original promotion.
router.put('/personal/:boardId/players/:playerId/final', authMiddleware, requireRole('coach'), validateUUID('boardId', 'playerId'), async (req, res) => {
  try {
    const { position } = req.body;
    if (!position) return res.status(400).json({ error: 'position is required' });
    const finalData = {
      final_grade: req.body.final_grade,
      final_color_tag: req.body.final_color_tag,
      final_notes: req.body.final_notes,
      promoted_by_name: req.body.promoted_by_name,
    };
    const v = validateFinalSynthesisFields(finalData);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    stampPromotedAudit(finalData, req);
    await RecruitingBoard.updateFinalOnPersonalBoardById(
      req.params.boardId, req.userId, req.params.playerId, position, finalData
    );
    res.json({ message: 'Final fields updated', final: finalData });
  } catch (error) {
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    logger.error('Error updating personal board final fields:', error);
    res.status(500).json({ error: 'Failed to update final fields' });
  }
});

// ==================== Personal Board Routes (LEGACY — class-year keyed) ====================
// Kept for the player-profile "Add to Recruiting Board" button which still
// targets the single per-coach board. Will be migrated when that flow is reworked.

// Initialize/get personal board
router.get('/personal/init', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const board = await RecruitingBoard.getOrCreatePersonalBoard(req.userId);
    res.json({ board });
  } catch (error) {
    logger.error('Error initializing personal board:', error);
    res.status(500).json({ error: 'Failed to initialize personal board' });
  }
});

// Get personal board config
router.get('/personal/config', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const config = await RecruitingBoard.getPositionConfig(req.userId);
    res.json(config);
  } catch (error) {
    logger.error('Error fetching personal board config:', error);
    res.status(500).json({ error: 'Failed to fetch position configuration' });
  }
});

// Save personal board config
router.put('/personal/config', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { offensePositions, defensePositions } = req.body;

    if (!offensePositions || !defensePositions) {
      return res.status(400).json({ error: 'Both offense and defense positions are required' });
    }

    await RecruitingBoard.savePositionConfig(req.userId, offensePositions, defensePositions);

    res.json({
      message: 'Position configuration saved',
      offensePositions,
      defensePositions
    });
  } catch (error) {
    logger.error('Error saving personal board config:', error);
    res.status(500).json({ error: 'Failed to save position configuration' });
  }
});

// Get players for personal board by class year
router.get('/personal/:classYear/players', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    let players = await RecruitingBoard.getPlayersFromPersonalBoard(req.userId, parseInt(classYear));
    players = await addSignedUrlsToPlayers(players);
    res.json(players);
  } catch (error) {
    logger.error('Error fetching personal board players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Add player to personal board
router.post('/personal/:classYear/players', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    const playerData = req.body;

    if ((!playerData.user_id && !playerData.pool_entry_id) || !playerData.position) {
      return res.status(400).json({ error: 'Player identifier (user_id or pool_entry_id) and position are required' });
    }

    await RecruitingBoard.addPlayerToPersonalBoard(req.userId, parseInt(classYear), playerData);

    res.json({
      message: 'Player added to recruiting board',
      player: playerData
    });
  } catch (error) {
    logger.error('Error adding player to personal board:', error);
    if (error.message === 'Player already on board for this position') {
      return res.status(400).json({ error: 'Player is already on the board for this position' });
    }
    res.status(500).json({ error: 'Failed to add player to recruiting board' });
  }
});

// Remove player from personal board
router.delete('/personal/:classYear/players/:playerId', authMiddleware, requireRole('coach'), validateUUID('playerId'), async (req, res) => {
  try {
    const { classYear, playerId } = req.params;
    const { position } = req.query;

    await RecruitingBoard.removePlayerFromPersonalBoard(req.userId, parseInt(classYear), playerId, position);
    res.json({ message: 'Player removed from recruiting board' });
  } catch (error) {
    logger.error('Error removing player from personal board:', error);
    res.status(500).json({ error: 'Failed to remove player from recruiting board' });
  }
});

// Update player position on personal board
router.put('/personal/:classYear/players/:playerId/position', authMiddleware, requireRole('coach'), validateUUID('playerId'), async (req, res) => {
  try {
    const { classYear, playerId } = req.params;
    const { oldPosition, newPosition } = req.body;

    if (!oldPosition || !newPosition) {
      return res.status(400).json({ error: 'Both oldPosition and newPosition are required' });
    }

    await RecruitingBoard.updatePlayerPositionOnPersonalBoard(req.userId, parseInt(classYear), playerId, oldPosition, newPosition);
    res.json({ message: 'Player position updated' });
  } catch (error) {
    logger.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position' });
  }
});

// ==================== Shared Groups (Phase 2 — Google-Docs-style sharing) ====================
// A "group" is a named collection of college coaches with viewer/editor permissions.
// Inside a group, members collectively manage up to BOARDS_PER_GROUP_CAP named recruiting
// boards. Permission gating is enforced via requireGroupAccess(level) middleware on every
// /groups/* route — it loads the requester's permission row and 403s if insufficient.
// This is the "immediate kick" enforcement: any request after removal returns 403.

// Middleware: load the requester's group permission and 403 if insufficient.
//   level === 'any'    → must be a member (viewer or editor)
//   level === 'editor' → must be editor or owner
//   level === 'owner'  → must be the owner specifically
function requireGroupAccess(level) {
  return async function (req, res, next) {
    try {
      const groupId = req.params.groupId;
      if (!groupId) return res.status(400).json({ error: 'groupId is required' });

      const my = await BoardGroup.getMembership(groupId, req.userId);
      if (!my) return res.status(403).json({ error: 'You are not a member of this group' });

      if (level === 'editor' && my.permission !== 'editor') {
        return res.status(403).json({ error: 'Editor access required' });
      }
      if (level === 'owner' && !my.is_owner) {
        return res.status(403).json({ error: 'Owner access required' });
      }

      req.groupPermission = my; // { permission, is_owner }
      next();
    } catch (err) {
      logger.error('requireGroupAccess error:', err);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

// Map model errors to HTTP status. Centralizes the duplication.
function handleGroupError(error, res, fallbackMsg) {
  const msg = error.message || fallbackMsg;
  if (/required|characters|limit reached|cannot|must|permission|already/i.test(msg)) {
    return res.status(400).json({ error: msg });
  }
  if (/not found|not a member/i.test(msg)) {
    return res.status(404).json({ error: msg });
  }
  logger.error(fallbackMsg + ':', error);
  return res.status(500).json({ error: fallbackMsg });
}

// ---------- Group lifecycle ----------

// List all groups the current coach belongs to
router.get('/groups', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const groups = await BoardGroup.listGroupsForUser(req.userId);
    res.json({ groups, cap: BoardGroup.GROUPS_PER_USER_CAP });
  } catch (error) {
    logger.error('Error listing groups:', error);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

// Create a new group
router.post('/groups', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { groupName } = req.body;
    const group = await BoardGroup.createGroup(req.userId, groupName);
    res.json({ group });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to create group');
  }
});

// IMPORTANT: define static `/groups/search-coaches` BEFORE the parametric
// `/groups/:groupId` route below — otherwise Express matches "search-coaches"
// as a groupId and the validateUUID middleware rejects it.
router.get('/groups/search-coaches', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { query, groupId } = req.query;
    // Empty query is allowed: returns all same-school coaches (alphabetical)
    // so the invite modal can show a "browse all teammates" dropdown when the
    // search field is focused but empty. A non-empty short query (1 char) is
    // still rejected — too noisy.
    const hasQuery = !!(query && query.length >= 2);
    if (query && query.length === 1) return res.json({ coaches: [] });

    // Hard same-school restriction (mirrors the Plan 5A handoff recipient
    // picker). New shared-group invites can only go to coaches whose
    // normalized team_name matches the requester's. Existing cross-school
    // members are grandfathered — this filter only gates new invites.
    // If the requester has no team_name set, return empty (no school to match).
    const meCp = await pool.query(
      `SELECT team_name FROM coach_profiles WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const myTeamName = meCp.rows[0] && meCp.rows[0].team_name;
    const mySchoolKey = TeamQuestionnaire.normalizeSchoolKey(myTeamName);
    if (!mySchoolKey) return res.json({ coaches: [] });

    const excludeIds = [req.userId];
    if (groupId) {
      // Existing members
      const existing = await pool.query(
        `SELECT user_id FROM board_group_members WHERE group_id = $1`,
        [groupId]
      );
      for (const r of existing.rows) excludeIds.push(r.user_id);

      // Pending invites (either permission level)
      const pending = await pool.query(
        `SELECT user_id FROM notifications
         WHERE related_entity_id = $1
           AND related_entity_type IN ('group_invite', 'group_invite_editor')
           AND is_read = FALSE`,
        [groupId]
      );
      for (const r of pending.rows) excludeIds.push(r.user_id);
    }

    let result;
    if (hasQuery) {
      result = await pool.query(
        `SELECT cp.user_id, cp.first_name, cp.last_name, cp.username, cp.profile_image_url, cp.team_name, cp.college_division, cp.state
         FROM coach_profiles cp
         JOIN users u ON cp.user_id = u.id
         WHERE u.role = 'coach'
           AND cp.college_division IS NOT NULL
           AND cp.user_id != ALL($1::uuid[])
           AND LOWER(TRIM(cp.team_name)) = $4
           AND (
             similarity(cp.first_name || ' ' || cp.last_name, $2) > 0.2
             OR similarity(cp.username, $2) > 0.2
             OR LOWER(cp.first_name || ' ' || cp.last_name) LIKE LOWER($3)
             OR LOWER(cp.username) LIKE LOWER($3)
           )
         ORDER BY GREATEST(similarity(cp.first_name || ' ' || cp.last_name, $2), similarity(cp.username, $2)) DESC, cp.last_name, cp.first_name
         LIMIT 10`,
        [excludeIds, query, `%${escapeLikePattern(query)}%`, mySchoolKey]
      );
    } else {
      // Empty-query browse mode — alphabetical, cap higher (50) since coaches
      // are scoped to a single school anyway and we want them to see everyone.
      result = await pool.query(
        `SELECT cp.user_id, cp.first_name, cp.last_name, cp.username, cp.profile_image_url, cp.team_name, cp.college_division, cp.state
         FROM coach_profiles cp
         JOIN users u ON cp.user_id = u.id
         WHERE u.role = 'coach'
           AND cp.college_division IS NOT NULL
           AND cp.user_id != ALL($1::uuid[])
           AND LOWER(TRIM(cp.team_name)) = $2
         ORDER BY cp.last_name, cp.first_name
         LIMIT 50`,
        [excludeIds, mySchoolKey]
      );
    }

    // Sign avatars
    for (const r of result.rows) {
      if (r.profile_image_url && r.profile_image_url.startsWith('profiles/')) {
        try { r.profile_image_url = await getSignedS3Url(r.profile_image_url); }
        catch { r.profile_image_url = null; }
      }
    }

    res.json({ coaches: result.rows });
  } catch (error) {
    logger.error('Error searching coaches:', error);
    res.status(500).json({ error: 'Failed to search coaches' });
  }
});

// Get group details + members + my permission
router.get('/groups/:groupId', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('any'), async (req, res) => {
  try {
    const group = await BoardGroup.getGroupById(req.params.groupId, req.userId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Sign avatars for members
    for (const m of group.members) {
      if (m.profile_image_url && m.profile_image_url.startsWith('profiles/')) {
        try { m.profile_image_url = await getSignedS3Url(m.profile_image_url); }
        catch { m.profile_image_url = null; }
      }
    }
    res.json(group);
  } catch (error) {
    return handleGroupError(error, res, 'Failed to get group');
  }
});

// Helper: resolve a coach's per-school questionnaire and return the standard
// response shape. Used by both /my-questionnaire (group-free) and the legacy
// /groups/:groupId/questionnaire endpoint.
async function resolveCoachQuestionnaire(req, res) {
  try {
    const coachProfile = await pool.query(
      `SELECT team_name FROM coach_profiles WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const teamName = coachProfile.rows[0] && coachProfile.rows[0].team_name;
    if (!teamName) {
      return res.status(400).json({
        error: 'Set your team name in My Profile before generating the questionnaire link.'
      });
    }

    const q = await TeamQuestionnaire.getOrCreateForSchool(teamName);
    res.json({
      slug: q.slug,
      public_url: buildQuestionnaireUrl(q.slug),
      created_at: q.created_at
    });
  } catch (err) {
    logger.error('Get/create team questionnaire error:', err);
    res.status(500).json({ error: 'Failed to fetch team questionnaire' });
  }
}

// Get (or implicitly create) the public questionnaire URL for the requesting
// coach's CURRENT school. Group-agnostic — the questionnaire is keyed on the
// coach's normalized team_name (school identity), not on any shared group
// membership. This is the recommended endpoint for any UI that just needs
// "what's my school's questionnaire link?".
router.get('/my-questionnaire', authMiddleware, requireRole('coach'), async (req, res) => {
  return resolveCoachQuestionnaire(req, res);
});

// Legacy alias for compatibility with existing UI code that passes a groupId.
// Identical behavior to /my-questionnaire — the groupId is no longer consulted
// for slug resolution; it only serves as a permission check via
// requireGroupAccess('any').
router.get('/groups/:groupId/questionnaire', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('any'), async (req, res) => {
  return resolveCoachQuestionnaire(req, res);
});

// ---------- Team Pool (per-school, Plan 3) ----------

// GET /my-pool — paginated list of pool_entries for the requesting coach's
// school (resolved from coach_profiles.team_name → normalized school_key).
// Filters: position (multi), grad_year, state, height range, weight range, GPA range.
router.get('/my-pool', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    // 1. Resolve coach school from team_name (same guard as /my-questionnaire)
    const coachProfile = await pool.query(
      `SELECT team_name FROM coach_profiles WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const teamName = coachProfile.rows[0] && coachProfile.rows[0].team_name;
    if (!teamName) {
      return res.status(400).json({
        error: 'Set your team name in My Profile to see your team pool.'
      });
    }

    // 2. Get/create the questionnaire row so the pool always has a parent
    const q = await TeamQuestionnaire.getOrCreateForSchool(teamName);

    // 3. Parse + assemble filter SQL
    const {
      position, grad_year, state,
      min_height, max_height,
      min_weight, max_weight,
      min_gpa, max_gpa,
      offset = 0, limit = 50
    } = req.query;

    const where = [`pe.questionnaire_id = $1`];
    const params = [q.id];
    let p = 1;

    // Position: substring match against slash-joined positions string
    if (position) {
      const positions = Array.isArray(position) ? position : [position];
      const orClauses = positions.map(pos => {
        p++; params.push(`%${pos}%`);
        return `qs.submission_data->'athletic'->>'positions' ILIKE $${p}`;
      });
      where.push(`(${orClauses.join(' OR ')})`);
    }
    if (grad_year) {
      p++; params.push(parseInt(grad_year, 10));
      where.push(`(qs.submission_data->'academic'->>'graduation_year')::int = $${p}`);
    }
    if (state) {
      p++; params.push(state);
      where.push(`qs.submission_data->'address'->>'state' = $${p}`);
    }
    if (min_height) {
      p++; params.push(parseInt(min_height, 10));
      where.push(`(qs.submission_data->'athletic'->>'height_inches')::int >= $${p}`);
    }
    if (max_height) {
      p++; params.push(parseInt(max_height, 10));
      where.push(`(qs.submission_data->'athletic'->>'height_inches')::int <= $${p}`);
    }
    if (min_weight) {
      p++; params.push(parseInt(min_weight, 10));
      where.push(`(qs.submission_data->'athletic'->>'weight_lbs')::int >= $${p}`);
    }
    if (max_weight) {
      p++; params.push(parseInt(max_weight, 10));
      where.push(`(qs.submission_data->'athletic'->>'weight_lbs')::int <= $${p}`);
    }
    if (min_gpa) {
      p++; params.push(parseFloat(min_gpa));
      where.push(`(qs.submission_data->'academic'->>'gpa')::numeric >= $${p}`);
    }
    if (max_gpa) {
      p++; params.push(parseFloat(max_gpa));
      where.push(`(qs.submission_data->'academic'->>'gpa')::numeric <= $${p}`);
    }

    // Pagination params
    p++; params.push(parseInt(limit, 10) || 50);
    const limitParam = `$${p}`;
    p++; params.push(parseInt(offset, 10) || 0);
    const offsetParam = `$${p}`;

    // Plan 4 checkmark params (LATERAL join in the SELECT below). These come
    // AFTER limit/offset so the count query below — which uses
    // params.slice(0, -4) to drop the four pagination/checkmark params — still
    // works. The count query does NOT reference the LATERAL join, so dropping
    // these four is safe.
    p++; params.push(req.userId);
    const meParam = `$${p}`;
    p++; params.push(q.school_key);
    const schoolKeyParam = `$${p}`;

    // 4. Run the list query — LEFT JOIN the linked DR account's player_profile
    // so we can surface their profile_image_url for the avatar (Plan 3.5).
    // LATERAL join pipeline_recruits → the Plan 4 cross-coach checkmark flags.
    // in_my_pipeline = this coach; in_any_pipeline_at_school = any coach at
    // this school (per pr.school_key snapshotted at add-time).
    const rowsResult = await pool.query(
      `SELECT
         pe.id,
         pe.email,
         pe.submission_count,
         pe.first_submitted_at,
         pe.last_submitted_at,
         pe.linked_player_user_id,
         qs.submission_data,
         pp.profile_image_url AS dr_profile_image_s3_key,
         COALESCE(pip.in_my_pipeline, false) AS in_my_pipeline,
         COALESCE(pip.in_any_pipeline_at_school, false) AS in_any_pipeline_at_school
       FROM pool_entries pe
       JOIN questionnaire_submissions qs ON qs.id = pe.latest_submission_id
       LEFT JOIN player_profiles pp ON pp.user_id = pe.linked_player_user_id
       LEFT JOIN LATERAL (
         SELECT
           BOOL_OR(pr.coach_user_id = ${meParam}) AS in_my_pipeline,
           COUNT(*) > 0 AS in_any_pipeline_at_school
         FROM pipeline_recruits pr
         WHERE pr.pool_entry_id = pe.id AND pr.school_key = ${schoolKeyParam}
           AND pr.removed_from_pipeline_at IS NULL
       ) pip ON TRUE
       WHERE ${where.join(' AND ')}
       ORDER BY pe.last_submitted_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    // Total count for pagination (drop the last 4 params: limit, offset, me, schoolKey)
    const countParams = params.slice(0, -4);
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM pool_entries pe
         JOIN questionnaire_submissions qs ON qs.id = pe.latest_submission_id
         WHERE ${where.join(' AND ')}`,
      countParams
    );

    // 5. Shape the response — sign the DR profile image S3 key when a linked
    // DR account exists. Questionnaire-only entries do NOT have a profile pic
    // (intentional UX choice — see Plan 3.5).
    const entries = await Promise.all(rowsResult.rows.map(async (row) => {
      const d = row.submission_data || {};
      const personal = d.personal || {};
      const athletic = d.athletic || {};
      const academic = d.academic || {};
      const address = d.address || {};

      let profileImageUrl = null;
      if (row.dr_profile_image_s3_key && row.dr_profile_image_s3_key.startsWith('profiles/')) {
        try { profileImageUrl = await getSignedS3Url(row.dr_profile_image_s3_key); }
        catch (_) { profileImageUrl = null; }
      }

      return {
        id: row.id,
        email: row.email,
        first_name: personal.first_name || '',
        last_name: personal.last_name || '',
        // Normalize positions to a clean upper-cased array — questionnaire
        // JSONB can hold a string ("WR/CB", "WR,CB") or array. Helper handles
        // all variants, splits on / and , so filters can match individual
        // codes ("WR" filter matches "WR/CB" recruit).
        positions: PipelineRecruit.normalizePositionList(athletic.positions, null),
        height_inches: athletic.height_inches || null,
        weight_lbs: athletic.weight_lbs || null,
        graduation_year: academic.graduation_year || null,
        gpa: academic.gpa || null,
        state: address.state || null,
        city: address.city || null,
        high_school: academic.high_school || null,
        submission_count: row.submission_count,
        first_submitted_at: row.first_submitted_at,
        last_submitted_at: row.last_submitted_at,
        linked_player_user_id: row.linked_player_user_id,
        profile_image_url: profileImageUrl,
        is_in_my_pipeline: row.in_my_pipeline === true,
        is_in_any_pipeline_at_school: row.in_any_pipeline_at_school === true
      };
    }));

    res.json({
      total: countResult.rows[0].total || 0,
      offset: parseInt(offset, 10) || 0,
      limit: parseInt(limit, 10) || 50,
      entries
    });
  } catch (err) {
    logger.error('GET /my-pool error:', err);
    res.status(500).json({ error: 'Failed to load pool' });
  }
});

// GET /my-pool/:entryId — full submission history + DR profile snapshot.
// Enforces per-school: requesting coach's school_key must match entry's school.
router.get('/my-pool/:entryId', authMiddleware, requireRole('coach'), validateUUID('entryId'), async (req, res) => {
  try {
    const coachProfile = await pool.query(
      `SELECT team_name FROM coach_profiles WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const teamName = coachProfile.rows[0] && coachProfile.rows[0].team_name;
    if (!teamName) {
      return res.status(400).json({ error: 'Set your team name in My Profile.' });
    }
    const schoolKey = TeamQuestionnaire.normalizeSchoolKey(teamName);

    // Look up entry + its questionnaire's school_key — enforce match
    const entryResult = await pool.query(
      `SELECT
         pe.id, pe.email, pe.questionnaire_id, pe.submission_count, pe.linked_player_user_id,
         pe.first_submitted_at, pe.last_submitted_at,
         tq.school_key
       FROM pool_entries pe
       JOIN team_questionnaires tq ON tq.id = pe.questionnaire_id
       WHERE pe.id = $1
       LIMIT 1`,
      [req.params.entryId]
    );
    if (!entryResult.rows[0]) return res.status(404).json({ error: 'Pool entry not found' });
    if (entryResult.rows[0].school_key !== schoolKey) {
      return res.status(403).json({ error: 'This recruit submitted to a different school.' });
    }
    const entry = entryResult.rows[0];

    // All submissions matching (questionnaire_id, email) chronological ASC
    const subsResult = await pool.query(
      `SELECT id, submission_data, submitted_at
         FROM questionnaire_submissions
        WHERE questionnaire_id = $1
          AND LOWER(email) = LOWER($2)
        ORDER BY submitted_at ASC`,
      [entry.questionnaire_id, entry.email]
    );

    // Optional DR profile snapshot
    let drProfile = null;
    if (entry.linked_player_user_id) {
      const profResult = await pool.query(
        `SELECT user_id, first_name, last_name, username, position, height, weight,
                graduation_year, gpa, team_name, city, state, profile_image_url,
                college_division, transfer
           FROM player_profiles WHERE user_id = $1 LIMIT 1`,
        [entry.linked_player_user_id]
      );
      if (profResult.rows[0]) {
        drProfile = profResult.rows[0];
        if (drProfile.profile_image_url && drProfile.profile_image_url.startsWith('profiles/')) {
          try { drProfile.profile_image_url = await getSignedS3Url(drProfile.profile_image_url); }
          catch { drProfile.profile_image_url = null; }
        }
      }
    }

    // Plan 4 — checkmark flags so the modal footer button can render the
    // right state without a second roundtrip.
    const pipResult = await pool.query(
      `SELECT
         BOOL_OR(coach_user_id = $1) AS in_my_pipeline,
         COUNT(*) > 0 AS in_any_pipeline_at_school
       FROM pipeline_recruits
       WHERE pool_entry_id = $2 AND school_key = $3
         AND removed_from_pipeline_at IS NULL`,
      [req.userId, entry.id, schoolKey]
    );
    const pip = pipResult.rows[0] || {};

    res.json({
      entry: {
        id: entry.id,
        email: entry.email,
        submission_count: entry.submission_count,
        first_submitted_at: entry.first_submitted_at,
        last_submitted_at: entry.last_submitted_at,
        linked_player_user_id: entry.linked_player_user_id,
        // Convenience: surface the linked DR account's signed profile image
        // URL at the top level so the modal header doesn't have to dig into
        // dr_profile for the avatar.
        profile_image_url: (drProfile && drProfile.profile_image_url) || null,
        is_in_my_pipeline: pip.in_my_pipeline === true,
        is_in_any_pipeline_at_school: pip.in_any_pipeline_at_school === true
      },
      submissions: subsResult.rows.map(r => ({
        id: r.id,
        submitted_at: r.submitted_at,
        submission_data: r.submission_data
      })),
      dr_profile: drProfile
    });
  } catch (err) {
    logger.error('GET /my-pool/:entryId error:', err);
    res.status(500).json({ error: 'Failed to load pool entry' });
  }
});

// Rename group (editor or owner)
router.put('/groups/:groupId/name', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const group = await BoardGroup.renameGroup(req.params.groupId, req.userId, req.body.groupName);
    res.json({ group });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to rename group');
  }
});

// Delete group (editor or owner)
router.delete('/groups/:groupId', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    await BoardGroup.deleteGroup(req.params.groupId, req.userId);
    res.json({ success: true });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to delete group');
  }
});

// Leave group (any member). Auto-transfers ownership if owner is the leaver.
router.post('/groups/:groupId/leave', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('any'), async (req, res) => {
  try {
    const groupId = req.params.groupId;
    // Capture group name + the coach's name BEFORE leaving so we can notify.
    const groupBefore = await pool.query(
      `SELECT group_name, owner_user_id FROM board_groups WHERE id = $1`,
      [groupId]
    );
    const groupName = groupBefore.rows[0] ? groupBefore.rows[0].group_name : 'a group';
    const wasOwner = groupBefore.rows[0] && String(groupBefore.rows[0].owner_user_id) === String(req.userId);

    const result = await BoardGroup.leaveGroup(groupId, req.userId);

    // Notify remaining members (best effort).
    if (!result.deleted) {
      const leaverResult = await pool.query(
        `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
        [req.userId]
      );
      const leaver = leaverResult.rows[0];
      const leaverName = leaver ? `${leaver.first_name} ${leaver.last_name}` : 'A member';

      // Notify everyone else in the group
      const remaining = await pool.query(
        `SELECT user_id FROM board_group_members WHERE group_id = $1 AND user_id != $2`,
        [groupId, req.userId]
      );
      for (const m of remaining.rows) {
        const notif = await Notification.create({
          userId: m.user_id,
          type: 'interaction',
          title: 'Member Left Group',
          message: `${leaverName} has left "${groupName}"`,
          relatedUserId: req.userId,
          relatedEntityId: groupId,
          relatedEntityType: 'group_member_left'
        });
        if (notif) notifyUser(req.app.get('io'), notif);
      }

      // If ownership auto-transferred, send the new owner a heads-up
      if (wasOwner && result.transferred_to) {
        const newOwnerNotif = await Notification.create({
          userId: result.transferred_to,
          type: 'interaction',
          title: 'Group Ownership Transferred',
          message: `You are now the owner of "${groupName}" — the previous owner left the group`,
          relatedUserId: req.userId,
          relatedEntityId: groupId,
          relatedEntityType: 'group_ownership_transfer'
        });
        if (newOwnerNotif) notifyUser(req.app.get('io'), newOwnerNotif);
      }
    }

    res.json(result);
  } catch (error) {
    return handleGroupError(error, res, 'Failed to leave group');
  }
});

// Transfer ownership (owner only)
router.post('/groups/:groupId/transfer-ownership', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('owner'), async (req, res) => {
  try {
    const { newOwnerUserId } = req.body;
    if (!newOwnerUserId) return res.status(400).json({ error: 'newOwnerUserId is required' });

    await BoardGroup.transferOwnership(req.params.groupId, req.userId, newOwnerUserId);

    // Notify the new owner
    const groupResult = await pool.query(
      `SELECT group_name FROM board_groups WHERE id = $1`,
      [req.params.groupId]
    );
    const groupName = groupResult.rows[0] ? groupResult.rows[0].group_name : 'a group';
    const transfererResult = await pool.query(
      `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
      [req.userId]
    );
    const transferer = transfererResult.rows[0];
    const transfererName = transferer ? `${transferer.first_name} ${transferer.last_name}` : 'The previous owner';

    const notif = await Notification.create({
      userId: newOwnerUserId,
      type: 'interaction',
      title: 'Group Ownership Transferred',
      message: `${transfererName} has transferred ownership of "${groupName}" to you`,
      relatedUserId: req.userId,
      relatedEntityId: req.params.groupId,
      relatedEntityType: 'group_ownership_transfer'
    });
    if (notif) notifyUser(req.app.get('io'), notif);

    res.json({ success: true });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to transfer ownership');
  }
});

// ---------- Member management ----------
// (Note: GET /groups/search-coaches is defined earlier in the file, before the
// parametric /groups/:groupId routes, to prevent Express from misrouting it.)

// List pending invites for a group
router.get('/groups/:groupId/pending-invites', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('any'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.user_id AS invitee_user_id, n.created_at, n.related_entity_type,
              cp.first_name, cp.last_name, cp.username, cp.profile_image_url, cp.team_name, cp.state, cp.college_division
       FROM notifications n
       JOIN coach_profiles cp ON cp.user_id = n.user_id
       WHERE n.related_entity_id = $1
         AND n.related_entity_type IN ('group_invite', 'group_invite_editor')
         AND n.is_read = FALSE`,
      [req.params.groupId]
    );

    // Annotate each row with the proposed permission so the UI can show "as editor" / "as viewer"
    for (const r of result.rows) {
      r.permission = r.related_entity_type === 'group_invite_editor' ? 'editor' : 'viewer';
    }

    for (const r of result.rows) {
      if (r.profile_image_url && r.profile_image_url.startsWith('profiles/')) {
        try { r.profile_image_url = await getSignedS3Url(r.profile_image_url); }
        catch { r.profile_image_url = null; }
      }
    }

    res.json({ pendingInvites: result.rows });
  } catch (error) {
    logger.error('Error listing pending invites:', error);
    res.status(500).json({ error: 'Failed to list pending invites' });
  }
});

// Send a group invite (editor or owner). Body: { inviteeUserId, permission }
router.post('/groups/:groupId/invite', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const { inviteeUserId, permission } = req.body;
    if (!inviteeUserId) return res.status(400).json({ error: 'inviteeUserId is required' });
    if (permission && !['viewer', 'editor'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be "viewer" or "editor"' });
    }
    const perm = permission || 'viewer';

    // Already a member?
    const already = await BoardGroup.getMembership(req.params.groupId, inviteeUserId);
    if (already) return res.status(400).json({ error: 'User is already a member of this group' });

    // Already has a pending invite (either permission level)?
    const pending = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1
         AND related_entity_id = $2
         AND related_entity_type IN ('group_invite', 'group_invite_editor')
         AND is_read = FALSE`,
      [inviteeUserId, req.params.groupId]
    );
    if (pending.rows[0]) return res.status(400).json({ error: 'An invite is already pending for this user' });

    // Group + sender info for notification copy
    const groupResult = await pool.query(
      `SELECT group_name FROM board_groups WHERE id = $1`,
      [req.params.groupId]
    );
    const groupName = groupResult.rows[0] ? groupResult.rows[0].group_name : 'a group';

    const senderResult = await pool.query(
      `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
      [req.userId]
    );
    const sender = senderResult.rows[0];
    const senderName = sender ? `${sender.first_name} ${sender.last_name}` : 'A coach';

    // Notification for invitee. We encode the proposed permission in the entity type
    // since the notifications schema has no metadata column — 'group_invite' = viewer
    // (default), 'group_invite_editor' = editor.
    const inviteEntityType = perm === 'editor' ? 'group_invite_editor' : 'group_invite';
    const inviteeNotif = await Notification.create({
      userId: inviteeUserId,
      type: 'interaction',
      title: 'Recruiting Group Invite',
      message: `${senderName} has invited you to join "${groupName}" as a ${perm}`,
      relatedUserId: req.userId,
      relatedEntityId: req.params.groupId,
      relatedEntityType: inviteEntityType
    });
    if (inviteeNotif) notifyUser(req.app.get('io'), inviteeNotif);

    // Tracking notification for sender
    const inviteeResult = await pool.query(
      `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
      [inviteeUserId]
    );
    const invitee = inviteeResult.rows[0];
    const inviteeName = invitee ? `${invitee.first_name} ${invitee.last_name}` : 'a coach';
    const senderNotif = await Notification.create({
      userId: req.userId,
      type: 'interaction',
      title: 'Group Invite Sent',
      message: `Invite sent to ${inviteeName} for "${groupName}"`,
      relatedUserId: inviteeUserId,
      relatedEntityId: req.params.groupId,
      relatedEntityType: 'group_invite_sent'
    });
    if (senderNotif) notifyUser(req.app.get('io'), senderNotif);

    res.json({ success: true });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to send invite');
  }
});

// Cancel a pending invite (editor or owner)
router.delete('/groups/:groupId/invite/:inviteeId', authMiddleware, requireRole('coach'), validateUUID('groupId', 'inviteeId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    // Delete the invitee's invite + the sender's tracking notification
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_entity_id = $2
         AND related_entity_type IN ('group_invite', 'group_invite_editor')`,
      [req.params.inviteeId, req.params.groupId]
    );
    await pool.query(
      `DELETE FROM notifications
       WHERE related_user_id = $1
         AND related_entity_id = $2
         AND related_entity_type = 'group_invite_sent'`,
      [req.params.inviteeId, req.params.groupId]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Error cancelling invite:', error);
    res.status(500).json({ error: 'Failed to cancel invite' });
  }
});

// Remove a member (editor or owner). Cannot target the owner.
router.delete('/groups/:groupId/members/:userId', authMiddleware, requireRole('coach'), validateUUID('groupId', 'userId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const groupResult = await pool.query(
      `SELECT group_name FROM board_groups WHERE id = $1`,
      [req.params.groupId]
    );
    const groupName = groupResult.rows[0] ? groupResult.rows[0].group_name : 'a group';

    await BoardGroup.removeMember(req.params.groupId, req.userId, req.params.userId);

    // Notify removed coach
    const removerResult = await pool.query(
      `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
      [req.userId]
    );
    const remover = removerResult.rows[0];
    const removerName = remover ? `${remover.first_name} ${remover.last_name}` : 'A group editor';

    const notif = await Notification.create({
      userId: req.params.userId,
      type: 'interaction',
      title: 'Removed from Group',
      message: `${removerName} has removed you from "${groupName}"`,
      relatedUserId: req.userId,
      relatedEntityId: req.params.groupId,
      relatedEntityType: 'group_member_removed'
    });
    if (notif) notifyUser(req.app.get('io'), notif);

    res.json({ success: true });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to remove member');
  }
});

// Change a member's permission (editor or owner). Cannot target the owner.
router.put('/groups/:groupId/members/:userId/permission', authMiddleware, requireRole('coach'), validateUUID('groupId', 'userId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const { permission } = req.body;
    const result = await BoardGroup.updatePermission(
      req.params.groupId, req.userId, req.params.userId, permission
    );
    res.json(result);
  } catch (error) {
    return handleGroupError(error, res, 'Failed to update permission');
  }
});

// ---------- Incoming invites (for the dedicated Invites modal) ----------

// GET /api/recruiting-board/my-invites — list the requesting coach's INCOMING
// group invites (any status — unseen or seen). Returns sender details + group
// name so the modal can render full coach cards (avatar + orange subheader).
// Invite rows stay in the table until the coach accepts or declines.
router.get('/my-invites', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         n.id AS notification_id,
         n.related_entity_id AS group_id,
         n.related_entity_type,
         n.is_read,
         n.created_at,
         n.related_user_id AS sender_id,
         cp.first_name AS sender_first_name,
         cp.last_name AS sender_last_name,
         cp.team_name AS sender_team_name,
         cp.state AS sender_state,
         cp.college_division AS sender_college_division,
         cp.profile_image_url AS sender_profile_image_url,
         bg.group_name
       FROM notifications n
       LEFT JOIN coach_profiles cp ON cp.user_id = n.related_user_id
       LEFT JOIN board_groups bg ON bg.id = n.related_entity_id
       WHERE n.user_id = $1
         AND n.related_entity_type IN ('group_invite', 'group_invite_editor')
       ORDER BY n.created_at DESC`,
      [req.userId]
    );

    for (const row of result.rows) {
      if (row.sender_profile_image_url && row.sender_profile_image_url.startsWith('profiles/')) {
        try { row.sender_profile_image_url = await getSignedS3Url(row.sender_profile_image_url); }
        catch { row.sender_profile_image_url = null; }
      }
    }

    res.json({
      invites: result.rows.map(r => ({
        notification_id: r.notification_id,
        group_id: r.group_id,
        group_name: r.group_name,
        permission: r.related_entity_type === 'group_invite_editor' ? 'editor' : 'viewer',
        is_read: r.is_read,
        created_at: r.created_at,
        sender: {
          id: r.sender_id,
          first_name: r.sender_first_name,
          last_name: r.sender_last_name,
          team_name: r.sender_team_name,
          state: r.sender_state,
          college_division: r.sender_college_division,
          profile_image_url: r.sender_profile_image_url
        }
      }))
    });
  } catch (err) {
    logger.error('List my invites error:', err);
    res.status(500).json({ error: 'Failed to load invites' });
  }
});

// GET /api/recruiting-board/my-invites/unread-count — drives the badge counter.
// Counts only invites the coach hasn't seen yet (is_read = FALSE).
router.get('/my-invites/unread-count', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM notifications
        WHERE user_id = $1
          AND is_read = FALSE
          AND related_entity_type IN ('group_invite', 'group_invite_editor')`,
      [req.userId]
    );
    res.json({ count: result.rows[0].count || 0 });
  } catch (err) {
    logger.error('Invite unread-count error:', err);
    res.status(500).json({ error: 'Failed to load count' });
  }
});

// POST /api/recruiting-board/my-invites/mark-seen — fired when the coach
// opens the Invites modal. Marks every unread invite as read so the badge
// clears. Invite rows are NOT deleted — they remain visible in the modal
// until accepted or declined.
router.post('/my-invites/mark-seen', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications
          SET is_read = TRUE
        WHERE user_id = $1
          AND is_read = FALSE
          AND related_entity_type IN ('group_invite', 'group_invite_editor')`,
      [req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error('Mark invites seen error:', err);
    res.status(500).json({ error: 'Failed to mark invites seen' });
  }
});

// ---------- Invite accept / decline (group-based) ----------

// Accept a group invite. Body: { notificationId, groupId }
router.post('/invite/accept', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { notificationId, groupId } = req.body;
    if (!groupId) return res.status(400).json({ error: 'Group ID is required' });

    // Look up the invite notification to recover the proposed permission.
    // Entity type is 'group_invite' (viewer) or 'group_invite_editor' (editor).
    // NOTE: no is_read filter — the Invites modal marks invites read on open,
    // so they may already be is_read = TRUE when the coach accepts/declines.
    const inviteNotifResult = await pool.query(
      `SELECT id, related_user_id, related_entity_type FROM notifications
       WHERE user_id = $1
         AND related_entity_id = $2
         AND related_entity_type IN ('group_invite', 'group_invite_editor')
       LIMIT 1`,
      [req.userId, groupId]
    );
    if (!inviteNotifResult.rows[0]) {
      return res.status(404).json({ error: 'Invite not found or already resolved' });
    }
    const inviteRow = inviteNotifResult.rows[0];
    const senderId = inviteRow.related_user_id;
    const perm = inviteRow.related_entity_type === 'group_invite_editor' ? 'editor' : 'viewer';

    // Add the member (also enforces invitee's 5-group cap).
    try {
      await BoardGroup.addMember(groupId, req.userId, req.userId, perm);
    } catch (err) {
      if (/limit reached/i.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    // Delete the invite row entirely — it's been acted on. Sender's tracking
    // notif is deleted below in the same flow.
    await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [inviteRow.id, req.userId]
    );

    // Delete the sender's tracking notification
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_id = $3
         AND related_entity_type = 'group_invite_sent'`,
      [senderId, req.userId, groupId]
    );

    // Notify the sender that their invite was accepted
    const groupResult = await pool.query(
      `SELECT group_name FROM board_groups WHERE id = $1`,
      [groupId]
    );
    const groupName = groupResult.rows[0] ? groupResult.rows[0].group_name : 'a group';
    const accepterResult = await pool.query(
      `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
      [req.userId]
    );
    const accepter = accepterResult.rows[0];
    const accepterName = accepter ? `${accepter.first_name} ${accepter.last_name}` : 'A coach';

    const acceptedNotif = await Notification.create({
      userId: senderId,
      type: 'interaction',
      title: 'Group Invite Accepted',
      message: `${accepterName} has accepted your invite to "${groupName}"`,
      relatedUserId: req.userId,
      relatedEntityId: groupId,
      relatedEntityType: 'group_invite_accepted'
    });
    if (acceptedNotif) notifyUser(req.app.get('io'), acceptedNotif);

    res.json({ success: true });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to accept invite');
  }
});

// Decline a group invite. Body: { notificationId, groupId }
router.post('/invite/decline', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { notificationId, groupId } = req.body;

    // Find the invite row + delete it. is_read state is ignored — the Invites
    // modal flips invites to read when it opens; the row itself only goes away
    // when the coach actually acts on it.
    if (groupId) {
      const inviteNotifResult = await pool.query(
        `SELECT id, related_user_id FROM notifications
         WHERE user_id = $1
           AND related_entity_id = $2
           AND related_entity_type IN ('group_invite', 'group_invite_editor')
         LIMIT 1`,
        [req.userId, groupId]
      );
      const inviteRowDecline = inviteNotifResult.rows[0];
      const senderId = inviteRowDecline ? inviteRowDecline.related_user_id : null;

      if (inviteRowDecline) {
        // Delete the invite row — it's been declined.
        await pool.query(
          `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
          [inviteRowDecline.id, req.userId]
        );
      }

      if (senderId) {
        await pool.query(
          `DELETE FROM notifications
           WHERE user_id = $1
             AND related_user_id = $2
             AND related_entity_id = $3
             AND related_entity_type = 'group_invite_sent'`,
          [senderId, req.userId, groupId]
        );

        const groupResult = await pool.query(
          `SELECT group_name FROM board_groups WHERE id = $1`,
          [groupId]
        );
        const groupName = groupResult.rows[0] ? groupResult.rows[0].group_name : 'a group';
        const declinerResult = await pool.query(
          `SELECT cp.first_name, cp.last_name FROM coach_profiles cp WHERE cp.user_id = $1`,
          [req.userId]
        );
        const decliner = declinerResult.rows[0];
        const declinerName = decliner ? `${decliner.first_name} ${decliner.last_name}` : 'A coach';

        const declinedNotif = await Notification.create({
          userId: senderId,
          type: 'interaction',
          title: 'Group Invite Declined',
          message: `${declinerName} has declined your invite to "${groupName}"`,
          relatedUserId: req.userId,
          relatedEntityId: groupId,
          relatedEntityType: 'group_invite_declined'
        });
        if (declinedNotif) notifyUser(req.app.get('io'), declinedNotif);
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error declining invite:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// ---------- Group boards ----------

// List boards in a group (any member)
router.get('/groups/:groupId/boards', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('any'), async (req, res) => {
  try {
    const boards = await RecruitingBoard.listGroupBoards(req.params.groupId);
    res.json({ boards, cap: RecruitingBoard.BOARDS_PER_GROUP_CAP });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to list group boards');
  }
});

// Create a board in a group (editor only)
router.post('/groups/:groupId/boards', authMiddleware, requireRole('coach'), validateUUID('groupId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const board = await RecruitingBoard.createGroupBoard(req.params.groupId, req.body.boardName);
    res.json({ board });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to create group board');
  }
});

// Delete a board in a group (editor only)
router.delete('/groups/:groupId/boards/:boardId', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    await RecruitingBoard.deleteGroupBoard(req.params.boardId, req.params.groupId);
    res.json({ success: true });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to delete board');
  }
});

// Rename a board in a group (editor only)
router.put('/groups/:groupId/boards/:boardId/name', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const board = await RecruitingBoard.renameGroupBoard(req.params.boardId, req.params.groupId, req.body.boardName);
    res.json({ board });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to rename board');
  }
});

// Get position config for a group board (any member)
router.get('/groups/:groupId/boards/:boardId/config', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId'), requireGroupAccess('any'), async (req, res) => {
  try {
    const board = await RecruitingBoard.getGroupBoardById(req.params.boardId, req.params.groupId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({
      offensePositions: board.offense_positions,
      defensePositions: board.defense_positions
    });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to fetch position configuration');
  }
});

// Save position config (editor only)
router.put('/groups/:groupId/boards/:boardId/config', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const { offensePositions, defensePositions } = req.body;
    if (!offensePositions || !defensePositions) {
      return res.status(400).json({ error: 'Both offense and defense positions are required' });
    }
    await RecruitingBoard.saveGroupBoardConfig(req.params.boardId, req.params.groupId, offensePositions, defensePositions);
    res.json({ message: 'Position configuration saved', offensePositions, defensePositions });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to save position configuration');
  }
});

// Get players for a group board (any member)
router.get('/groups/:groupId/boards/:boardId/players', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId'), requireGroupAccess('any'), async (req, res) => {
  try {
    let players = await RecruitingBoard.getPlayersFromGroupBoardById(req.params.boardId, req.params.groupId);
    players = await addSignedUrlsToPlayers(players);
    res.json(players);
  } catch (error) {
    return handleGroupError(error, res, 'Failed to fetch players');
  }
});

// Add a player to a group board (editor only). Accepts the standard player
// JSONB plus optional final-synthesis fields (final_grade, final_color_tag,
// final_notes, grading_history). These are surfaced on the shared-board
// football-field card so the rest of the staff sees a one-glance read on each
// recruit. Validation lives in the shared validateFinalSynthesisFields helper
// at the top of this file (used by both POST routes + the PUT update routes).
router.post('/groups/:groupId/boards/:boardId/players', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const playerData = req.body;
    if ((!playerData.user_id && !playerData.pool_entry_id) || !playerData.position) {
      return res.status(400).json({ error: 'Player identifier (user_id or pool_entry_id) and position are required' });
    }
    const v = validateFinalSynthesisFields(playerData);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    stampPromotedAudit(playerData, req);

    await RecruitingBoard.addPlayerToGroupBoardById(req.params.boardId, req.params.groupId, playerData);
    res.json({ message: 'Player added', player: playerData });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to add player');
  }
});

// Remove a player from a group board (editor only)
router.delete('/groups/:groupId/boards/:boardId/players/:playerId', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId', 'playerId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const { position } = req.query;
    await RecruitingBoard.removePlayerFromGroupBoardById(req.params.boardId, req.params.groupId, req.params.playerId, position);
    res.json({ message: 'Player removed' });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to remove player');
  }
});

// Update a player's position on a group board (editor only)
router.put('/groups/:groupId/boards/:boardId/players/:playerId/position', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId', 'playerId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const { oldPosition, newPosition } = req.body;
    if (!oldPosition || !newPosition) {
      return res.status(400).json({ error: 'Both oldPosition and newPosition are required' });
    }
    await RecruitingBoard.updatePlayerPositionOnGroupBoardById(
      req.params.boardId, req.params.groupId, req.params.playerId, oldPosition, newPosition
    );
    res.json({ message: 'Player position updated' });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to update player position');
  }
});

// Update final-synthesis fields on an existing player on a group board (editor
// only). Same shape as the personal-board PUT route. grading_history stays
// frozen — only final_grade / final_color_tag / final_notes / promoted_by_*
// are mutated.
router.put('/groups/:groupId/boards/:boardId/players/:playerId/final', authMiddleware, requireRole('coach'), validateUUID('groupId', 'boardId', 'playerId'), requireGroupAccess('editor'), async (req, res) => {
  try {
    const { position } = req.body;
    if (!position) return res.status(400).json({ error: 'position is required' });
    const finalData = {
      final_grade: req.body.final_grade,
      final_color_tag: req.body.final_color_tag,
      final_notes: req.body.final_notes,
      promoted_by_name: req.body.promoted_by_name,
    };
    const v = validateFinalSynthesisFields(finalData);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    stampPromotedAudit(finalData, req);
    await RecruitingBoard.updateFinalOnGroupBoardById(
      req.params.boardId, req.params.groupId, req.params.playerId, position, finalData
    );
    res.json({ message: 'Final fields updated', final: finalData });
  } catch (error) {
    return handleGroupError(error, res, 'Failed to update final fields');
  }
});

// ==================== Utility Routes ====================

// Check if a player is on the coach's recruiting boards
router.get('/check/:playerId', authMiddleware, requireRole('coach'), validateUUID('playerId'), async (req, res) => {
  try {
    const { playerId } = req.params;
    const result = await RecruitingBoard.checkPlayerOnBoards(req.userId, playerId);
    res.json(result);
  } catch (error) {
    logger.error('Error checking player on recruiting board:', error);
    res.status(500).json({ error: 'Failed to check player status' });
  }
});

module.exports = router;
