const pool = require('../config/database');
const { PORTAL_KEYWORDS } = require('../utils/portal-intelligence');

class PortalSignal {
  /**
   * Query college players showing portal behavioral signals.
   * Returns players matching the requested signal types with signal details.
   *
   * @param {Object} filters - Signal filters from Claude
   * @param {string[]} filters.signal_types - Array of: 'bio_and_film', 'portal_keywords', 'browsing_coaches'
   * @param {string[]|null} filters.position - Position codes to filter by
   * @param {string|null} filters.college_division - Division to filter by
   * @param {number} filters.days - Lookback window in days (default 14)
   * @param {string} excludeUserId - Coach's user_id to exclude from results
   * @param {number} limit - Max results (default 10)
   * @param {number} offset - Pagination offset
   * @returns {{ players: Array, hasMore: boolean }}
   */
  static async queryBySignalFilters(filters, excludeUserId, limit = 10, offset = 0) {
    const signalTypes = filters.signal_types || ['bio_and_film', 'portal_keywords', 'browsing_coaches'];
    const days = parseInt(filters.days, 10) || 14;
    const values = [];
    let paramCount = 1;

    // Build signal subqueries — each returns a set of user_ids with signal details
    const signalConditions = [];
    const signalSelects = [];

    // === SIGNAL 1: bio_and_film ===
    // Player updated bio AND uploaded highlight within the lookback window
    if (signalTypes.includes('bio_and_film')) {
      signalConditions.push(`bio_and_film_signal`);
      values.push(days, days);
      const daysParam1 = `$${paramCount++}`;
      const daysParam2 = `$${paramCount++}`;
      signalSelects.push(`
        CASE WHEN EXISTS (
          SELECT 1 FROM player_highlights ph
          WHERE ph.user_id = pp.user_id
            AND ph.created_at >= NOW() - INTERVAL '1 day' * ${daysParam1}::integer
        ) AND pp.bio IS NOT NULL AND pp.bio != ''
          AND pp.updated_at >= NOW() - INTERVAL '1 day' * ${daysParam2}::integer
        THEN true ELSE false END AS bio_and_film_signal`);
    }

    // === SIGNAL 2: portal_keywords ===
    // Player's bio contains portal-related keywords
    if (signalTypes.includes('portal_keywords')) {
      signalConditions.push(`portal_keywords_signal`);
      // Build ILIKE conditions for each keyword
      const keywordConditions = PORTAL_KEYWORDS.map(kw => {
        values.push(`%${kw}%`);
        const param = `$${paramCount}`;
        paramCount++;
        return `LOWER(pp.bio) LIKE LOWER(${param})`;
      });
      signalSelects.push(`
        CASE WHEN pp.bio IS NOT NULL AND pp.bio != ''
          AND (${keywordConditions.join(' OR ')})
        THEN true ELSE false END AS portal_keywords_signal`);
    }

    // === SIGNAL 3: browsing_coaches ===
    // Player viewed coaches from other teams within the lookback window
    if (signalTypes.includes('browsing_coaches')) {
      signalConditions.push(`browsing_coaches_signal`);
      values.push(days);
      const daysParam3 = `$${paramCount++}`;
      signalSelects.push(`
        CASE WHEN EXISTS (
          SELECT 1 FROM coach_profile_views cpv
          JOIN coach_profiles cp_viewed ON cpv.viewed_coach_id = cp_viewed.user_id
          WHERE cpv.viewer_id = pp.user_id
            AND cpv.created_at >= NOW() - INTERVAL '1 day' * ${daysParam3}::integer
            AND LOWER(TRIM(cp_viewed.team_name)) != LOWER(TRIM(pp.team_name))
        ) THEN true ELSE false END AS browsing_coaches_signal`);
    }

    // Base WHERE: college players who are NOT already in the portal
    const whereClauses = [
      `pp.college_division IS NOT NULL`,
      `pp.college_division != ''`,
      `(pp.transfer IS NULL OR pp.transfer != 'y')`
    ];

    // Exclude the requesting coach
    if (excludeUserId) {
      whereClauses.push(`pp.user_id != $${paramCount}`);
      values.push(excludeUserId);
      paramCount++;
    }

    // Position filter
    if (filters.position && filters.position.length > 0) {
      const posConditions = filters.position.map(pos => {
        values.push(`%${pos}%`);
        const param = `$${paramCount}`;
        paramCount++;
        return `pp.position ILIKE ${param}`;
      });
      whereClauses.push(`(${posConditions.join(' OR ')})`);
    }

    // Division filter
    if (filters.college_division) {
      whereClauses.push(`pp.college_division = $${paramCount}`);
      values.push(filters.college_division);
      paramCount++;
    }

    // PFF grade minimum — exclude ungraded players when set
    if (filters.pff_grade_min) {
      whereClauses.push(`pp.pff_grade IS NOT NULL AND pp.pff_grade >= $${paramCount}`);
      values.push(filters.pff_grade_min);
      paramCount++;
    }

    // Build the query — select players with signal flags, then filter to only those with at least one signal
    const havingCondition = signalConditions.map(s => s).join(' OR ');

    const query = `
      SELECT
        pp.*,
        ${signalSelects.join(',\n        ')}
      FROM player_profiles pp
      JOIN users u ON pp.user_id = u.id
      WHERE ${whereClauses.join(' AND ')}
        AND u.is_active = true
      ORDER BY pp.updated_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    values.push(limit * 5, offset); // Over-fetch to filter in-app
    paramCount += 2;

    const result = await pool.query(query, values);

    // Filter to only players who have at least one active signal
    const flaggedPlayers = result.rows.filter(row => {
      return signalConditions.some(signal => row[signal] === true);
    });

    // Trim to limit + 1 for hasMore detection
    const hasMore = flaggedPlayers.length > limit;
    const players = hasMore ? flaggedPlayers.slice(0, limit) : flaggedPlayers;

    // Enrich each player with signal_types array and signal_details
    const enrichedPlayers = await Promise.all(players.map(async (player) => {
      const signals = [];
      const signalDetails = {};

      if (player.bio_and_film_signal) {
        signals.push('bio_and_film');
        // Get recent highlights with titles and upload dates
        const hlResult = await pool.query(
          `SELECT title, highlight_type, created_at FROM player_highlights
           WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
           ORDER BY created_at DESC LIMIT 5`,
          [player.user_id, days]
        );
        signalDetails.bio_and_film = {
          bio_updated: player.updated_at,
          bio_excerpt: player.bio ? player.bio.substring(0, 300) : '',
          recent_highlights: hlResult.rows.map(h => ({
            title: h.title,
            type: h.highlight_type,
            uploaded_at: h.created_at
          }))
        };
      }

      if (player.portal_keywords_signal) {
        signals.push('portal_keywords');
        // Find which keywords matched
        const matchedKeywords = PORTAL_KEYWORDS.filter(kw =>
          player.bio && player.bio.toLowerCase().includes(kw.toLowerCase())
        );
        signalDetails.portal_keywords = {
          matched_keywords: matchedKeywords,
          bio_text: player.bio || '',
          bio_updated: player.updated_at
        };
      }

      if (player.browsing_coaches_signal) {
        signals.push('browsing_coaches');
        // Get individual coaches they viewed with names, titles, teams, and view counts
        const viewsResult = await pool.query(
          `SELECT cp.first_name, cp.last_name, cp.position_title,
                  cp.team_name, cp.college_division,
                  COUNT(*) as view_count,
                  MAX(cpv.created_at) as last_viewed
           FROM coach_profile_views cpv
           JOIN coach_profiles cp ON cpv.viewed_coach_id = cp.user_id
           WHERE cpv.viewer_id = $1
             AND cpv.created_at >= NOW() - INTERVAL '1 day' * $2
             AND LOWER(TRIM(cp.team_name)) != LOWER(TRIM($3))
           GROUP BY cp.first_name, cp.last_name, cp.position_title,
                    cp.team_name, cp.college_division
           ORDER BY view_count DESC, last_viewed DESC
           LIMIT 8`,
          [player.user_id, days, player.team_name || '']
        );
        // Also get unique team count
        const teamCountResult = await pool.query(
          `SELECT COUNT(DISTINCT cp.team_name) as unique_teams
           FROM coach_profile_views cpv
           JOIN coach_profiles cp ON cpv.viewed_coach_id = cp.user_id
           WHERE cpv.viewer_id = $1
             AND cpv.created_at >= NOW() - INTERVAL '1 day' * $2
             AND LOWER(TRIM(cp.team_name)) != LOWER(TRIM($3))`,
          [player.user_id, days, player.team_name || '']
        );
        signalDetails.browsing_coaches = {
          coaches_viewed: viewsResult.rows.map(v => ({
            name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
            title: v.position_title || '',
            team: v.team_name,
            division: v.college_division,
            views: parseInt(v.view_count),
            last_viewed: v.last_viewed
          })),
          unique_teams_browsed: parseInt(teamCountResult.rows[0]?.unique_teams || 0),
          total_external_views: viewsResult.rows.reduce((sum, v) => sum + parseInt(v.view_count), 0)
        };
      }

      // Clean up internal signal flags from the player object
      delete player.bio_and_film_signal;
      delete player.portal_keywords_signal;
      delete player.browsing_coaches_signal;

      return {
        ...player,
        signal_types: signals,
        signal_details: signalDetails
      };
    }));

    return { players: enrichedPlayers, hasMore };
  }
}

module.exports = PortalSignal;
