const pool = require('../config/database');
const { otherPopularityExpr } = require('../utils/popularity-score');
const { escapeLikePattern } = require('../middleware/validation');
const { blockedUserFilter } = require('../utils/blockFilter');
const { fullNameExpr, searchTermParams, searchScoreExpr } = require('../utils/search-score');

class OtherProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, date_of_birth
    } = profileData;

    const result = await pool.query(
      `INSERT INTO other_profiles
      (user_id, first_name, last_name, username, date_of_birth)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [userId, first_name, last_name, username, date_of_birth ?? null]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query('SELECT * FROM other_profiles WHERE user_id = $1', [userId]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await pool.query(
      // Case-insensitive: matches the lower(username) unique index (migration 054).
      'SELECT op.*, u.role FROM other_profiles op JOIN users u ON op.user_id = u.id WHERE lower(op.username) = lower($1)',
      [username]
    );
    return result.rows[0];
  }

  static async update(userId, profileData) {
    const allowedColumns = new Set([
      'first_name', 'last_name', 'username', 'date_of_birth', 'subheader', 'bio',
      'email', 'phone'
      // profile_image_url + profile_picture_url removed — set via
      // updateProfileImage() only (security #22)
    ]);

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(profileData).forEach(key => {
      if (profileData[key] !== undefined && allowedColumns.has(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(profileData[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findByUserId(userId);
    }

    values.push(userId);
    const query = `UPDATE other_profiles SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Dedicated avatar update — bypasses the allowedColumns filter on update().
  // "Other" profiles use profile_picture_url instead of profile_image_url.
  // MUST only be called from the upload route, which generates the S3 key
  // from req.userId and never accepts a key from req.body. Security #22.
  static async updateProfileImage(userId, s3Key) {
    const result = await pool.query(
      `UPDATE other_profiles SET profile_picture_url = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING *`,
      [s3Key, userId]
    );
    return result.rows[0];
  }

  // Security #34: parameterized LIMIT/OFFSET so route can clamp + paginate.
  // Caller passes (filters, limit, offset); we fetch limit+1 rows and return
  // {others, hasMore} so route can pass hasMore through to frontend.
  static async search(filters, limit = 50, offset = 0) {
    let select = 'SELECT op.*';
    let query = ' FROM other_profiles op JOIN users u ON op.user_id = u.id WHERE u.is_active = true';
    const values = [];
    let paramCount = 1;

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('op.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    if (filters.searchTerm) {
      const p = { term: paramCount, substr: paramCount + 1, prefix: paramCount + 2, word: paramCount + 3 };
      values.push(...searchTermParams(filters.searchTerm));
      paramCount += 4;
      const fullName = fullNameExpr('op');
      select += `, ${searchScoreExpr(['op.first_name', 'op.last_name', 'op.username', 'op.subheader', fullName], p)} AS search_score`;
      query += ` AND (similarity(op.first_name, $${p.term}) > 0.2 OR similarity(op.last_name, $${p.term}) > 0.2 OR similarity(op.username, $${p.term}) > 0.2 OR similarity(COALESCE(op.subheader, ''), $${p.term}) > 0.2 OR similarity(${fullName}, $${p.term}) > 0.2 OR op.first_name ILIKE $${p.substr} OR op.last_name ILIKE $${p.substr} OR op.username ILIKE $${p.substr} OR op.subheader ILIKE $${p.substr} OR ${fullName} ILIKE $${p.substr})`;
    }

    if (filters.searchTerm) {
      // Keys must match compareSearchResults in utils/search-score.js — see invariant there.
      query += ` ORDER BY search_score DESC, COALESCE(op.followers_count, 0) DESC, op.created_at DESC, op.user_id LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    } else {
      query += ` ORDER BY op.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }
    const result = await pool.query(select + query, values);
    const others = result.rows.slice(0, limit);
    const hasMore = result.rows.length > limit;
    return { others, hasMore };
  }

  // Discover other profiles with pagination
  static async discover(filters = {}, limit = 12, offset = 0) {
    let query = `
      SELECT op.*
      FROM other_profiles op
      JOIN users u ON op.user_id = u.id
      WHERE u.is_active = true
    `;
    const values = [];
    let paramCount = 1;

    // Exclude current user if specified
    if (filters.excludeUserId) {
      query += ` AND op.user_id != $${paramCount}`;
      values.push(filters.excludeUserId);
      paramCount++;
    }

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('op.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    // Search term filter — fuzzy + ILIKE fallback
    if (filters.searchTerm) {
      query += ` AND (similarity(op.first_name, $${paramCount}) > 0.2 OR similarity(op.last_name, $${paramCount}) > 0.2 OR similarity(op.username, $${paramCount}) > 0.2 OR similarity(COALESCE(op.subheader, ''), $${paramCount}) > 0.2 OR op.first_name ILIKE $${paramCount + 1} OR op.last_name ILIKE $${paramCount + 1} OR op.username ILIKE $${paramCount + 1} OR op.subheader ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${escapeLikePattern(filters.searchTerm)}%`);
      paramCount += 2;
    }

    // Count total for hasMore check
    const countQuery = query.replace('SELECT op.*', 'SELECT COUNT(*) as total');
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(op.first_name, $${paramCount}), similarity(op.last_name, $${paramCount}), similarity(op.username, $${paramCount}), COALESCE(similarity(op.subheader, $${paramCount}), 0)) DESC, op.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit, offset);
    } else {
      query += ` ORDER BY ${otherPopularityExpr('op')} DESC NULLS LAST, op.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, offset);
    }

    const result = await pool.query(query, values);

    return {
      profiles: result.rows,
      hasMore: offset + result.rows.length < total
    };
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
    const query = `UPDATE other_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = OtherProfile;
