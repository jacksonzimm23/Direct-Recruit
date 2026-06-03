-- Local-dev twin of backend/migrations/045_backfill_school_amp_encoding.sql
--
-- One-time data repair for local Docker postgres. The old sanitizeBody middleware
-- entity-encoded bare characters (&->&amp; etc.), corrupting school names at rest.
-- The middleware now decodes them; this fixes rows already written corrupted by
-- prior local testing.
--
-- NOT added to the MIGRATIONS array in seed-local.js: a fresh `npm run seed` never
-- produces corrupted rows, so this only needs to run against an existing dirty DB.
--
-- Run once (PowerShell pipe, NOT `<` redirection):
--   Get-Content backend/scripts/backfill-school-amp-encoding.sql | docker exec -i dr-postgres psql -U postgres -d direct_recruit
--
-- ORDER MATTERS: replace &amp; LAST (see migration 045 header for why).
-- IDEMPOTENT: WHERE guards only match still-encoded rows, so re-running is a no-op.

UPDATE coach_signup_requests
SET locked_school = replace(replace(replace(replace(replace(
      locked_school, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')
WHERE locked_school LIKE '%&amp;%' OR locked_school LIKE '%&lt;%'
   OR locked_school LIKE '%&gt;%' OR locked_school LIKE '%&quot;%' OR locked_school LIKE '%&#39;%';

UPDATE coach_invites
SET school = replace(replace(replace(replace(replace(
      school, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')
WHERE school LIKE '%&amp;%' OR school LIKE '%&lt;%'
   OR school LIKE '%&gt;%' OR school LIKE '%&quot;%' OR school LIKE '%&#39;%';

UPDATE coach_profiles
SET team_name = replace(replace(replace(replace(replace(
      team_name, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')
WHERE team_name LIKE '%&amp;%' OR team_name LIKE '%&lt;%'
   OR team_name LIKE '%&gt;%' OR team_name LIKE '%&quot;%' OR team_name LIKE '%&#39;%';
