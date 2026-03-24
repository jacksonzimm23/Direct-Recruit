const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { getSignedS3Url } = require('../utils/s3');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

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
        const limit = parseInt(req.query.limit) || 12;
        const offset = parseInt(req.query.offset) || 0;
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

        query += ` ORDER BY followers_count DESC, created_at DESC
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

module.exports = router;
