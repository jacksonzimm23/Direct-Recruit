const express = require('express');
const router = express.Router();
const PlayerOffer = require('../models/PlayerOffer');
const PlayerProfile = require('../models/PlayerProfile');
const Follow = require('../models/Follow');
const { authMiddleware } = require('../middleware/auth');

// Get all offers for the logged-in player
router.get('/my-offers', authMiddleware, async (req, res) => {
  try {
    const offers = await PlayerOffer.getByUserId(req.userId);
    res.json({ offers });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// Get offers for a player by username (for viewing profiles)
router.get('/player/:username', authMiddleware, async (req, res) => {
  try {
    // Get the player's profile to check privacy
    const profile = await PlayerProfile.findByUsername(req.params.username);
    if (!profile) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Check if viewer can access this user's content (private profile check)
    const targetUserId = profile.user_id;
    if (req.userId !== targetUserId) {
      const isPrivate = await Follow.isPrivateProfile(targetUserId);
      if (isPrivate) {
        const isFollowing = await Follow.isFollowing(req.userId, targetUserId);
        if (!isFollowing) {
          return res.json({ offers: [], accessDenied: true });
        }
      }
    }

    const offers = await PlayerOffer.getByUsername(req.params.username);
    res.json({ offers });
  } catch (error) {
    console.error('Get player offers error:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// Add a new offer
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { collegeName, division } = req.body;

    if (!collegeName || !division) {
      return res.status(400).json({ error: 'College name and division are required' });
    }

    // Format as "School Name, Division"
    const offerData = `${collegeName}, ${division}`;

    const offer = await PlayerOffer.create(req.userId, offerData);
    res.status(201).json({
      success: true,
      message: 'Offer added successfully',
      offer
    });
  } catch (error) {
    console.error('Add offer error:', error);
    res.status(500).json({ error: 'Failed to add offer' });
  }
});

// Update an offer by index
router.put('/:offerIndex', authMiddleware, async (req, res) => {
  try {
    const offerIndex = parseInt(req.params.offerIndex);
    const { collegeName, division } = req.body;

    if (!collegeName || !division) {
      return res.status(400).json({ error: 'College name and division are required' });
    }

    const offerData = `${collegeName}, ${division}`;
    const result = await PlayerOffer.update(req.userId, offerIndex, offerData);

    if (!result) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.json({
      success: true,
      message: 'Offer updated successfully',
      offer: result
    });
  } catch (error) {
    console.error('Update offer error:', error);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

// Delete an offer by index
router.delete('/:offerIndex', authMiddleware, async (req, res) => {
  try {
    const offerIndex = parseInt(req.params.offerIndex);
    const result = await PlayerOffer.delete(req.userId, offerIndex);

    if (!result) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.json({
      success: true,
      message: 'Offer deleted successfully'
    });
  } catch (error) {
    console.error('Delete offer error:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
});

module.exports = router;
