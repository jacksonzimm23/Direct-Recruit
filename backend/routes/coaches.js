const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get all college coaches with pagination and filters
// College coaches have a college_division set (not null/empty)
router.get('/college', async (req, res) => {
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
