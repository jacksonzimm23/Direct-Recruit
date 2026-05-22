const pool = require('../config/database');
const TeamQuestionnaire = require('./TeamQuestionnaire');
const { getSignedS3Url } = require('../utils/s3');

/**
 * PipelineRecruit — per-coach evaluation rows for the Plan 4 recruiting pipeline.
 *
 * Each row is one recruit a coach is actively evaluating. Sourced either from
 * the team pool (pool_entry_id) or directly from a DR player profile
 * (linked_player_user_id). school_key is snapshotted at add-time from the
 * coach's normalized team_name and drives the cross-coach pool checkmark plus
 * Plan 5 hand-off recipient lookups.
 *
 * Remove from pipeline is a hard DELETE (no rejected/restore semantics). The
 * pool entry itself stays untouched — only the coach's evaluation row goes.
 */

/**
 * Normalize a recruit's positions to an upper-cased, deduped array.
 *
 * Real questionnaire submissions store multi-position recruits as a single
 * string like "WR/CB" or "WR, CB". DR player profiles store a single position
 * code like "WR". This helper produces the same array shape for both sources
 * so frontend filters + renderers can do simple .includes() / .some() checks.
 *
 * Pass athletic.positions (from questionnaire JSONB) first, fall back to the
 * DR profile's single-string position when no questionnaire is linked.
 */
function normalizePositionList(athleticPositions, drPosition) {
  const raw = athleticPositions != null && athleticPositions !== ''
    ? athleticPositions
    : drPosition;
  if (raw == null || raw === '') return null;

  let arr;
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    arr = String(raw).split(/[/,]/);
  }
  const cleaned = arr
    .map(s => String(s || '').trim().toUpperCase())
    .filter(Boolean);
  if (cleaned.length === 0) return null;
  // Dedupe while preserving order
  return Array.from(new Set(cleaned));
}

const COLOR_TAG_ALLOWLIST = new Set([
  'dark_green',
  'light_green',
  'yellow',
  'orange',
  'red',
  'dark_red',
]);

class PipelineRecruit {
  static COLOR_TAGS = COLOR_TAG_ALLOWLIST;

