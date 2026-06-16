// ==================== CSV Export Helpers (shared) ====================
// Generic CSV building + save. RFC-4180 compliant, UTF-8 with BOM (so Excel /
// Teamworks read it correctly), CRLF line endings.
//
// saveCsv() branches by platform:
//   - iOS app (Capacitor WebView): a hidden <a download> does NOT reliably save
//     a file, so write the CSV to a cache file and open the native iOS share
//     sheet (Save to Files / AirDrop / Mail) via @capacitor/filesystem +
//     @capacitor/share.
//   - Web / desktop / mobile Safari: standard Blob + <a download>.
//
// Exposed on window: csvEscapeField, buildCsv, saveCsv.

(function () {
    // RFC-4180: a field needs quoting if it contains a comma, double-quote, CR,
    // or LF. Inner double-quotes are escaped by doubling them.
    function csvEscapeField(value) {
        if (value === null || value === undefined) return '';
        var s = String(value);
        if (/[",\r\n]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    // headers: string[]; rows: Array<Array<any>> (each inner array aligns to headers).
    // Returns the full CSV text with a leading UTF-8 BOM and CRLF line endings.
    function buildCsv(headers, rows) {
        var lines = [];
        lines.push(headers.map(csvEscapeField).join(','));
        for (var i = 0; i < rows.length; i++) {
            lines.push(rows[i].map(csvEscapeField).join(','));
        }
        // ﻿ BOM => Excel/Teamworks detect UTF-8 instead of mangling accents.
        return '﻿' + lines.join('\r\n');
    }

    function isIOSApp() {
        try {
            return !!(window.API && typeof window.API.isIOSApp === 'function' && window.API.isIOSApp());
        } catch (_) {
            return document.documentElement.classList.contains('ios-app');
        }
    }

    // Web/desktop: Blob + hidden anchor download.
    function webDownload(filename, csvString) {
        var blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke on the next tick so the click has consumed the URL.
        setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }

    // iOS app: write to a cache file, then open the native share sheet.
    // Returns a Promise. Falls back to webDownload on any failure.
    async function iosShare(filename, csvString) {
        var Plugins = window.Capacitor && window.Capacitor.Plugins;
        var Filesystem = Plugins && Plugins.Filesystem;
        var Share = Plugins && Plugins.Share;
        if (!Filesystem || !Share) {
            // Plugins not present (e.g. not synced yet) — degrade to web path.
            webDownload(filename, csvString);
            return;
        }
        try {
            // 'Cache' directory: ephemeral, no permission prompt. utf8 encoding
            // preserves the BOM + content as written.
            var writeRes = await Filesystem.writeFile({
                path: filename,
                data: csvString,
                directory: 'CACHE',
                encoding: 'utf8'
            });
            var uri = (writeRes && writeRes.uri)
                ? writeRes.uri
                : (await Filesystem.getUri({ path: filename, directory: 'CACHE' })).uri;
            await Share.share({
                title: filename,
                url: uri,
                dialogTitle: 'Export recruiting board'
            });
        } catch (err) {
            // User cancelling the share sheet throws — that's not an error to
            // surface. Anything else: fall back to the web download path.
            var msg = (err && err.message) || '';
            if (msg.indexOf('cancel') === -1 && msg.indexOf('Cancel') === -1) {
                try { webDownload(filename, csvString); } catch (_) {}
            }
        }
    }

    // Public: save a CSV, choosing the right mechanism for the platform.
    // Returns a Promise (resolves once the save/share is initiated).
    async function saveCsv(filename, csvString) {
        if (isIOSApp()) {
            await iosShare(filename, csvString);
        } else {
            webDownload(filename, csvString);
        }
    }

    window.csvEscapeField = csvEscapeField;
    window.buildCsv = buildCsv;
    window.saveCsv = saveCsv;
})();
