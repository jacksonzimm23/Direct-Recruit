const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const path = require('path');

// Upload profile image
router.post('/profile-image', authMiddleware, upload.single('profile_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Create full URL with backend server - use forward slashes for web URLs
    const fileUrl = `http://localhost:5000/uploads/${req.userId}/${req.file.filename}`.replace(/\\/g, '/');
    const relativePath = `/uploads/${req.userId}/${req.file.filename}`.replace(/\\/g, '/');

    console.log('File uploaded:', {
      filename: req.file.filename,
      path: req.file.path,
      fileUrl,
      relativePath,
      fileExists: require('fs').existsSync(req.file.path)
    });

    // Update user profile with image URL
    if (req.user.role === 'player') {
      await PlayerProfile.update(req.userId, { profile_image_url: relativePath });
    } else if (req.user.role === 'coach') {
      await CoachProfile.update(req.userId, { profile_image_url: relativePath });
    }

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: fileUrl,
      url: fileUrl // Keep for backwards compatibility
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload highlight video (players only)
router.post('/highlight-video', authMiddleware, upload.single('highlight_video'), async (req, res) => {
  try {
    if (req.user.role !== 'player') {
      return res.status(403).json({ error: 'Only players can upload highlight videos' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.userId}/${req.file.filename}`;

    await PlayerProfile.update(req.userId, { highlight_video_url: fileUrl });

    res.json({
      message: 'Highlight video uploaded successfully',
      url: fileUrl
    });
  } catch (error) {
    console.error('Upload highlight video error:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Upload post media
router.post('/post-media', authMiddleware, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.userId}/${req.file.filename}`;
    const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    res.json({
      message: 'Media uploaded successfully',
      url: fileUrl,
      media_type: mediaType
    });
  } catch (error) {
    console.error('Upload post media error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

module.exports = router;
