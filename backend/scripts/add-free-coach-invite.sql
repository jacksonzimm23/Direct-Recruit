-- Local mirror of backend/migrations/041_add_free_coach_invite.sql.
ALTER TABLE coach_invites ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
