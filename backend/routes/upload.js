const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const path = require('path');
const multer = require('multer');
const { uploadToS3, getSignedS3Url, generateProfileImageKey, generatePostMediaKey, deleteFromS3 } = require('../utils/s3');

// Memory storage for S3 uploads (keeps file in buffer instead of disk)
const memoryStorage = multer.memoryStorage();

// Multer config for profile images (images only, 5MB max)
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

// Multer config for post media (images and videos, 200MB max for videos up to ~5 min)
const postMediaUpload = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedVideoTypes = /mp4|mov|avi|webm|mkv/;
    const extname = path.extname(file.originalname).toLowerCase().slice(1);
    const mimetype = file.mimetype;

    if (allowedImageTypes.test(extname) && mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    if (allowedVideoTypes.test(extname) && mimetype.startsWith('video/')) {
      return cb(null, true);
    }
    return cb(new Error('Only image files (jpg, png, gif, webp) and video files (mp4, mov, avi, webm) are allowed'));
  },
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB max for videos (~5 min at 1080p)
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
    } else if (req.user.role === 'other') {
      existingProfile = await OtherProfile.findByUserId(req.userId);
    }

    // Delete old profile image from S3 if it exists
    // Check both profile_image_url (player/coach) and profile_picture_url (other)
    const existingImageUrl = existingProfile?.profile_image_url || existingProfile?.profile_picture_url;
    if (existingImageUrl && existingImageUrl.startsWith('profiles/')) {
      try {
        await deleteFromS3(existingImageUrl);
        console.log('Deleted old profile image:', existingImageUrl);
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
    } else if (req.user.role === 'other') {
      // Other profiles use profile_picture_url column
      await OtherProfile.update(req.userId, { profile_picture_url: s3Key });
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

// Upload post media to S3 (supports multiple files)
router.post('/post-media', authMiddleware, postMediaUpload.array('media', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedMedia = [];
    let overallMediaType = 'image';
    let hasVideo = false;
    let hasImage = false;

    // Upload each file to S3
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video/');
      const mediaType = isVideo ? 'video' : 'image';

      if (isVideo) hasVideo = true;
      else hasImage = true;

      // Generate S3 key
      const s3Key = generatePostMediaKey(req.userId, file.originalname, mediaType);

      // Upload to S3
      await uploadToS3(file.buffer, s3Key, file.mimetype);

      // Generate signed URL for immediate display
      const signedUrl = await getSignedS3Url(s3Key);

      uploadedMedia.push({
        s3Key: s3Key,
        url: signedUrl,
        media_type: mediaType,
        size: file.size,
        originalName: file.originalname
      });

      console.log('Post media uploaded to S3:', {
        key: s3Key,
        contentType: file.mimetype,
        size: file.size
      });
    }

    // Determine overall media type
    if (hasVideo && hasImage) {
      overallMediaType = 'mixed';
    } else if (hasVideo) {
      overallMediaType = 'video';
    } else {
      overallMediaType = 'image';
    }

    res.json({
      message: 'Media uploaded successfully',
      media: uploadedMedia,
      media_type: overallMediaType,
      // For backwards compatibility with single file uploads
      url: uploadedMedia[0]?.url,
      s3Key: uploadedMedia[0]?.s3Key
    });
  } catch (error) {
    console.error('Upload post media error:', error);
    if (error.message && error.message.includes('Only image files')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

module.exports = router;