  /**
   * Pull a pool entry into the coach's pipeline. Server validates that the
   * pool entry's school_key matches the coach's current normalized team_name.
   *
   * If the coach previously removed this recruit (soft-deleted row exists for
   * the same (coach_user_id, pool_entry_id) pair), the partial UNIQUE index
   * excludes soft-deleted rows so this INSERT succeeds — a fresh ungraded row
   * is created alongside the historical one. The old grade stays in
   * getEvaluationsAtSchool's history view forever.
   */
  static async addFromPool(coachUserId, schoolKey, poolEntryId) {
    // Resolve pool entry + its questionnaire's school_key
    const peResult = await pool.query(
      `SELECT pe.id, pe.linked_player_user_id, tq.school_key
         FROM pool_entries pe
         JOIN team_questionnaires tq ON tq.id = pe.questionnaire_id
        WHERE pe.id = $1
        LIMIT 1`,
      [poolEntryId]
    );
    if (!peResult.rows[0]) {
      const err = new Error('Pool entry not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (peResult.rows[0].school_key !== schoolKey) {
      const err = new Error('This recruit submitted to a different school.');
      err.code = 'CROSS_SCHOOL';
      throw err;
    }

    const linkedPlayerUserId = peResult.rows[0].linked_player_user_id || null;

    try {
      const inserted = await pool.query(
        `INSERT INTO pipeline_recruits
            (coach_user_id, school_key, pool_entry_id, linked_player_user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [coachUserId, schoolKey, poolEntryId, linkedPlayerUserId]
      );
      return this.getByIdForCoach(inserted.rows[0].id, coachUserId);
    } catch (e) {
      if (e.code === '23505') {
        const err = new Error('Already in your pipeline');
        err.code = 'DUPLICATE';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Add a DR player directly to the pipeline (no pool entry / no questionnaire).
   * Validates the target is a player; coach_user_id provides the perspective.
   * Like addFromPool, the partial UNIQUE excludes soft-deleted rows so a fresh
   * INSERT after a remove succeeds and the old grade stays in history.
   */
  static async addFromDRProfile(coachUserId, schoolKey, playerUserId) {
    const userResult = await pool.query(
      `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
      [playerUserId]
    );
    if (!userResult.rows[0]) {
      const err = new Error('Player not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (userResult.rows[0].role !== 'player') {
      const err = new Error('Only player accounts can be added to a pipeline');
      err.code = 'INVALID_TARGET';
      throw err;
    }

    try {
      const inserted = await pool.query(
        `INSERT INTO pipeline_recruits
            (coach_user_id, school_key, pool_entry_id, linked_player_user_id)
         VALUES ($1, $2, NULL, $3)
         RETURNING id`,
        [coachUserId, schoolKey, playerUserId]
      );
      return this.getByIdForCoach(inserted.rows[0].id, coachUserId);
    } catch (e) {
      if (e.code === '23505') {
        const err = new Error('Already in your pipeline');
        err.code = 'DUPLICATE';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Return one pipeline row shaped for the frontend. Used by add* methods and
   * by updateEvaluation to return the canonical row after a write. Filters
   * soft-deleted rows (removed_from_pipeline_at IS NOT NULL) so reads after
   * a soft-delete behave like the row is gone.
   */
  static async getByIdForCoach(recruitId, coachUserId) {
    const result = await pool.query(this._baseSelectSQL('WHERE pr.id = $1 AND pr.coach_user_id = $2 AND pr.removed_from_pipeline_at IS NULL'), [
      recruitId,
      coachUserId,
    ]);
    if (!result.rows[0]) return null;
    return this._shapeRow(result.rows[0]);
  }

  /**
   * Full pipeline list for a coach. Active rows only (out/promoted are
   * surfaced by Plans 5 & 6 respectively). Ordered by updated_at DESC so
   * freshly handed-off recruits land at the top in Plan 5.
   */
  static async getPipelineForCoach(coachUserId) {
    const result = await pool.query(
      // Include 'active' AND any legacy 'out' rows so coaches who sent a
      // recruit before the "sender keeps their copy" rule landed still see
      // those recruits in their pipeline. 'promoted' stays excluded — those
      // moved to a board and should NOT clutter the pipeline. Soft-deleted
      // rows (removed_from_pipeline_at IS NOT NULL) are excluded too — they
      // live on only inside getEvaluationsAtSchool's history view.
      this._baseSelectSQL("WHERE pr.coach_user_id = $1 AND pr.status IN ('active', 'out') AND pr.removed_from_pipeline_at IS NULL ORDER BY pr.updated_at DESC"),
      [coachUserId]
    );
    const shaped = await Promise.all(result.rows.map(r => this._shapeRow(r)));
    return shaped;
  }

  /**
   * Coach edits their own evaluation. Validates color_tag against the locked
   * 6-color palette. Returns the canonical shaped row.
   */
  static async updateEvaluation(recruitId, coachUserId, { grade, color_tag, notes }) {
    // Validate color_tag — null is allowed (clear the tag)
    if (color_tag !== undefined && color_tag !== null && !COLOR_TAG_ALLOWLIST.has(color_tag)) {
      const err = new Error('Invalid color tag');
      err.code = 'INVALID_COLOR_TAG';
      throw err;
    }
    // Validate grade — null is allowed (clear the grade)
    if (grade !== undefined && grade !== null) {
      const g = Number(grade);
      if (!Number.isInteger(g) || g < 0 || g > 100) {
        const err = new Error('Grade must be an integer 0–100');
        err.code = 'INVALID_GRADE';
        throw err;
      }
    }

    const result = await pool.query(
      `UPDATE pipeline_recruits
          SET grade = $1,
              color_tag = $2,
              notes = $3,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND coach_user_id = $5
        RETURNING id`,
      [
        grade === undefined ? null : grade,
        color_tag === undefined ? null : color_tag,
        notes === undefined ? null : notes,
        recruitId,
        coachUserId,
      ]
    );
    if (!result.rows[0]) {
      const err = new Error('Pipeline recruit not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    return this.getByIdForCoach(recruitId, coachUserId);
  }

  /**
   * Soft delete. Sets removed_from_pipeline_at = NOW() so the row stays in the
   * table — getEvaluationsAtSchool includes soft-deleted rows so a coach a year
   * later can still see "Coach Smith graded this kid 78 / yellow last May".
   * Every other read path filters removed_from_pipeline_at IS NULL. The partial
   * UNIQUE indexes also exclude soft-deleted, so re-adding the same recruit
   * inserts a fresh ungraded row alongside the historical one.
   *
   * Returns {pool_entry_id, school_key} so the caller can chain
   * countAtSchoolForPoolEntry to compute still_in_any_pipeline_at_school for
   * the response (frontend uses this to clear the pool checkmark optimistically).
   */
  static async delete(recruitId, coachUserId) {
    const result = await pool.query(
      `UPDATE pipeline_recruits
          SET removed_from_pipeline_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND coach_user_id = $2 AND removed_from_pipeline_at IS NULL
        RETURNING pool_entry_id, school_key`,
      [recruitId, coachUserId]
    );
    if (!result.rows[0]) {
      const err = new Error('Pipeline recruit not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    return result.rows[0];
  }

  /** Cross-coach checkmark helper. Filters soft-deleted rows so the checkmark
   *  clears when the last active row at the school is removed. */
  static async countAtSchoolForPoolEntry(schoolKey, poolEntryId) {
    if (!poolEntryId) return 0;
    const result = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM pipeline_recruits
        WHERE school_key = $1 AND pool_entry_id = $2 AND removed_from_pipeline_at IS NULL`,
      [schoolKey, poolEntryId]
    );
    return result.rows[0].n;
  }

  /**
   * Cheap "is this DR player in this coach's pipeline?" lookup. Drives the
   * player-profile "Add to Pipeline" button's initial state so a coach who
   * navigates back to a profile doesn't see the default Add label after
   * they've already added the recruit.
   *
   * Matches on linked_player_user_id (not pool_entry_id) because the same DR
   * player could be in the coach's pipeline either via from-profile add OR
   * via a pool entry whose linked_player_user_id was auto-populated.
   */
  static async containsLinkedPlayerForCoach(coachUserId, playerUserId) {
    if (!playerUserId) return { in_pipeline: false, recruit_id: null };
    const result = await pool.query(
      `SELECT id
         FROM pipeline_recruits
        WHERE coach_user_id = $1
          AND linked_player_user_id = $2
          AND removed_from_pipeline_at IS NULL
        LIMIT 1`,
      [coachUserId, playerUserId]
    );
    if (result.rows.length === 0) {
      return { in_pipeline: false, recruit_id: null };
    }
    return { in_pipeline: true, recruit_id: result.rows[0].id };
  }

  /**
   * Plan 8: resolve coaches whose ACTIVE pipeline contains a given recruit,
   * matched by either pool_entry_id (questionnaire-sourced rows) or
   * linked_player_user_id (DR-direct rows; populated post-backlink at
   * register time). Used by the "DR Account Linked" notification fan-out
   * in auth.js — a user who just registered may have submitted
   * questionnaires to multiple schools, so accept an ARRAY of matched
   * pool_entry_ids. SELECT DISTINCT collapses to one row per coach (each
   * coach has at most one active row per recruit due to the partial
   * UNIQUE index, but the DISTINCT is defensive against any future
   * multi-row case).
   *
   * Filters removed_from_pipeline_at IS NULL (lesson #110: soft-delete
   * must be filtered) and status IN ('active', 'out') to mirror
   * getPipelineForCoach's "live pipeline" definition.
   */
  static async findCoachesWithRecruit(poolEntryIds, linkedPlayerUserId) {
    const ids = Array.isArray(poolEntryIds) ? poolEntryIds.filter(Boolean) : [];
    if (ids.length === 0 && !linkedPlayerUserId) return [];
    const result = await pool.query(
      `SELECT DISTINCT coach_user_id
         FROM pipeline_recruits
        WHERE (pool_entry_id = ANY($1::uuid[]) OR linked_player_user_id = $2)
          AND removed_from_pipeline_at IS NULL
          AND status IN ('active', 'out')`,
      [ids, linkedPlayerUserId || null]
    );
    return result.rows.map(r => r.coach_user_id);
  }

  /**
   * Append a snapshot entry to a recruit's evaluation_chain (Plan 5A).
   * Pure function — returns a NEW array. The snapshot freezes the coach's
   * name, title, and the evaluation at the time of append. Plan 6 (final-
   * grade synthesis) and Plan 7 (AI Report) both read these entries.
   */
  static appendChainEntry(chain, coach, evaluation) {
    const safeChain = Array.isArray(chain) ? chain : [];
    const name = `${(coach.first_name || '').trim()} ${(coach.last_name || '').trim()}`.trim() || 'Coach';
    const evaluatedAt = evaluation.evaluated_at instanceof Date
      ? evaluation.evaluated_at.toISOString()
      : (evaluation.evaluated_at || new Date().toISOString());
    return [
      ...safeChain,
      {
        coach_id: coach.user_id,
        coach_name: name,
        coach_title: coach.position || null,
        grade: evaluation.grade == null ? null : evaluation.grade,
        color_tag: evaluation.color_tag || null,
        notes: evaluation.notes || '',
        evaluated_at: evaluatedAt,
      },
    ];
  }

  /**
   * Plan 5A: when a hand-off is resolved (accept/reject/auto-cancel), flip
   * the source recruit's status back to 'active' if no other pending
   * hand-offs reference it. Takes an open transaction client so callers can
   * sequence this inside their own BEGIN/COMMIT.
   *
   * Guarded on `status='out'` so this never disturbs 'active' or 'promoted'
   * rows. Returns true if the row was flipped, false otherwise.
   */
  static async flipBackStatusIfNoPendingHandoffs(client, sourceRecruitId) {
    if (!sourceRecruitId) return false;
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM pipeline_handoffs
        WHERE source_recruit_id = $1 AND state = 'pending'`,
      [sourceRecruitId]
    );
    if (countResult.rows[0].n > 0) return false;
    const updateResult = await client.query(
      `UPDATE pipeline_recruits
          SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'out'
        RETURNING id`,
      [sourceRecruitId]
    );
    return updateResult.rowCount > 0;
  }

  // ---------- internals ----------

  /**
   * Single SELECT shape reused by every read path. Joins pool_entries +
   * questionnaire_submissions (for nested submission_data) and player_profiles
   * (for DR-linked profile data). All columns aliased so _shapeRow can
   * extract the nested JSONB without ambiguity.
   */
  static _baseSelectSQL(whereOrderClause) {
    return `
      SELECT
        pr.id, pr.coach_user_id, pr.school_key, pr.pool_entry_id,
        pr.linked_player_user_id, pr.status, pr.grade, pr.color_tag, pr.notes,
        pr.evaluation_chain, pr.added_at, pr.updated_at,
        qs.submission_data AS qs_submission_data,
        pp.first_name AS pp_first_name,
        pp.last_name AS pp_last_name,
        pp.username AS pp_username,
        pp.position AS pp_position,
        pp.height AS pp_height,
        pp.weight AS pp_weight,
        pp.graduation_year AS pp_graduation_year,
        pp.gpa AS pp_gpa,
        pp.team_name AS pp_team_name,
        pp.city AS pp_city,
        pp.state AS pp_state,
        pp.profile_image_url AS pp_profile_image_s3_key,
        pp.college_division AS pp_college_division,
        pp.transfer AS pp_transfer,
        pp.eligibility AS pp_eligibility
      FROM pipeline_recruits pr
      LEFT JOIN pool_entries pe ON pe.id = pr.pool_entry_id
      LEFT JOIN questionnaire_submissions qs ON qs.id = pe.latest_submission_id
      LEFT JOIN player_profiles pp ON pp.user_id = pr.linked_player_user_id
      ${whereOrderClause}
    `;
  }

  /**
   * Shape a raw row into the frontend payload. Mirrors the nested-JSONB
   * extraction at recruiting-board.js:642–661 (/my-pool list shaping) so
   * pipeline cards can reuse pool card rendering logic.
   */
  static async _shapeRow(row) {
    const d = row.qs_submission_data || {};
    const personal = d.personal || {};
    const athletic = d.athletic || {};
    const academic = d.academic || {};
    const address = d.address || {};

    // Prefer DR profile data when linked, otherwise fall back to questionnaire data
    const drLinked = !!row.linked_player_user_id;
    let profileImageUrl = null;
    if (drLinked && row.pp_profile_image_s3_key && row.pp_profile_image_s3_key.startsWith('profiles/')) {
      try { profileImageUrl = await getSignedS3Url(row.pp_profile_image_s3_key); }
      catch { profileImageUrl = null; }
    }

    // Transcript PDF (questionnaire-sourced only). Pipeline rows added from a
    // DR profile have no questionnaire submission, so no transcript. We surface
    // the signed URL on the shaped row so the pipeline card / modal can render
    // a "View Transcript" link without a second roundtrip.
    let transcriptUrl = null;
    const transcriptKeys = Array.isArray(academic.transcript_s3_keys) ? academic.transcript_s3_keys : [];
    if (transcriptKeys.length > 0 && typeof transcriptKeys[0] === 'string' && transcriptKeys[0].startsWith('transcripts/anon/')) {
      try { transcriptUrl = await getSignedS3Url(transcriptKeys[0]); }
      catch { transcriptUrl = null; }
    }

    // Cross-coach: every other coach at the same school who has this recruit
    // in their pipeline AND has graded/noted them. Replaces the lagging
    // evaluation_chain snapshot for History display purposes. The snapshot
    // still ships separately for callers that need the frozen lineage at
    // hand-off time (e.g. board JSONB grading_history at promote time).
    let allSchoolEvaluations = [];
    try {
      allSchoolEvaluations = await this.getEvaluationsAtSchool(row.school_key, {
        poolEntryId: row.pool_entry_id,
        linkedPlayerUserId: row.linked_player_user_id,
      });
    } catch (_) { /* non-fatal — render with empty cross-coach view */ }

    return {
      id: row.id,
      pool_entry_id: row.pool_entry_id,
      linked_player_user_id: row.linked_player_user_id,
      school_key: row.school_key,
      status: row.status,
      grade: row.grade,
      color_tag: row.color_tag,
      notes: row.notes,
      evaluation_chain: row.evaluation_chain || [],
      all_school_evaluations: allSchoolEvaluations,
      added_at: row.added_at,
      updated_at: row.updated_at,

      // Display fields: DR-linked wins when present, else questionnaire data
      first_name: (drLinked && row.pp_first_name) || personal.first_name || '',
      last_name: (drLinked && row.pp_last_name) || personal.last_name || '',
      username: (drLinked && row.pp_username) || null,
      // Pool data has athletic.positions (array); DR data has pp.position (single string)
      // Normalize to an array. The questionnaire form actually stores
      // multi-position recruits as a single string with "/" or "," separators
      // (e.g. "WR/CB" or "WR,CB"), so split + trim before frontend consumes
      // it. Single position stays as a one-element array.
      positions: normalizePositionList(athletic.positions, row.pp_position),
      height_inches: athletic.height_inches || row.pp_height || null,
      weight_lbs: athletic.weight_lbs || row.pp_weight || null,
      graduation_year: academic.graduation_year || row.pp_graduation_year || null,
      gpa: academic.gpa || row.pp_gpa || null,
      state: address.state || row.pp_state || null,
      city: address.city || row.pp_city || null,
      high_school: academic.high_school || null,
      team_name: row.pp_team_name || null,
      college_division: row.pp_college_division || null,
      is_transfer: row.pp_transfer === 'y',
      eligibility: row.pp_eligibility != null ? row.pp_eligibility : null,

      profile_image_url: profileImageUrl,
      transcript_url: transcriptUrl,
      // Source signal for the card badge: 'pool' or 'dr_profile'
      source: row.pool_entry_id ? 'pool' : 'dr_profile',
      // Full latest questionnaire submission JSONB (null for DR-only recruits
      // with no pool linkage). The Evaluation Modal's Info tab renders this
      // via renderQuestionnaireView() so coaches see every field the recruit
      // submitted (personal, address, parents, family, academic, athletic,
      // film) — not just the handful surfaced on cards.
      submission_data: row.pool_entry_id ? d : null,
    };
  }

  /**
   * Live cross-coach evaluations for one recruit at one school. Returns every
   * pipeline_recruits row at `schoolKey` that targets the same recruit
   * (matched by pool_entry_id OR linked_player_user_id), shaped as chain-
   * compatible entries `{coach_id, coach_name, coach_title, grade, color_tag,
   * notes, evaluated_at}` so the frontend can render them with the existing
   * timeline renderers.
   *
   * This is the authoritative source for "all evaluations at this school"
   * because each coach owns their own pipeline_recruits row — the static
   * evaluation_chain JSONB snapshot is only what was inherited at hand-off
   * accept time, so it can lag if other coaches grade their copies later.
   * Skips rows with no evaluation (no grade, no color, no notes).
   */
  static async getEvaluationsAtSchool(schoolKey, { poolEntryId, linkedPlayerUserId }) {
    if (!schoolKey) return [];
    if (!poolEntryId && !linkedPlayerUserId) return [];
    // INCLUDES soft-deleted rows — that's the whole point of soft-delete. A
    // coach who removed a recruit a year ago still shows up here with
    // is_active=false so the next coach sees the audit trail. The recruit_id
    // field lets the frontend cache currentEvalRecruit.id from the viewer's
    // own row without an extra roundtrip.
    const result = await pool.query(
      `SELECT pr.id AS recruit_id, pr.coach_user_id, pr.grade, pr.color_tag, pr.notes, pr.updated_at,
              (pr.removed_from_pipeline_at IS NULL) AS is_active,
              cp.first_name, cp.last_name, cp.position_title
         FROM pipeline_recruits pr
         LEFT JOIN coach_profiles cp ON cp.user_id = pr.coach_user_id
        WHERE pr.school_key = $1
          AND (
            ($2::uuid IS NOT NULL AND pr.pool_entry_id = $2)
            OR ($3::uuid IS NOT NULL AND pr.linked_player_user_id = $3)
          )
          AND (pr.grade IS NOT NULL OR pr.color_tag IS NOT NULL OR (pr.notes IS NOT NULL AND length(trim(pr.notes)) > 0))
        ORDER BY pr.updated_at DESC`,
      [schoolKey, poolEntryId || null, linkedPlayerUserId || null]
    );
    return result.rows.map(r => ({
      recruit_id: r.recruit_id,
      coach_id: r.coach_user_id,
      coach_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Coach',
      coach_title: r.position_title || null,
      grade: r.grade,
      color_tag: r.color_tag,
      notes: r.notes,
      evaluated_at: r.updated_at,
      is_active: r.is_active,
    }));
  }
}

module.exports = PipelineRecruit;
module.exports.normalizePositionList = normalizePositionList;
