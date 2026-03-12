// In development, use local filesystem instead of AWS S3
if (process.env.NODE_ENV !== 'production') { module.exports = require('./local/s3-local'); return; }

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file content as a buffer
 * @param {string} key - The S3 object key (path)
 * @param {string} contentType - The MIME type of the file
 * @returns {Promise<string>} - The S3 key of the uploaded file
 */
async function uploadToS3(fileBuffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType
  });

  await s3Client.send(command);
  return key;
}

/**
 * Generate a signed URL for accessing a private S3 object
 * @param {string} key - The S3 object key
 * @param {number} expiresIn - URL expiration time in seconds (default 1 hour)
 * @returns {Promise<string>} - The signed URL
 */
async function getSignedS3Url(key, expiresIn = 3600) {
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3
 * @param {string} key - The S3 object key to delete
 */
async function deleteFromS3(key) {
  if (!key) return;

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  await s3Client.send(command);
}

/**
 * Generate S3 key for profile images
 * @param {string} userId - The user's ID
 * @param {string} originalFilename - The original filename
 * @returns {string} - The S3 key
 */
function generateProfileImageKey(userId, originalFilename) {
  const extension = originalFilename.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  return `profiles/${userId}/avatar-${timestamp}.${extension}`;
}

/**
 * Generate S3 key for highlight videos
 * @param {string} userId - The user's ID
 * @param {string} originalFilename - The original filename
 * @returns {string} - The S3 key
 */
function generateHighlightVideoKey(userId, originalFilename) {
  const extension = originalFilename.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  return `highlights/${userId}/video-${timestamp}.${extension}`;
}

/**
 * Get signed URL with longer expiration for videos (6 hours)
 * @param {string} key - The S3 object key
 * @returns {Promise<string>} - The signed URL
 */
async function getSignedVideoUrl(key) {
  if (!key) return null;
  // Videos get 6 hour expiration since they take longer to watch
  return getSignedS3Url(key, 21600);
}

/**
 * Generate S3 key for post media (images/videos)
 * @param {string} userId - The user's ID
 * @param {string} originalFilename - The original filename
 * @param {string} mediaType - 'image' or 'video'
 * @returns {string} - The S3 key
 */
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
  s3Client,
  BUCKET_NAME
};
