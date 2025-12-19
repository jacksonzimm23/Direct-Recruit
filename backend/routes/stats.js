const express = require('express');
const router = express.Router();
const PlayerGameStats = require('../models/PlayerGameStats');
const { authMiddleware } = require('../middleware/auth');

// Get all games/stats for the logged-in player
router.get('/my-games', authMiddleware, async (req, res) => {
  try {
    const games = await PlayerGameStats.getByUserId(req.userId);
    res.json({ games });
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Get games/stats for a player by username (for viewing profiles)
router.get('/player/:username', authMiddleware, async (req, res) => {
  try {
    const games = await PlayerGameStats.getByUsername(req.params.username);
    res.json({ games });
  } catch (error) {
    console.error('Get player games error:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Get a single game by ID
router.get('/game/:gameId', authMiddleware, async (req, res) => {
  try {
    const game = await PlayerGameStats.getGameById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json({ game });
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// Add a new game with stats
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { opponent, positions, season_year: requestSeasonYear } = req.body;

    if (!positions || Object.keys(positions).length === 0) {
      return res.status(400).json({ error: 'At least one position with stats is required' });
    }

    // Use current date as game date
    const now = new Date();
    const game_date = now.toISOString().split('T')[0];
    // Use season_year from request if provided (including 0 and -1), otherwise use current year
    // 0 = career stats, -1 = last season stats for transfer players
    const season_year = requestSeasonYear !== undefined && requestSeasonYear !== null ? requestSeasonYear : now.getFullYear();

    const game = await PlayerGameStats.create(req.userId, {
      game_date,
      season_year,
      opponent,
      result: null,
      positions
    });

    res.status(201).json({
      success: true,
      message: 'Game stats added successfully',
      game
    });
  } catch (error) {
    console.error('Add game stats error:', error);
    res.status(500).json({ error: 'Failed to add game stats' });
  }
});

// Update a game and its stats
router.put('/:gameId', authMiddleware, async (req, res) => {
  try {
    const { game_date, season_year, opponent, result, positions } = req.body;

    if (!game_date) {
      return res.status(400).json({ error: 'Game date is required' });
    }

    const game = await PlayerGameStats.update(req.userId, req.params.gameId, {
      game_date,
      season_year,
      opponent,
      result,
      positions
    });

    res.json({
      success: true,
      message: 'Game stats updated successfully',
      game
    });
  } catch (error) {
    console.error('Update game stats error:', error);
    if (error.message === 'Game not found or unauthorized') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update game stats' });
  }
});

// Delete a game and all its stats
router.delete('/:gameId', authMiddleware, async (req, res) => {
  try {
    const result = await PlayerGameStats.delete(req.userId, req.params.gameId);

    if (!result) {
      return res.status(404).json({ error: 'Game not found or unauthorized' });
    }

    res.json({
      success: true,
      message: 'Game stats deleted successfully'
    });
  } catch (error) {
    console.error('Delete game stats error:', error);
    res.status(500).json({ error: 'Failed to delete game stats' });
  }
});

module.exports = router;
