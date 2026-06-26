-- add-push-enabled.sql (local-dev seed mirror of backend/migrations/052_add_push_enabled.sql)
-- Push-notification on/off control.
--
-- users.push_enabled       - account-wide source of truth for the iOS push
--                            toggle. notifyUser() skips the APNs fan-out when
--                            this is false, so a single switch governs every
--                            notification type (messages, follows, likes,
--                            comments, recruiting, etc.). Default true.
-- device_tokens.enabled    - per-device send filter kept in sync with the
--                            account-wide flag (defense in depth). notifyUser()
--                            only sends to enabled tokens. Default true.
--
-- Both default true so existing users/devices keep receiving pushes. Idempotent.
-- Local-dev counterpart of prod migration 052 — User.findById SELECTs push_enabled,
-- so a fresh local seed without this column 500s every authenticated request.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE device_tokens
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_enabled
  ON device_tokens(user_id) WHERE enabled;
