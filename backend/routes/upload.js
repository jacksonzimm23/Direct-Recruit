const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { uploadToS3, getSignedS3Url, getSignedVideoUrl, generateProfileImageKey, generatePostMediaKey, generateMessageMediaKey, deleteFromS3 } = require('../utils/s3');
const { validateBufferMagic, validateFileMagic } = require('../utils/file-magic');
const logger = require('../utils/logger');

// Memory storage for small profile-image uploads (5MB max — buffer is fine).
const memoryStorage = multer.memoryStorage();

// Security #16: disk storage for large video uploads. Multer writes the
// multipart body straight to disk so we don't pin 200-500MB in Node's heap
// for the duration of the upload. Routes read the temp file into a Buffer
// just before the S3 PUT and unlink it in finally.
const TMP_UPLOAD_DIR = path.join(os.tmpdir(), 'dr-uploads');
if (!fs.existsSync(TMP_UPLOAD_DIR)) {
  fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
}

const videoDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const stamp = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, `${stamp}${ext}`);
  }
});

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
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
    fields: 20, // cap non-file fields (DoS mitigation, CVE append-field nesting)
    fieldNestingDepth: 1 // app uses flat field names; reject bracket nesting (a[b][c])
  }
});

// Multer config for message media (images and videos, same limits as post media)
const messageMediaUpload = multer({
  storage: videoDiskStorage,
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedVideoTypes = /mp4|mov|avi|webm|mkv|m4v/;
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
    fileSize: 200 * 1024 * 1024,
    fields: 20, // cap non-file fields (DoS mitigation, CVE append-field nesting)
    fieldNestingDepth: 1 // app uses flat field names; reject bracket nesting (a[b][c])
  }
});

// Multer config for post media (images and videos, 200MB max for videos up to ~5 min)
const postMediaUpload = multer({
  storage: videoDiskStorage,
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
    fileSize: 200 * 1024 * 1024, // 200MB max for videos (~5 min at 1080p)
    fields: 20, // cap non-file fields (DoS mitigation, CVE append-field nesting)
    fieldNestingDepth: 1 // app uses flat field names; reject bracket nesting (a[b][c])
  }
});

