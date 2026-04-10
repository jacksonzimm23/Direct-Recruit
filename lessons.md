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

17. **Recruiting calendar data comes from yearly-updated files and must be kept in sync.** The PDF/image files in `docs/recruiting-info/screenshots/` are updated yearly by the NCAA, so the period dates in the recruiting calendar modal (`frontend/collegecoach/tabs/messages.html`) must be updated to match whenever new files are uploaded. The recruiting info spec lives in `docs/recruiting-info/recruiting_info.md`. Divisions covered: D1 FBS, D1 FCS, D2, D3, NJCAA.

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

    **PRODUCTION SETUP REMINDER:** To get the dashboard working on prod:
    1. SSH into EC2 and add `ADMIN_ANALYTICS_KEY=your-secret-key` to the production `~/direct-recruit/backend/.env`
    2. Restart the backend: `pm2 restart all`
    3. Copy `frontend/admin/ai-dashboard.html` to the EC2 instance (it's gitignored so `git pull` won't bring it — use `scp` or create it manually)
    4. In the prod copy of the dashboard HTML, change `API_BASE` from `http://localhost:5000` to `http://98.82.239.221:5000` (or your domain)
    5. Make sure `ADMIN_KEY` in the dashboard HTML matches the key in the prod `.env`
    6. Run `cd ~/direct-recruit/backend && npm run migrate:prod` to create the `ai_analytics`, `ra_saved_players`, and `ai_engagement_events` tables on prod



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

## TODOs
*TODO: Add profile view modal for all profile types 

Take a look at the right sidebar on the hsplayer and transferplayer page. They have the profile views modal to see who is viewing their profile. 2 things, currently, it only shows collegecoach views, make it so it shows all profile views from any profile type (and add a 2 day cool down, to where if a person views the same profile twice in 1 day, it will only show once. And if they view 2 days later it will show who viewed). also, make it so ALL profiles have this right sidebar (with the toggle) on the my profile page to see all profile views. Make sure profile modal is displaying profiles in the correct format and colors, and make sure only the logged in user viewing the my profile page can see the profile views right sidebar. No one else should be able to see this info. Please plan out for me