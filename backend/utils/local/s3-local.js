/**
 * Local development mock for AWS S3 file storage.
 * Saves files to backend/uploads/ and serves them via Express static middleware.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function uploadToS3(fileBuffer, key, contentType) {
  const filePath = path.join(UPLOADS_DIR, key);
  const dir = path.dirname(filePath);

  // Create subdirectories as needed
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, fileBuffer);
  console.log(`[LOCAL S3] Uploaded: ${key} (${contentType})`);
  return key;
}

async function getSignedS3Url(key, expiresIn = 3600) {
  if (!key) return null;
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}/uploads/${key}`;
}

async function getSignedVideoUrl(key) {
  if (!key) return null;
  return getSignedS3Url(key, 21600);
}

async function deleteFromS3(key) {
  if (!key) return;
  const filePath = path.join(UPLOADS_DIR, key);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[LOCAL S3] Deleted: ${key}`);
    }
  } catch (err) {
    console.error(`[LOCAL S3] Delete failed for ${key}:`, err.message);
  }
}

// These key generators are identical to the real s3.js — they don't touch AWS
function generateProfileImageKey(userId, originalFilename) {
  const extension = originalFilename.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  return `profiles/${userId}/avatar-${timestamp}.${extension}`;
}

function generateHighlightVideoKey(userId, originalFilename) {
  const extension = originalFilename.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  return `highlights/${userId}/video-${timestamp}.${extension}`;
}

function generatePostMediaKey(userId, originalFilename, mediaType = 'image') {
  const extension = originalFilename.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `post-media/${userId}/${mediaType}-${timestamp}-${randomId}.${extension}`;
}

module.exports = {
  uploadToS3,
  getSignedS3Url,
  getSignedVideoUrl,
  deleteFromS3,
  generateProfileImageKey,
  generateHighlightVideoKey,
  generatePostMediaKey,
  s3Client: null,
  BUCKET_NAME: 'local-dev'
};
