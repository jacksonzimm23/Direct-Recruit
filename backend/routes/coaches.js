const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get all college coaches with pagination
// College coaches have a college_division set (not null/empty)
router.get('/college', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 12;
        const offset = parseInt(req.query.offset) || 0;

        // Get college coaches (those with college_division set)
        const result = await pool.query(
            `SELECT * FROM coach_profiles
             WHERE college_division IS NOT NULL AND college_division != ''
             ORDER BY followers_count DESC, created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        // Get total count for pagination
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM coach_profiles
             WHERE college_division IS NOT NULL AND college_division != ''`
        );

        const total = parseInt(countResult.rows[0].count);
        const hasMore = offset + result.rows.length < total;

        res.json({
            coaches: result.rows,
            total,
            hasMore,
            offset,
            limit
        });
    } catch (error) {
        console.error('Error fetching college coaches:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get college coach by first_name='College' and last_name='Coach' (legacy endpoint)
router.get('/college-coach', async (req, res) => {
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
        console.error('Error fetching college coach:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
