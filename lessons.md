# LESSONS.md - Direct Recruit Platform Lessons

> This file is a living document. Every lesson here exists because something went wrong or a non-obvious pattern was discovered. Read this before starting work. Add to it when you learn something new (with user permission). Make sure after every new lesson / task that is not within the LESSON.md file to ask permission to add to this file.

---

## Database & Backend

1. **Always check the actual DB schema before referencing columns.** Past bug: code referenced a `deleted_content` column that didn't exist in the `posts` and `comments` tables. This caused runtime crashes. Run `\d table_name` in psql if unsure.

2. **All profile update endpoints need the same validation as creation endpoints.** The PUT `/profile` and POST `/profile/other` routes were missing validation that existed on the creation routes. Any new profile field must have validation added to ALL profile endpoints — create AND update.

3. **When adding fields to SQL queries, check for column name collisions across JOINed tables.** If two tables both have a `name` or `created_at` column, the query will silently return the wrong value unless you use explicit aliases (`p.name AS player_name, t.name AS team_name`).

4. **S3 keys go in the database, never full URLs.** Presigned URLs expire. Store the S3 key (`profiles/{userId}/avatar-{ts}.jpg`) and generate the presigned URL at read time using `getSignedS3Url()` or `getSignedVideoUrl()`.

---

## Frontend & Cross-Role Patterns

5. **Changes to duplicated patterns must go in all 6 role folders.** The folders are: `hsplayer`, `collegeplayer`, `transferplayer`, `hscoach`, `collegecoach`, `other`. Missing one folder means that role silently breaks — there's no error, the feature just doesn't work for those users.

6. **Profile navigation logic requires checking ALL three fields: `role`, `is_transfer_player`, AND `college_division`.** Skipping any one of these fields causes users to be redirected to the wrong role folder. This logic is duplicated in 20+ files (see Pattern 1 in CLAUDE.md).

7. **Subheader formatting is role-specific — don't assume one pattern fits all.** Each role has its own subtitle format and color. HS Players use `Position • Height • Weight • GradYear` in cerulean. Transfer Players use `Position • Height • Weight • YOE` in red. Coaches use comma-separated `Team, State` in orange. Getting these wrong is visually obvious.

8. **`isInTabsFolder` path detection matters for relative navigation.** Sidebar nav links use relative paths. Code running from `mainpage-*.html` (root of role folder) needs different relative paths than code running from `tabs/*.html` (one level deeper). Test navigation from BOTH contexts.

9. **Reposter info in feed subheaders must match the sidebar format for that role.** When a user reposts, the subheader shown under the reposter's name must follow the same format rules as the sidebar (lesson 7). A past fix specifically addressed this for HS players — the repost subheader didn't include height/weight/eligibility.

---

## Local Development

10. **Port 5432 conflicts: check for a local PostgreSQL installation before debugging "connection refused."** A locally installed PostgreSQL service grabs port 5432 before Docker can. Stop it first: `net stop postgresql-x64-18` in admin PowerShell. This is the #1 cause of "can't connect to database" locally.

11. **Use `localhost`, not `127.0.0.1`, for the frontend Live Server.** Some cookie/CORS settings depend on the hostname being `localhost`. Using the IP address can cause auth failures that look like backend bugs.

12. **Wipe and reset is one command.** When the database gets into a weird state: `docker-compose down -v && docker-compose up -d && cd backend && npm run seed`. Don't try to manually fix corrupted seed data.

---

## General Workflow

13. **Read the file before editing it.** Don't assume you know what a file contains. Column names, function signatures, and HTML structure change frequently. A stale assumption leads to edits that break at runtime.

14. **When a commit fixes a bug, check if the same bug exists elsewhere.** This codebase has heavy duplication (Patterns 1–9). If a bug was found in `hsplayer/mainpage-hsplayer.js`, the same bug likely exists in the other 5 mainpage files.

15. **Test with multiple user roles, not just one.** A change that works for a player might break for a coach or "other" user. At minimum, test with one player role and one coach role.

---

## Recruiting Calendar Feature

16. **AI Rep feature is only for hsplayer and transferplayer roles.** Do not add AI Rep nav links, pages, or sidebar references to `collegeplayer`, `hscoach`, `collegecoach`, or `other` folders. Only these two roles have AI Rep pages (`tabs/ai-rep.html`).

17. **Recruiting calendar data comes from yearly-updated files and must be kept in sync.** The PDF/image files in `docs/recruiting-info/screenshots/` are updated yearly by the NCAA, so the period dates in the recruiting calendar modal (`frontend/collegecoach/tabs/messages.html`) must be updated to match whenever new files are uploaded. The recruiting info spec lives in `docs/recruiting-info/recruiting_info.md`. Divisions covered: D1 FBS, D1 FCS, D2, D3, NJCAA, NAIA.

    **Two data sources to keep in sync each year (both in `frontend/collegecoach/tabs/messages.{html,js}`):**
    1. The **inline Recruiting Period Indicator** strip above the message input — driven by the `RECRUITING_CALENDARS` JS object in `messages.js` (FBS/FCS/D2 only; D3/NAIA/NJCAA short-circuit). When the calendar PDFs change, the `{m1, d1, m2, d2, type, name}` entries must be updated to match. Exceptions are listed first so they take priority over wider ranges in the iteration order.
    2. The **Recruiting Calendar reference modal** (`#rcOverlay` in messages.html) — HTML tables with hand-transcribed dates from the same PDFs. Yearly update touches both.

    Each division tab in the modal also shows a yellow disclaimer banner (`.rc-disclaimer`) reminding coaches that rules change and to verify with their compliance office or ncaa.org / njcaa.org / naia.org — but the disclaimer is not a substitute for actually updating the data, it just covers the gap between releases. Source link on the Overview tab points to `https://www.ncaa.org/sports/2021/2/10/recruiting-calendars-faq.aspx`.

---

## Database Migrations

18. **Every database schema change needs a migration file, and there are two separate migration paths for local dev vs production.**

    **Local dev** uses the seed system (`cd backend && npm run seed`). Migration SQL files live in `backend/scripts/` and are listed in the `MIGRATIONS` array in `backend/scripts/seed-local.js`. The seed script runs them in order on every seed — they must be idempotent (`IF NOT EXISTS`, `IF EXISTS`) so re-running is safe. To add a new migration locally:
    1. Create the SQL file in `backend/scripts/` (e.g., `add-ai-analytics.sql`)
    2. Add the filename to the `MIGRATIONS` array in `seed-local.js`
    3. Either run `npm run seed` or manually apply it via `docker exec -it dr-postgres psql -U postgres -d direct_recruit` and paste the SQL

    **Production** uses a tracked migration system (`cd backend && npm run migrate:prod`). Migration files live in `backend/migrations/` with numbered prefixes (`001_`, `002_`, etc.). The `run-prod-migration.js` script tracks which migrations have been applied in a `schema_migrations` table — it only runs new ones. To add a new migration for prod:
    1. Create the SQL file in `backend/migrations/` (e.g., `001_add_ai_analytics.sql`) — same SQL as the local script, with `IF NOT EXISTS` for safety
    2. Push to GitHub and deploy to EC2: `git pull origin main`
    3. Run on EC2: `cd ~/direct-recruit/backend && npm run migrate:prod`
    4. Check status: `npm run migrate:status`

    **Both files must exist for any schema change** — one in `backend/scripts/` (for local dev seed) and one in `backend/migrations/` (for prod). The SQL content is identical; they just live in different folders for the two systems. Template: `backend/migrations/_TEMPLATE.sql`.

---

## AI Features — Shared Infrastructure

19. **Both AIs use a glossary to interpret natural language into structured queries.** The recruiting assistant and portal intelligence both reference a glossary file (`backend/utils/recruit-assistant-glossary.js` for backend, `frontend/collegecoach/tabs/recruit-assistant-glossary.js` for frontend) that contains football-specific term mappings. This includes position group aliases ("offensive line" → OT/OG/C), size descriptors ("big", "tall", "undersized"), speed terms ("burner", "explosive"), position-specific archetypes ("pocket passer", "slot receiver", "ball hawk"), recruiting terms ("sleeper", "hidden gem"), stat aliases ("threw for" → pass_yds), state abbreviations, division aliases, offer terms, highlight/film terms, and academic terms. The glossary is embedded in Claude's system prompt so it can translate coach language into database filters. Both glossary files must be kept in sync.

---

## AI Recruiting Assistant — Searchable Filters

