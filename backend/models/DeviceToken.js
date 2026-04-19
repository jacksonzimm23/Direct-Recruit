const pool = require('../config/database');

class DeviceToken {
    // Upsert — if same (user_id, token, platform) exists, update last_seen_at + bump metadata.
    static async upsert({ userId, token, platform, environment, appVersion, osVersion }) {
        const env = environment || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
        const result = await pool.query(
            `INSERT INTO device_tokens (user_id, token, platform, environment, app_version, os_version, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, token, platform)
             DO UPDATE SET
                 last_seen_at = CURRENT_TIMESTAMP,
                 environment = EXCLUDED.environment,
                 app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
                 os_version = COALESCE(EXCLUDED.os_version, device_tokens.os_version)
             RETURNING id, user_id, token, platform, environment, created_at, last_seen_at`,
            [userId, token, platform, env, appVersion || null, osVersion || null]
        );
        return result.rows[0];
    }

    static async findByUserId(userId) {
        const result = await pool.query(
            'SELECT * FROM device_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC',
            [userId]
        );
        return result.rows;
    }

    // Used when APNs returns a "BadDeviceToken" or "Unregistered" response
    // (device uninstalled the app) — 4c-II will call this on send failures.
    static async deleteByToken(token) {
        await pool.query('DELETE FROM device_tokens WHERE token = $1', [token]);
    }

    // Touch last_seen_at without changing anything else (optional heartbeat).
    static async touchLastSeen({ userId, token, platform }) {
        await pool.query(
            `UPDATE device_tokens
             SET last_seen_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND token = $2 AND platform = $3`,
            [userId, token, platform]
        );
    }

    // Background cleanup for tokens that haven't been seen in N days.
    static async deleteStale(daysInactive) {
        const days = parseInt(daysInactive, 10);
        if (!Number.isFinite(days) || days < 1) return 0;
        const result = await pool.query(
            `DELETE FROM device_tokens
             WHERE last_seen_at < NOW() - make_interval(days => $1)
             RETURNING id`,
            [days]
        );
        return result.rowCount;
    }
}

module.exports = DeviceToken;
