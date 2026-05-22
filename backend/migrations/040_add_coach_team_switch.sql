-- Migration 040: College Coach Team Switch Verification Flow
--
-- Extends the existing coach_signup_requests / coach_invites machinery to
-- support intra-collegecoach team switches (a coach moving from one school
-- to another). Distinct from `is_switch` (which means profile-type switch,
-- e.g. HS coach becoming college coach). A team switch is always:
--   is_switch = false, is_team_switch = true.
--
-- Flow: coach requests switch from Edit Profile modal → admin locks new
-- school + division → admin approves → 7-day token emailed to new .edu →
-- coach signs in + confirms → coach_profiles row UPDATEd via
-- CoachProfile.update() (which fires Plan 5A pipeline-handoff cleanup).
--
-- The .edu address is identity-verification only — it is NOT written to
-- users.email. Coaches keep their personal login email across switches.
--
-- 72h cooldown enforced via coach_team_switch_history (only logs successful
-- switches).

ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS is_team_switch BOOLEAN DEFAULT false;
ALTER TABLE coach_invites          ADD COLUMN IF NOT EXISTS is_team_switch BOOLEAN DEFAULT false;

-- Snapshot of the coach's pre-switch identity, captured at request time.
-- Lets the admin UI render "from X to Y" without re-joining coach_profiles
-- (which would otherwise show the coach's current school, not the school
-- they were on when the request was filed).
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS old_team_name VARCHAR(200);
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS old_division  VARCHAR(20);
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS old_state     VARCHAR(50);

-- The NEW state the coach is moving to. The existing schema has school +
-- division + position columns that already store the "new" values on a
-- team-switch row, but no state column — added here. Used by the confirm
-- endpoint to write the new state to coach_profiles.state. Nullable so
-- non-team-switch rows (new signups, profile-type switches) don't need it.
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS state VARCHAR(50);

-- Cooldown ledger — only successful switches are logged. Pending/rejected
-- requests do NOT count toward the 72h window, so a coach can resubmit
-- after a rejection without waiting.
CREATE TABLE IF NOT EXISTS coach_team_switch_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_team_name VARCHAR(200),
    from_division  VARCHAR(20),
    to_team_name   VARCHAR(200),
    to_division    VARCHAR(20),
    invite_token   VARCHAR(64),
    switched_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_switch_history_user
    ON coach_team_switch_history(user_id, switched_at DESC);
