-- Migration: 045_backfill_school_amp_encoding
-- Date: 2026-06-03
-- Description: One-time data backfill. The global sanitizeBody middleware
--              (backend/middleware/validation.js) used to entity-ENCODE bare
--              characters that sanitize-html leaves behind (&->&amp;, <->&lt;,
--              >->&gt;, plus &quot; / &#39;). That corrupted school names at rest
--              — e.g. "West Texas A&M University" was stored as "...A&amp;M..." —
--              which broke exact-string matching against school-logos.json
--              (logo lookup + invite preselect). The middleware now decodes those
--              entities back to literal text. This migration repairs rows that
--              were already written corrupted.
--
--              Scope (per plan): the three school columns that flow through the
--              admin lock -> invite -> coach profile chain. Player/coach bios and
--              post content are intentionally NOT touched here.
--
--              ORDER MATTERS: replace &amp; LAST. A user's literal "&lt;" was
--              stored as "&amp;lt;"; decoding &amp; first would collapse it to
--              "<". Decoding &amp; last restores the literal "&lt;" string.
--
--              IDEMPOTENT: the WHERE guards only match rows that still contain an
--              encoded entity, so re-running is a no-op. (A genuinely
--              double-encoded value would need a second pass — verify zero
--              remaining with the SELECTs at the bottom.)

-- coach_signup_requests.locked_school
UPDATE coach_signup_requests
SET locked_school = replace(replace(replace(replace(replace(
      locked_school, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')
WHERE locked_school LIKE '%&amp;%' OR locked_school LIKE '%&lt;%'
   OR locked_school LIKE '%&gt;%' OR locked_school LIKE '%&quot;%' OR locked_school LIKE '%&#39;%';

-- coach_invites.school
UPDATE coach_invites
SET school = replace(replace(replace(replace(replace(
      school, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')
WHERE school LIKE '%&amp;%' OR school LIKE '%&lt;%'
   OR school LIKE '%&gt;%' OR school LIKE '%&quot;%' OR school LIKE '%&#39;%';

-- coach_profiles.team_name
UPDATE coach_profiles
SET team_name = replace(replace(replace(replace(replace(
      team_name, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')
WHERE team_name LIKE '%&amp;%' OR team_name LIKE '%&lt;%'
   OR team_name LIKE '%&gt;%' OR team_name LIKE '%&quot;%' OR team_name LIKE '%&#39;%';

-- Verification (should each return 0 after running):
--   SELECT COUNT(*) FROM coach_signup_requests WHERE locked_school LIKE '%&amp;%';
--   SELECT COUNT(*) FROM coach_invites WHERE school LIKE '%&amp;%';
--   SELECT COUNT(*) FROM coach_profiles WHERE team_name LIKE '%&amp;%';
