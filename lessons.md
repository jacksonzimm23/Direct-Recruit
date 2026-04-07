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

## TODOs

**TODO: Adding subscription tiers and stripe (Stripe integration for paid profile types: collegecoach, hsplayer, transferplayer)

**TODO: Fix sign up college inputs with their logos, show logo icon badge

**TODO: Save button on posts