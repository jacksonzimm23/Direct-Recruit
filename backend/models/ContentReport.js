const pool = require('../config/database');

const VALID_CONTENT_TYPES = ['post', 'comment', 'message', 'profile', 'share'];
const VALID_REASONS = ['spam', 'harassment', 'inappropriate', 'hate_speech', 'impersonation', 'other'];

class ContentReport {
  static get VALID_CONTENT_TYPES() { return VALID_CONTENT_TYPES; }
  static get VALID_REASONS() { return VALID_REASONS; }

  // Create a new report. content_id is nullable for content_type='profile'
  // (the reported_user_id IS the target in that case).
  static async create({ reporterUserId, reportedUserId, contentType, contentId, reason, details }) {
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      throw new Error(`Invalid content_type: ${contentType}`);
    }
    if (!VALID_REASONS.includes(reason)) {
      throw new Error(`Invalid reason: ${reason}`);
    }
    const result = await pool.query(
      `INSERT INTO content_reports
         (reporter_user_id, reported_user_id, content_type, content_id, reason, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [reporterUserId, reportedUserId || null, contentType, contentId || null, reason, details || null]
    );
    return result.rows[0];
  }

  // Count reports filed by this user in the last 24h. Used by the
  // reportRateLimit middleware to enforce the per-user soft cap.
  static async countRecentByReporter(reporterUserId, windowHours = 24) {
    const result = await pool.query(
      `SELECT COUNT(*) AS count
       FROM content_reports
       WHERE reporter_user_id = $1
         AND created_at > NOW() - ($2 || ' hours')::interval`,
      [reporterUserId, String(windowHours)]
    );
    return parseInt(result.rows[0].count, 10) || 0;
  }

  // JOIN fragment used by admin queue queries to expand reporter + reported
  // user info inline. Saves N+1 fetches on the admin dashboard.
  static get _adminSelectWithUsers() {
    return `
      SELECT r.*,
             ru.email AS reporter_email,
             ru.role AS reporter_role,
             COALESCE(rpp.first_name, rcp.first_name, rop.first_name) AS reporter_first_name,
             COALESCE(rpp.last_name, rcp.last_name, rop.last_name) AS reporter_last_name,
             COALESCE(rpp.username, rcp.username, rop.username) AS reporter_username,
             du.email AS reported_email,
             du.role AS reported_role,
             du.is_suspended AS reported_is_suspended,
             COALESCE(dpp.first_name, dcp.first_name, dop.first_name) AS reported_first_name,
             COALESCE(dpp.last_name, dcp.last_name, dop.last_name) AS reported_last_name,
             COALESCE(dpp.username, dcp.username, dop.username) AS reported_username
      FROM content_reports r
      LEFT JOIN users ru ON ru.id = r.reporter_user_id
      LEFT JOIN player_profiles rpp ON rpp.user_id = r.reporter_user_id
      LEFT JOIN coach_profiles rcp ON rcp.user_id = r.reporter_user_id
      LEFT JOIN other_profiles rop ON rop.user_id = r.reporter_user_id
      LEFT JOIN users du ON du.id = r.reported_user_id
      LEFT JOIN player_profiles dpp ON dpp.user_id = r.reported_user_id
      LEFT JOIN coach_profiles dcp ON dcp.user_id = r.reported_user_id
      LEFT JOIN other_profiles dop ON dop.user_id = r.reported_user_id
    `;
  }

  // Returns pending reports newest-first with reporter + reported user info.
  // Used by the admin moderation queue.
  static async getPending(limit = 50, offset = 0) {
    const result = await pool.query(
      `${this._adminSelectWithUsers}
       WHERE r.status = 'pending'
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  // Returns a single report with reporter + reported user info, or null.
  static async getByIdWithUsers(reportId) {
    const result = await pool.query(
      `${this._adminSelectWithUsers}
       WHERE r.id = $1`,
      [reportId]
    );
    return result.rows[0] || null;
  }

  // Admin queue: list reports filterable by status. Pass status=null to get
  // all reports across all statuses.
  static async listForAdmin({ status = null, limit = 100, offset = 0 } = {}) {
    if (status) {
      const result = await pool.query(
        `${this._adminSelectWithUsers}
         WHERE r.status = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );
      return result.rows;
    }
    const result = await pool.query(
      `${this._adminSelectWithUsers}
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  // Mark a report as reviewed/actioned/dismissed and record who handled it.
  // Status values: 'reviewed', 'actioned', 'dismissed'.
  static async updateStatus(reportId, status, reviewedByUserId = null) {
    if (!['reviewed', 'actioned', 'dismissed', 'pending'].includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    const result = await pool.query(
      `UPDATE content_reports
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [status, reviewedByUserId, reportId]
    );
    return result.rows[0] || null;
  }

  // Aggregate counts for the admin dashboard top cards.
  static async getCounts() {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'actioned' AND reviewed_at > NOW() - interval '24 hours') AS actioned_today,
        COUNT(*) FILTER (WHERE status = 'dismissed' AND reviewed_at > NOW() - interval '24 hours') AS dismissed_today,
        COUNT(*) FILTER (WHERE created_at > NOW() - interval '7 days') AS week_total
       FROM content_reports`
    );
    return result.rows[0];
  }
}

module.exports = ContentReport;