// Upload profile image to S3
router.post('/profile-image', authMiddleware, s3Upload.single('profile_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Security #38: validate magic bytes before any DB/S3 work. The multer
    // fileFilter only checks client-supplied mimetype + extension, both of
    // which an attacker controls.
    const magic = await validateBufferMagic(req.file.buffer, 'profile_image');
    if (!magic.ok) {
      logger.warn(`[upload] profile-image rejected by magic check: ${magic.error}`);
      return res.status(400).json({ error: 'Uploaded file is not a valid image' });
    }
    // Override the mimetype with the detected one so S3 receives the truth,
    // not the client's claim.
    req.file.mimetype = magic.detected;

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
        logger.info('Deleted old profile image:', existingImageUrl);
      } catch (deleteError) {
        // Log but don't fail the upload if delete fails
        logger.error('Failed to delete old profile image:', deleteError);
      }
    }

    // Generate S3 key for the profile image
    const s3Key = generateProfileImageKey(req.userId, req.file.originalname);

    // Upload to S3
    await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

    logger.info('File uploaded to S3:', {
      key: s3Key,
      contentType: req.file.mimetype,
      size: req.file.size
    });

    // Generate signed URL for immediate display
    const signedUrl = await getSignedS3Url(s3Key);

    // Update user profile with S3 key (not the full URL).
    // Uses dedicated updateProfileImage() — does NOT go through allowedColumns,
    // so an authenticated user cannot inject another user's S3 key via PUT
    // /api/profile (security #22). The s3Key here is generated server-side
    // via generateProfileImageKey(req.userId, ...) which roots the key in the
    // authenticated user's own folder.
    if (req.user.role === 'player') {
      await PlayerProfile.updateProfileImage(req.userId, s3Key);
    } else if (req.user.role === 'coach') {
      await CoachProfile.updateProfileImage(req.userId, s3Key);
    } else if (req.user.role === 'other') {
      await OtherProfile.updateProfileImage(req.userId, s3Key);
    }

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: signedUrl,
      url: signedUrl, // Keep for backwards compatibility
      s3Key: s3Key
    });
  } catch (error) {
    logger.error('Upload profile image error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload post media to S3 (supports multiple files)
router.post('/post-media', authMiddleware, postMediaUpload.array('media', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Security #38: magic-byte validation per file BEFORE any S3 PUT.
    // If any file fails, reject the whole batch — temp-file cleanup runs
    // in the outer finally below either way.
    for (const file of req.files) {
      const magic = await validateFileMagic(file.path, 'post_media');
      if (!magic.ok) {
        logger.warn(`[upload] post-media rejected by magic check: ${magic.error}`);
        // Clean up temp files now since we're returning before the outer try.
        await Promise.all(req.files.map(f =>
          fs.promises.unlink(f.path).catch(() => {})
        ));
        return res.status(400).json({ error: 'One or more files are not valid images or videos' });
      }
      file.mimetype = magic.detected;
    }

    const uploadedMedia = [];
    let overallMediaType = 'image';
    let hasVideo = false;
    let hasImage = false;

    try {
      // Upload each file to S3
      for (const file of req.files) {
        const isVideo = file.mimetype.startsWith('video/');
        const mediaType = isVideo ? 'video' : 'image';

        if (isVideo) hasVideo = true;
        else hasImage = true;

        const s3Key = generatePostMediaKey(req.userId, file.originalname, mediaType);

        const fileBuffer = await fs.promises.readFile(file.path);
        await uploadToS3(fileBuffer, s3Key, file.mimetype);

        const signedUrl = await getSignedS3Url(s3Key);

        uploadedMedia.push({
          s3Key: s3Key,
          url: signedUrl,
          media_type: mediaType,
          size: file.size,
          originalName: file.originalname
        });

        logger.info('Post media uploaded to S3:', {
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
    } finally {
      // Security #16: best-effort cleanup of ALL temp files, including any
      // that weren't yet uploaded (in case the for-loop threw partway through).
      await Promise.all(req.files.map(f =>
        fs.promises.unlink(f.path).catch(err => {
          logger.warn('Failed to delete temp upload:', f.path, err.message);
        })
      ));
    }
  } catch (error) {
    logger.error('Upload post media error:', error);
    if (error.message && error.message.includes('Only image files')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// Upload a single message attachment (image or video) to S3
router.post('/message-media', authMiddleware, messageMediaUpload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Security #38: magic-byte validation BEFORE S3 PUT.
    const magic = await validateFileMagic(req.file.path, 'message_media');
    if (!magic.ok) {
      logger.warn(`[upload] message-media rejected by magic check: ${magic.error}`);
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Uploaded file is not a valid image or video' });
    }
    req.file.mimetype = magic.detected;

    const isVideo = req.file.mimetype.startsWith('video/');
    const mediaType = isVideo ? 'video' : 'image';
    const s3Key = generateMessageMediaKey(req.userId, req.file.originalname, mediaType);

    try {
      const fileBuffer = await fs.promises.readFile(req.file.path);
      await uploadToS3(fileBuffer, s3Key, req.file.mimetype);

      const signedUrl = isVideo ? await getSignedVideoUrl(s3Key) : await getSignedS3Url(s3Key);

      logger.info('Message media uploaded to S3:', {
        key: s3Key,
        contentType: req.file.mimetype,
        size: req.file.size
      });

      res.json({
        message: 'Media uploaded successfully',
        s3Key: s3Key,
        url: signedUrl,
        media_type: mediaType,
        size: req.file.size,
        originalName: req.file.originalname
      });
    } finally {
      // Security #16: best-effort temp-file cleanup, runs on success and error.
      fs.promises.unlink(req.file.path).catch(err => {
        logger.warn('Failed to delete temp upload:', req.file.path, err.message);
      });
    }
  } catch (error) {
    logger.error('Upload message media error:', error);
    if (error.message && (error.message.includes('Only image files') || error.message.includes('File too large'))) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

module.exports = router;