20. **What coaches can search for with the AI Recruiting Assistant.** The assistant (Claude Haiku) interprets natural language queries into structured filters. These are the database fields/features coaches can search by:
    - **Position** — any of 18 position codes (QB, RB, WR, TE, OT, OG, C, DE, DT, NT, ILB, OLB, CB, S, K, P, LS) plus group aliases ("offensive line", "skill players", "edge rushers", etc.)
    - **State** — full name or abbreviation, with alias mapping
    - **Height** — min/max in inches, with size term interpretation ("tall", "big", "undersized") relative to coach's baseline metrics per position
    - **Weight** — min/max in pounds, with size term interpretation relative to baselines
    - **GPA** — minimum GPA (0.00–4.00), with academic term mapping ("good grades" → 3.0, "honor roll" → 3.5)
    - **Graduation year** — exact year or class terms ("junior", "2026")
    - **Player type** — high school, transfer portal, or both (never college roster players)
    - **College division** — for transfer players: D1 FBS, D1 FCS, D2, D3, NAIA, NJCAA
    - **Eligibility** — years remaining (transfer players only)
    - **Stats** — any stat key from `player_game_stats` JSONB (pass_yds, rush_tds, tackles, sacks, etc.), with career/season/per-game modes, using natural language aliases ("threw for 3000 yards" → pass_yds >= 3000)
    - **Highlights / film** — filter for players who have uploaded highlight videos or have a Hudl profile (`has_highlights` filter)
    - **Offers** — filter by total offer count (`min_count`) and/or offer division (`division`). Examples: "5+ D1 FBS offers", "players with D2 offers". Cannot filter by conference — assistant tells coach it can only filter by division.
    - **Name search** — fuzzy name/username search with similarity scoring
    - **Recruiting terms** — "sleeper" (≤2 offers), "hidden gem", "ready now" (current class), "plug and play", "high ceiling" (above baseline), "local"/"in-state" (coach's state)
    - **Multi-sport** — filter by additional sports the player plays (`other_sports` TEXT[] on `player_profiles`). Two filter keys: `other_sports: ['Basketball', 'Wrestling']` (AND semantics — player must have all listed sports, uses `pp.other_sports @> ARRAY[...]::text[]` containment) and `plays_other_sports: true` (boolean shortcut for any multi-sport athlete). Canonical sport names: Basketball, Baseball, Track and Field, Wrestling, Soccer, Lacrosse, Hockey, Volleyball, Tennis, Golf, Swimming, Rugby. Examples: "QBs who also play basketball", "wrestlers", "two-sport athletes from Texas", "kid that plays basketball and wrestles". CRITICAL: the canonical name is "Track and Field" (with "and", not "&") — the `sanitize-html` middleware encodes `&` to `&amp;` on write, so the dropdown stores the spelled-out version and the AI must emit the same. Glossary section 16 (`multiSportTerms`) maps natural-language phrases to these keys.
    - **Track times** — filter by 100m/200m sprint times (`track_100m`, `track_200m` NUMERIC(5,2) on `player_profiles`, stored as decimal seconds). Two scalar filter keys, both upper bounds since faster = lower: `track_100m_max: 11.0` and `track_200m_max: 22.5`. Examples: "sub-11 100m", "under 22 in the 200", "WR with under 11.5 100 time". The filter fires ONLY on EXPLICIT numeric thresholds — "burner" / "speedy" / "fast" stay tied to the `weightAdj` heuristic and do NOT trigger track filters (most players don't have track times on file, so firing on vague terms would zero out results). Filter respects `IS NOT NULL` so players without track times are excluded from sub-X searches. Relevance scoring rewards faster sub-threshold times by up to +10 points (mirrors height/GPA). Glossary section 17 (`trackTerms`) lists the recognized patterns.
    - **Results are ranked by relevance score** (not recency). The scoring is query-adaptive and works in tandem with the coach's baseline metrics. The flow: (1) coach sets per-position baseline ranges for height/weight/GPA in the Baseline Metrics modal, (2) when the coach uses size terms like "tall" or "big," Claude interprets them relative to those baselines for the specific position (e.g., "tall QB" uses the QB baseline max height, not a generic number), (3) Claude outputs filter thresholds (e.g., min_height: 75), (4) the WHERE clause filters out non-matches, (5) `buildRelevanceScoreExpr()` in `PlayerProfile.js` ranks the remaining players by how much they exceed those thresholds — taller/heavier/higher GPA = higher score. Additional scoring factors always active: profile completeness (photo +3, bio +2, highlights +3), offer count (+0.5 per offer, max 5 pts), offer division quality (D1 FBS +2/offer, D1 FCS +1.5, D2 +1, D3/NAIA/NJCAA +0.5, max 10 pts). Coach profile views (`cc_views`) are intentionally NOT included in the relevance score — they create a popularity bias that conflicts with "sleeper" / "under the radar" searches where low visibility is the point. The baseline metrics ensure position-awareness — the scoring layer doesn't need to know positions because Claude already set appropriate thresholds from the baselines.
    - **Save/bookmark players** — coaches can save up to 50 players from search results for later review. Saved players are accessible via the "Saved Players" button in the RA sidebar. Each saved player shows role-specific subheaders (HS player in cerulean, transfer in red). Table: `ra_saved_players`. Model: `backend/models/RaSavedPlayers.js`.

---

## AI Portal Intelligence — Searchable Signals

21. **What coaches can search for with the AI Portal Intelligence.** The portal intelligence assistant detects behavioral signals that suggest college players may be about to enter the transfer portal. Coaches can filter by:
    - **Signal types** — three detection signals:
      - `bio_and_film` — player updated their bio AND uploaded new highlight film within the lookback window (both required)
      - `portal_keywords` — player's bio contains keywords like "transfer", "portal", "exploring options", "new chapter", "fresh start", "available", "seeking", "next step", etc. (30+ keywords tracked)
      - `browsing_coaches` — player viewed profiles of coaches from teams OTHER than their current team (more unique external coaches = stronger signal)
    - **Position** — same position codes as recruiting assistant
    - **College division** — D1 FBS, D1 FCS, D2, D3, NAIA, NJCAA
    - **Lookback window** — number of days to check for signals (default 14 days)
    - **Portal watchlist** — coaches can flag up to 50 players to monitor for portal entry. Flagged players are tracked in the `portal_watchlist` table and accessible via the "Portal Watchlist" button in the PI sidebar. The watchlist modal shows player name with role-specific subheaders (college player: `Position • Team • Division` in cerulean, transfer: `Position • Height • Weight • YOE` in red). Coaches receive notifications if a flagged player enters the portal. Model: `backend/models/PortalWatchlist.js`.
    - Signal details are shown on player cards: matched keywords (highlighted in bio), coach browsing lists with view counts, and recent highlight upload dates.

---

## AI Analytics & Future Tracking

22. **AI analytics logging is stored in the `ai_analytics` table.** Every AI search (both Recruiting Assistant and Portal Intelligence) that triggers a database query is logged for future data analytics. Conversational messages (greetings, follow-up questions about already-shown players) are NOT logged — only real searches that hit the database.

    **What is tracked per search:**
    - `ai_type` — which AI feature: `recruit_assistant` or `portal_intelligence`
    - `coach_division` / `coach_state` — anonymized coach context (no coach ID or name)
    - `raw_query` — the coach's exact natural language input (e.g., "Find me tall corners from Colorado")
    - `filters_json` — the full JSONB filters object that Claude generated from the query
    - `active_filters` — TEXT array of which filter fields were used (e.g., `{position, state, min_height}`) — enables fast aggregate queries like `WHERE 'min_height' = ANY(active_filters)`
    - `result_count` / `has_more` — how many players matched and whether there were more beyond the 5 shown
    - `avg_relevance_score` — average relevance score of returned players (Recruiting Assistant only)
    - `result_players` — JSONB array of returned players: `[{player_id, position, state}]` for RA, `[{player_id, position, college_division}]` for PI
    - `model_version` — which Claude model was used (e.g., `claude-haiku-4-5-20251001`)
    - `input_tokens` / `output_tokens` — token usage per API call (for cost tracking)
    - `latency_ms` — how long the Claude API call took

    **How it works:** Analytics logging is fire-and-forget — it runs asynchronously after the search results are returned to the coach, so it never blocks or slows down the response. Errors in logging are caught and logged to the server console but don't affect the coach's experience.

    **Why we track this (future analytics use cases):**
    - What positions/states/divisions do coaches search for most?
    - Do FBS coaches search differently than D2 coaches?
    - What % of searches include stats? Offers? Film?
    - Which players appear in the most AI search results?
    - Are coaches finding players? (avg result count, empty search rate)
    - Token cost breakdown by feature (RA vs PI) and over time
    - API latency monitoring and performance trends
    - How often is Portal Intelligence used vs Recruiting Assistant?

    **Key files:** Model: `backend/models/AiAnalytics.js`. Migration: `backend/migrations/001_add_ai_analytics.sql`. Logging inserted in `backend/routes/ai.js` at both the `/message` and `/pi-message` endpoints. Token usage and latency come from `_meta` returned by `backend/utils/ai.js` and `backend/utils/portal-intelligence.js`.

23. **"Show more" pagination for both AI Recruiting Assistant and Portal Intelligence.** When a coach types "show me more" / "more players" / "next" / etc., the frontend detects the pattern via regex and skips Claude entirely — instead calling `POST /api/ai/chats/:chatId/show-more` which re-queries the database with the same filters at an incremented offset (5, 10, 15...). No Claude API call = zero token cost for pagination. If the coach changes criteria, it triggers a fresh Claude call and resets offset to 0. Results are ranked by relevance score, so page 1 shows the best 5 matches, page 2 shows #6-10, etc. The offset is saved in message metadata so "show more" state persists across chat reloads. Both RA and PI use the same pattern. Endpoint: `POST /api/ai/chats/:chatId/show-more`. Also added `POST /api/ai/pi-search` for PI re-search with offset.

24. **Save/bookmark function for Recruiting Assistant output players.** Coaches can save up to 50 players from AI search results via a bookmark button on each player card. Saved players are stored in the `ra_saved_players` table (coach_user_id + player_user_id, UNIQUE constraint). The "Saved Players" button in the RA sidebar (above "Edit Baseline Metrics") opens a modal showing all saved players with role-specific subheaders (HS: `Position • Height • Weight • Class of YYYY` in cerulean, Transfer: `Position • Height • Weight • YOE` in red). Clicking a player navigates to their profile; pressing back reopens the modal. Model: `backend/models/RaSavedPlayers.js`. Routes: `GET/POST/DELETE /api/ai/saved`. Migration: `backend/migrations/002_add_ra_saved_players.sql`.

25. **Follow-up interaction tracking (funnel analytics) + Admin Dashboard.** Tracks whether AI search results lead to real engagement. When a coach saves, views, follows, or messages a player, the backend checks if that player appeared in an AI search result for that coach within the last 30 minutes. If yes, an event is logged in the `ai_engagement_events` table linked back to the `ai_analytics` session via `analytics_id`. Uses a time-window matching approach with JSONB containment query (`result_players @> '[{"player_id": "uuid"}]'`). All tracking is fire-and-forget — never blocks the coach's action. No frontend changes needed. Event types: `save`, `profile_view`, `follow`, `message`. Hooked into: `routes/ai.js` (save), `routes/profile.js` (view), `routes/follow.js` (follow), `routes/messages.js` (message). Model: `backend/models/AiEngagement.js`. Migration: `backend/migrations/003_add_ai_engagement_events.sql`.

    **Admin Dashboard:** A private standalone HTML file at `frontend/admin/ai-dashboard.html` (gitignored, never committed) that visualizes all analytics data in real-time. Uses Chart.js for charts. Protected by `ADMIN_ANALYTICS_KEY` in `.env` — the dashboard sends this key as an `x-admin-key` header to the admin API routes at `/api/admin/analytics/*`. Auto-refreshes every 30 seconds. Displays: overview cards (total searches, engagements, conversion rate, tokens, latency), search activity (daily trends, by division, by position, by filter type), engagement funnel (search -> save -> view -> follow -> message with drop-off %), and performance metrics (latency over time, token usage, breakdown by AI type). Backend routes: `backend/routes/admin-analytics.js` (4 endpoints: overview, searches, funnel, performance + 2 DELETE endpoints for clearing data). Each section has a "Clear Data" button with an "Are you sure?" confirmation modal.

    **PRODUCTION SETUP:** The dashboard HTML is local-only (gitignored, NOT copied to EC2). It runs from Live Server at `localhost:5500` against the prod API via `API_BASE = 'https://directrecruit.net'`. Only the backend admin routes live on prod, authenticated by the `ADMIN_ANALYTICS_KEY` header. Setup steps:
    1. SSH into EC2 and add `ADMIN_ANALYTICS_KEY=<random-string>` to `~/direct-recruit/backend/.env`
    2. Restart with env reload: `pm2 restart direct-recruit --update-env` (plain `pm2 restart` caches old env vars)
    3. Apply DB migrations on prod: `cd ~/direct-recruit/backend && npm run migrate:prod`
    4. Locally, open `http://localhost:5500/frontend/admin/ai-dashboard.html`. The page prompts for the admin key on first load and caches it in localStorage as `aiDashboardKey`. On 401 it clears the cached key and re-prompts — so key rotation requires zero file edits, just paste the new value when prompted.
    5. **Do NOT `scp` the admin HTML to EC2.** Earlier guidance to do so was wrong; the dashboard is intentionally localhost-only so the key never sits in a publicly-served HTML file.



26. **AI Rep page is live for hsplayer and transferplayer.** The AI Rep shows players how they appear in college coach AI Recruiting Assistant searches. It pulls from the existing `ai_analytics` table — every time a coach's search outputs a player, that player sees it as a match on their AI Rep.

    **What it shows:**
    - **Match Feed** (hidden if no matches — never shows "0 matches" to avoid discouraging players): Each match card shows the coach's division badge (e.g., "D2"), "Matched on" tags derived from `active_filters` (Position, State, Height, Weight, GPA, Grad Year, Highlights/Film, Offers, Stats, College Division, Eligibility — excludes searchTerm and recruiting terms), and the date. Period dropdown filters by last 7 days, 30 days, or all time. Paginated 5 at a time with Show More.
    - **Division Distribution:** Bar chart counting matches per division (D1 FBS, D1 FCS, D2, D3, NAIA, NJCAA) within the selected period.
    - **Top Attributes Driving Exposure:** Ranked tags showing which filters appear most across the player's matches (e.g., "Position (83%)", "Height (58%)").
    - **Profile Optimization:** Checks the player's profile against all AI RA searchable fields. HS players have 11 fields, transfer players have 13 (adds College Division + Eligibility). Incomplete fields show as prioritized recommendations (HIGH/MED/LOW). Displays "Completing your profile helps get more coaching matches" message.
    - **Search Trends:** Coming Soon overlay — no data yet.

    **Backend:** `backend/routes/ai-rep.js` mounted at `/api/ai-rep` with `requireRole('player')`. Two endpoints: `GET /matches` (queries `ai_analytics` via JSONB containment `result_players @> '[{"player_id":"..."}]'`) and `GET /profile-completion`. Frontend API: `API.aiRep.getMatches()` and `API.aiRep.getProfileCompletion()`.

    **Local dev note:** The AI RA mock (`backend/utils/local/ai-local.js`) returns hardcoded filters for every query, so "matched on" tags won't reflect the actual coach request locally. In production with real Claude, the filters are accurate. To clear all AI Rep test data locally:
    ```
    docker exec dr-postgres psql -U postgres -d direct_recruit -c "DELETE FROM ai_engagement_events; DELETE FROM ai_analytics;"
    ```


## College Coach AI Subscription Tiers — Token Budgets & Cost Analysis

29. **AI token caps were calculated from worst-case API cost analysis.** Both the Recruiting Assistant (RA) and Portal Intelligence (PI) use `claude-haiku-4-5-20251001` with `max_tokens: 1024` (output hard-capped in code). Haiku 4.5 pricing: $1.00/MTok input, $5.00/MTok output.

    **Worst-case per request breakdown:**
    - The system prompt (instructions + glossary + coach baselines) is ~8,000 input tokens for RA, ~5,000 for PI
    - Chat history is sent in full with NO cap — every previous message in the conversation is included
    - A 50+ message marathon conversation can push input to ~58,000 tokens per request
    - Output is hard-capped at 1,024 tokens (just a JSON filter object)
    - Worst-case total: ~59,024 tokens/request (98.3% input, 1.7% output)
    - Worst-case cost: ~$0.063/request

    **Tier token caps (targeting ~79% margin at worst case):**

    | Plan    | Price    | Token Cap | Multiplier | Worst-Case Requests | Input Cost | Output Cost | API Cost | Margin |
    |---------|----------|-----------|------------|---------------------|------------|-------------|----------|--------|
    | Starter | $20/mo   | 4M        | 1x         | ~67                 | $3.93      | $0.34       | $4.27    | 78.7%  |
    | Pro     | $50/mo   | 10M       | 2.5x       | ~169                | $9.83      | $0.85       | $10.68   | 78.6%  |
    | Elite   | $100/mo  | 20M       | 5x         | ~338                | $19.66     | $1.70       | $21.36   | 78.6%  |

    **Simplified tier overview:**

    | Plan    | Price    | Token Cap | API Cost | Margin |
    |---------|----------|-----------|----------|--------|
    | Starter | $20/mo   | 4M        | $4.27    | 78.7%  |
    | Pro     | $50/mo   | 10M       | $10.68   | 78.6%  |
    | Elite   | $100/mo  | 20M       | $21.36   | 78.6%  |

    **Why worst-case margins are conservative (actual margins will be higher):**
    - Most coaches send short searches early in a conversation where input is mostly just the system prompt (~8K-10K tokens, not 58K)
    - A typical request costs ~$0.01-0.02, not $0.063 — meaning real-world margins are closer to 90-95%
    - "Show more" pagination skips Claude entirely (re-queries DB with same filters at new offset, zero token cost)
    - Conversational messages (greetings, clarifications about shown players) produce small outputs
    - The 1,024 max_tokens output cap in code prevents any single response from being expensive on the output side

    **Token tracking:** Input and output tokens are already logged per request in the `ai_analytics` table (`input_tokens`, `output_tokens` columns). Enforcement should sum both into one pool per coach per billing period — combined is simpler for the coach to understand even though input/output have different per-token costs. The worst-case ratio (98.3% input) means the blended cost is dominated by the cheap input tokens anyway.

    **The unbounded chat history is the biggest cost driver.** If cost becomes an issue, the highest-impact optimization would be adding a message history window (e.g., only send the last 10-20 messages to Claude instead of all of them). This would bring worst-case input from ~58K tokens down to ~15-20K tokens per request.

---

## Per-Coach AI Usage Tracking & View Usage Modal

30. **Per-coach token usage tracking requires `coach_user_id` in `ai_analytics`.** The original `ai_analytics` table only stored `coach_division` and `coach_state` — there was no way to tie usage to a specific coach. We added a `coach_user_id UUID` column (with index) via migration `004_add_coach_user_id_to_ai_analytics.sql`. Both the RA and PI log calls in `backend/routes/ai.js` now pass `req.userId` as `coachUserId` to `AiAnalytics.log()`. Historical rows before this migration have `coach_user_id = NULL` — that's fine, they predate per-coach tracking.

31. **Both RA and PI share a single token pool per coach.** The `GET /api/ai/usage` endpoint (in `backend/routes/ai.js`) calls `AiAnalytics.getUsageByCoach()` which sums `input_tokens + output_tokens` across ALL `ai_type` values (`recruit_assistant` and `portal_intelligence`) for the given coach within the current calendar month. Both the RA modal and PI modal call this same endpoint, so they always show the same usage numbers. When a coach uses RA, the PI modal reflects that usage too, and vice versa.

32. **View Usage modal is on both AI pages.** The "View Usage" button lives in the sidebar footer of both the RA (discover-players.html) and PI (transfer-portal.html) pages. It shows:
    - Current plan name and billing period (calendar month)
    - Token usage progress bar with color states: orange (normal), yellow (75%+ warning), red (90%+ critical)
    - Breakdown: input tokens, output tokens, total requests
    - Info footer explaining both AIs count toward the same cap
    - The sidebar button badge shows the usage percentage on page load

    **Key files:**
    - Backend model: `backend/models/AiAnalytics.js` — `getUsageByCoach()` method
    - Backend route: `backend/routes/ai.js` — `GET /api/ai/usage`
    - Frontend API: `frontend/shared/api.js` — `API.ai.getUsage()`
    - RA modal JS: `frontend/collegecoach/tabs/discover-recruit-assistant.js` — `openUsageModal()`
    - PI modal JS: `frontend/collegecoach/tabs/portal-intelligence.js` — `openPiUsageModal()`
    - RA modal HTML/CSS: `discover-players.html` + `discover-players.css` + `recruit-assistant.css` (orange theme)
    - PI modal HTML/CSS: `transfer-portal.html` + `transfer-portal.css` (red theme)

33. **Subscription tiers are hardcoded for now.** `getUsageByCoach()` returns `plan: 'Pro'` and `tokenCap: 10_000_000` as defaults. When Stripe subscriptions are built, this method should look up the coach's tier from a subscriptions table and return the real cap. The tier caps are:

    | Plan    | Price    | Token Cap |
    |---------|----------|-----------|
    | Starter | $20/mo   | 4M        |
    | Pro     | $50/mo   | 10M       |
    | Elite   | $100/mo  | 20M       |

34. **The standalone `recruit-assistant.html` and `recruit-assistant.js` were deleted.** They were dead files — nothing linked to them. The actual RA lives as a subtab inside `discover-players.html` using `discover-recruit-assistant.js`. The `recruit-assistant.css` file was kept because `discover-players.html` imports it.

35. **Testing token usage locally without the Claude API.** Local dev mocks return `input_tokens: 0, output_tokens: 0`, so the modal shows 0% usage. To test visually, insert fake rows directly:
    ```sql
    docker exec dr-postgres psql -U postgres -d direct_recruit -c "
    INSERT INTO ai_analytics (ai_type, coach_user_id, raw_query, input_tokens, output_tokens, created_at)
    SELECT 'recruit_assistant', u.id, 'test query', 50000, 2000, NOW()
    FROM users u WHERE u.email = 'collegecoach@test.com';
    "
    ```
    Then open the RA or PI page and click View Usage. Clean up after: `DELETE FROM ai_analytics WHERE raw_query = 'test query';`

---

## Profile Type Switching

36. **Profile type switching is now live in Settings > Profile Type.** Users can switch between any of the 6 profile types (hsplayer, collegeplayer, transferplayer, hscoach, collegecoach, other) from their Settings page. The feature uses a 3-step modal flow: (1) choose target type, (2) fill in the full profile form for that type, (3) confirm with a permanent-action warning.

    **How switching works (database transaction):**
    - Profile type is determined by 3 fields: `users.role` (player/coach/other), `player_profiles.college_division` (null = HS, has value = college), and `player_profiles.transfer` ('y' = transfer)
    - On switch: the old profile row is **deleted** from its table (`player_profiles`, `coach_profiles`, or `other_profiles`), `users.role` is updated, and a new profile row is created in the target table — all in a single Postgres transaction
    - Only `first_name`, `last_name`, and `email` carry over (email is read-only). All other profile data is new input from the switch form
    - Social data (posts, follows, messages, notifications, conversations) is **preserved** — these all reference `users.id`, which never changes
    - `ai_analytics` is **safe** — `coach_user_id` references `users(id) ON DELETE SET NULL`, and we never delete the users row
    - Player game stats (`player_games`, `player_game_stats`) are the only CASCADE loss — they reference `player_profiles.id` directly
    - A new JWT is issued with the updated role, set as an HTTPOnly cookie
    - 72-hour cooldown between switches, enforced via `users.last_profile_switch_at`
    - Switch history logged in `profile_switch_history` table (from_role, from_subtype, to_role, to_subtype)

    **Key files:**
    - Migration: `backend/scripts/add-profile-switching.sql` + `backend/migrations/005_add_profile_switching.sql`
    - Backend endpoints: `backend/routes/settings.js` — `GET /api/settings/switch-profile/info` and `POST /api/settings/switch-profile`
    - User model helpers: `backend/models/User.js` — `getSubtypeFromProfile()`, `getBaseRole()`, `PAID_TYPES`, `COLLEGE_DIVISIONS`
    - Frontend API: `frontend/shared/api.js` — `API.settings.getSwitchProfileInfo()` and `API.settings.switchProfile()`
    - Frontend modal: `frontend/shared/settings.js` — `initializeProfileTypeSwitching()`, `openSwitchProfileModal()`, 3-step flow
    - Frontend CSS: `frontend/shared/settings.css` — all `.switch-*` classes
    - HTML (all 6 roles): `tabs/settings.html` — "Profile Type" nav button + section

37. **Profile type switching is pre-wired for Stripe subscription handling.** Three profile types are paid (`collegecoach`, `hsplayer`, `transferplayer`) and three are free (`collegeplayer`, `hscoach`, `other`). The paid/free distinction is defined in `User.PAID_TYPES` array in `backend/models/User.js`.

    **How it works on the frontend:**
    - The `GET /api/settings/switch-profile/info` endpoint returns `is_paid` for each target type and `is_current_paid` for the current type
    - Step 1 (type selection) shows a "PAID" or "FREE" badge on each type card
    - Step 3 (confirmation) shows an info banner for paid types: "This profile type requires a paid subscription for full access"
    - The `POST /api/settings/switch-profile` response includes `is_paid: true/false` so the frontend can show appropriate messaging after switching

    **How Stripe should be integrated when ready:**
    - The `POST /api/settings/switch-profile` endpoint has `// TODO` comments marking where to add Stripe calls
    - **Switching TO paid:** Add a subscription check/creation step between confirmation (Step 3) and the actual switch. Options: (a) redirect to Stripe Checkout before executing the switch, then execute on webhook callback; or (b) allow the switch and gate paid features (AI RA, PI) at usage time by checking subscription status
    - **Switching FROM paid to free:** Call `stripe.subscriptions.cancel()` inside the transaction, before deleting the old profile row. The coach's subscription ID would come from a future `subscriptions` table
    - **The `profile_switch_history` table** logs every switch with from/to types — useful for billing audits and detecting abuse (e.g., switching to free right before billing cycle)
    - **Cooldown (72h)** also helps prevent subscription gaming — users can't rapidly cycle between paid and free to avoid charges

    **Current behavior (no Stripe yet):** All switches are allowed freely regardless of paid/free. The UI shows paid badges and info banners as informational only. When Stripe is built, the enforcement point is a single check at the top of the POST endpoint.

---

## Sidebar Footer — Avatar, Name, Subheader, and Colored Ring

38. **The sidebar footer (avatar + name + subheader) is populated in 4 separate places per role, and all 4 must stay in sync.** When modifying how the sidebar footer looks (avatar border, subheader text, subheader color, name display), you must update ALL of these locations for ALL 6 role folders. Missing one causes the sidebar to flash the wrong info or lose its colored ring on certain pages.

    **The 4 population points (per role folder):**

    | # | File | When it runs | What page |
    |---|---|---|---|
    | 1 | `{role}/sidebar-footer.js` | On DOMContentLoaded via `populateSidebarFooter()` | Mainpage (feed) — runs first, sets initial sidebar |
    | 2 | `{role}/mainpage-{type}.js` | In `updateSidebarFooter()` called after feed loads | Mainpage (feed) — overwrites #1 with same data from `/auth/me` |
    | 3 | `{role}/tabs/my-profile.js` | In `updateNavbarForLoggedInUser(user, profile)` called on page load | My Profile page + when viewing other profiles |
    | 4 | `{role}/tabs/messages.js` | In `loadCurrentUser()` called on page load | Messages page |

    All 4 call `GET /api/auth/me` to get the **logged-in user's** data (not the viewed user's). This means the sidebar always shows YOUR info, even when viewing someone else's profile.

    **What each population point sets:**
    - **Name:** `profile.first_name + profile.last_name` → `.sidebar-footer .user-name`
    - **Subheader text:** Role-specific format → `.sidebar-footer .user-role`
    - **Subheader color:** Inline `style.color` on `.user-role`
    - **Avatar image:** `profile.profile_image_url` (or `profile_picture_url` for other) → `.sidebar-footer .user-avatar-circle` innerHTML
    - **Avatar border ring:** Inline `style.border` using `getRoleBorderColor()` on `.user-avatar-circle`

    **Subheader format and color by profile type (must match across all 4 files):**

    | Profile Type | Subheader Format | Color | Separator |
    |---|---|---|---|
    | HS Player | `Position • Height • Weight • GradYear` | `#1282a2` (cerulean) | bullet `•` |
    | College Player | `Position • Team • Division` | `#1282a2` (cerulean) | bullet `•` |
    | Transfer Player | `Position • Height • Weight • YOE: N year(s)` | `#b91c1c` (red) | bullet `•` |
    | HS Coach | `Team, State` | `#ff6b35` (orange) | comma `,` |
    | College Coach | `Team, State • Division` | `#ff6b35` (orange) | mixed |
    | Other | `subheader` field (plain text) | `#d4a017` (gold) | N/A |

    **Avatar border ring colors (set by `getRoleBorderColor()` in `shared/api.js`):**

    | Profile Type | Border Color |
    |---|---|
    | HS Player / College Player | `#1282a2` (cerulean) |
    | Transfer Player | `#ef4444` (red) |
    | Coach (HS or College) | `#ff6b35` (orange) |
    | Other | `#d4a017` (gold) |

    **Height formatting logic (duplicated in all sidebar footer code):**
    - If `profile.height` is a string containing `'` or `"` → use as-is (already formatted like `6'2"`)
    - If `profile.height` is a number (inches) → convert: `Math.floor(inches / 12)` feet, `inches % 12` remaining → format as `6'2"`

    **How `getProfileFolder()` determines which format to use:**
    The sidebar footer code calls `getProfileFolder({ role, is_transfer_player, transfer, college_division })` (from `shared/api.js`) to determine `userFolder`, then uses a series of `if/else if` blocks to apply the correct subheader format. This is the same function used for cross-folder profile navigation (Pattern 1 in CLAUDE.md).

    **Common mistakes when modifying the sidebar footer:**
    1. Forgetting one of the 4 population points — the sidebar will show the wrong format on that page
    2. Using `#1282a2` for the "other" profile color instead of `#d4a017` — the "other" color is gold, NOT cerulean
    3. Not setting the avatar `style.border` after setting `innerHTML` — the border ring disappears
    4. Using `profile.profile_image_url` without also checking `profile.profile_picture_url` — the "other" profile table uses a different column name
    5. Forgetting to handle the height number→string conversion — raw integer heights display as `"74"` instead of `6'2"`
    6. Setting sidebar data from the *viewed* profile instead of the *logged-in* user — sidebar must always show YOUR info

    **Key files (24 total — 4 per role x 6 roles):**
    - `frontend/{role}/sidebar-footer.js` (6 files)
    - `frontend/{role}/mainpage-{type}.js` (6 files: mainpage-player.js x3, mainpage-coach.js x2, mainpage-other.js x1)
    - `frontend/{role}/tabs/my-profile.js` (6 files)
    - `frontend/{role}/tabs/messages.js` (6 files)

    **Additional sidebar avatar locations (profile post avatars on my-profile pages):**
    The `.profile-post-avatar` divs in the Posts/Replies/Likes tabs of my-profile.js also need `getRoleBorderColor()` borders. These use `post.author_role`, `post.author_transfer`, `post.author_division` for regular posts, and `post.original_author_role` etc. for reposts. There are ~5 per file (30 total across 6 roles).

---

## Stripe Subscription Integration

39. **Stripe subscriptions follow the same local-dev mock pattern as Cognito/S3/SES.** The environment switcher is `backend/utils/stripe.js` — line 1 checks `NODE_ENV` and loads `backend/utils/local/stripe-local.js` in development. The mock auto-approves all payments, returns fake customer/subscription IDs, and never calls the Stripe API. Zero cost in local dev.

    **Paid profile types and pricing:**

    | Profile Type | Price | Tier Value in DB |
    |---|---|---|
    | HS Player | $10/mo | `player` |
    | Transfer Player | $10/mo | `player` |
    | College Coach Starter | $20/mo | `starter` |
    | College Coach Pro | $50/mo | `pro` |
    | College Coach Elite | $100/mo | `elite` |

    HS Player and Transfer Player share the same Stripe Price ID (same $10/mo plan). College coaches select a tier at checkout.

    **Database columns added to `users` table (migration `006_add_stripe_subscriptions.sql`):**
    - `stripe_customer_id` — Stripe customer ID, created on first checkout
    - `stripe_subscription_id` — active subscription ID from Stripe
    - `subscription_status` — `none` (default), `active`, `past_due`, `cancelled`
    - `subscription_tier` — `null`, `player`, `starter`, `pro`, `elite`

    **Key files:**
    - Environment switcher: `backend/utils/stripe.js`
    - Local mock: `backend/utils/local/stripe-local.js`
    - Routes: `backend/routes/payments.js` — 4 endpoints: `POST /create-checkout-session`, `POST /webhook`, `GET /subscription-status`, `POST /cancel`
    - User model methods: `User.getStripeCustomerId()`, `User.updateStripeCustomerId()`, `User.updateSubscription()`, `User.getSubscriptionInfo()`
    - Price ID mapping: `PRICE_MAP` and `TIER_MAP` objects in `payments.js` map profile types to Stripe Price IDs from env vars

    **Webhook mounting is special.** The Stripe webhook needs the raw request body (not JSON-parsed) for signature verification. In `server.js`, the webhook is mounted BEFORE `express.json()` with `express.raw({ type: 'application/json' })`. The webhook handler is exported separately from the router: `paymentsRoutes.webhookHandler`.

    **Webhook events handled:**
    - `checkout.session.completed` — activates subscription, sets tier
    - `customer.subscription.updated` — syncs status changes
    - `customer.subscription.deleted` — marks subscription as cancelled, clears tier
    - `invoice.payment_failed` — sets status to `past_due`

    **Cancellation behavior:** `POST /cancel` sets `cancel_at_period_end: true` on the Stripe subscription — the user keeps access until the end of their billing period. When the period ends, Stripe fires `customer.subscription.deleted` and we set status to `cancelled`.

    **Env vars required (in `.env`, all gitignored):**
    - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
    - `STRIPE_PLAYER_PRICE_ID`, `STRIPE_COACH_STARTER_PRICE_ID`, `STRIPE_COACH_PRO_PRICE_ID`, `STRIPE_COACH_ELITE_PRICE_ID`

    **Testing real Stripe in local dev:** The `stripe.js` switcher checks for a real `sk_` key prefix instead of `NODE_ENV`. To test real Stripe checkout locally: add real test-mode keys to `.env` (keep `NODE_ENV=development`), restart the server. Stripe checkout appears while Cognito/S3/CORS stay mocked. Swap keys back to `PLACEHOLDER` when done.

40. **Paid profile signup flow: register → pay → create profile (Option A1).** For all 3 paid types (hsplayer, transferplayer, collegecoach), the signup flow is:

    1. User fills out the create-profile form and submits
    2. `authAPI.register()` creates a bare `users` row (email + role only, no profile data)
    3. Profile form data is stored in `localStorage` key `pendingProfileData`
    4. For players: redirect straight to Stripe Checkout ($10/mo)
    5. For college coaches: show a tier selection modal (Starter $20 / Pro $50 / Elite $100), then redirect to Stripe
    6. Stripe redirects to `payment-success.html` after successful payment
    7. `payment-success.html` reads `pendingProfileData` from localStorage, calls `profileAPI.createPlayerProfile()` or `createCoachProfile()`, clears localStorage, then redirects to `verify-email.html`

    **If user backs out at Stripe Checkout:** They have a bare `users` row with no profile and `subscription_status = 'none'`. If they try to register again with the same email, they get "email already in use." They can sign in instead, and Phase 6's paywall catches them — offers options to pay or switch to a free profile type.

    **Profile updates skip Stripe entirely.** The `isUpdating` flag in all 3 profile-form files detects whether the user is editing an existing profile. Updates call `createProfile()` directly and redirect to the mainpage — no payment step.

    **Key files:**
    - Player forms: `frontend/hsplayer/profile-form.js`, `frontend/transferplayer/profile-form.js`
    - Coach form: `frontend/collegecoach/coach-profile-form.js` (includes `showTierSelectionModal()` function)
    - Payment success pages: `frontend/{hsplayer,transferplayer,collegecoach}/payment-success.html`
    - Frontend API: `frontend/shared/api.js` — `API.payments.createCheckoutSession()`, `getSubscriptionStatus()`, `cancelSubscription()`

    **Tier selection modal (college coach only):** Built dynamically in `showTierSelectionModal()` at the bottom of `coach-profile-form.js`. Creates a full-screen overlay with 3 cards (Starter/Pro/Elite), Pro highlighted as "Most Popular" with orange border. Each card's "Select" button calls `API.payments.createCheckoutSession('collegecoach', tier, ...)`. Styled inline with orange accent (`#ff6b35`) matching the coach theme.

41. **Profile type switching handles Stripe subscription transitions.** When a user switches profile types via Settings, the backend (`backend/routes/settings.js`) handles 4 subscription scenarios:

    | Scenario | Example | Action |
    |---|---|---|
    | Free → Paid | collegeplayer → hsplayer | Frontend redirects to Stripe Checkout after switch |
    | Paid → Free | hsplayer → collegeplayer | Backend cancels Stripe subscription |
    | Paid → Paid (different price) | hsplayer → collegecoach | Backend cancels old sub, frontend redirects to new checkout |
    | hsplayer ↔ transferplayer | Same $10/mo plan | Keep subscription, no payment change |

    The switch endpoint returns `requires_payment: true/false` and `payment_profile_type` in the response. The frontend (`frontend/shared/settings.js` → `executeSwitchProfile()`) checks these fields and either redirects to Stripe or shows success directly. For coach switches, `showSwitchTierModal()` in settings.js shows the tier picker before checkout.

    Payment success after a switch goes to `frontend/shared/payment-success-switch.html`, which reads `switchRedirectUrl` from localStorage and redirects to the new role's mainpage.

42. **Subscription management lives in Settings for all 6 roles.** Every `tabs/settings.html` has a "Subscription" nav button and section. The content is populated dynamically by `initializeSubscriptionSection()` in `frontend/shared/settings.js`. It fetches `API.payments.getSubscriptionStatus()` and shows:
    - **Free types:** "Your account type is free — no subscription needed."
    - **Paid with active sub:** Plan name, price, green "Active" badge, next billing date, Cancel button (+ Change Plan for coaches)
    - **Paid with cancelled/none:** Subscribe/Resubscribe button
    - **Cancelling:** Yellow "Cancelling" badge with access-until date

    Cancel uses a confirmation modal → calls `API.payments.cancelSubscription()` → Stripe cancels at end of billing period. The save/discard footer is hidden on Subscription, Profile Type, and Security sections since they don't use form inputs.

43. **Feature gating locks the entire platform for unpaid users on paid profiles.** Phase 6 has two enforcement layers:

    **Frontend paywall (automatic):** An IIFE at the bottom of `frontend/shared/api.js` runs on every page load. It calls `/auth/me`, checks if the user is on a paid profile type (hsplayer, transferplayer, collegecoach) with `subscription_status` not `active` or `past_due`, and redirects to `frontend/shared/subscription-required.html`. Skipped on: landing pages, create-profile, verify-email, payment-success, and the paywall page itself (prevents redirect loops).

    **Backend AI gating:** `backend/routes/ai.js` has a `requireActiveSubscription()` helper that checks `User.getSubscriptionInfo()` before all 4 AI endpoints (message, pi-message, show-more, pi-search). Returns 403 if subscription isn't active or past_due. Same check in `backend/routes/ai-rep.js` for matches and profile-completion endpoints.

    **`past_due` is treated as active** — Stripe retries failed payments automatically over several days. Users are only locked out when Stripe fires `customer.subscription.deleted` (which sets status to `cancelled`).

    **Paywall page options:** Subscribe Now (players go direct to checkout, coaches see tier picker), Switch Profile Type (redirects to Settings), Log Out.

44. **AI token caps are now tier-based, not hardcoded.** `AiAnalytics.getUsageByCoach()` in `backend/models/AiAnalytics.js` queries the coach's `subscription_tier` from the users table and returns the real cap:

    | Tier | Plan Name | Token Cap |
    |---|---|---|
    | starter | Starter | 4,000,000 |
    | pro | Pro | 10,000,000 |
    | elite | Elite | 20,000,000 |

    Default (no tier set) falls back to Starter/4M. The old hardcoded `plan: 'Pro'` and `tokenCap: 10_000_000` no longer exist.

45. **The `/api/auth/me` endpoint returns subscription data.** `subscription_status` and `subscription_tier` are included in the user object returned by `/me`. Also, `User.findById()` now selects `subscription_status` and `subscription_tier` from the users table, so `req.user` in authMiddleware has these fields available on every authenticated request.

46. **The edit profile modal no longer toggles between HS ↔ College.** Previously, hsplayer/collegeplayer could switch to the other type from the edit profile modal, and same for hscoach/collegecoach. The School Type toggle buttons, conditional field containers, `setupEditSchoolTypeToggle()` function, and redirect-on-type-change logic were all removed from all 4 files (hsplayer, collegeplayer, hscoach, collegecoach). Each modal now shows only the static fields for that profile type. Profile type switching is handled exclusively through Settings → Profile Type (with Stripe integration).

---

## School Search & School Logo System

47. **School search with logo + auto-division is a shared module used across create-profile, edit-profile, and logo display.** The module lives at `frontend/shared/school-search.js` + `frontend/shared/school-search.css`. It provides three things: (1) `initSchoolSearch(config)` — wraps any college name `<input>` with a fuzzy-search dropdown (828 schools from `frontend/assets/school-logos.json`) that shows logos and auto-fills the division `<select>`, with a "Can't find your school? Enter manually" fallback; (2) `getSchoolLogoHTML(schoolName, assetBasePath, size)` — returns a small `<img>` tag for a school's logo or `''` if not found; (3) `ensureSchoolLogosLoaded(assetBasePath)` — async preload of the JSON data.

48. **`school-search.js` must be loaded on EVERY page across ALL 6 roles, not just college roles.** Even hsplayer, hscoach, and other users see college profiles in their feed, search results, messages, notifications, and suggested connections. If `school-search.js` isn't loaded on those pages, `getSchoolLogoHTML()` returns `''` and no logos appear next to college users' names. The script tag goes after `api.js` on every mainpage and tab HTML file across all 6 role folders. Watch for versioned script tags (e.g., `api.js?v=2`) — sed replacements won't match if the exact string differs.

49. **Asset paths for school logos depend on page depth — hardcoding breaks on tab pages.** Mainpage files (`frontend/{role}/mainpage-*.html`) need `../assets`, tab files (`frontend/{role}/tabs/*.html`) need `../../assets`. The critical mistake: `mainpage-*.js` files are loaded on BOTH mainpage AND tab pages (via `<script src="../mainpage-coach.js">`), so any logo path inside them must use `window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'` to detect the correct depth. Hardcoding `'../assets'` causes broken `<img>` tags (wrong path) on every tab page. This applies to ALL shared JS files too (`feed.js`, `search.js`, `suggested-connections.js`).

50. **All `getSchoolLogoHTML()` and `ensureSchoolLogosLoaded()` calls must be guarded with `typeof` checks.** Since `school-search.js` may load after other scripts (or fail to load), every call must be `typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(...) : ''` and `typeof ensureSchoolLogosLoaded === 'function'` before `await`. Without this, pages throw `ReferenceError` and the entire function that renders the sidebar footer or user info fails silently — the name doesn't display at all, not just the logo.

51. **Every async function that renders user names with logos MUST `await ensureSchoolLogosLoaded()` before calling `getSchoolLogoHTML()`.** `getSchoolLogoHTML()` is synchronous — it returns `''` if the JSON isn't loaded yet. This caused logos to silently not appear on messages, suggested connections, and tab pages even though the code was correct. The fix: every async rendering function (`loadConversations()`, `loadConnections()`, `loadAllConnectionsForModal()`, `updateSidebarFooter()`, `loadCurrentUser()`, `populateSidebarFooter()`) must `await ensureSchoolLogosLoaded(path)` before any call to `getSchoolLogoHTML()`. For sync functions called from async parents, the parent must ensure the data is loaded first. The JSON is cached after the first successful load, so subsequent `await` calls return instantly.

52. **School logo icon is displayed next to user names at 25+ locations across ALL 6 roles.** The logo appears for collegeplayer, collegecoach, and transferplayer profiles (any user whose `team_name` matches a school in the JSON). It does NOT appear for manually-typed school names not in the JSON, or for hsplayer/hscoach/other profiles (they have no college `team_name`). But ALL 6 roles must render logos for OTHER users they see. The display locations and sizes:

    | Location | Size | Files |
    |----------|------|-------|
    | Sidebar footer (all pages) | 16px | `sidebar-footer.js`, `mainpage-*.js`, `my-profile.js`, `messages.js` × 3 college roles |
    | Feed post author name | 16px | `shared/feed.js` (2 templates) |
    | Feed reposter/quoter name | 16px | `shared/feed.js` (2 locations) |
    | Feed comment author | 14px | `shared/feed.js` (2 comment templates) |
    | Search results | 16px | `shared/search.js` |
    | Suggested connections | 14px | `shared/suggested-connections.js` (widget + modal) |
    | Message conversation list | 14px | `messages.js` × 6 roles |
    | Message thread header | 16px | `messages.js` × 6 roles |
    | Notification actors | 14px | `notifications.js` × 3 college roles |
    | My Profile page header | 20px | `my-profile.js` × 5 roles (all except other) |

    **Key rule:** When adding the logo to a new location, always check: (1) is `school-search.js` loaded on that page's HTML? (2) is the asset path dynamically detected with `/tabs/` check? (3) is the containing function async, and does it `await ensureSchoolLogosLoaded()` before rendering? (4) is the `getSchoolLogoHTML` call guarded with `typeof`? Missing any one of these 4 causes the logo to silently not appear or shows a broken image.

---

## Search Bar — Display Pattern & Fuzzy Search

53. **The search bar (`frontend/shared/search.js`) must match the feed post author display pattern.** Search results use the same visual structure as feed posts: a `<div>` avatar container (not a bare `<img>`) with a colored border ring and background via `getRoleBorderColor()` / `getRoleAvatarBg()`, containing either the profile image or an SVG person icon fallback. The username is gray (`rgba(255,255,255,0.5)`, `font-weight: 400`) matching the feed's `.post-user-handle` — NOT bold or role-colored. The subheader IS bold (`font-weight: 700`) and role-colored via CSS classes (`.player-meta`, `.transfer-player-meta`, `.coach-meta`, `.other-meta`) matching the feed's `.post-meta` pattern.

    **Common mistake:** Using a bare `<img>` tag for the avatar with an `onerror` fallback to an SVG data URI initial letter. This loses the colored border ring and background. Instead, use a `<div>` container with inline border/color/background styles, containing either `<img>` or the person SVG fallback — exactly like feed.js's `.post-avatar-circle`.

54. **Fuzzy search requires the `pg_trgm` PostgreSQL extension.** All 3 search models (PlayerProfile, CoachProfile, OtherProfile) use `similarity()` for fuzzy matching on `first_name`, `last_name`, and `username`. Without `pg_trgm` enabled, search returns a 500 error: `function similarity(character varying, unknown) does not exist`. The extension is created in `backend/scripts/add-fuzzy-search.sql` and listed in the `MIGRATIONS` array in `backend/scripts/seed-local.js`. If search breaks after a database wipe, run: `docker exec dr-postgres psql -U postgres -d direct_recruit -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"`. For production, ensure the extension exists in the prod migration path too.

    **Key files:**
    - Frontend: `frontend/shared/search.js` (render logic), `frontend/shared/search.css` (avatar container + role-colored subtitle classes)
    - Backend: `backend/routes/profile.js` (`GET /api/profile/search`), `backend/models/PlayerProfile.js`, `backend/models/CoachProfile.js`, `backend/models/OtherProfile.js` (all have `search()` with `similarity()`)
    - Migration: `backend/scripts/add-fuzzy-search.sql`

---

## Feed Posts — Rendering, Click Behavior & Single Post View

55. **Feed posts are rendered by `FeedManager` in `frontend/shared/feed.js` using 4 template methods.** Each creates an `<article class="post-card">` element with a `data-post-id` (and `data-share-id` for shares). The 4 methods:
    - `createPostElement(post)` — regular posts (~line 570)
    - `createRepostElement(post)` — reposts (~line 861), adds `feed-repost-card` class
    - `createQuotePostElement(post)` — quote posts (~line 985), adds `quote-post-card feed-quote-card` classes
    - `createSingleQuotePostElement(share)` — quote posts on single post view (~line 1118), adds `single-quote-view` class

    Each post card contains: `.post-header` (avatar, name, username, subheader, three-dot menu), `.post-content` (text + media), `.post-stats` (likes/comments/shares counts), `.post-actions-bar` (like/comment/save/share buttons), and `.post-comments-section`.

56. **Clicking anywhere on a post card navigates to the single post view — except interactive elements.** A document-level click handler (capture phase) at the bottom of `feed.js` catches clicks on `.post-card` and calls `feedManager.navigateToPostView()` which redirects to `tabs/post-view.html?id={postId}` (or `?share={shareId}` for quote/repost shares). The handler excludes: `a` tags, `button`, `input`, `textarea`, `.post-stats`, `.post-actions-bar`, `.post-comments-section`, `.quoted-post-embed`, `.media-wrapper`, `.media-grid-cell`, `video`, and `IMG` tags — these all have their own click behavior.

    **Critical:** The handler skips navigation entirely on `post-view.html` pages (`window.location.pathname.includes('post-view.html')`) to prevent reloading the page when clicking the post you're already viewing. The CSS also disables the hover effect on post-view pages via `.post-view-container .post-card` overrides (cursor: default, no transform, no background change).

57. **The single post view page (`tabs/post-view.html`) reuses `feed.js` to render posts.** All 6 role folders have identical `post-view.html` files. They load `feed.js`, create a `FeedManager(true)` instance, fetch the post via `API.get('/posts/${postId}')` or `API.get('/posts/share/${shareId}')`, then call `feedManager.createPostElement()` or `createSingleQuotePostElement()` to render it. Comments are auto-expanded on single post view via `commentsSection.style.display = 'block'` + `feedManager.loadComments(targetPostId)`. The post is wrapped in a `.post-view-container` div, which is used for the CSS hover override.

    **Key files:**
    - Feed rendering + click handler: `frontend/shared/feed.js`
    - Feed styling + post-view overrides: `frontend/shared/feed.css`
    - Single post pages: `frontend/{role}/tabs/post-view.html` (6 identical files)

---

## Discover Page — Desktop Row Layout

58. **Discover pages use a 2-column row layout on desktop, not cards.** The old card grid (`repeat(auto-fill, minmax(300px, 1fr))`) was replaced with `repeat(2, 1fr)` rows using `.discover-desktop-row` elements. Each row is a flex container (76px min-height, 52px avatar) with 2–3 lines of text. Mobile rows (`.discover-row`) are unchanged — they're scoped inside `@media (max-width: 768px)` and use smaller 40px avatars. The `isMobile()` check in JS determines which HTML is generated; CSS provides a safety net with `.discover-desktop-row { display: none !important; }` in the mobile media query. At the 1024px breakpoint, the grid collapses to `1fr` (single column).

    **Desktop row line format per profile type:**

    | Profile Type | Line 1 | Line 2 (colored) | Line 3 (gray) | Color |
    |---|---|---|---|---|
    | HS Player | Name | Position • Height • Weight • GradYear | Team, State • Offers: # (orange) | `#1282a2` cerulean |
    | College Player | Name + logo | Position • Team • Division | — | `#1282a2` cerulean |
    | Transfer Player | Name + logo | Position • Height • Weight • YOE: N year(s) | Previous division: Div • Offers: # (orange) | `#b91c1c` red |
    | HS Coach | Name | Team, State | — | `#ff6b35` orange |
    | College Coach | Name + logo | Team, State • Division | — | `#ff6b35` orange |
    | Other | Name | subheader | — | `#d4a017` gold |

    **Position display:** Desktop rows show ALL positions separated by `/` (e.g. `CB/WR`) using `formatAllPositions()`. Mobile rows only show the first position (`split(/[,\/]/)[0]`). Coach position titles use `getPositionAcronym()` to convert full names to abbreviations (e.g. "Head Coach" → "HC").

    **Avatar SVG fallback coloring:** The `.discover-desktop-avatar` border variants must include a `color` property (not just `border` and `background`) so that the SVG fallback icon (`fill="currentColor"`) inherits the correct role color. Missing this causes all fallback avatars to render in the default text color instead of their role color.

    **Key files (12 total):**
    - CSS: `frontend/{role}/tabs/discover-players.css` (6 files) — desktop row styles + grid changes
    - JS: `frontend/{role}/tabs/discover-players.js` (6 files) — card functions rewritten to return row HTML

    **School logos** (`getSchoolLogoHTML()`) appear on Line 1 for college player, transfer player, and college coach rows. Each JS file calls `await ensureSchoolLogosLoaded('../../assets')` before rendering.

---

## UI Alerts & Confirmations

59. **Never use native `alert()` or `confirm()` anywhere on the platform.** All user-facing messages must use the platform's own UI components:
    - **Yes/no or save/cancel actions** → `showConfirmModal({ title, message, confirmText, cancelText, danger })` in `frontend/shared/api.js`. Returns a `Promise<boolean>`. CSS is injected automatically on first call — no CSS file changes needed.
    - **Everything else** (errors, warnings, validation) → `showToast(message, type)` in `frontend/shared/api.js`. Types: `'error'` (red), `'warning'` (yellow), `'success'` (green). Auto-dismisses after 4 seconds.
    - **Placeholder stubs** (e.g., `alert('Coming soon')`) → remove entirely or replace with a `// TODO` comment.

    Both functions are globally available on every page since `shared/api.js` is loaded everywhere. If you add a new feature that needs user feedback, use these — never `alert()` or `confirm()`.

---

## Feed Ranking — Twitter/Instagram-Style Engagement Scoring

60. **Engagement scores are recalculated in real-time on every engagement action.** The `engagement_score` column on the `posts` table is updated inside the same database transaction as every like, unlike, comment, delete comment, save, unsave, share, unshare, and unrepost. This is done via `Post._engagementScoreSQL()` — a static helper that returns the UPDATE SQL string for use with `client.query()` inside transactions. Never call it with `pool.query()` directly — it must run inside the transaction to keep the score consistent with the counts.

    **The 9 methods that trigger score recalculation (all in `backend/models/Post.js`):**
    - `like()`, `unlike()`, `addComment()`, `deleteComment()`, `savePost()`, `unsavePost()`, `sharePost()`, `unsharePost()`, `unrepostByPostId()`

    Each method already had a transaction (`BEGIN`/`COMMIT`/`ROLLBACK`) that updates the count column. The engagement score recalc line goes immediately after the count update, inside the same `if (result.rows[0])` guard.

61. **The engagement scoring formula uses weighted engagement divided by time decay.** The formula:

    ```
    score = (likes × 2.0 + comments × 3.0 + shares × 5.0 + saves × 2.5) / (hours_old + 2)^1.5
    ```

    **Weight rationale (inspired by Twitter/Instagram):**
    - **Shares (5.0):** Strongest signal — user is redistributing content to their network (like Twitter retweets at 20x weight)
    - **Comments (3.0):** Active engagement — indicates quality discussion
    - **Saves (2.5):** High-value signal — user wants to revisit later (Instagram weights saves heavily)
    - **Likes (2.0):** Lowest weight — passive, low-effort signal

    **Time decay:** The `POWER(hours + 2, 1.5)` divisor ensures newer posts rank higher than older posts with similar engagement. The `+ 2` offset prevents division by zero for brand-new posts and gives them a small initial boost window.

62. **Both feeds are ranked by engagement, not just Discover.** The two-tab feed system:

    - **Discover feed** (`getDiscoverFeed()`): All public posts from everyone, ranked by `engagement_score DESC`. This was already set up in the SQL — it just needed the scores to actually be populated.
    - **Following feed** (`getFollowingFeed()`): Posts from followed users + your own posts, ranked by engagement score with a **relationship boost** — posts from users whose profiles you've viewed in the last 30 days get a 1.5x score multiplier. Uses the existing `profile_views` table as a proxy for interest/relationship strength.

    **The following feed ORDER BY:**
    ```sql
    ORDER BY (
      COALESCE(fp.engagement_score, 0) *
      CASE WHEN EXISTS(
        SELECT 1 FROM profile_views pv
        WHERE pv.viewer_id = $1 AND pv.viewed_player_id = fp.user_id
        AND pv.created_at > NOW() - INTERVAL '30 days'
      ) THEN 1.5 ELSE 1.0 END
    ) DESC NULLS LAST, fp.sort_date DESC
    ```

    **Important:** `p.engagement_score` had to be added to both SELECT halves of the `getFollowingFeed()` CTE (original posts AND reposts/quotes UNION ALL) for the ORDER BY to reference it.

63. **Engagement scores decay over time and need periodic batch recalculation.** Because the formula includes time decay, scores become stale as posts age — even without new engagement. Two mechanisms handle this:

    - **Real-time recalc:** Triggered on every engagement action (Step 60 above). Keeps scores accurate when users interact.
    - **Batch recalc:** A `setInterval` in `backend/server.js` calls `Post.recalculateAllEngagementScores()` every 15 minutes. This updates scores for all posts from the last 7 days, ensuring time decay stays fresh even for posts with no new engagement. Errors are caught and logged — never blocks the server.

    **If scores seem wrong:** Run the backfill script manually: `node backend/scripts/recalculate-engagement-scores.js`. This recalculates ALL posts (not just last 7 days).

64. **The engagement score index is critical for feed performance.** Migration `008_add_engagement_score_index.sql` creates a composite index on `(engagement_score DESC NULLS LAST, created_at DESC)`. Both the Discover and Following feeds ORDER BY this column — without the index, sorting the full posts table gets slow as data grows. The index exists in both migration paths:
    - Local dev: `backend/scripts/add-engagement-score-index.sql` (in the MIGRATIONS array in `seed-local.js`)
    - Production: `backend/migrations/008_add_engagement_score_index.sql`

    **Key files for the entire engagement system:**
    - Scoring formula + all engagement methods: `backend/models/Post.js` (`_engagementScoreSQL()`, `recalculateAllEngagementScores()`)
    - Batch recalc interval: `backend/server.js` (setInterval after server.listen)
    - One-time backfill: `backend/scripts/recalculate-engagement-scores.js`
    - Index migration: `backend/migrations/008_add_engagement_score_index.sql`

65. **No frontend changes were needed for engagement ranking.** The two-tab UI (Discover / Your Network) in `frontend/shared/feed.js` already calls `postsAPI.getDiscoverFeed()` and `postsAPI.getFollowingFeed()` separately. The ranking change is entirely server-side — the backend returns posts in the new ranked order, and the frontend renders them identically. All 4 post rendering templates (`createPostElement`, `createRepostElement`, `createQuotePostElement`, `createSingleQuotePostElement`) are untouched.

---

## Discover Pages & Suggested Connections — Engagement-Based Profile Ranking

66. **Discover pages rank profiles by a "popularity score" instead of `created_at DESC`.** The popularity score is computed inline in SQL using existing columns — no new database columns needed. The formula varies by profile type:

    - **Players:** `(followers_count × 3) + (cc_views × 1) + (30-day post engagement_score SUM × 2)`
    - **Coaches:** `(followers_count × 3) + (30-day coach_profile_views COUNT × 1) + (30-day post engagement_score SUM × 2)`
    - **Other:** `(followers_count × 3) + (30-day post engagement_score SUM × 2)`

    The SQL expressions live in `backend/utils/popularity-score.js` as three functions: `playerPopularityExpr(alias)`, `coachPopularityExpr(alias)`, `otherPopularityExpr(alias)`. Each returns a SQL string that can be dropped into an `ORDER BY` clause. The alias parameter must match the table alias used in the query (e.g., `'pp'` for player_profiles, `'coach_profiles'` if no alias).

    **When search is active:** Similarity scoring stays primary — `followers_count` is added only as a lightweight tiebreaker for equally-similar results. The full popularity subquery is skipped during search to avoid overhead.

    **Filters are unaffected.** Only the `ORDER BY` clause changed — all `WHERE` conditions (position, state, graduation_year, min_height, min_weight, min_gpa, college_division, eligibility) remain identical.

67. **Suggested connections now rank by engagement + relevance instead of `ORDER BY RANDOM()`.** The `GET /profile/suggested-connections` endpoint in `backend/routes/profile.js` was rewritten with a multi-signal ranking:

    - **Base engagement score:** Same popularity formula as discover pages (followers × 3 + cc_views × 1 + post engagement × 2)
    - **Same-state bonus (+10):** Users from the same state as the current user rank higher — important for a recruiting platform where geography matters
    - **Mutual connections bonus (+5 per mutual):** "Friends of friends" — if people you follow also follow this user, they're more relevant
    - **Small random factor (0-2):** Prevents the same 5 users from always appearing, but is small enough that engagement still dominates

    **Bug fix included:** The query now excludes already-followed users via `AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = $1)`. Previously, followed users could appear in suggestions.

68. **Performance indexes for popularity scoring are in migration 009.** The correlated subqueries for post engagement use `SELECT SUM(engagement_score) FROM posts WHERE user_id = X AND created_at > 30 days`. Without proper indexes this would be slow. Migration `009_add_popularity_indexes.sql` adds:
    - `idx_player/coach/other_profiles_followers_count` — for sorting by followers
    - `idx_posts_user_engagement` — composite (user_id, created_at DESC) with partial WHERE for the 30-day engagement subquery
    - `idx_follows_follower_following` — composite for the suggested connections exclusion + mutual connections subquery

    **Key files:**
    - Popularity score expressions: `backend/utils/popularity-score.js`
    - Player discover (3 methods): `backend/models/PlayerProfile.js` — `searchHSPlayers()`, `searchCollegePlayers()`, `searchTransferPlayers()`
    - Coach discover: `backend/routes/coaches.js` — `GET /coaches/college`
    - Coach search: `backend/models/CoachProfile.js` — `search()` (adds `followers_count` tiebreaker)
    - Other discover: `backend/models/OtherProfile.js` — `discover()`
    - Suggested connections: `backend/routes/profile.js` — `GET /profile/suggested-connections`
    - Index migration: `backend/migrations/009_add_popularity_indexes.sql`

---

## Settings Subscription Section — `getProfileFolder` Bug

69. **`getProfileFolder(me.user)` returns the wrong folder because `me.user` doesn't have `college_division`.** The `/api/auth/me` endpoint returns `college_division` on `me.profile`, not `me.user`. Calling `getProfileFolder(me.user)` for a college coach returns `'hscoach'` (because `isCollege` is false), which is not in `PAID_PROFILE_TYPES`, so the Subscription tab shows "Your account type is free." The fix is to merge user and profile fields:

    ```javascript
    getProfileFolder({
        role: me.user.role,
        is_transfer_player: me.user.is_transfer_player,
        college_division: me.profile && me.profile.college_division
    });
    ```

    This pattern is already used correctly in `frontend/shared/mobile-header.js` (line 129) and `frontend/shared/view-profile.js` (line 32). Any future code calling `getProfileFolder` from an `/auth/me` response must merge both objects — never pass `me.user` alone.

    **Key file:** `frontend/shared/settings.js` — `initializeSubscriptionSection()`.

---

## Seed Data — Subscription Fields for Paid Test Accounts

70. **Seed script now sets subscription fields for the 3 paid test accounts.** Previously, `seed-local.js` never set `subscription_status`, `subscription_tier`, `stripe_subscription_id`, or `stripe_customer_id`, so all paid accounts showed "No Subscription" in Settings. The `seedSubscriptions()` function now runs after `seedProfiles()` and sets:
    - `hsplayer@test.com` → `tier='player'`, `status='active'`
    - `transferplayer@test.com` → `tier='player'`, `status='active'`
    - `collegecoach@test.com` → `tier='pro'`, `status='active'`

    All use mock Stripe IDs (`sub_mock_*`, `cus_mock_*`) that work with `stripe-local.js`. After seeding, the Settings Subscription tab shows correct plan names and the AI Usage modal shows the correct tier.

    **Key file:** `backend/scripts/seed-local.js` — `seedSubscriptions()`.

---

## AI Usage Modal — Stripe Billing Period

71. **AI Usage billing period now uses the Stripe subscription cycle, not calendar month.** Previously, `AiAnalytics.getUsageByCoach()` hardcoded `periodStart` to the 1st of the month and `periodEnd` to the last day. Now it fetches the coach's `stripe_subscription_id` from the users table and calls `stripe.getSubscription()` to get `current_period_start` and `current_period_end`. Token usage is summed within the Stripe billing window so the numbers match the displayed period. Falls back to calendar month if no active subscription or if the Stripe call fails.

    In local dev, the `stripe-local.js` mock returns `current_period_start = now` and `current_period_end = now + 30 days`, so the modal shows a 30-day window starting from today.

    **Key file:** `backend/models/AiAnalytics.js` — `getUsageByCoach()`.

---

## AI Recruiting Assistant — Row-Based Player Cards

72. **AI Recruiting Assistant now outputs horizontal row cards matching the Discover page format.** The old vertical card grid (`.ra-player-card` with avatar, position badges, stats grid, detail items with icons) was replaced with horizontal rows (`.ra-player-row`) matching the discover page desktop row layout.

    **HS Player row format:**
    ```
    [52px avatar, cerulean border] | Name
                                   | Position • Height • Weight • GradYear  (cerulean #1282a2)
                                   | School, State • Offers: N              (gray, offers orange)
                                   |                          [Save] [View Profile]
    ```

    **Transfer Player row format:**
    ```
    [52px avatar, red border] | Name + school logo
                              | Position • Height • Weight • YOE: N year(s)  (red #dc2626)
                              | Previously: School (Division)                (gray)
                              |                          [Save] [View Profile]
    ```

    **Key changes:**
    - Positions displayed as plain text joined by `/` (e.g., `CB/WR`), not badge spans
    - Transfer players show school logo via `getSchoolLogoHTML()` — requires `ensureSchoolLogosLoaded('../../assets')` before rendering
    - Save and View Profile buttons moved to `.ra-row-actions` on the right side of the row
    - Container class `ra-player-cards` kept (to avoid updating all querySelector references) but CSS changed from grid to `flex-direction: column`
    - All old CSS classes removed: `.ra-player-card`, `.ra-card-header`, `.ra-card-avatar`, `.ra-portal-badge`, `.ra-card-name`, `.ra-card-positions`, `.ra-position-badge`, `.ra-card-stats`, `.ra-stat-item`, `.ra-card-gpa-row`, `.ra-card-details`, `.ra-detail-item`
    - Portal Intelligence card output was NOT changed — only RA cards

    **Key files:**
    - JS: `frontend/collegecoach/tabs/discover-recruit-assistant.js` — `createPlayerCard()` rewritten
    - CSS: `frontend/collegecoach/tabs/recruit-assistant.css` — card styles replaced with row styles

---

## Docker — Retaining vs Resetting Local Database

73. **Use `docker-compose stop` / `docker-compose start` to keep your data.** These commands pause and resume the containers without touching the database volume. All accounts, profiles, stats, highlights, and uploads survive.

    **To stop (keeps all data):**
    ```
    docker-compose stop
    ```

    **To start again later:**
    ```
    docker-compose start
    ```

    Then just run `node backend/server.js` — everything is still there.

    **To wipe everything and start fresh:**
    ```
    docker-compose down -v
    docker-compose up -d
    cd backend
    npm run seed
    node scripts/seed-demo-data.js
    ```

    The `-v` flag in `docker-compose down -v` is what **deletes** the database volume. Never use `-v` unless you want to lose all data. `docker-compose down` (without `-v`) stops and removes containers but keeps the volume — data survives.

    **Remember:** If local PostgreSQL is running on port 5432, stop it first: `net stop postgresql-x64-18` (admin PowerShell). The seed script will silently connect to the wrong database otherwise (see lesson 10).

---

## Demo Data Seed Script

74. **`node backend/scripts/seed-demo-data.js` creates 15 fully-populated QB profiles for demo recordings.** Run it after the base `npm run seed`. It creates 5 HS players (2 from CO), 5 transfer players (various divisions), and 5 college players (with portal intelligence signals). Also creates 4 minimal coach accounts for the `browsing_coaches` portal signal.

    **All accounts use password `Test123!@#`.** Email format: `demo.firstname.lastname@test.com` (e.g., `demo.cody.harmon@test.com`).

    **What each profile includes:** Position (QB), height, weight, GPA, SAT, ACT, bio, jersey number, player status, offers (pipe-delimited with real school names from `school-logos.json` so logos display), star rating (HS only), conference/division (college/transfer), twitter/instagram/hudl, last season + career stats, 8 games with randomized QB stats, 2-3 highlight videos, 2-3 posts, follow relationships, and active subscriptions for paid types.

    **College players have portal intelligence signals:** `portal_keywords` (bio contains transfer-related keywords), `bio_and_film` (recent highlight upload + bio update within 14 days), and `browsing_coaches` (coach_profile_views showing they viewed coaches at other schools). Search for them via Portal Intelligence as `collegecoach@test.com`.

    **The script is idempotent** — safe to re-run. It checks if accounts exist before creating them.

    **Demo account emails (all use password `Test123!@#`):**

    *HS Players:*
     `demo.cody.harmon@test.com` — Valor Christian, Highlands Ranch, CO (4-star, Class of 2026)
     `demo.tyler.rae@test.com` — Cherry Creek, Greenwood Village, CO (3-star, Class of 2027)
     `demo.jaylen.archer@test.com` — IMG Academy, Bradenton, FL (5-star, Class of 2026)
     `demo.bryce.nolan@test.com` — Katy High School, Katy, TX (4-star, Class of 2026)
     `demo.mason.park@test.com` — De La Salle, Concord, CA (3-star, Class of 2027)

    *Transfer Players:*
     `demo.darius.cole@test.com` — Oregon State University, D1 FBS (3 yrs eligibility)
     `demo.elijah.monroe@test.com` — Sam Houston State University, D1 FBS (2 yrs eligibility)
     `demo.keegan.shaw@test.com` — Colorado Mesa University, D2 (3 yrs eligibility)
     `demo.andre.voss@test.com` — Bethune-Cookman University, D1 FCS (2 yrs eligibility)
     `demo.julian.west@test.com` — University of Mount Union, D3 (4 yrs eligibility)

    *College Players (portal signals active):*
     `demo.ryan.keeler@test.com` — Kansas State University, D1 FBS (portal_keywords + browsing_coaches)
     `demo.trevon.james@test.com` — Boise State University, D1 FBS (bio_and_film + browsing_coaches)
     `demo.marcus.bell@test.com` — Eastern Washington University, D1 FCS (portal_keywords)
     `demo.sean.calloway@test.com` — Colorado School of Mines, D2 (browsing_coaches + bio_and_film)
     `demo.nate.fischer@test.com` — University of Wisconsin - Whitewater, D3 (portal_keywords + bio_and_film)

    *Extra coaches (for portal browsing signal):*
    - `demo.coach.sec@test.com` — University of Alabama
    - `demo.coach.big12@test.com` — University of Oklahoma
    - `demo.coach.pac12@test.com` — University of Oregon
    - `demo.coach.d2@test.com` — Colorado State University Pueblo

---

## Mobile UX

75. **No popup modals on mobile — all modals must be full-screen.** Centered popup modals with backdrops feel cramped on small screens and are a poor mobile UX pattern. On mobile (≤768px), every modal must be a full-screen overlay (100vw × 100vh, fixed position, no backdrop gap visible). This applies to: profile viewers, followers/following lists, logout confirmation, share/repost menus, confirm modals, and any other modal-like UI. Desktop (>768px) can keep the centered popup style.

---

## College Coach Signup — Invite-Only Verification Flow

76. **College Coach signups are invite-only and gated behind a manual admin approval step.** Anyone selecting "College Coach" on `/landingpage/get-started.html` is now routed to `/landingpage/coach-signup-request.html` (a public contact form) instead of straight to create-coach-profile. They submit name (first + last), school, division (free-text on the form), position, phone, .edu email, personal email, and optional notes (150 char max). A `coach_signup_requests` row is inserted with `status='pending'`, an SES email is sent to `jackson@directrecruit.net` with all the details, and the coach sees a "we'll be in touch" success screen. HS coaches remain open-signup; the gate ONLY applies to college coach.

    **Why:** anyone with a credit card could previously register as a college coach and access the AI Recruiting Assistant + Portal Intelligence. This protects platform credibility (no fake recruiters messaging recruits) and gates the paid AI features behind real coaches.

77. **Admin approval happens in `/frontend/admin/coach-verification.html` (gitignored, scp'd to EC2 separately, same pattern as ai-dashboard).** Auth follows the same admin pattern as the AI analytics dashboard. The dashboard shows pending/approved/rejected tabs with a horizontally-scrollable table (sticky Actions column on the right). For each pending row Jackson sees: created time, name, submitted school + a 🔒 locked-school chip if locked, division, position, .edu email (mailto link), personal email, phone, notes preview, status, and Action buttons.

    **The Lock School flow is critical and required before approval can fire.** Each pending row has a pencil button next to the submitted school. Clicking it opens a floating editor panel (positioned via JS, anchored to the pencil button — NOT inside the table because `overflow-x: auto` on the table wrapper would clip the school-search dropdown). The panel reuses the same shared `initSchoolSearch` widget from `frontend/shared/school-search.js` that the collegecoach create-profile page uses — fuzzy search across all 828 schools in `frontend/assets/school-logos.json`, logo + division displayed inline, division auto-fills when a school is picked. Manual-entry mode is hidden via CSS so the admin MUST pick from the canonical list. On Lock, the request gets `locked_school` + `locked_division` + `locked_at` populated. The Approve button is `disabled` (greyed) until `locked_school IS NOT NULL` — server-side enforcement also returns 400 "Request must be locked before approval" if you try to approve via curl without locking.

    **Why force the lock step:** coaches type school names with typos and inconsistent capitalization ("Colorado School Of Mines" vs "Colorado School of Mines"). Without canonical names, the school-logo display + school-based AI filters break. The locked value is what gets copied into `coach_invites.school` + `coach_invites.division` on approval and ultimately into `coach_profiles.team_name` + `coach_profiles.college_division`.

78. **Approved coaches receive a single-use 64-hex token via email to their .edu address.** `crypto.randomBytes(32).toString('hex')` → stored in `coach_invites.token` with `expires_at = NOW() + 7 days`. Email is built by `sendCoachInvite()` in `backend/utils/email.js` (with a console-log mock in `backend/utils/local/email-local.js` that prints `INVITE URL: ...` to the terminal in dev). The link format is `${APP_URL}${FRONTEND_PATH_PREFIX}/collegecoach/create-coach-profile.html?token=${token}` — env vars default to `http://localhost:5000` + `/frontend` in dev, `https://directrecruit.net` + `''` in prod.

    **Token lifecycle:** valid → used (after successful profile insert sets `used_at`) → optionally revoked (admin click → sets `revoked_at`) → optionally expired (after 7 days). `GET /api/coach-signup/validate-token` distinguishes all four states for paywall messaging (`invalid` / `expired` / `used` / `revoked`).

    **Resilient to bailing:** the token is consumed AFTER profile insert succeeds, NOT on Stripe success or registration. So if a coach registers, hits Stripe, and bails → token is still valid, they can come back via the same URL and retry. Only successful profile creation kills the token. If they bail AFTER profile creation but BEFORE email verification → invite is dead, but they sign in via signin.html which auto-resends the verification code and routes them to the right verify-email page (see lesson 80).

79. **The create-coach-profile page is now invite-locked on three fields.** When `?token=...` is present in the URL, `coach-profile-form.js` validates the token via `GET /api/coach-signup/validate-token`. On success: first/last name pre-filled but editable; school field is locked using `schoolSearch.preselectSchool()` which renders the logo + name + division preview with the input hidden — IMPORTANT: only call `preselectSchool` if the value is an exact JSON key match (otherwise the module switches to manual mode and traps the admin/user); the division `<select>` is `disabled` with a hidden mirror `<input type="hidden" name="division">` so the value still submits (disabled selects don't); a 🔒 hint appears: "Verified school — contact support to change". Without a token → full-screen paywall overlay with "Request access" CTA → contact form.

    **Server-side override is the actual security boundary.** `req.body.team_name` and `req.body.college_division` are overridden from `coach_invites` regardless of what the frontend sends. `readonly` / `disabled` / `hidden` mirrors are UX only — DevTools tampering is allowed because the backend always wins. The override happens inside `createCoachProfile` in `backend/routes/profile.js`, which only fires for new (non-update) profiles where `school_type === 'college'`, so the existing `collegecoach@test.com` seed account and any legacy profiles are grandfathered in.

80. **Recovery flow when a coach gets stuck mid-signup.** Common case: coach finishes Stripe → profile created → invite consumed → but they close the tab before entering their email verification code. The invite URL is now dead. Fix: `POST /api/auth/login` returns `{requiresVerification: true, email, role, subtype}` on `UserNotConfirmedException` AND auto-resends the Cognito verification code. The new `subtype` field (set by querying `coach_profiles.college_division` etc. before responding) lets `frontend/landingpage/auth.js` route to the correct `/{subtype}/verify-email.html` instead of always defaulting to `/hscoach/verify-email.html` (the bug it had before).

    Also: `cognito-local.js` had a subtle bug where the DB-fallback in `getPasswordHash()` always cached `verified: true`, hiding the unverified state across server restarts. Fixed to read `email_verified` from the users table and respect it.

81. **The free-text Division field on the public contact form is intentional.** Coaches type whatever ("D1 FBS", "Division II", "fbs"). Backend just guards against absurdly long strings (>50 chars). The admin Lock modal is where it gets canonicalized to one of the 6 valid enum values via the school-search auto-fill. Don't add a dropdown to the public form — it adds friction without value, since the admin canonicalizes anyway.

82. **`coach_signup_requests.edu_email` has a UNIQUE constraint that doubles as anti-resubmit logic.** `POST /api/coach-signup/request` uses ON CONFLICT semantics: brand-new edu_email → insert + email Jackson; same pending edu_email within 24h → silent success (no spam); same pending edu_email after 24h → refresh row + re-email Jackson; status=approved or rejected → silent success (no email, no DB change). All paths return 200 to avoid leaking whether an email is in the system.

83. **Production setup checklist for this feature.**
    - Run `cd backend && npm run migrate:prod` to apply migrations 018 + 019 (coach_signup_requests, coach_invites, plus division/locked_school columns).
    - **Do NOT `scp` `frontend/admin/coach-verification.html` to EC2.** Same as the AI analytics dashboard (lesson 25), this HTML is local-only — run it via Live Server at `http://localhost:5500/frontend/admin/coach-verification.html`. It already targets prod via `API_BASE` and prompts for the admin key on first load (cached in localStorage as `coachVerificationKey`).
    - Set in prod `.env`: `APP_URL=https://directrecruit.net`, `FRONTEND_PATH_PREFIX=` (empty), `ADMIN_NOTIFY_EMAIL=jackson@directrecruit.net`. Admin auth reuses the existing AI analytics dashboard env var — no new key needed.
    - Confirm SES is out of sandbox mode in AWS Console → SES → Account dashboard. Sandbox mode only allows sending to verified addresses, which would block emails to arbitrary .edu addresses.
    - `pm2 restart direct-recruit --update-env` after pulling (the `--update-env` flag forces pm2 to re-read `.env` instead of using its cached copy).
    - Send yourself a real test request → approve → confirm the invite email actually arrives in a real .edu inbox.

84. **CSP ('script-src \'self\'') breaks any inline `<script>` on pages served by the node backend.** `payment-success.html` (collegecoach, hsplayer, transferplayer) and `payment-success-switch.html` were originally written with inline scripts, which silently fail with a console error — coach gets stuck on "Setting up your profile..." forever because the profile-creation code never runs. Fix: extract to external `payment-success.js` files. This was hidden during local dev because Live Server (port 5500) doesn't enforce CSP, only the node backend does. Test all post-Stripe pages on `:5000` to catch this category of bug, not just `:5500`.

85. **Service worker disabled in local dev.** `frontend/shared/sw-register.js` short-circuits when `window.location.hostname === 'localhost'` or `127.0.0.1`, AND actively unregisters any previously installed SW + wipes its caches. Reason: the SW had a network-first strategy that cached aggressively and treated CSP-blocked Google Fonts requests as network failures, causing it to serve stale or 503 responses for unrelated assets (logos, CSS) until a hard refresh. In dev this fights with file edits — every change required Ctrl+Shift+R until the SW was removed. Production deploys (`directrecruit.net`) still register the SW for PWA behavior.

---

docker-compose stop

docker-compose start

DO NOT run seed

---

## AI RA + AI PI — Range Queries Across Numeric Fields

86. **Every numeric filter that the AI features expose to coaches supports a `min_*` / `max_*` pair (or equivalent) so range queries actually work.** This was added incrementally after a coach query like "QBs with PFF grade between 50-60" silently dropped the upper bound and returned 90+ players — the classic "Claude has no field to express the ceiling so it leaves it null" bug. The fix pattern is the same for every field: add a `max_*` field to the Claude prompt schema + field rule, add a `WHERE pp.<col> <= $N` clause to both `PlayerProfile.searchByAiFilters` (RA) and `PortalSignal.queryBySignalFilters` (PI), and update `extractActiveFilters()` in `backend/routes/ai.js` so analytics log it.

    **Range-capable fields (both AIs):**

    | Field | Min key | Max key | DB column |
    |---|---|---|---|
    | Height | `min_height` | `max_height` | `pp.height` (inches) |
    | Weight | `min_weight` | `max_weight` | `pp.weight` |
    | GPA | `min_gpa` | `max_gpa` | `pp.gpa` |
    | SAT | `min_sat_score` | `max_sat_score` | `pp.sat_score` |
    | ACT | `min_act_score` | `max_act_score` | `pp.act_score` |
    | Graduation year | `graduation_year` | `max_graduation_year` | `pp.graduation_year` |
    | Eligibility | `eligibility` | `max_eligibility` | `pp.eligibility` |
    | PFF grade | `pff_grade_min` | `pff_grade_max` | `pp.pff_grade` |
    | Offer count | `offer_filters.min_count` | `offer_filters.max_count` | derived from `pp.offers` |

    **Special cases:**
    - **Track times** (`track_100m_max` / `track_200m_max`) — only have a max because faster = lower number; semantically the floor is meaningless for a "fast 100m" query. Don't add a min unless coaches start asking "100m time between 11.0 and 11.5" type queries.
    - **Stats** (`stat_filters`) — array-based, not a min/max pair. Range queries on stats are expressed as TWO entries in the array with the same `stat_key`/`season_year`/`per_game`/`positions` but different operators (`>=` and `<=`). Both entries become separate `EXISTS` subqueries that AND together. See lesson 87 for the seed-data gotcha with this approach on transferplayers.
    - **`graduation_year` and `eligibility` are backward-compatible.** When `max_graduation_year` is null, the field is matched as an exact value (legacy single-class behavior — "class of 2026" → equality). When `max_graduation_year` is also set, the field becomes the lower bound of a range. Same pattern for `eligibility`. This was a deliberate choice to avoid renaming existing fields and breaking analytics history.

    **The prompt instruction that actually fixes Claude's behavior:** The Claude prompts (`backend/utils/ai.js` for RA, `backend/utils/portal-intelligence.js` for PI) both have an explicit **RANGE QUERIES** prose section with examples for every field. The critical line is "NEVER silently drop the upper bound of a range — that's the common bug." Without that prose, Claude tends to set only the floor on range phrasing because the schema doesn't force it to fill both.

    **PI parity caveat:** Before this work, AI Portal Intelligence only supported `position`, `college_division`, `days`, `signal_types`, and `pff_grade_*`. Now it has the full RA filter set (state, height, weight, GPA, SAT, ACT, grad year, eligibility, track times, PFF, stats). The `PortalSignal.js` model still keeps its base WHERE clauses (`college_division IS NOT NULL`, `transfer != 'y'`) so it only ever returns current college players — but on top of that base, it now applies all the same numeric filters RA does.

    **Shared stat-key allowlist:** `VALID_STAT_KEYS` was hoisted from inside `PlayerProfile.searchByAiFilters` to module scope and exported alongside `COMPOSITE_STAT_KEYS`. `PortalSignal.js` imports both via `require('./PlayerProfile')`. This prevents drift — adding a new stat key only requires updating the one Set.

    **Key files:**
    - `backend/utils/ai.js` — RA Claude prompt schema + field rules + RANGE QUERIES prose
    - `backend/utils/portal-intelligence.js` — PI Claude prompt schema + field rules + RANGE QUERIES prose; injects `statsByPosition` + `statAliases` + `pffGradeTerms` from RA glossary
    - `backend/utils/recruit-assistant-glossary.js` — glossary section 18 `pffGradeTerms` has `minPatterns`, `maxPatterns`, `rangePatterns`, `vagueMinTerms`, `vagueMaxTerms`
    - `frontend/collegecoach/tabs/recruit-assistant-glossary.js` — frontend mirror of the same (lessons.md #19 rule)
    - `backend/routes/ai.js` — `extractActiveFilters()` logs all min and max keys for analytics
    - `backend/routes/ai-rep.js` — `FILTER_LABEL_MAP` groups max counterparts under the same label as min (e.g. `max_gpa` → "GPA")
    - `backend/models/PlayerProfile.js` — RA WHERE clauses + module-level `VALID_STAT_KEYS` / `COMPOSITE_STAT_KEYS` exports
    - `backend/models/PortalSignal.js` — PI WHERE clauses; aliases prefixed `sf_pi_` / `sg_pi_` to avoid collision risk
    - `backend/utils/local/ai-local.js` + `backend/utils/local/portal-intelligence-local.js` — local mocks include every new null field for round-trip parity

87. **PFF Grade vague-term tiers map to numeric thresholds.** Unlike the trackTerms anti-pattern ("burner" doesn't fire any filter because firing on vague speed terms would zero out results), PFF vague terms intentionally DO fire because grades cluster predictably 60-90. The glossary's `pffGradeTerms.vagueMinTerms` and `vagueMaxTerms` tables map loose language to a numeric default; explicit numbers in the query always override the vague mapping.

    **Vague min tiers** (floor, `pff_grade_min`): "average"/"decent"/"okay" → 60, "good"/"well graded"/"above average" → 70, "high"/"highly graded" → 75, "great"/"strong"/"top PFF guys" → 80, "elite"/"top-graded" → 85.

    **Vague max tiers** (ceiling, `pff_grade_max`): "backup"/"backup-level" → 65, "below average"/"low" → 60, "weak"/"poor" → 55, "bad" → 50, "underperforming"/"struggling" → 60.

    **Explicit + vague conflict:** "elite PFF, at least 90" → `pff_grade_min: 90` (explicit wins, NOT 85).

    The vague-max set was added late — initially the plan was "don't fire on ceiling terms, just note the limitation in reasoning," but with `pff_grade_max` now supported, ceiling vague terms also map to thresholds.

88. **Stat-range queries on randtest transferplayers double-count because `seed-transferplayers.js` emits both a pre-aggregated career row AND individual per-game rows.** The seed generator creates:
    - One row tagged `season_year = 0` with pre-summed career totals (e.g. `pass_yds: 7605`)
    - One row tagged `season_year = -1` with last-season totals
    - 10 individual game rows tagged with actual years (`2024`, `2025`) whose stats also sum to the same career total

    When the AI fires a stat filter with `season_year: 0` (the default, meaning "sum across all games"), the SQL has no season filter applied — so it sums BOTH the synthetic career row AND the 10 per-game rows. Net result: randtest transferplayer career stats appear ~2x in AI search results.

    **Why real users are unaffected:** The live "Add Game" UI only inserts individual per-game rows. The synthetic `season_year = 0` / `season_year = -1` rows are seed-data only, and only for transferplayers (hsplayer + collegeplayer seed generators don't create them). So real-user stat queries sum correctly.

    **Why this is left as-is:** The synthetic rows exist because the "Current Portal" tab UI in `frontend/collegecoach/tabs/transfer-portal.js` does a fast lookup on `season_year = 0` for the row preview rather than aggregating individual games on every render. Removing them would require either re-aggregating at render time (slower) or changing how the AI SQL distinguishes "career bucket row" from "per-game row" (more invasive). The bug is contained to test data, so it's accepted as a known seed artifact.

    **If a future change requires fixing this:** Cleanest option is changing the AI SQL to exclude `season_year IN (0, -1)` when summing "career totals" (`season_year: 0` filter), so it only sums real per-game rows. That would mean the synthetic rows become display-only and stop polluting aggregates. Would need to verify all consumers of the synthetic rows still work.

---

## Recruiting Period Indicator — Class-Year Eligibility & Transfer Disclaimer

89. **The Recruiting Period Indicator (RPI) above the message input on the college coach messages tab has THREE states, not one.** The container `#recruitingPeriodIndicator` ([frontend/collegecoach/tabs/messages.html](frontend/collegecoach/tabs/messages.html)) renders differently based on who the coach is talking to:

    | Participant | What renders |
    |---|---|
    | HS player (`role='player'`, `transfer!='y'`, no `college_division`) | Period row (`.rpi-content`) + Class-year eligibility row (`.rpi-eligibility-row`) |
    | Transfer player (`role='player'`, `transfer='y'`) | Single disclaimer-only strip (`.rpi-transfer-disclaimer`) — both other rows hidden |
    | Anyone else (college player, coach, other) | Entire indicator hidden |

    `updateRecruitingPeriodIndicator(participant)` in `messages.js` handles all three branches via `isHSPlayer()` and `isTransferPlayer()` helpers. **Important**: the function uses inline `style.display` resets at the top so switching between an HS conversation and a transfer conversation toggles both directions correctly. Forgetting to reset hides the wrong row on the second switch.

90. **Class-year eligibility is derived from `participant.graduation_year` + current date + coach's division — all on the frontend, recomputed on every conversation switch.** No backend changes were needed because `graduation_year` was already in the conversations API payload at [backend/models/Message.js:142](backend/models/Message.js#L142).

    **Helpers in `messages.js` (above `updateRecruitingPeriodIndicator`):**
    - `normalizeDivision(division)` — strips whitespace and the `D1` prefix so `'D1 FBS'` and `'FBS'` both resolve to `'FBS'`. Same normalization used in `getRecruitingPeriod()` for the period row.
    - `getClassYearFromGradYear(gradYear, today)` — returns `{ classYear, label, g }`. Uses NCAA-style "Rising X" labels between **June 15 and Aug 1** of each summer (e.g. a Class of 2028 player on June 16, 2026 reads as "Rising Junior", not "Sophomore"). After June 1 of grad year, flips to "Graduated".
    - `getContactEligibility(division, gradYear, today)` — returns `{ status: 'eligible' | 'not_yet' | 'unknown' }`. **Only D1 FBS/FCS can produce `not_yet`** because their messaging gate is Sept 1 of junior year; every other division allows direct messaging at any class year per NCAA rules. The check for FBS/FCS specifically tests `today >= new Date(g - 2, 8, 1)` (Sept 1 of junior fall) for rising juniors.
    - `getDivisionEligibilityData(division, gradYear, today)` — builds the modal payload: dynamic per-activity verdict lines + static rules table + footnote, all six divisions.

    **Badge UX**: green "Eligible" / red "Not Eligible" with a separate italic "Click for info" hint to its right (`.rpi-eligibility-hint`). Click opens `#eligOverlay`, a custom modal that mirrors the existing `#rcOverlay` palette but shows division-specific rules + a live verdict list with unlock dates and day-counts (e.g. "Off-campus contact: Unlocks June 15, 2026 (in 31 days)").

    **NCAA-style date constants per `graduation_year = g`:**
    - June 15 before junior year: `new Date(g - 2, 5, 15)` — D2 off-campus/visit gate, also "Rising Junior" label transition
    - Aug 1 before junior year: `new Date(g - 2, 7, 1)` — D1 official visit gate, also "Junior" label
    - Sept 1 of junior year: `new Date(g - 2, 8, 1)` — D1 messaging gate
    - Jan 1 of junior year: `new Date(g - 1, 0, 1)` — D3 official visit gate
    - June 1 of grad year: `new Date(g, 5, 1)` — flip to "Graduated"

    **Auto-refresh**: `new Date()` is called fresh inside `updateRecruitingPeriodIndicator()` every time a conversation is opened — no timer or interval. Coach has to click another conversation (or refresh) to see a midnight rollover. Deliberate trade-off for simplicity.

91. **Transfer-player conversations show a confirm-portal-entry disclaimer instead of the period/eligibility rows.** The strip (`.rpi-transfer-disclaimer`) reads: *"Confirm that this player has officially entered the **NCAA Transfer Portal** before initiating contact."* "NCAA Transfer Portal" is bolded in red. The disclaimer is intentionally minimal because the platform can't know the player's true portal status — only the coach (via the transfer portal database) can. The goal is a compliance reminder, not a verdict.

    The disclaimer only fires when `isTransferPlayer(participant) && currentCoachDivision` — so HS coaches messaging transfer players won't see it (it's only relevant to college coaches whose contact is NCAA-regulated).

92. **Each division tab in the Recruiting Calendar modal opens with a yellow disclaimer banner reminding coaches that rules change.** The `.rc-disclaimer` block (yellow `#eab308` left-border accent) sits above the calendar table on all 6 division tabs (D1 FBS, D1 FCS, D2, D3, NJCAA, NAIA). Wording differs by governing body:

    - NCAA divisions (D1 FBS/FCS, D2, D3) → link to `ncaa.org`
    - NJCAA → link to `njcaa.org`
    - NAIA → link to `naia.org`

    **Why a disclaimer instead of just keeping data current**: there's always a lag between NCAA bylaw changes and the next PDF release. The disclaimer covers that gap; it does NOT replace the yearly update obligation in lesson 17. If a coach makes a recruiting decision based on stale data, the disclaimer + compliance-office redirect is the legal safety net.

---

## Recruiting Board — Personal Boards (Phase 1)

93. **The Recruiting Board page is college-coach-only and has three subtabs: Personal Boards, Pipeline (placeholder), Shared Boards.** The page lives at [frontend/collegecoach/tabs/recruiting-board.{html,js,css}](frontend/collegecoach/tabs/recruiting-board.html). The `<h1>Recruiting Board</h1>` is hidden via inline `style="display: none;"` and replaced by `.rb-subtabs` (orange-active pills) — same pattern as Discover Players (`.dp-subtabs`) and Transfer Portal (`.tp-subtabs`). The football field, Offense/Defense toggle, and Add/Remove/Rename Position controls are page-level siblings of the tab containers (NOT inside `.rb-tab-content`) so they stay shared across the Personal and Shared tabs. CSS rules `body.rb-tab-pipeline`, `body.rb-personal-empty`, `body.rb-shared-empty`, and `body.rb-shared-no-boards` hide the field/controls when the relevant tab/state is active.

94. **Personal Boards: up to 5 named boards per coach, no class year.** Each board is one row in `recruiting_boards` at `(owner_user_id, is_personal=TRUE, class_year=0, board_name=<name>)` with its own `offense_positions`, `defense_positions`, and `players` JSONB. The 5-board cap is enforced in `RecruitingBoard.PERSONAL_BOARD_CAP` (model-level). The selector is a `<select>` dropdown with `+` (cerulean) and trash (red) buttons next to it; `+` disables at cap, trash disables at 0 boards. Empty state has a "Create Your First Board" CTA. Board ordering in the dropdown is `created_at ASC` (stable). Migration: [add-named-personal-boards.sql](backend/scripts/add-named-personal-boards.sql) backfilled the existing nameless personal board as `'My Board'`.

    **Key model methods** ([backend/models/RecruitingBoard.js](backend/models/RecruitingBoard.js)): `listPersonalBoards`, `createPersonalBoard`, `deletePersonalBoard`, `renamePersonalBoard`, `getPersonalBoardById`, `savePersonalBoardConfig`, `getPlayersFromPersonalBoardById`, `addPlayerToPersonalBoardById`, `removePlayerFromPersonalBoardById`, `updatePlayerPositionOnPersonalBoardById`. Routes are `/api/recruiting-board/personal/*` with `:boardId` in the URL — NOT `:classYear`.

95. **Legacy class-year personal-board endpoints are kept for backward compat.** The player-profile "Add to Recruiting Board" button on `frontend/{hsplayer,transferplayer}/tabs/my-profile.js` still hits the old `/recruiting-board/personal/:classYear/players` style routes. Those routes still exist in [backend/routes/recruiting-board.js](backend/routes/recruiting-board.js) marked with the `LEGACY` comment. Do NOT delete them until the player-profile flow is migrated to a board-picker UI (planned for Pipeline phase). The legacy `RecruitingBoard.getOrCreatePersonalBoard / getPositionConfig / savePositionConfig / addPlayerToPersonalBoard / removePlayerFromPersonalBoard / updatePlayerPositionOnPersonalBoard / getPlayersFromPersonalBoard` model methods are also kept alive solely for these legacy routes.

96. **The page-level shared football field DOM is moved between tabs by JS, not duplicated.** Single `.football-field-container` with `#offenseField` / `#defenseField` IDs lives once at the page level. JS sets `currentBoardMode` to `'personal'` or `'group'` and the field renders the corresponding data via the shared `renderBoard()` + `loadPlayersIntoBoard()` helpers. All branch points (`loadPlayersForBoard`, `updatePlayerPosition`, `saveBoardConfiguration`, `removeModalSubmit`, the move-modal flow) check `currentBoardMode` to pick the right API path. The legacy `currentBoardType` variable is also still consulted in some places — leave both in sync for safety.

97. **localStorage keys for state restoration:** `lastViewedRecruitingBoardSubtab` (`'personal-boards' | 'pipeline' | 'shared-boards'`), `lastViewedPersonalBoardId`, `lastViewedSharedGroupId`, `lastViewedSharedBoardId_{groupId}` (per-group, since each group has its own boards). On board/group delete, the corresponding localStorage entry is removed.

---

## Recruiting Board — Shared Groups (Phase 2 — Google-Docs-style)

98. **A "shared group" is a named collection of college coaches who collectively manage up to 5 named recruiting boards.** Each member has either `'viewer'` or `'editor'` permission. Each coach can be in **at most 1 group** (`BoardGroup.GROUPS_PER_USER_CAP = 1`) — enforced both at create time and at invite-acceptance time. If a coach is already in a group, the in-group selector row hides the `+` Create New Group button (the only path to create is the empty-state CTA). The group-name display in the row is a static label (no dropdown — there's only one).

    **Schema** (migration [add-board-groups.sql](backend/scripts/add-board-groups.sql) / [033_add_board_groups.sql](backend/migrations/033_add_board_groups.sql)):
    - `board_groups` table: `id, group_name, owner_user_id, created_at, updated_at`
    - `board_group_members` table: `(group_id, user_id, permission CHECK ∈ {viewer, editor}, added_at)` PK `(group_id, user_id)`. The owner is also stored as a row here with `permission = 'editor'` so a single `WHERE user_id = $X` query yields every group the coach can see.
    - `recruiting_boards.group_id UUID REFERENCES board_groups(id) ON DELETE CASCADE` — group boards are rows where `group_id IS NOT NULL AND is_personal = FALSE AND class_year = 0`. Same flat-roster model as personal boards.
    - The migration also wipes pre-Phase-2 shared rows: `DELETE FROM recruiting_boards WHERE is_personal = FALSE AND group_id IS NULL` — the legacy single-board shared system was retired entirely.

99. **Permission enforcement is per-route via `requireGroupAccess(level)` middleware.** `level` is `'any' | 'editor' | 'owner'`. Loads the requester's permission row and 403s if insufficient. This is the "immediate kick" pattern — a removed coach's next API call returns 403 (no Socket.IO push). The middleware sets `req.groupPermission = { permission, is_owner }` for downstream handlers. Ownership rules:
    - **Owner only**: transfer ownership, change owner's permission (impossible — must transfer first)
    - **Editor or owner**: rename group, delete group, invite/cancel-invite, remove members, change member permissions, all board CRUD (create, delete, rename, position config, player add/remove/move)
    - **Any member**: read group details, read board list, read board config + players

    **`/groups/search-coaches` route order matters.** The static `/groups/search-coaches` route MUST be defined BEFORE the parametric `/groups/:groupId` routes — otherwise Express matches `'search-coaches'` as a `groupId` and the `validateUUID('groupId')` middleware rejects it. Comment in the routes file flags this.

100. **Group-board model mirrors personal-board model exactly, swapping the ownership predicate.** New `RecruitingBoard` methods: `listGroupBoards(groupId)`, `createGroupBoard(groupId, boardName)` (caps at `BOARDS_PER_GROUP_CAP = 5`), `deleteGroupBoard(boardId, groupId)`, `renameGroupBoard(boardId, groupId, newName)`, `getGroupBoardById(boardId, groupId)`, `saveGroupBoardConfig`, `getPlayersFromGroupBoardById`, `addPlayerToGroupBoardById`, `removePlayerFromGroupBoardById`, `updatePlayerPositionOnGroupBoardById`. The `boardId + groupId` pair is always required so a malicious request can't reach into another group's board. `RecruitingBoard.checkPlayerOnBoards(userId, playerId)` was rewritten to scan personal boards + every group board across every group the coach is a member of.

    **`BoardGroup` model methods** ([backend/models/BoardGroup.js](backend/models/BoardGroup.js)): `listGroupsForUser`, `getGroupById` (returns full members list with their `permission` + `coach_profiles` join), `getMembership` (used by `requireGroupAccess`), `hasPendingInvite`, `createGroup` (transactional — creates group + adds creator as editor row), `deleteGroup`, `renameGroup`, `transferOwnership` (transactional — flips `owner_user_id`, promotes new owner to editor), `leaveGroup` (smart — if owner is leaving and another editor exists, auto-transfers; if only viewers left, promotes oldest viewer to editor + owner; if last member, deletes the group), `addMember`, `removeMember` (cannot target the owner), `updatePermission` (cannot modify owner's permission).

101. **Invites are notification-based with permission encoded in the `related_entity_type`.** The notifications schema has no `metadata` column, so the proposed permission is stored in the entity type itself: `'group_invite'` = viewer (default), `'group_invite_editor'` = editor. The accept handler (`POST /api/recruiting-board/invite/accept` with `{ groupId, notificationId }`) reads the entity type back to know what permission to apply. All search/list/cancel queries match BOTH variants via `related_entity_type IN ('group_invite', 'group_invite_editor')`. Other notification types: `group_invite_sent` (sender's tracking), `group_invite_accepted`, `group_invite_declined`, `group_member_removed`, `group_ownership_transfer`, `group_member_left`. Notification rendering is in [frontend/collegecoach/tabs/notifications.js](frontend/collegecoach/tabs/notifications.js) — the `boardNotificationTypes` array lists all 8 group_* types and `isBoardInvite` accepts both invite variants. Accept/Decline POST bodies send both `boardId` and `groupId` for back-compat.

102. **Member adds use a STAGED list inside the create-group / Group Info modal.** The user searches → clicks a coach → coach gets added to a staged list with a per-row permission `<select>` (default viewer) and an `×` to remove. Nothing hits the server until the user clicks **Create Group** (in the create flow) or **Send Invites** (in Group Info). At submit, the frontend iterates the staged list and POSTs `/groups/:id/invite` once per coach. Closing or canceling the modal discards the staged list — no invites sent. The shared renderer is `renderStagedList(arr, listElId, countElId, saveBtnElId)`.

103. **Same-school disclaimer fires at PICK time, not submit time.** When a coach clicks "Add" on a search result whose `team_name` doesn't match the requester's `team_name` (case-insensitive), the `#sgSameSchoolModal` opens with both school names bolded. On Continue, the coach is staged. On Cancel, nothing happens. No second prompt at submit. The requester's `team_name` is cached in `currentUserTeamName` from `/auth/me` at tab init. The disclaimer modal uses red destructive accents (`#ef4444`, NOT yellow), with `z-index: 1100` so it stacks above the create-group / Group Info modal that triggered it. Same `z-index: 1100` rule applies to `#deleteSharedGroupModal`, `#sgRemoveMemberModal`, and `#sgTransferConfirmModal` — all secondary modals that fire from inside Group Info.

104. **Read-only enforcement for viewers is centralized in `applySharedPermissionToUI()`.** Called on every group board (re)render. Hides: create/delete board buttons, rename board pencil, Add Position / Remove Position buttons. Sets: position-label inputs to `readOnly`, recruit cards to `draggable=false`. Editors and owners see everything; the only owner-exclusive UI is the Transfer Ownership section in the Group Info modal. The pencil for renaming the GROUP itself (`sgGroupNameEditBtn`) is also hidden for viewers via `renderGroupNameDisplay`.

105. **Inline rename is a single shared helper used by the group, personal boards, and shared boards.** `startInlineRename({display, input, getCurrentValue, commit, onCancel})` hides `display`, shows `input` pre-filled, focuses + selects, commits on Enter or blur, reverts on Escape. Empty/unchanged values revert silently. Errors restore the original via toast + `onCancel`. Rename buttons are scoped to permission:
    - Personal board rename: always visible to owner of the board (the only viewer of personal boards).
    - Group board rename: visible only to editors/owners (hidden via `applySharedPermissionToUI`).
    - Group name rename: lives inside the Group Info modal (NOT in the row), visible only to editors/owners (toggled by `renderGroupNameDisplay`).

    **Duplicate-ID gotcha:** the group name had a `<span id="sgGroupNameLabel">` in BOTH the row and the modal at one point. `getElementById` returns only the first match, so writes silently went to the wrong element. Fixed by giving the row label a different ID (`sgGroupNameRowLabel`) and having `renderGroupNameDisplay` write to both. If you ever duplicate a label across the row and a modal, give them distinct IDs.

106. **Group Info modal layout uses `.sg-modal-content` (560px wide, scrollable body).** Generic modal-content rules cap at 400-480px and stack the header in a column with a giant centered icon — those rules win without explicit overrides. The `.sg-modal-content` rule overrides with higher-specificity selectors: `.recruiting-board-modal.collab-modal .sg-modal-content` and `.recruiting-board-modal.confirm-modal .sg-modal-content`. The header is restructured to a horizontal row (`flex-direction: row !important`) so the title, rename pencil, and close button sit inline. Body is `flex: 1 1 auto; overflow-y: auto; min-height: 0` (the `min-height: 0` is required so the flex child can actually shrink below its content size and scroll).

107. **Visual divider separates the GROUP row from the BOARD row in the Shared Boards tab.** A `<hr class="sg-section-divider">` between `.sg-group-selector-row` and `.sg-board-selector-row` makes it obvious that group-level controls (Group Info, Leave Group) are distinct from board-level controls (Rename, Add, Delete board). The divider's visibility is tied to `hideSharedEmptyState` / `showSharedEmptyState` — only shows when the coach is in a group.

108. **The College Coach subheader format is `Team, State • Division` in `var(--accent-orange)` (`#ff6b35`).** Used everywhere a coach is rendered in the shared-groups UI: search results, staged member list, current members, pending invites. Avatar is 40px with `var(--accent-orange)` ring and `rgba(255, 107, 53, 0.2)` tinted bg — matches `getRoleBorderColor('coach')` from `shared/api.js`. Always SELECT `cp.team_name, cp.state, cp.college_division` when fetching coach profiles for these views. `.sg-coach-avatar` and `.sg-coach-subheader` are the CSS classes.

    **`.confirm-modal` body has `text-align: center` that leaks into the search results and centers the names.** Override with explicit `text-align: left` on `.sg-search-results, .sg-staged-list, .sg-members-list, .sg-pending-list, .sg-search-result-item, .sg-staged-row, .sg-member-row, .sg-search-result-details` inside `.recruiting-board-modal`.

109. **Replacing a `<select>` with a static element requires guarding every `.value =` assignment.** When the group selector dropdown was removed (cap of 1 group), the JS still had four `sharedGroupSelect.value = ...` assignments scattered through the init/create/leave/delete handlers. Each one threw `TypeError: Cannot set properties of null` and short-circuited the entire group-load chain — the permission chip, group name label, and Group Info button looked broken because `loadSharedGroup` never finished. Always wrap with `if (sharedGroupSelect)` or refactor to skip the assignment when the element is gone. Lesson generalizes: when removing a DOM element used by an existing JS, audit every `getElementById` consumer of that ID.

110. **Soft-delete with partial UNIQUE indexes is the right pattern when "history survives removal" + "re-add must work."** `pipeline_recruits` adds `removed_from_pipeline_at TIMESTAMP NULL` (migration `038_add_pipeline_soft_delete.sql`); `PipelineRecruit.delete()` UPDATEs that column instead of DELETE. Both existing UNIQUE indexes on `(coach_user_id, pool_entry_id)` and `(coach_user_id, linked_player_user_id)` are dropped + recreated with an extra `AND removed_from_pipeline_at IS NULL` in the WHERE clause, so the same (coach, pool_entry) pair can coexist as one soft-deleted row + one fresh re-add — each re-add starts ungraded; the old soft-deleted row keeps its grade in history for the Evaluation tab's "year later" UX.

    **Read-site audit was the bulk of the work.** Every SELECT against `pipeline_recruits` had to choose to filter or include soft-deleted. Filter sites (the live state): `getByIdForCoach`, `getPipelineForCoach`, `countAtSchoolForPoolEntry`, `containsLinkedPlayerForCoach`, the LATERAL subqueries in [recruiting-board.js](backend/routes/recruiting-board.js) `/my-pool` list + detail (the cross-coach checkmark count), and `PipelineHandoff.create()`'s source-recruit existence guard (no hand-off off a tombstoned row). Include-soft-deleted sites: **only** `PipelineRecruit.getEvaluationsAtSchool` — that's the whole reason the row exists. Missing any one of these would either show ghost recruits in the pipeline list or break the cross-coach checkmark count.

    **`pipeline_handoffs.source_recruit_id ON DELETE CASCADE` clause is now dead but harmless** — since no rows physically delete anymore, the cascade never fires. Kept as-is; documented in the migration header.

111. **The cross-coach evaluation history endpoint decorates each row with three flags so the frontend can resolve the viewer's state without extra roundtrips.** `GET /api/pipeline/evaluations` returns one entry per coach at the school who's graded the recruit (including soft-deleted historicals), each carrying `recruit_id` (the pipeline_recruits.id of THAT coach's row — used by the viewer to cache their own `currentEvalRecruit.id` when opening the unified info modal from a board card), `is_active` (`removed_from_pipeline_at IS NULL` — false for historicals so the row renders muted with an "(inactive)" badge), and `is_mine` (`coach_id === req.userId` — added in the route, not the model, so the model stays viewer-agnostic). The frontend's `loadEvaluationsForModal` uses `evals.find(e => e.is_mine && e.is_active)` to determine `_inMyPipeline` and to cache `recruit.id` for the footer action buttons (Send to Coach, Remove from Pipeline). This single endpoint replaces what would otherwise be 2-3 roundtrips per modal open (`/contains` + evaluations + a separate id-resolve).

112. **`.btn-submit` in [recruiting-board.css](frontend/collegecoach/tabs/recruiting-board.css) is footer-scoped (`.recruiting-board-modal-footer .btn-submit`), so in-body buttons that need the orange-primary look must restate the styling explicitly.** Symptom: the button renders as the bare-default native browser `<button>` — white background, system font, no padding. Fix is to add per-id rules (e.g. `#evalAddOrEditGradeBtn, #evalFinalGradeSaveBtn, #gradeEntrySaveBtn { background: var(--accent-orange); … }`) plus matching `:hover:not(:disabled)` and `:disabled` rules. When adding any new in-body primary action button to this page, either name it in the per-id rule block or move the button into the modal footer.

---

## Credential Rotation Log

> Record every rotation of a prod secret here. Values stay in Bitwarden — this is just an audit trail of *when* something was rotated.

| Date | Credential | Notes |
|---|---|---|
| 2026-05-12 | `ADMIN_ANALYTICS_KEY` | Initial rotation. Also refactored `frontend/admin/ai-dashboard.html` to prompt+localStorage pattern (no more hardcoded key). |
| 2026-05-12 | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Rotated together. Old key deactivated in IAM same day; delete after 24h+ of confirmed prod operation. |
| 2026-05-12 | `AWS_COGNITO_CLIENT_SECRET` | Verified by signing in fresh. |
| 2026-05-12 | `DB_PASSWORD` | RDS master password for `direct-recruit-db`. Modified via RDS console with Apply Immediately. |
| 2026-05-12 | `JWT_SECRET` | Logged out all existing sessions (expected). Verified by signing in fresh. |

