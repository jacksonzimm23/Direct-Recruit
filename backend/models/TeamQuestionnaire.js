const pool = require('../config/database');
const { generateSlug } = require('../utils/slug');

const MAX_SLUG_RETRIES = 5;

/**
 * TeamQuestionnaire — one row per SCHOOL, holding a permanent public slug for
 * that school's recruiting questionnaire. School identity is the normalized
 * (lowercased + trimmed) team_name. Detached from shared groups so the link
 * survives staff turnover and is shared by every coach at the school.
 *
 * When a coach changes their team_name, calls to getOrCreateForSchool() with
 * the new team_name resolve to a different school's questionnaire (creating
 * one if it doesn't exist yet). The old school's row is untouched.
 */
class TeamQuestionnaire {
  /** Normalize a team_name to a school_key: lowercase + trim + collapse whitespace. */
  static normalizeSchoolKey(teamName) {
    if (!teamName || typeof teamName !== 'string') return null;
    const key = teamName.trim().toLowerCase().replace(/\s+/g, ' ');
    return key || null;
  }

  /**
   * Get or create the questionnaire for a given school. Slug generated once
   * from teamName at creation time and never changes thereafter.
   */
  static async getOrCreateForSchool(teamName) {
    const schoolKey = this.normalizeSchoolKey(teamName);
    if (!schoolKey) {
      const err = new Error('teamName is required to resolve a school questionnaire');
      err.code = 'INVALID_TEAM_NAME';
      throw err;
    }

    // Fast path: existing row
    const existing = await pool.query(
      `SELECT id, school_key, slug, created_at, updated_at
         FROM team_questionnaires
        WHERE school_key = $1
        LIMIT 1`,
      [schoolKey]
    );
    if (existing.rows[0]) return existing.rows[0];

    // Slow path: insert with slug collision retry
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      const slug = generateSlug(teamName);
      try {
        const inserted = await pool.query(
          `INSERT INTO team_questionnaires (school_key, slug)
                VALUES ($1, $2)
             ON CONFLICT (school_key) DO NOTHING
             RETURNING id, school_key, slug, created_at, updated_at`,
          [schoolKey, slug]
        );

        if (inserted.rows[0]) return inserted.rows[0];

        // Race: another request just inserted this school_key. Read it back.
        const raced = await pool.query(
          `SELECT id, school_key, slug, created_at, updated_at
             FROM team_questionnaires
            WHERE school_key = $1
            LIMIT 1`,
          [schoolKey]
        );
        if (raced.rows[0]) return raced.rows[0];
      } catch (err) {
        // 23505 on slug UNIQUE — retry with new slug
        if (err.code === '23505' && /slug/.test(err.constraint || '')) continue;
        throw err;
      }
    }

    throw new Error('Failed to generate unique questionnaire slug after retries');
  }

  static async getBySlug(slug) {
    const result = await pool.query(
      `SELECT id, school_key, slug, created_at, updated_at
         FROM team_questionnaires
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    return result.rows[0] || null;
  }

  static async getBySchoolKey(schoolKey) {
    if (!schoolKey) return null;
    const result = await pool.query(
      `SELECT id, school_key, slug, created_at, updated_at
         FROM team_questionnaires
        WHERE school_key = $1
        LIMIT 1`,
      [schoolKey]
    );
    return result.rows[0] || null;
  }
}

module.exports = TeamQuestionnaire;
