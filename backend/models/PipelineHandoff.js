const pool = require('../config/database');
const TeamQuestionnaire = require('./TeamQuestionnaire');
const PipelineRecruit = require('./PipelineRecruit');
const { getSignedS3Url } = require('../utils/s3');

/**
 * PipelineHandoff — coach-to-coach recruit routing within a school (Plan 5A).
 *
 * Each row is one pending hand-off from a sender's pipeline row to a single
 * recipient. Accept/reject/auto-cancel DELETE the row (matches the Group
 * Invites lifecycle in recruiting-board.js). school_key snapshots the
 * sender's normalized team_name at send time so the recipient auto-cancel
 * hook and the cross-school view filter can both gate on snapshot vs current.
 *
 * No CHECK constraint on state — accept/reject briefly write 'accepted'/
 * 'rejected' inside the transaction before the DELETE.
 */

const MAX_RECIPIENTS = 20;

class PipelineHandoff {
  /**
   * Send a hand-off from one source recruit to N recipients at the same
   * school. Transactional: source recruit status flips to 'out' atomically
   * with the inserts.
   */
  static async create(senderId, senderSchoolKey, sourceRecruitId, toCoachIds, message) {
    if (!Array.isArray(toCoachIds) || toCoachIds.length === 0) {
      const err = new Error('At least one recipient is required');
      err.code = 'INVALID_TARGET';
      throw err;
    }
    if (toCoachIds.length > MAX_RECIPIENTS) {
      const err = new Error(`Too many recipients (max ${MAX_RECIPIENTS})`);
      err.code = 'INVALID_TARGET';
      throw err;
    }
    // De-dupe and validate self-handoff upfront
    const uniqueIds = [...new Set(toCoachIds)];
    if (uniqueIds.includes(senderId)) {
      const err = new Error('Cannot hand off to yourself');
      err.code = 'INVALID_TARGET';
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Verify source recruit belongs to sender and is 'active' and not
      //    soft-deleted (a coach who removed a recruit can't suddenly send
      //    a hand-off off the tombstoned row).
      const srcResult = await client.query(
        `SELECT id, status FROM pipeline_recruits
          WHERE id = $1 AND coach_user_id = $2
            AND removed_from_pipeline_at IS NULL
          FOR UPDATE`,
        [sourceRecruitId, senderId]
      );
      if (!srcResult.rows[0]) {
        const err = new Error('Pipeline recruit not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (srcResult.rows[0].status !== 'active') {
        const err = new Error('Recruit is already handed off');
        err.code = 'INVALID_STATE';
        throw err;
      }

      // 2. Validate each recipient is at the sender's school
      const recipientsResult = await client.query(
        `SELECT u.id AS user_id, u.role, cp.team_name,
                cp.first_name, cp.last_name
           FROM users u
           LEFT JOIN coach_profiles cp ON cp.user_id = u.id
          WHERE u.id = ANY($1::uuid[])`,
        [uniqueIds]
      );
      const foundIds = new Set(recipientsResult.rows.map(r => r.user_id));
      const missing = uniqueIds.filter(id => !foundIds.has(id));
      if (missing.length > 0) {
        const err = new Error('One or more recipients not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      for (const r of recipientsResult.rows) {
        if (r.role !== 'coach') {
          const err = new Error('All recipients must be coaches');
          err.code = 'INVALID_TARGET';
          throw err;
        }
        const recipientKey = TeamQuestionnaire.normalizeSchoolKey(r.team_name);
        if (!recipientKey || recipientKey !== senderSchoolKey) {
          const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Recipient';
          const err = new Error(`Recipient ${name} is not at your school`);
          err.code = 'CROSS_SCHOOL';
          throw err;
        }
      }

      // 3. Insert one handoff row per recipient
      const msg = (typeof message === 'string' && message.trim()) ? message.trim() : null;
      const values = [];
      const params = [];
      uniqueIds.forEach((toId, i) => {
        const base = i * 5;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        params.push(sourceRecruitId, senderId, toId, senderSchoolKey, msg);
      });
      const insertResult = await client.query(
        `INSERT INTO pipeline_handoffs
            (source_recruit_id, from_coach_id, to_coach_id, school_key, message)
         VALUES ${values.join(', ')}
         RETURNING id, to_coach_id`,
        params
      );

      // Source recruit STAYS 'active' — coaches keep working their own copy
      // of the player even after sending it to a teammate. The receiver gets
      // their own pipeline_recruits row on accept; both coaches see the same
      // recruit independently. We still bump updated_at so the row sorts to
      // the top of the sender's pipeline (recently-acted-on first).
      await client.query(
        `UPDATE pipeline_recruits
            SET updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [sourceRecruitId]
      );

      await client.query('COMMIT');
      return {
        handoffs: insertResult.rows,
        source_recruit_id: sourceRecruitId,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * In view — pending hand-offs sent TO me at MY CURRENT school.
   * Filtered by school_key so a coach who switched schools sees nothing
   * old (and defense-in-depth with the auto-cancel hook that DELETEs
   * those rows).
   */
  static async listIn(coachUserId, schoolKey) {
    if (!schoolKey) return [];
    const result = await pool.query(
      `${this._listSelectSQL('TO_VIEW')}
        WHERE h.to_coach_id = $1
          AND h.state = 'pending'
          AND h.school_key = $2
        ORDER BY h.created_at DESC`,
      [coachUserId, schoolKey]
    );
    return Promise.all(result.rows.map(row => this._shapeInItem(row)));
  }

  /**
   * Out view — ALL hand-offs I sent (pending + accepted + rejected +
   * rejected_duplicate), filtered to MY CURRENT school. Grouped by source
   * recruit so the caller sees one card per recruit with N recipients each
   * carrying their current state. Frontend renders status badges + lets the
   * sender clear resolved rows manually via clearResolvedOut().
   */
  static async listOut(coachUserId, schoolKey) {
    if (!schoolKey) return [];
    const result = await pool.query(
      `${this._listSelectSQL('FROM_VIEW')}
        WHERE h.from_coach_id = $1
          AND h.school_key = $2
        ORDER BY h.created_at DESC`,
      [coachUserId, schoolKey]
    );

    // Shape each row, then group by source_recruit_id
    const shaped = await Promise.all(result.rows.map(row => this._shapeOutItem(row)));
    const grouped = new Map();
    for (const item of shaped) {
      const key = item.recruit.id;
      if (!grouped.has(key)) {
        grouped.set(key, { recruit: item.recruit, recipients: [], created_at: item.created_at });
      }
      grouped.get(key).recipients.push({
        handoff_id: item.handoff_id,
        recipient: item.recipient,
        message: item.message,
        state: item.state,
        acted_on_at: item.acted_on_at,
        created_at: item.created_at,
      });
    }
    return Array.from(grouped.values());
  }

  /**
   * Clear all non-pending hand-offs the sender has acted-on-resolution for
   * at their current school. Used by the "Clear acted-on" button in the
   * Sent view so the list doesn't grow forever.
   */
  static async clearResolvedOut(coachUserId, schoolKey) {
    if (!schoolKey) return 0;
    const result = await pool.query(
      `DELETE FROM pipeline_handoffs
        WHERE from_coach_id = $1
          AND school_key = $2
          AND state IN ('accepted', 'rejected', 'rejected_duplicate')`,
      [coachUserId, schoolKey]
    );
    return result.rowCount || 0;
  }

  /** Lightweight unread counter for badge polling. */
  static async unreadCount(coachUserId, schoolKey) {
    if (!schoolKey) return 0;
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM pipeline_handoffs
        WHERE to_coach_id = $1
          AND state = 'pending'
          AND school_key = $2
          AND is_read = FALSE`,
      [coachUserId, schoolKey]
    );
    return result.rows[0].count;
  }

  /** Mark all pending inbound hand-offs at my current school as read. */
  static async markSeen(coachUserId, schoolKey) {
    if (!schoolKey) return 0;
    const result = await pool.query(
      `UPDATE pipeline_handoffs
          SET is_read = TRUE
        WHERE to_coach_id = $1
          AND state = 'pending'
          AND school_key = $2
          AND is_read = FALSE
        RETURNING id`,
      [coachUserId, schoolKey]
    );
    return result.rowCount;
  }

  /**
   * Accept a hand-off — create the receiver's pipeline row with the sender's
   * snapshot appended to the chain, then DELETE the handoff row.
   */
  static async accept(handoffId, coachUserId, coachSchoolKey) {
    if (!coachSchoolKey) {
      const err = new Error('Set your team name in My Profile.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Load and lock the handoff
      const handoffResult = await client.query(
        `SELECT id, source_recruit_id, from_coach_id, to_coach_id, school_key, state
           FROM pipeline_handoffs
          WHERE id = $1
          FOR UPDATE`,
        [handoffId]
      );
      const handoff = handoffResult.rows[0];
      if (!handoff || handoff.to_coach_id !== coachUserId || handoff.state !== 'pending') {
        const err = new Error('Hand-off not found');
        err.code = 'NOT_FOUND';
        throw err;
      }

      // 2. Cross-school check at accept time (defense in depth)
      if (handoff.school_key !== coachSchoolKey) {
        const err = new Error("You are no longer at this recruit's school");
        err.code = 'CROSS_SCHOOL';
        throw err;
      }

      // 3. Load source recruit + sender's coach_profiles (for chain entry)
      const srcResult = await client.query(
        `SELECT pr.id, pr.pool_entry_id, pr.linked_player_user_id,
                pr.evaluation_chain, pr.grade, pr.color_tag, pr.notes, pr.updated_at,
                cp.first_name AS sender_first_name,
                cp.last_name AS sender_last_name,
                cp.position_title AS sender_position
           FROM pipeline_recruits pr
           LEFT JOIN coach_profiles cp ON cp.user_id = pr.coach_user_id
          WHERE pr.id = $1`,
        [handoff.source_recruit_id]
      );
      const src = srcResult.rows[0];
      if (!src) {
        const err = new Error('Source recruit no longer exists');
        err.code = 'NOT_FOUND';
        throw err;
      }

      // 4. Build new chain via PipelineRecruit.appendChainEntry
      const newChain = PipelineRecruit.appendChainEntry(
        src.evaluation_chain,
        {
          user_id: handoff.from_coach_id,
          first_name: src.sender_first_name,
          last_name: src.sender_last_name,
          position: src.sender_position,
        },
        {
          grade: src.grade,
          color_tag: src.color_tag,
          notes: src.notes,
          evaluated_at: src.updated_at,
        }
      );

      // 5. INSERT receiver's pipeline row (catch UNIQUE violation)
      let newRecruitId = null;
      try {
        const insertResult = await client.query(
          `INSERT INTO pipeline_recruits
              (coach_user_id, school_key, pool_entry_id, linked_player_user_id,
               status, grade, color_tag, notes, evaluation_chain, updated_at)
           VALUES ($1, $2, $3, $4, 'active', NULL, NULL, NULL, $5::jsonb, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            coachUserId,
            coachSchoolKey,
            src.pool_entry_id,
            src.linked_player_user_id,
            JSON.stringify(newChain),
          ]
        );
        newRecruitId = insertResult.rows[0].id;
      } catch (e) {
        if (e.code === '23505') {
          // Receiver already has this recruit. Mark the hand-off as
          // 'rejected_duplicate' so the sender still sees a row in their Sent
          // view with the reason — instead of silently disappearing. Flip
          // source status back if applicable, then surface DUPLICATE so the
          // caller can show a clean toast.
          await client.query(
            `UPDATE pipeline_handoffs
                SET state = 'rejected_duplicate', acted_on_at = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [handoffId]
          );
          await PipelineRecruit.flipBackStatusIfNoPendingHandoffs(client, handoff.source_recruit_id);
          await client.query('COMMIT');
          const err = new Error('You already have this recruit in your pipeline');
          err.code = 'DUPLICATE';
          throw err;
        }
        throw e;
      }

      // 6. Mark the hand-off as accepted. Row stays in pipeline_handoffs so
      // the sender's Sent view can show "Accepted" — sender clears manually.
      await client.query(
        `UPDATE pipeline_handoffs
            SET state = 'accepted',
                acted_on_at = CURRENT_TIMESTAMP,
                received_recruit_id = $1
          WHERE id = $2`,
        [newRecruitId, handoffId]
      );

      // 7. Flip source recruit back to 'active' if no other handoffs remain
      await PipelineRecruit.flipBackStatusIfNoPendingHandoffs(client, handoff.source_recruit_id);

      await client.query('COMMIT');

      // 8. Return the new pipeline row shaped via PipelineRecruit.getByIdForCoach
      const shaped = await PipelineRecruit.getByIdForCoach(newRecruitId, coachUserId);
      return { accepted: true, recruit: shaped };
    } catch (err) {
      // ROLLBACK if commit didn't happen; safe to call after a partial commit (no-op)
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw err;
    } finally {
      client.release();
    }
  }

  /** Reject — DELETE the handoff, flip source status back if last pending. */
  static async reject(handoffId, coachUserId, coachSchoolKey) {
    if (!coachSchoolKey) {
      const err = new Error('Set your team name in My Profile.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const handoffResult = await client.query(
        `SELECT id, source_recruit_id, to_coach_id, school_key, state
           FROM pipeline_handoffs
          WHERE id = $1
          FOR UPDATE`,
        [handoffId]
      );
      const handoff = handoffResult.rows[0];
      if (!handoff || handoff.to_coach_id !== coachUserId || handoff.state !== 'pending') {
        const err = new Error('Hand-off not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (handoff.school_key !== coachSchoolKey) {
        const err = new Error("You are no longer at this recruit's school");
        err.code = 'CROSS_SCHOOL';
        throw err;
      }

      // Row stays in pipeline_handoffs (state='rejected') so the sender's
      // Sent view can show "Rejected" — sender clears manually.
      await client.query(
        `UPDATE pipeline_handoffs
            SET state = 'rejected', acted_on_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [handoffId]
      );

      await PipelineRecruit.flipBackStatusIfNoPendingHandoffs(client, handoff.source_recruit_id);

      await client.query('COMMIT');
      return { rejected: true };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Auto-cancel — called from CoachProfile.update / settings.switch-profile
   * when a recipient's team_name changes. Takes an open client so the caller
   * controls the transaction (settings.switch-profile already has one open).
   * If called from a context with no transaction (CoachProfile.update),
   * caller wraps in BEGIN/COMMIT.
   *
   * Deletes every pending inbound handoff for `coachUserId` whose snapshot
   * school_key no longer matches `newSchoolKey`, then flips each source
   * recruit's status back to 'active' if applicable.
   */
  static async autoCancelForRecipient(client, coachUserId, newSchoolKey) {
    // Find rows to cancel
    const rowsResult = await client.query(
      `SELECT id, source_recruit_id
         FROM pipeline_handoffs
        WHERE to_coach_id = $1
          AND state = 'pending'
          AND ($2::text IS NULL OR school_key <> $2)`,
      [coachUserId, newSchoolKey || null]
    );
    if (rowsResult.rows.length === 0) {
      return { cancelled: 0 };
    }
    const handoffIds = rowsResult.rows.map(r => r.id);
    const sourceIds = [...new Set(rowsResult.rows.map(r => r.source_recruit_id))];

    await client.query(
      `DELETE FROM pipeline_handoffs WHERE id = ANY($1::uuid[])`,
      [handoffIds]
    );
    for (const srcId of sourceIds) {
      await PipelineRecruit.flipBackStatusIfNoPendingHandoffs(client, srcId);
    }
    return { cancelled: handoffIds.length };
  }

  // ---------- internals ----------

  /**
   * Shared SELECT shape for list queries. Joins sender + recipient coach
   * profiles AND the source recruit's full underlying data (pool entry,
   * questionnaire submission, DR profile). All columns aliased so the shapers
   * below can extract without ambiguity.
   *
   * mode: 'TO_VIEW' (In) joins the SENDER's coach data; 'FROM_VIEW' (Out)
   * joins the RECIPIENT's coach data. The recruit join is the same either way.
   */
  static _listSelectSQL(mode) {
    const isToView = mode === 'TO_VIEW';
    const otherCoachId = isToView ? 'h.from_coach_id' : 'h.to_coach_id';
    return `
      SELECT
        h.id AS handoff_id, h.message, h.is_read, h.created_at,
        h.state, h.acted_on_at,
        h.from_coach_id, h.to_coach_id, h.school_key,
        oc.id AS oc_user_id, oc_cp.first_name AS oc_first_name,
        oc_cp.last_name AS oc_last_name, oc_cp.team_name AS oc_team_name,
        oc_cp.state AS oc_state, oc_cp.college_division AS oc_college_division,
        oc_cp.position_title AS oc_position,
        oc_cp.profile_image_url AS oc_profile_image_s3_key,
        pr.id AS pr_id, pr.coach_user_id AS pr_coach_user_id,
        pr.school_key AS pr_school_key, pr.pool_entry_id AS pr_pool_entry_id,
        pr.linked_player_user_id AS pr_linked_player_user_id,
        pr.status AS pr_status, pr.grade AS pr_grade,
        pr.color_tag AS pr_color_tag, pr.notes AS pr_notes,
        pr.evaluation_chain AS pr_evaluation_chain,
        pr.added_at AS pr_added_at, pr.updated_at AS pr_updated_at,
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
        pp.transfer AS pp_transfer
      FROM pipeline_handoffs h
      JOIN users oc ON oc.id = ${otherCoachId}
      LEFT JOIN coach_profiles oc_cp ON oc_cp.user_id = oc.id
      JOIN pipeline_recruits pr ON pr.id = h.source_recruit_id
      LEFT JOIN pool_entries pe ON pe.id = pr.pool_entry_id
      LEFT JOIN questionnaire_submissions qs ON qs.id = pe.latest_submission_id
      LEFT JOIN player_profiles pp ON pp.user_id = pr.linked_player_user_id
    `;
  }

  /** Shape an In-view row: sender info + recruit snapshot + sender evaluation + prior chain */
  static async _shapeInItem(row) {
    const recruit = await this._shapeRecruitFromJoinedRow(row);
    let senderImage = null;
    if (row.oc_profile_image_s3_key && row.oc_profile_image_s3_key.startsWith('profiles/')) {
      try { senderImage = await getSignedS3Url(row.oc_profile_image_s3_key); }
      catch { senderImage = null; }
    }
    return {
      handoff_id: row.handoff_id,
      message: row.message,
      is_read: row.is_read,
      created_at: row.created_at,
      sender: {
        user_id: row.oc_user_id,
        first_name: row.oc_first_name,
        last_name: row.oc_last_name,
        profile_image_url: senderImage,
        team_name: row.oc_team_name,
        state: row.oc_state,
        college_division: row.oc_college_division,
        position: row.oc_position,
      },
      recruit,
      sender_evaluation: {
        grade: row.pr_grade,
        color_tag: row.pr_color_tag,
        notes: row.pr_notes,
        evaluated_at: row.pr_updated_at,
      },
      prior_evaluation_chain: row.pr_evaluation_chain || [],
    };
  }

  /** Shape an Out-view row: recipient info + recruit snapshot. Grouping happens in listOut(). */
  static async _shapeOutItem(row) {
    const recruit = await this._shapeRecruitFromJoinedRow(row);
    let recipientImage = null;
    if (row.oc_profile_image_s3_key && row.oc_profile_image_s3_key.startsWith('profiles/')) {
      try { recipientImage = await getSignedS3Url(row.oc_profile_image_s3_key); }
      catch { recipientImage = null; }
    }
    return {
      handoff_id: row.handoff_id,
      message: row.message,
      created_at: row.created_at,
      state: row.state,
      acted_on_at: row.acted_on_at,
      recipient: {
        user_id: row.oc_user_id,
        first_name: row.oc_first_name,
        last_name: row.oc_last_name,
        profile_image_url: recipientImage,
        team_name: row.oc_team_name,
        state: row.oc_state,
        college_division: row.oc_college_division,
        position: row.oc_position,
      },
      recruit,
    };
  }

  /**
   * Recruit JSON shape. Mirrors PipelineRecruit._shapeRow exactly so frontend
   * code that renders a pipeline card can also render a handoff card's
   * embedded recruit without branching on source.
   *
   * Implemented as a parallel shaper instead of calling _shapeRow directly
   * because our SELECT aliases prefix pipeline_recruits columns with `pr_`
   * (vs. _shapeRow's bare names) — easier to keep the two shapers in sync
   * than to bend the SELECT shape.
   */
  static async _shapeRecruitFromJoinedRow(row) {
    const d = row.qs_submission_data || {};
    const personal = d.personal || {};
    const athletic = d.athletic || {};
    const academic = d.academic || {};
    const address = d.address || {};
    const drLinked = !!row.pr_linked_player_user_id;

    let profileImageUrl = null;
    if (drLinked && row.pp_profile_image_s3_key && row.pp_profile_image_s3_key.startsWith('profiles/')) {
      try { profileImageUrl = await getSignedS3Url(row.pp_profile_image_s3_key); }
      catch { profileImageUrl = null; }
    }

    // Sign the recruit's questionnaire transcript (if present) so the
    // handoff modal can render the same "View Transcript" link the pool /
    // pipeline cards show. Pure DR-direct recruits don't have a transcript.
    let transcriptUrl = null;
    const transcriptKeys = Array.isArray(academic.transcript_s3_keys) ? academic.transcript_s3_keys : [];
    if (transcriptKeys.length > 0 && typeof transcriptKeys[0] === 'string' && transcriptKeys[0].startsWith('transcripts/anon/')) {
      try { transcriptUrl = await getSignedS3Url(transcriptKeys[0]); }
      catch { transcriptUrl = null; }
    }

    return {
      id: row.pr_id,
      pool_entry_id: row.pr_pool_entry_id,
      linked_player_user_id: row.pr_linked_player_user_id,
      school_key: row.pr_school_key,
      status: row.pr_status,
      grade: row.pr_grade,
      color_tag: row.pr_color_tag,
      notes: row.pr_notes,
      evaluation_chain: row.pr_evaluation_chain || [],
      added_at: row.pr_added_at,
      updated_at: row.pr_updated_at,

      first_name: (drLinked && row.pp_first_name) || personal.first_name || '',
      last_name: (drLinked && row.pp_last_name) || personal.last_name || '',
      username: (drLinked && row.pp_username) || null,
      // Normalize to a clean upper-cased array — questionnaire stores
      // multi-position recruits as "WR/CB" or "WR,CB". Helper splits and
      // dedupes so frontend filters can do simple includes() checks.
      positions: PipelineRecruit.normalizePositionList(athletic.positions, row.pp_position),
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

      profile_image_url: profileImageUrl,
      transcript_url: transcriptUrl,
      source: row.pr_pool_entry_id ? 'pool' : 'dr_profile',
    };
  }
}

module.exports = PipelineHandoff;
