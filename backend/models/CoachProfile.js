const pool = require('../config/database');
const { escapeLikePattern } = require('../middleware/validation');
const { blockedUserFilter } = require('../utils/blockFilter');
const { fullNameExpr, searchTermParams, searchScoreExpr } = require('../utils/search-score');
// Plan 5A: team_name changes auto-cancel inbound pipeline hand-offs.
// Required at call time to avoid a circular import on module load.

class CoachProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, date_of_birth, team_name, college_division,
      position_title, city, state, phone, bio, conference,
      // AI Fit-Matching "Program Profile" columns (Plan 3)
      admitted_gpa_min, admitted_gpa_max, test_optional, sat_min, sat_max,
      act_min, act_max, top_programs, football_player_majors,
      affordability_band, offers_athletic_aid, aid_generosity,
      campus_setting, distance_profile, hs_tier_recruited, fit_preferences
    } = profileData;

    const result = await pool.query(
      `INSERT INTO coach_profiles
      (user_id, first_name, last_name, username, date_of_birth, team_name, college_division,
       position_title, city, state, phone, bio, conference,
       admitted_gpa_min, admitted_gpa_max, test_optional, sat_min, sat_max,
       act_min, act_max, top_programs, football_player_majors,
       affordability_band, offers_athletic_aid, aid_generosity,
       campus_setting, distance_profile, hs_tier_recruited, fit_preferences)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
       $26, $27, $28, $29)
      RETURNING *`,
      [userId, first_name, last_name, username, date_of_birth ?? null, team_name, college_division,
       position_title, city, state, phone, bio, conference,
       // TEXT[] arrays (top_programs, football_player_majors) pass raw — node-postgres
       // handles JS arrays for TEXT[]. fit_preferences is JSONB → JSON.stringify (or '{}').
       admitted_gpa_min, admitted_gpa_max, test_optional, sat_min, sat_max,
       act_min, act_max, top_programs, football_player_majors,
       affordability_band, offers_athletic_aid, aid_generosity,
       campus_setting, distance_profile, hs_tier_recruited,
       fit_preferences != null ? JSON.stringify(fit_preferences) : '{}']
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query('SELECT * FROM coach_profiles WHERE user_id = $1', [userId]);
    return result.rows[0];
  }

  static async update(userId, profileData) {
    const allowedColumns = new Set([
      'first_name', 'last_name', 'username', 'date_of_birth', 'team_name', 'college_division',
      'position_title', 'city', 'state', 'phone', 'email', 'bio', 'conference',
      // profile_image_url removed — set via updateProfileImage() only (security #22)
      // AI Fit-Matching "Program Profile" columns (Plan 3)
      'admitted_gpa_min', 'admitted_gpa_max', 'test_optional', 'sat_min', 'sat_max',
      'act_min', 'act_max', 'top_programs', 'football_player_majors',
      'affordability_band', 'offers_athletic_aid', 'aid_generosity',
      'campus_setting', 'distance_profile', 'hs_tier_recruited', 'fit_preferences'
    ]);

    // Plan 5A: detect team_name change so we can auto-cancel inbound
    // pipeline hand-offs whose snapshot school_key no longer matches.
    const teamNameIncoming = (profileData.team_name !== undefined) ? profileData.team_name : null;
    let oldTeamName = null;
    if (profileData.team_name !== undefined) {
      const oldResult = await pool.query(
        `SELECT team_name FROM coach_profiles WHERE user_id = $1`,
        [userId]
      );
      oldTeamName = (oldResult.rows[0] && oldResult.rows[0].team_name) || null;
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(profileData).forEach(key => {
      if (profileData[key] !== undefined && allowedColumns.has(key)) {
        fields.push(`${key} = $${paramCount}`);
        // fit_preferences is JSONB — node-postgres needs a JSON string, not a JS object.
        values.push(key === 'fit_preferences' && profileData[key] != null
          ? JSON.stringify(profileData[key])
          : profileData[key]);
        paramCount++;
      }
    });

    values.push(userId);
    const query = `UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    const updated = result.rows[0];

    // Plan 5A: fire auto-cancel if normalized school_key actually changed.
    // Lazy-require both modules to avoid a circular import (PipelineHandoff →
    // PipelineRecruit → ../config/database is fine, but importing here at the
    // top of CoachProfile would create a chain CoachProfile → PipelineHandoff
    // → PipelineRecruit that some seed scripts touch in a different order).
    if (profileData.team_name !== undefined) {
      const TeamQuestionnaire = require('./TeamQuestionnaire');
      const PipelineHandoff = require('./PipelineHandoff');
      const oldKey = TeamQuestionnaire.normalizeSchoolKey(oldTeamName);
      const newKey = TeamQuestionnaire.normalizeSchoolKey(teamNameIncoming);
      if (oldKey !== newKey) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await PipelineHandoff.autoCancelForRecipient(client, userId, newKey);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          // Don't fail the profile update if auto-cancel errors — just log.
          // The Out-view filter + view-time school_key filter still hide the
          // stale rows from the user; auto-cancel is the cleanup pass.
          try {
            const logger = require('../utils/logger');
            logger.error('Plan 5A auto-cancel hook failed (CoachProfile.update):', err);
          } catch { /* noop */ }
        } finally {
          client.release();
        }
      }
    }

    return updated;
  }

  // Dedicated avatar update — bypasses the allowedColumns filter on update().
  // MUST only be called from the upload route, which generates the S3 key
  // from req.userId and never accepts a key from req.body. Security #22.
  static async updateProfileImage(userId, s3Key) {
    const result = await pool.query(
      `UPDATE coach_profiles SET profile_image_url = $1 WHERE user_id = $2 RETURNING *`,
      [s3Key, userId]
    );
    return result.rows[0];
  }

  // Security #34: parameterized LIMIT/OFFSET so route can clamp + paginate.
  // Caller passes (filters, limit, offset); we fetch limit+1 rows and return
  // {coaches, hasMore} so route can pass hasMore through to frontend.
  static async search(filters, limit = 50, offset = 0) {
    let select = 'SELECT cp.*';
    let query = ' FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE u.is_active = true';
    const values = [];
    let paramCount = 1;

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('cp.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    if (filters.college_division) {
      query += ` AND cp.college_division = $${paramCount}`;
      values.push(filters.college_division);
      paramCount++;
    }
    if (filters.state) {
      query += ` AND cp.state = $${paramCount}`;
      values.push(filters.state);
      paramCount++;
    }
    if (filters.searchTerm) {
      const p = { term: paramCount, substr: paramCount + 1, prefix: paramCount + 2, word: paramCount + 3 };
      values.push(...searchTermParams(filters.searchTerm));
      paramCount += 4;
      const fullName = fullNameExpr('cp');
      select += `, ${searchScoreExpr(['cp.first_name', 'cp.last_name', 'cp.username', 'cp.team_name', fullName], p)} AS search_score`;
      query += ` AND (similarity(cp.first_name, $${p.term}) > 0.2 OR similarity(cp.last_name, $${p.term}) > 0.2 OR similarity(cp.username, $${p.term}) > 0.2 OR similarity(cp.team_name, $${p.term}) > 0.2 OR similarity(${fullName}, $${p.term}) > 0.2 OR cp.first_name ILIKE $${p.substr} OR cp.last_name ILIKE $${p.substr} OR cp.username ILIKE $${p.substr} OR cp.team_name ILIKE $${p.substr} OR ${fullName} ILIKE $${p.substr})`;
    }

    if (filters.searchTerm) {
      // Keys must match compareSearchResults in utils/search-score.js — see invariant there.
      // (verified DESC intentionally dropped here: cross-model pagination requires identical
      // keys in all three models; verified coaches surface via the exact/prefix tiers anyway.)
      query += ` ORDER BY search_score DESC, COALESCE(cp.followers_count, 0) DESC, cp.created_at DESC, cp.user_id LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    } else {
      query += ` ORDER BY cp.verified DESC, COALESCE(cp.followers_count, 0) DESC, cp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }
    const result = await pool.query(select + query, values);
    const coaches = result.rows.slice(0, limit);
    const hasMore = result.rows.length > limit;
    return { coaches, hasMore };
  }

  // All active college coaches (full row, so all program/fit columns are present).
  // Used by the AI Rep "Best-Fit Schools" engine to score every school's program
  // against a player. No pagination — the route groups + ranks the results.
  static async getAllCollege() {
    const result = await pool.query(
      'SELECT cp.* FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE u.is_active = true AND cp.college_division IS NOT NULL'
    );
    return result.rows;
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT cp.*, u.role FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE cp.username = $1', [username]);
    return result.rows[0];
  }

  static async updatePrivacySettings(userId, settings) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (settings.profile_visibility !== undefined) {
      fields.push(`profile_visibility = $${paramCount}`);
      values.push(settings.profile_visibility);
      paramCount++;
    }

    if (settings.message_permissions !== undefined) {
      fields.push(`message_permissions = $${paramCount}`);
      values.push(settings.message_permissions);
      paramCount++;
    }

    if (fields.length === 0) {
      return null;
    }

    values.push(userId);
    const query = `UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = CoachProfile;
