// ==================== Native Camera Helpers (Phase 4b) ====================
// Wraps @capacitor/camera for iOS-native media pickers. Only works when
// API.isIOSApp() is true (caller should gate before using).
//
// Callers get File objects back — matching the web <input type="file">
// shape — so downstream code (image-cropper, FormData uploads) stays
// identical across platforms.
//
// Phase 4b-I exports: pickProfilePhoto, base64ToFile
// Phase 4b-II will add: pickPostPhotos, pickPostVideo
// Phase 4b-III will add: pickHighlightVideo, pickMessageImage

(function () {
    // Convert a Capacitor base64 string (no data: prefix) to a File.
    // We add the mime prefix + use fetch trick to get a Blob efficiently.
    async function base64ToFile(base64, filename, mimeType) {
        const response = await fetch('data:' + mimeType + ';base64,' + base64);
        const blob = await response.blob();
        return new File([blob], filename, { type: mimeType });
    }

    // Phase 4b-I: pick a single profile photo.
    // Returns { file, cancelled, error }.
    async function pickProfilePhoto(opts) {
        opts = opts || {};
        try {
            const Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
            if (!Camera) {
                return { file: null, cancelled: false, error: 'Camera plugin not available' };
            }

            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,        // Our image-cropper.js handles crop
                resultType: 'base64',
                source: 'Prompt',           // Native "Take Photo or Choose from Library"
                saveToGallery: false,
                width: opts.maxWidth || 1024,
                correctOrientation: true
            });

            if (!photo || !photo.base64String) {
                return { file: null, cancelled: true };
            }

            const mimeType = 'image/' + (photo.format === 'png' ? 'png' : 'jpeg');
            const ext = photo.format === 'png' ? 'png' : 'jpg';
            const file = await base64ToFile(photo.base64String, 'profile.' + ext, mimeType);
            return { file: file, cancelled: false };
        } catch (e) {
            // Capacitor throws a specific message on user cancel — treat separately
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED')) {
                return { file: null, cancelled: true };
            }
            return { file: null, cancelled: false, error: msg || 'Camera failed' };
        }
    }

    // Phase 4b-II: convert a Capacitor webPath URI to a File object.
    // webPath is a capacitor://... URL accessible via fetch inside the WebView.
    async function webPathToFile(webPath, filename, mimeType) {
        const response = await fetch(webPath);
        const blob = await response.blob();
        return new File([blob], filename, { type: mimeType });
    }

    // Phase 4b-II: multi-select photos from the iOS photo library.
    // Returns { files: File[], cancelled, error }.
    async function pickPostPhotos(opts) {
        opts = opts || {};
        try {
            const Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
            if (!Camera) return { files: [], cancelled: false, error: 'Camera plugin not available' };

            const result = await Camera.pickImages({
                quality: 90,
                limit: opts.limit || 4,
                correctOrientation: true
            });

            if (!result || !result.photos || result.photos.length === 0) {
                return { files: [], cancelled: true };
            }

            const files = [];
            for (let i = 0; i < result.photos.length; i++) {
                const photo = result.photos[i];
                const mime = 'image/' + (photo.format === 'png' ? 'png' : 'jpeg');
                const ext = photo.format === 'png' ? 'png' : 'jpg';
                const path = photo.webPath || photo.path;
                if (!path) continue;
                try {
                    const file = await webPathToFile(path, 'photo-' + Date.now() + '-' + i + '.' + ext, mime);
                    files.push(file);
                } catch (convErr) {
                    console.error('[NativeCamera] photo conversion failed:', convErr);
                }
            }
            return { files: files, cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED')) {
                return { files: [], cancelled: true };
            }
            return { files: [], cancelled: false, error: msg || 'Photo picker failed' };
        }
    }

    // Phase 4b-II: pick a single video from the iOS library or camera.
    // Returns { file: File|null, cancelled, error }.
    async function pickPostVideo() {
        try {
            const Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
            if (!Camera) return { file: null, cancelled: false, error: 'Camera plugin not available' };
            if (typeof Camera.getVideo !== 'function') {
                return { file: null, cancelled: false, error: 'Video picker not available in this plugin version' };
            }

            const video = await Camera.getVideo({ source: 'Prompt' });
            const path = video && (video.webPath || video.path);
            if (!path) return { file: null, cancelled: true };

            const file = await webPathToFile(path, 'video-' + Date.now() + '.mp4', 'video/mp4');
            return { file: file, cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED')) {
                return { file: null, cancelled: true };
            }
            return { file: null, cancelled: false, error: msg || 'Video picker failed' };
        }
    }

    // Phase 4b-II: bottom-sheet action picker — Photos / Video / Cancel.
    // onFilesPicked: async (File[]) => void. Called ONCE with picked files (if any).
    // remaining: how many slots are still available (clamps pickImages limit).
    // Returns a Promise that resolves when the sheet closes.
    function showPostMediaSheet(onFilesPicked, remaining) {
        const limit = Math.max(1, Math.min(4, remaining || 4));

        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'ios-media-sheet-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:flex-end;justify-content:center;';
            overlay.innerHTML =
                '<div style="background:#0a1128;border-radius:14px 14px 0 0;padding:16px;width:100%;max-width:500px;box-shadow:0 -4px 24px rgba(0,0,0,0.4);padding-bottom:calc(16px + env(safe-area-inset-bottom));">' +
                '<button type="button" data-choice="photos" style="display:block;width:100%;padding:14px;background:#1282a2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:8px;cursor:pointer;">📷 Add Photos</button>' +
                '<button type="button" data-choice="video" style="display:block;width:100%;padding:14px;background:#1282a2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:8px;cursor:pointer;">🎥 Add Video</button>' +
                '<button type="button" data-choice="cancel" style="display:block;width:100%;padding:14px;background:transparent;color:#8892b0;border:1px solid rgba(100,116,152,0.3);border-radius:8px;font-size:16px;cursor:pointer;">Cancel</button>' +
                '</div>';
            document.body.appendChild(overlay);

            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

            overlay.addEventListener('click', async function (e) {
                // Tap outside sheet = cancel
                if (e.target === overlay) { close(); resolve(); return; }
                const choice = e.target && e.target.dataset && e.target.dataset.choice;
                if (!choice) return;
                close();

                try {
                    if (choice === 'photos') {
                        const r = await pickPostPhotos({ limit: limit });
                        if (r.files && r.files.length) {
                            await onFilesPicked(r.files);
                        } else if (r.error && window.showToast) {
                            window.showToast('Photo picker failed: ' + r.error, 'error');
                        }
                    } else if (choice === 'video') {
                        const r = await pickPostVideo();
                        if (r.file) {
                            await onFilesPicked([r.file]);
                        } else if (r.error && window.showToast) {
                            window.showToast('Video picker failed: ' + r.error, 'error');
                        }
                    }
                } catch (cbErr) {
                    console.error('[NativeCamera] onFilesPicked failed:', cbErr);
                }
                resolve();
            });
        });
    }

    // Phase 4b-III: pick a single image for a message attachment.
    // No cropping, no forced resize — send the original.
    // Returns { file, cancelled, error }.
    async function pickMessageImage() {
        try {
            const Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
            if (!Camera) return { file: null, cancelled: false, error: 'Camera plugin not available' };

            const photo = await Camera.getPhoto({
                quality: 85,
                allowEditing: false,
                resultType: 'base64',
                source: 'Prompt',
                saveToGallery: false,
                correctOrientation: true
            });

            if (!photo || !photo.base64String) return { file: null, cancelled: true };

            const mimeType = 'image/' + (photo.format === 'png' ? 'png' : 'jpeg');
            const ext = photo.format === 'png' ? 'png' : 'jpg';
            const file = await base64ToFile(photo.base64String, 'message-' + Date.now() + '.' + ext, mimeType);
            return { file: file, cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED')) {
                return { file: null, cancelled: true };
            }
            return { file: null, cancelled: false, error: msg || 'Camera failed' };
        }
    }

    // Phase 4b-III: pick a single video for a message attachment.
    async function pickMessageVideo() {
        try {
            const Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
            if (!Camera) return { file: null, cancelled: false, error: 'Camera plugin not available' };
            if (typeof Camera.getVideo !== 'function') {
                return { file: null, cancelled: false, error: 'Video picker not available in this plugin version' };
            }

            const video = await Camera.getVideo({ source: 'Prompt' });
            const path = video && (video.webPath || video.path);
            if (!path) return { file: null, cancelled: true };

            const file = await webPathToFile(path, 'message-video-' + Date.now() + '.mp4', 'video/mp4');
            return { file: file, cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED')) {
                return { file: null, cancelled: true };
            }
            return { file: null, cancelled: false, error: msg || 'Video picker failed' };
        }
    }

    // Phase 4b-III: bottom-sheet for message attachments — Photo / Video / Cancel.
    // onFilePicked: async (File, mediaType) => void. Called ONCE with the picked file.
    function showMessageMediaSheet(onFilePicked) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'ios-media-sheet-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:flex-end;justify-content:center;';
            overlay.innerHTML =
                '<div style="background:#0a1128;border-radius:14px 14px 0 0;padding:16px;width:100%;max-width:500px;box-shadow:0 -4px 24px rgba(0,0,0,0.4);padding-bottom:calc(16px + env(safe-area-inset-bottom));">' +
                '<button type="button" data-choice="photo" style="display:block;width:100%;padding:14px;background:#1282a2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:8px;cursor:pointer;">📷 Photo</button>' +
                '<button type="button" data-choice="video" style="display:block;width:100%;padding:14px;background:#1282a2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:8px;cursor:pointer;">🎥 Video</button>' +
                '<button type="button" data-choice="cancel" style="display:block;width:100%;padding:14px;background:transparent;color:#8892b0;border:1px solid rgba(100,116,152,0.3);border-radius:8px;font-size:16px;cursor:pointer;">Cancel</button>' +
                '</div>';
            document.body.appendChild(overlay);

            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

            overlay.addEventListener('click', async function (e) {
                if (e.target === overlay) { close(); resolve(); return; }
                const choice = e.target && e.target.dataset && e.target.dataset.choice;
                if (!choice) return;
                close();

                try {
                    if (choice === 'photo') {
                        const r = await pickMessageImage();
                        if (r.file) await onFilePicked(r.file, 'image');
                        else if (r.error && window.showToast) window.showToast('Photo picker failed: ' + r.error, 'error');
                    } else if (choice === 'video') {
                        const r = await pickMessageVideo();
                        if (r.file) await onFilePicked(r.file, 'video');
                        else if (r.error && window.showToast) window.showToast('Video picker failed: ' + r.error, 'error');
                    }
                } catch (cbErr) {
                    console.error('[NativeCamera] onFilePicked failed:', cbErr);
                }
                resolve();
            });
        });
    }

    // Unified native picker (photos AND videos) via @capawesome/capacitor-file-picker.
    // FilePicker.pickMedia shows the STANDARD iOS media picker — same Apple sheet the
    // profile-photo flow gets, but including videos (the old @capacitor/camera path
    // could not pick video, which is why messages/feed used a custom photo/video sheet).
    // Returns { files: File[], cancelled, error }. opts: { multiple, limit }.
    async function pickMedia(opts) {
        opts = opts || {};
        try {
            const FilePicker = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
            if (!FilePicker) return { files: [], cancelled: false, error: 'FilePicker plugin not available' };

            const result = await FilePicker.pickMedia({ multiple: !!opts.multiple });
            let picked = (result && result.files) || [];
            if (!picked.length) return { files: [], cancelled: true };
            if (opts.limit) picked = picked.slice(0, opts.limit);

            const files = [];
            for (let i = 0; i < picked.length; i++) {
                const f = picked[i];
                const mime = f.mimeType || 'application/octet-stream';
                const name = f.name || ('media-' + Date.now() + '-' + i);
                try {
                    let file;
                    if (f.blob) {
                        // Web returns a real Blob directly.
                        file = new File([f.blob], name, { type: mime });
                    } else if (f.path) {
                        // iOS/Android: convert the native path to a WebView-fetchable URL.
                        const src = (window.Capacitor && window.Capacitor.convertFileSrc)
                            ? window.Capacitor.convertFileSrc(f.path)
                            : f.path;
                        const blob = await (await fetch(src)).blob();
                        file = new File([blob], name, { type: mime });
                    } else {
                        continue;
                    }
                    files.push(file);
                } catch (convErr) {
                    console.error('[NativeCamera] pickMedia conversion failed:', convErr);
                }
            }
            return { files: files, cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED') || (e && e.code === 'OS-PLUGIN-FILEPICKER-0001')) {
                return { files: [], cancelled: true };
            }
            return { files: [], cancelled: false, error: msg || 'Media picker failed' };
        }
    }

    // Convert a FilePicker result file list ({blob?, path, mimeType, name}) to
    // File[]. Same conversion pickMedia does inline; shared by the video-only
    // pickers below.
    async function _pickedToFiles(picked) {
        const files = [];
        for (let i = 0; i < picked.length; i++) {
            const f = picked[i];
            const mime = f.mimeType || 'application/octet-stream';
            const name = f.name || ('media-' + Date.now() + '-' + i);
            try {
                let file;
                if (f.blob) {
                    file = new File([f.blob], name, { type: mime });
                } else if (f.path) {
                    const src = (window.Capacitor && window.Capacitor.convertFileSrc)
                        ? window.Capacitor.convertFileSrc(f.path)
                        : f.path;
                    const blob = await (await fetch(src)).blob();
                    file = new File([blob], name, { type: mime });
                } else {
                    continue;
                }
                files.push(file);
            } catch (convErr) {
                console.error('[NativeCamera] file conversion failed:', convErr);
            }
        }
        return files;
    }

    // Video-only photo-library picker (FilePicker.pickVideos — same Apple sheet
    // as pickMedia but filtered to videos). Returns { files, cancelled, error }.
    async function pickVideos(opts) {
        opts = opts || {};
        try {
            const FilePicker = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
            if (!FilePicker) return { files: [], cancelled: false, error: 'FilePicker plugin not available' };

            const result = await FilePicker.pickVideos({ multiple: !!opts.multiple });
            let picked = (result && result.files) || [];
            if (!picked.length) return { files: [], cancelled: true };
            if (opts.limit) picked = picked.slice(0, opts.limit);
            return { files: await _pickedToFiles(picked), cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED') || (e && e.code === 'OS-PLUGIN-FILEPICKER-0001')) {
                return { files: [], cancelled: true };
            }
            return { files: [], cancelled: false, error: msg || 'Video picker failed' };
        }
    }

    // Files-app (document) picker restricted to video types — for highlight
    // clips saved outside the camera roll (e.g. Hudl downloads). FilePicker's
    // `types` option doesn't support wildcards, so list the formats the
    // backend accepts (MP4, MOV, AVI, WebM, M4V).
    async function pickVideoFiles() {
        try {
            const FilePicker = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
            if (!FilePicker) return { files: [], cancelled: false, error: 'FilePicker plugin not available' };

            const result = await FilePicker.pickFiles({
                types: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v'],
                limit: 1
            });
            const picked = (result && result.files) || [];
            if (!picked.length) return { files: [], cancelled: true };
            return { files: await _pickedToFiles(picked), cancelled: false };
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('cancel') || msg.includes('Cancel') || (e && e.code === 'USER_CANCELLED') || (e && e.code === 'OS-PLUGIN-FILEPICKER-0001')) {
                return { files: [], cancelled: true };
            }
            return { files: [], cancelled: false, error: msg || 'File picker failed' };
        }
    }

    // Bottom sheet for the highlight-reel upload — Camera Roll / Files / Cancel.
    // onFilePicked: async (File) => void. Called ONCE with the picked video.
    function showHighlightVideoSheet(onFilePicked) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'ios-media-sheet-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:flex-end;justify-content:center;';
            overlay.innerHTML =
                '<div style="background:#0a1128;border-radius:14px 14px 0 0;padding:16px;width:100%;max-width:500px;box-shadow:0 -4px 24px rgba(0,0,0,0.4);padding-bottom:calc(16px + env(safe-area-inset-bottom));">' +
                '<button type="button" data-choice="library" style="display:block;width:100%;padding:14px;background:#1282a2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:8px;cursor:pointer;">🎥 Camera Roll</button>' +
                '<button type="button" data-choice="files" style="display:block;width:100%;padding:14px;background:#1282a2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:8px;cursor:pointer;">📁 Browse Files</button>' +
                '<button type="button" data-choice="cancel" style="display:block;width:100%;padding:14px;background:transparent;color:#8892b0;border:1px solid rgba(100,116,152,0.3);border-radius:8px;font-size:16px;cursor:pointer;">Cancel</button>' +
                '</div>';
            document.body.appendChild(overlay);

            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

            overlay.addEventListener('click', async function (e) {
                if (e.target === overlay) { close(); resolve(); return; }
                const choice = e.target && e.target.dataset && e.target.dataset.choice;
                if (!choice) return;
                close();

                try {
                    if (choice === 'library' || choice === 'files') {
                        const r = (choice === 'library')
                            ? await pickVideos({ multiple: false })
                            : await pickVideoFiles();
                        if (r.files && r.files.length) {
                            await onFilePicked(r.files[0]);
                        } else if (r.error && window.showToast) {
                            window.showToast('Video picker failed: ' + r.error, 'error');
                        }
                    }
                } catch (cbErr) {
                    console.error('[NativeCamera] onFilePicked failed:', cbErr);
                }
                resolve();
            });
        });
    }

    // Expose globally — matches window.IAP / window.API patterns
    window.NativeCamera = {
        pickProfilePhoto: pickProfilePhoto,
        pickPostPhotos: pickPostPhotos,
        pickPostVideo: pickPostVideo,
        showPostMediaSheet: showPostMediaSheet,
        pickMessageImage: pickMessageImage,
        pickMessageVideo: pickMessageVideo,
        showMessageMediaSheet: showMessageMediaSheet,
        pickMedia: pickMedia,
        pickVideos: pickVideos,
        pickVideoFiles: pickVideoFiles,
        showHighlightVideoSheet: showHighlightVideoSheet,
        base64ToFile: base64ToFile,
        webPathToFile: webPathToFile
    };
})();
