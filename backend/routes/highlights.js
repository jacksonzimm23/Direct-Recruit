const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Get all highlights for a user by user_id
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT id, highlight_type, title, hudl_link, created_at
       FROM player_highlights
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      highlights: result.rows
    });
  } catch (error) {
    console.error('Get highlights error:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// Add a new highlight
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { highlight_type, title, hudl_link } = req.body;

    if (!highlight_type || !title || !hudl_link) {
      return res.status(400).json({ error: 'Highlight type, title, and Hudl link are required' });
    }

    // Validate highlight_type
    if (!['season', 'game'].includes(highlight_type)) {
      return res.status(400).json({ error: 'Invalid highlight type. Must be "season" or "game"' });
    }

    const result = await pool.query(
      `INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link)
       VALUES ($1, $2, $3, $4)
       RETURNING id, highlight_type, title, hudl_link, created_at`,
      [req.userId, highlight_type, title, hudl_link]
    );

    res.status(201).json({
      success: true,
      message: 'Highlight added successfully',
      highlight: result.rows[0]
    });
  } catch (error) {
    console.error('Add highlight error:', error);
    res.status(500).json({ error: 'Failed to add highlight' });
  }
});

// Update a highlight
router.put('/:highlightId', authMiddleware, async (req, res) => {
  try {
    const { highlightId } = req.params;
    const { title, hudl_link } = req.body;

    if (!title || !hudl_link) {
      return res.status(400).json({ error: 'Title and Hudl link are required' });
    }

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT user_id FROM player_highlights WHERE id = $1',
      [highlightId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    if (checkResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this highlight' });
    }

    const result = await pool.query(
      `UPDATE player_highlights
       SET title = $1, hudl_link = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, highlight_type, title, hudl_link, created_at`,
      [title, hudl_link, highlightId]
    );

    res.json({
      success: true,
      message: 'Highlight updated successfully',
      highlight: result.rows[0]
    });
  } catch (error) {
    console.error('Update highlight error:', error);
    res.status(500).json({ error: 'Failed to update highlight' });
  }
});

// Delete a highlight
router.delete('/:highlightId', authMiddleware, async (req, res) => {
  try {
    const { highlightId } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT user_id FROM player_highlights WHERE id = $1',
      [highlightId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    if (checkResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this highlight' });
    }

    await pool.query('DELETE FROM player_highlights WHERE id = $1', [highlightId]);

    res.json({
      success: true,
      message: 'Highlight deleted successfully'
    });
  } catch (error) {
    console.error('Delete highlight error:', error);
    res.status(500).json({ error: 'Failed to delete highlight' });
  }
});

module.exports = router;
