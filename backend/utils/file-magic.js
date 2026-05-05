// Security #38: server-side magic-byte validation for uploaded files.
//
// Multer's fileFilter checks the client-supplied mimetype + filename
// extension — both 100% attacker-controllable. An attacker can rename
// `evil.html` to `evil.jpg` and set `Content-Type: image/jpeg`, and
// multer will accept it. This module inspects actual file bytes after
// multer accepts the upload but before it reaches S3.
//
// Uses the `file-type` package (v21.3.1+, the version that patches the ASF
// infinite-loop CVE per Dependabot). v17+ is ESM-only, so we load it via
// dynamic `import()` and cache the resolved module — keeps the rest of the
// backend on CommonJS. The cached promise is awaited inside the (already
// async) validators, so the cost is one import on first call and zero
// thereafter. v17+ renamed the API: fromBuffer/fromFile → fileTypeFromBuffer/
// fileTypeFromFile. Return shape ({ext, mime}) is unchanged.

let _fileTypePromise = null;
function loadFileType() {
  if (!_fileTypePromise) {
    _fileTypePromise = import('file-type');
  }
  return _fileTypePromise;
}

// Allowed MIME types per upload kind. These are the values `file-type`
// emits for each format we accept — kept in sync with the per-route multer
// fileFilter allowlists in routes/upload.js and routes/highlights.js.
//
// Note: `file-type` reports MOV files as `video/quicktime` and AVI as
// `video/x-msvideo` (not the alternative `video/x-ms-video`). M4V is
// reported as `video/x-m4v`.
const ALLOWED_BY_KIND = Object.freeze({
  // Profile images: 5 image formats. No videos, no SVG.
  profile_image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),

  // Post media: images + videos.
  post_media: new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v', 'video/x-matroska'
  ]),

  // Message media: same set as post media.
  message_media: new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v', 'video/x-matroska'
  ]),

  // Highlight videos: video-only, no images.
  highlight_video: new Set([
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v'
  ])
});

/**
 * Inspect a Buffer's magic bytes and validate against an upload kind's
 * allowlist. Used for memory-storage uploads (profile images).
 *
 * @param {Buffer} buffer - The raw file bytes.
 * @param {keyof ALLOWED_BY_KIND} kind - The upload kind.
 * @returns {Promise<{ok: boolean, detected: string|null, error: string|null}>}
 */
async function validateBufferMagic(buffer, kind) {
  const allowed = ALLOWED_BY_KIND[kind];
  if (!allowed) {
    return { ok: false, detected: null, error: `Unknown upload kind: ${kind}` };
  }
  let detected;
  try {
    const { fileTypeFromBuffer } = await loadFileType();
    detected = await fileTypeFromBuffer(buffer);
  } catch (err) {
    return { ok: false, detected: null, error: `Magic-byte detection failed: ${err.message}` };
  }
  if (!detected) {
    return { ok: false, detected: null, error: 'File contents do not match any known image or video format' };
  }
  if (!allowed.has(detected.mime)) {
    return { ok: false, detected: detected.mime, error: `File contents are ${detected.mime}, not an allowed ${kind} type` };
  }
  return { ok: true, detected: detected.mime, error: null };
}

/**
 * Inspect a file path's magic bytes (reads only the first ~4KB; does NOT
 * load the whole file into memory — important for the 500MB highlight
 * uploads). Used for disk-storage uploads (post media, message media,
 * highlights).
 *
 * @param {string} filePath - Absolute path to the file on disk.
 * @param {keyof ALLOWED_BY_KIND} kind - The upload kind.
 * @returns {Promise<{ok: boolean, detected: string|null, error: string|null}>}
 */
async function validateFileMagic(filePath, kind) {
  const allowed = ALLOWED_BY_KIND[kind];
  if (!allowed) {
    return { ok: false, detected: null, error: `Unknown upload kind: ${kind}` };
  }
  let detected;
  try {
    const { fileTypeFromFile } = await loadFileType();
    detected = await fileTypeFromFile(filePath);
  } catch (err) {
    return { ok: false, detected: null, error: `Magic-byte detection failed: ${err.message}` };
  }
  if (!detected) {
    return { ok: false, detected: null, error: 'File contents do not match any known image or video format' };
  }
  if (!allowed.has(detected.mime)) {
    return { ok: false, detected: detected.mime, error: `File contents are ${detected.mime}, not an allowed ${kind} type` };
  }
  return { ok: true, detected: detected.mime, error: null };
}

module.exports = { validateBufferMagic, validateFileMagic, ALLOWED_BY_KIND };
