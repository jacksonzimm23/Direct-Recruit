const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../config/database');
const { authMiddleware, validateUUID } = require('../middleware/auth');
const { uploadToS3, getSignedVideoUrl, deleteFromS3, generateHighlightVideoKey } = require('../utils/s3');
const Follow = require('../models/Follow');
const { sanitizeBody } = require('../middleware/validation');
const logger = require('../utils/logger');

// Configure multer for video uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for videos (supports up to ~10 min videos)
  },
  fileFilter: (req, file, cb) => {
    // Accept video files only
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MOV, AVI, WebM, and M4V videos are allowed.'), false);
    }
  }
});

// Helper function to add signed URLs to highlights
async function addSignedUrlsToHighlights(highlights) {
  return Promise.all(highlights.map(async (highlight) => {
    if (highlight.video_url && highlight.video_url.startsWith('highlights/')) {
      try {
        highlight.video_signed_url = await getSignedVideoUrl(highlight.video_url);
      } catch (error) {
        logger.error('Error generating signed URL for highlight:', error);
        highlight.video_signed_url = null;
      }
    }
    return highlight;
  }));
}

// Upload highlight with video file (MUST be before /:userId and /:highlightId routes)
router.post('/upload', authMiddleware, upload.single('video_file'), async (req, res) => {
  try {
    const { highlight_type, title, hudl_link } = req.body;
    const videoFile = req.file;

    // Validate required fields
    if (!highlight_type || !title) {
      return res.status(400).json({ error: 'Highlight type and title are required' });
    }

    // Validate highlight_type
    if (!['season', 'game'].includes(highlight_type)) {
      return res.status(400).json({ error: 'Invalid highlight type. Must be "season" or "game"' });
    }

    // Must have either video file or hudl link
    if (!videoFile && !hudl_link) {
      return res.status(400).json({ error: 'Either a video file or Hudl link is required' });
    }

    let videoS3Key = null;

    // Upload video to S3 if provided
    if (videoFile) {
      const s3Key = generateHighlightVideoKey(req.userId, videoFile.originalname);
      await uploadToS3(videoFile.buffer, s3Key, videoFile.mimetype);
      videoS3Key = s3Key;
    }

    // Insert into database
    const result = await pool.query(
      `INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, highlight_type, title, hudl_link, video_url, created_at`,
      [req.userId, highlight_type, title, hudl_link || null, videoS3Key]
    );

    const highlight = result.rows[0];

    // Generate signed URL for the video if uploaded
    if (highlight.video_url) {
      highlight.video_signed_url = await getSignedVideoUrl(highlight.video_url);
    }

    res.status(201).json({
      success: true,
      message: 'Highlight added successfully',
      highlight: highlight
    });
  } catch (error) {
    logger.error('Upload highlight error:', error);

    // Handle multer errors - return generic message
    if (error.message && error.message.includes('Invalid file type')) {
      return res.status(400).json({ error: 'Invalid file type. Please upload a valid video file.' });
    }

    res.status(500).json({ error: 'Failed to upload highlight' });
  }
});

// Get all highlights for a user by user_id
router.get('/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.userId;

    // Owner can always see their own highlights
    if (viewerId !== userId) {
      // Check if profile is private
      const isPrivate = await Follow.isPrivateProfile(userId);
      if (isPrivate) {
        // Check if viewer follows the private profile
        const isFollowing = await Follow.isFollowing(viewerId, userId);
        if (!isFollowing) {
          // Return empty highlights for private profiles the viewer doesn't follow
          return res.json({
            success: true,
            highlights: [],
            accessDenied: true
          });
        }
      }
    }

    const result = await pool.query(
      `SELECT id, highlight_type, title, hudl_link, video_url, created_at
       FROM player_highlights
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    // Add signed URLs for video highlights
    const highlightsWithUrls = await addSignedUrlsToHighlights(result.rows);

    res.json({
      success: true,
      highlights: highlightsWithUrls
    });
  } catch (error) {
    logger.error('Get highlights error:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// Add a new highlight
router.post('/', authMiddleware, sanitizeBody, async (req, res) => {
  try {
    const { highlight_type, title, hudl_link } = req.body;

    if (!highlight_type || !title || !hudl_link) {
      return res.status(400).json({ error: 'Highlight type, title, and Hudl link are required' });
    }

    // Validate highlight_type
    if (!['season', 'game'].includes(highlight_type)) {
      return res.status(400).json({ error: 'Invalid highlight type. Must be "season" or "game"' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }
    if (hudl_link.length > 500) {
      return res.status(400).json({ error: 'Hudl link must be 500 characters or less' });
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
    logger.error('Add highlight error:', error);
    res.status(500).json({ error: 'Failed to add highlight' });
  }
});

// Update a highlight
router.put('/:highlightId', authMiddleware, validateUUID('highlightId'), sanitizeBody, async (req, res) => {
  try {
    const { highlightId } = req.params;
    const { title, hudl_link } = req.body;

    if (!title || !hudl_link) {
      return res.status(400).json({ error: 'Title and Hudl link are required' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }
    if (hudl_link.length > 500) {
      return res.status(400).json({ error: 'Hudl link must be 500 characters or less' });
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
    logger.error('Update highlight error:', error);
    res.status(500).json({ error: 'Failed to update highlight' });
  }
});

// Delete a highlight
router.delete('/:highlightId', authMiddleware, validateUUID('highlightId'), async (req, res) => {
  try {
    const { highlightId } = req.params;

    // Verify ownership and get video_url if exists
    const checkResult = await pool.query(
      'SELECT user_id, video_url FROM player_highlights WHERE id = $1',
      [highlightId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    if (checkResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this highlight' });
    }

    // Delete video from S3 if it exists
    const videoUrl = checkResult.rows[0].video_url;
    if (videoUrl && videoUrl.startsWith('highlights/')) {
      try {
        await deleteFromS3(videoUrl);
      } catch (s3Error) {
        logger.error('Error deleting video from S3:', s3Error);
        // Continue with database deletion even if S3 delete fails
      }
    }

    await pool.query('DELETE FROM player_highlights WHERE id = $1', [highlightId]);

    res.json({
      success: true,
      message: 'Highlight deleted successfully'
    });
  } catch (error) {
    logger.error('Delete highlight error:', error);
    res.status(500).json({ error: 'Failed to delete highlight' });
  }
});

module.exports = router;
