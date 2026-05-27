const pool = require('../config/database');

const VALID_CONTENT_TYPES = ['post', 'comment', 'message', 'profile'];
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

  // Future admin-queue helper (deferred per plan). Returns pending reports
  // newest-first. No JOINs for v1; admin can query DB directly for now.
  static async getPending(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM content_reports
       WHERE status = 'pending'
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
}

module.exports = ContentReport;
