const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { getSignedS3Url } = require('../utils/s3');
const { authMiddleware, requireRole } = require('../middleware/auth');
const TeamQuestionnaire = require('../models/TeamQuestionnaire');
const logger = require('../utils/logger');
const { coachPopularityExpr } = require('../utils/popularity-score');

// Helper function to add signed URLs to coach profiles
async function addSignedUrlsToCoaches(coaches) {
  if (!coaches || !Array.isArray(coaches)) return coaches;

  return await Promise.all(coaches.map(async (coach) => {
    if (coach.profile_image_url && coach.profile_image_url.startsWith('profiles/')) {
      try {
        coach.profile_image_url = await getSignedS3Url(coach.profile_image_url);
      } catch (error) {
        logger.error('Error generating signed URL for coach:', error);
        coach.profile_image_url = null;
      }
    }
    return coach;
  }));
}

// Get all college coaches with pagination and filters
// College coaches have a college_division set (not null/empty)
router.get('/college', authMiddleware, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 12, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const state = req.query.state;
        const collegeDivision = req.query.college_division;

        // Build query with optional filters
        let query = `SELECT * FROM coach_profiles
             WHERE college_division IS NOT NULL AND college_division != ''`;
        let countQuery = `SELECT COUNT(*) FROM coach_profiles
             WHERE college_division IS NOT NULL AND college_division != ''`;
        const values = [];
        const countValues = [];
        let paramCount = 1;

        // Exclude current user's profile
        if (req.userId) {
            query += ` AND user_id != $${paramCount}`;
            countQuery += ` AND user_id != $${paramCount}`;
            values.push(req.userId);
            countValues.push(req.userId);
            paramCount++;
        }

        if (state) {
            query += ` AND state = $${paramCount}`;
            countQuery += ` AND state = $${paramCount}`;
            values.push(state);
            countValues.push(state);
            paramCount++;
        }

        if (collegeDivision) {
            query += ` AND college_division = $${paramCount}`;
            countQuery += ` AND college_division = $${paramCount}`;
            values.push(collegeDivision);
            countValues.push(collegeDivision);
            paramCount++;
        }

        query += ` ORDER BY ${coachPopularityExpr('coach_profiles')} DESC NULLS LAST, created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        values.push(limit, offset);

        // Get college coaches with filters
        const result = await pool.query(query, values);

        // Get total count for pagination
        const countResult = await pool.query(countQuery, countValues);

        const total = parseInt(countResult.rows[0].count);
        const hasMore = offset + result.rows.length < total;

        // Add signed URLs to profile images
        const coachesWithSignedUrls = await addSignedUrlsToCoaches(result.rows);

        res.json({
            coaches: coachesWithSignedUrls,
            total,
            hasMore,
            offset,
            limit
        });
    } catch (error) {
        logger.error('Error fetching college coaches:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all high school coaches with pagination and filters
// HS coaches have no college_division set (null or empty)
// Used by the "other" and "collegeplayer" discover pages, which list every user type
router.get('/hs', authMiddleware, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 12, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const state = req.query.state;

        let query = `SELECT * FROM coach_profiles
             WHERE (college_division IS NULL OR college_division = '')`;
        let countQuery = `SELECT COUNT(*) FROM coach_profiles
             WHERE (college_division IS NULL OR college_division = '')`;
        const values = [];
        const countValues = [];
        let paramCount = 1;

        // Exclude current user's profile
        if (req.userId) {
            query += ` AND user_id != $${paramCount}`;
            countQuery += ` AND user_id != $${paramCount}`;
            values.push(req.userId);
            countValues.push(req.userId);
            paramCount++;
        }

        if (state) {
            query += ` AND state = $${paramCount}`;
            countQuery += ` AND state = $${paramCount}`;
            values.push(state);
            countValues.push(state);
            paramCount++;
        }

        query += ` ORDER BY ${coachPopularityExpr('coach_profiles')} DESC NULLS LAST, created_at DESC, user_id
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        const countResult = await pool.query(countQuery, countValues);

        const total = parseInt(countResult.rows[0].count);
        const hasMore = offset + result.rows.length < total;

        const coachesWithSignedUrls = await addSignedUrlsToCoaches(result.rows);

        res.json({
            coaches: coachesWithSignedUrls,
            total,
            hasMore,
            offset,
            limit
        });
    } catch (error) {
        logger.error('Error fetching HS coaches:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get college coach by first_name='College' and last_name='Coach' (legacy endpoint)
router.get('/college-coach', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM coach_profiles
             WHERE first_name = 'College' AND last_name = 'Coach'
             LIMIT 1`
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Coach not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching college coach:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /at-my-school — Plan 5A. Returns coaches whose normalized team_name
// matches the requester's normalized team_name, excluding self. Used by the
// Plan 5B Send Hand-Off modal recipient picker. Returns an empty array (not
// an error) if the requester's team_name is unset.
router.get('/at-my-school', authMiddleware, requireRole('coach'), async (req, res) => {
    try {
        const me = await pool.query(
            `SELECT team_name FROM coach_profiles WHERE user_id = $1 LIMIT 1`,
            [req.userId]
        );
        const teamName = me.rows[0] && me.rows[0].team_name;
        const schoolKey = TeamQuestionnaire.normalizeSchoolKey(teamName);
        if (!schoolKey) return res.json({ coaches: [] });

        const result = await pool.query(
            `SELECT cp.user_id, cp.first_name, cp.last_name, cp.profile_image_url,
                    cp.team_name, cp.state, cp.college_division, cp.position_title
               FROM coach_profiles cp
               JOIN users u ON u.id = cp.user_id
              WHERE u.is_active = TRUE
                AND u.id <> $1
                AND LOWER(TRIM(cp.team_name)) = $2
              ORDER BY cp.last_name ASC, cp.first_name ASC`,
            [req.userId, schoolKey]
        );

        const coaches = await Promise.all(result.rows.map(async (c) => {
            if (c.profile_image_url && c.profile_image_url.startsWith('profiles/')) {
                try { c.profile_image_url = await getSignedS3Url(c.profile_image_url); }
                catch { c.profile_image_url = null; }
            }
            return c;
        }));

        res.json({ coaches });
    } catch (error) {
        logger.error('Error fetching coaches at my school:', error);
        res.status(500).json({ error: 'Failed to load coaches' });
    }
});

module.exports = router;
