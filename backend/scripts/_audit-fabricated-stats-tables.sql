-- ============================================================
-- READ-ONLY AUDIT: assistant stats tables with no stats behind them
-- ============================================================
-- Context: before the "never invent player data" fix, the assistant could answer
-- "what are his stats?" with a full [STATS_TABLE] whose numbers were copied out
-- of the system prompt's worked example, for a player with zero game rows.
--
-- Those fabricated tables are still stored in ai_chat_messages, and routes/ai.js
-- replays prior assistant turns verbatim on every follow-up. The prompt now says
-- the attached player block outranks the assistant's own earlier messages, so
-- these rows are defused, not dangerous. This script finds them so you can see
-- how many exist and decide separately whether to remove any.
--
-- PHASE 1 BELOW IS SELECT-ONLY. Phase 2 is written but commented out and is NOT
-- part of the fix. Do not uncomment it without reading Phase 1's output first.
--
-- Run against prod:
--   psql "$DATABASE_URL" -f backend/scripts/_audit-fabricated-stats-tables.sql
-- Locally:
--   Get-Content backend/scripts/_audit-fabricated-stats-tables.sql | `
--     docker exec -i dr-postgres psql -U postgres -d direct_recruit
--
-- Why the check has to be CHAT-scoped, not row-scoped: the fabricated table
-- lives in a conversational reply, and conversational replies are stored with
-- metadata = NULL. The player data arrives on a different (search) message in
-- the same chat. So "was this table grounded?" can only be answered by asking
-- whether ANY message in that chat ever carried a player with real stats.
-- ============================================================

\echo '=== PHASE 1a: chats that produced a stats table with no stats anywhere in the chat ==='

WITH chats_with_real_stats AS (
  -- Any chat where at least one message carried a player with a non-empty stats array.
  SELECT DISTINCT m.chat_id
  FROM ai_chat_messages m
  CROSS JOIN LATERAL jsonb_array_elements(m.metadata -> 'players') AS p
  WHERE jsonb_typeof(m.metadata -> 'players') = 'array'
    AND jsonb_typeof(p -> 'stats') = 'array'
    AND jsonb_array_length(p -> 'stats') > 0
),
tables_emitted AS (
  SELECT m.id, m.chat_id, m.created_at, m.content
  FROM ai_chat_messages m
  WHERE m.role = 'assistant'
    AND m.content LIKE '%[STATS_TABLE]%'
)
SELECT
  c.id                AS chat_id,
  c.chat_type,
  c.title,
  u.email             AS coach_email,
  COUNT(t.id)         AS suspect_table_messages,
  MIN(t.created_at)   AS first_seen,
  MAX(t.created_at)   AS last_seen
FROM tables_emitted t
JOIN ai_chats c ON c.id = t.chat_id
LEFT JOIN users u ON u.id = c.coach_user_id
WHERE t.chat_id NOT IN (SELECT chat_id FROM chats_with_real_stats)
GROUP BY c.id, c.chat_type, c.title, u.email
ORDER BY last_seen DESC;

\echo ''
\echo '=== PHASE 1b: the individual suspect messages (first 400 chars each) ==='

WITH chats_with_real_stats AS (
  SELECT DISTINCT m.chat_id
  FROM ai_chat_messages m
  CROSS JOIN LATERAL jsonb_array_elements(m.metadata -> 'players') AS p
  WHERE jsonb_typeof(m.metadata -> 'players') = 'array'
    AND jsonb_typeof(p -> 'stats') = 'array'
    AND jsonb_array_length(p -> 'stats') > 0
)
SELECT
  m.id AS message_id,
  m.chat_id,
  m.created_at,
  LEFT(m.content, 400) AS content_head
FROM ai_chat_messages m
WHERE m.role = 'assistant'
  AND m.content LIKE '%[STATS_TABLE]%'
  AND m.chat_id NOT IN (SELECT chat_id FROM chats_with_real_stats)
ORDER BY m.created_at DESC
LIMIT 50;

\echo ''
\echo '=== PHASE 1c: scale check - how much AI history exists at all ==='

SELECT
  (SELECT COUNT(*) FROM ai_chats)                                             AS total_chats,
  (SELECT COUNT(*) FROM ai_chat_messages)                                     AS total_messages,
  (SELECT COUNT(*) FROM ai_chat_messages WHERE role = 'assistant')            AS assistant_messages,
  (SELECT COUNT(*) FROM ai_chat_messages
     WHERE role = 'assistant' AND content LIKE '%[STATS_TABLE]%')             AS all_stats_tables,
  (SELECT COUNT(DISTINCT coach_user_id) FROM ai_chats)                        AS distinct_coaches;

-- ============================================================
-- PHASE 2 - NOT PART OF THIS FIX. INTENTIONALLY COMMENTED OUT.
-- ============================================================
-- Only consider this after reading Phase 1 and confirming the rows are test
-- chats. Take a snapshot first. Deleting an assistant turn leaves a user turn
-- with no reply, which is a legal but unusual shape in the chat UI; replacing
-- the body is the gentler option, so both are written out below.
--
-- Option A - replace the fabricated table with a retraction:
--
-- BEGIN;
-- WITH chats_with_real_stats AS (
--   SELECT DISTINCT m.chat_id
--   FROM ai_chat_messages m
--   CROSS JOIN LATERAL jsonb_array_elements(m.metadata -> 'players') AS p
--   WHERE jsonb_typeof(m.metadata -> 'players') = 'array'
--     AND jsonb_typeof(p -> 'stats') = 'array'
--     AND jsonb_array_length(p -> 'stats') > 0
-- )
-- UPDATE ai_chat_messages
-- SET content = 'This earlier reply contained a stats table that was not backed by profile data and has been removed.'
-- WHERE role = 'assistant'
--   AND content LIKE '%[STATS_TABLE]%'
--   AND chat_id NOT IN (SELECT chat_id FROM chats_with_real_stats);
-- -- Review the row count, then COMMIT; or ROLLBACK;
-- ROLLBACK;
--
-- Option B - delete the whole test chat (cascades to its messages):
--
-- BEGIN;
-- DELETE FROM ai_chats WHERE id = '<chat_id from Phase 1a>';
-- ROLLBACK;
-- ============================================================
