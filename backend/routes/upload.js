const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const path = require('path');
const multer = require('multer');
const { uploadToS3, getSignedS3Url, generateProfileImageKey, deleteFromS3 } = require('../utils/s3');

// Memory storage for S3 uploads (keeps file in buffer instead of disk)
const memoryStorage = multer.memoryStorage();
const s3Upload = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const extname = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    if (allowedImageTypes.test(extname.slice(1)) && mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('Only image files are allowed for profile pictures'));
  },
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
  }
});

// Upload profile image to S3
router.post('/profile-image', authMiddleware, s3Upload.single('profile_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get current profile to check for existing image
    let existingProfile = null;
    if (req.user.role === 'player') {
      existingProfile = await PlayerProfile.findByUserId(req.userId);
    } else if (req.user.role === 'coach') {
      existingProfile = await CoachProfile.findByUserId(req.userId);
    }

    // Delete old profile image from S3 if it exists
    if (existingProfile && existingProfile.profile_image_url && existingProfile.profile_image_url.startsWith('profiles/')) {
      try {
        await deleteFromS3(existingProfile.profile_image_url);
        console.log('Deleted old profile image:', existingProfile.profile_image_url);
      } catch (deleteError) {
        // Log but don't fail the upload if delete fails
        console.error('Failed to delete old profile image:', deleteError);
      }
    }

    // Generate S3 key for the profile image
    const s3Key = generateProfileImageKey(req.userId, req.file.originalname);

    // Upload to S3
    await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

    console.log('File uploaded to S3:', {
      key: s3Key,
      contentType: req.file.mimetype,
      size: req.file.size
    });

    // Generate signed URL for immediate display
    const signedUrl = await getSignedS3Url(s3Key);

    // Update user profile with S3 key (not the full URL)
    if (req.user.role === 'player') {
      await PlayerProfile.update(req.userId, { profile_image_url: s3Key });
    } else if (req.user.role === 'coach') {
      await CoachProfile.update(req.userId, { profile_image_url: s3Key });
    }

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: signedUrl,
      url: signedUrl, // Keep for backwards compatibility
      s3Key: s3Key
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
