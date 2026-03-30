# Direct Recruit - Pre-Launch QA Checklist

> **Instructions:** Work through each section on both desktop and mobile. Check the box when verified. Run the DB queries in a terminal connected to your Docker Postgres container:
> ```bash
> docker exec -it dr-postgres psql -U postgres -d direct_recruit
> ```
> After each major action, verify the database. Reset the environment anytime with:
> ```bash
> docker-compose down -v && docker-compose up -d && cd backend && npm run seed
> ```

---

## Test Accounts

| Email | Password | Role | Username | Name |
|---|---|---|---|---|
| hsplayer@test.com | Test123!@# | HS Player | jakethompson | Jake Thompson |
| collegeplayer@test.com | Test123!@# | College Player | marcuswilliams | Marcus Williams |
| transferplayer@test.com | Test123!@# | Transfer Player | deshawncarter | DeShawn Carter |
| hscoach@test.com | Test123!@# | HS Coach | coachrodriguez | Mike Rodriguez |
| collegecoach@test.com | Test123!@# | College Coach | coachjohnson | Sarah Johnson |
| other@test.com | Test123!@# | Other | robertthompson | Robert Thompson |

**Verification code for all flows:** `123456`

---

## Part 1: Landing Pages (No Login Required)

### 1.1 Homepage (`/frontend/landingpage/index.html`)
- [ ] Page loads with hero section, features, and CTA buttons
- [ ] "Create Your Profile" button navigates to get-started page
- [ ] "Sign In" nav link navigates to sign-in page
- [ ] Nav links (Home, Features, How It Works, About) scroll/navigate correctly
- [ ] Mobile: hamburger menu opens and all links work

### 1.2 Get Started (`/frontend/landingpage/get-started.html`)
- [ ] Three role cards display: Player, Coach, Other
- [ ] Each card shows icon, description, and benefits list
- [ ] "Continue" on Player card navigates to HS player create-profile
- [ ] "Continue" on Coach card navigates to HS coach create-coach-profile
- [ ] "Continue" on Other card navigates to other create-profile
- [ ] "Already have an account? Sign In" link works

### 1.3 Sign In (`/frontend/landingpage/signin.html`)
- [ ] Email and password fields present
- [ ] Login with `hsplayer@test.com` / `Test123!@#` succeeds and redirects to HS player dashboard
- [ ] Login with invalid credentials shows error message
- [ ] "Forgot Password?" link navigates to forgot-password page
- [ ] "Create Account" / sign-up link navigates to get-started page

### 1.4 Forgot Password (`/frontend/landingpage/forgot-password.html`)
- [ ] Enter email field works
- [ ] Submit sends reset request (check terminal for verification code log)
- [ ] Verification code input appears
- [ ] Enter `123456` and new password — password resets successfully
- [ ] DB: `SELECT * FROM pending_password_resets ORDER BY created_at DESC LIMIT 1;`

### 1.5 Static Pages
- [ ] About page (`/frontend/landingpage/about.html`) loads correctly
- [ ] Privacy Policy page (`/frontend/landingpage/privacy-policy.html`) loads correctly
- [ ] Support page (`/frontend/landingpage/support.html`) loads correctly
- [ ] 404 page (`/frontend/404.html`) displays branded error page
- [ ] 500 page (`/frontend/500.html`) displays branded error page

---

## Part 2: High School Player (hsplayer@test.com)

### 2.1 Login & Dashboard
- [ ] Login with `hsplayer@test.com` / `Test123!@#`
- [ ] Redirected to `hsplayer/mainpage-player.html`
- [ ] Sidebar nav displays all links: Feed, Discover, Messages, Notifications, Settings
- [ ] Sidebar footer shows user avatar, name "Jake Thompson", and subtitle (position, height, weight, grad year)
- [ ] Right sidebar shows "Suggested Connections" with user cards
- [ ] Unread message badge shows in sidebar (if unread messages exist)
- [ ] Unread notification badge shows in sidebar (if unread notifications exist)
- [ ] DB: `SELECT u.username, u.role, pp.first_name, pp.last_name, pp.position, pp.graduation_year FROM users u JOIN player_profiles pp ON u.id = pp.user_id WHERE u.email = 'hsplayer@test.com';`

### 2.2 Feed
- [ ] "Following" feed tab loads (may be empty if not following anyone)
- [ ] "Discover" feed tab loads with posts from other users
- [ ] Feed posts show: author avatar, name, username, timestamp, content, media (if any)
- [ ] Each post shows like, comment, repost, save buttons with counts

### 2.3 Create a Post
- [ ] Post creation textarea visible at top of feed
- [ ] Type text and click Post — post appears in feed
- [ ] Create a post with an image (upload via media button, max 4 files)
- [ ] Create a post with a video
- [ ] Mobile: post creation modal opens and works
- [ ] DB: `SELECT id, content, media_urls, media_type, likes_count, comments_count, created_at FROM posts WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC LIMIT 3;`

### 2.4 Post Interactions
- [ ] **Like** a post — heart fills, count increments
- [ ] **Unlike** a post — heart unfills, count decrements
- [ ] **Comment** on a post — comment form opens, type and submit
- [ ] **Reply** to a comment — nested reply appears
- [ ] **Like a comment** — count increments
- [ ] **Repost** a post — repost modal appears, confirm repost
- [ ] **Quote post** — repost modal, add quote text, submit
- [ ] **Save** a post — bookmark icon fills
- [ ] **Unsave** a post — bookmark icon unfills
- [ ] DB (likes): `SELECT * FROM post_likes WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC LIMIT 5;`
- [ ] DB (comments): `SELECT * FROM post_comments WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC LIMIT 5;`
- [ ] DB (reposts): `SELECT * FROM post_shares WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC LIMIT 5;`
- [ ] DB (saves): `SELECT * FROM post_saves WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC LIMIT 5;`

### 2.5 Post View Page
- [ ] Click on a post — navigates to `tabs/post-view.html`
- [ ] Full post content displayed with all interactions
- [ ] Comments section visible with all comments and replies
- [ ] Back button returns to previous page

### 2.6 Discover Page (`tabs/discover-players.html`)
- [ ] Page loads with "Find Coaches" and "Connect with Players" sections
- [ ] State filter dropdown works (no white space gaps)
- [ ] Division filter dropdown works (no white space gaps)
- [ ] "Reset Filters" button clears all filters
- [ ] Coach cards display with name, school, state, division
- [ ] Player cards display with name, position, school
- [ ] "Load More" buttons load additional results
- [ ] Click on a coach card — navigates to their profile
- [ ] Click on a player card — navigates to their profile
- [ ] Mobile: filter FAB button opens filter modal

### 2.7 My Profile (`tabs/my-profile.html`)
- [ ] Profile header shows: avatar, name, position, school, height, weight, grad year
- [ ] Username displayed correctly
- [ ] Follower/Following counts displayed and clickable
- [ ] "Edit Profile" button opens edit modal/form
- [ ] "Share Profile" button copies profile link or opens share options
- [ ] **Tabs work:** Overview, Posts, Replies, Likes, Offers, Stats, Highlights, Academics
- [ ] Tab scroll arrows appear when tabs overflow (mobile)

#### 2.7a Edit Profile
- [ ] Edit profile form loads with current values pre-filled
- [ ] Update first name, last name — saves correctly
- [ ] Update position — saves correctly
- [ ] Update height/weight — saves correctly
- [ ] Update bio — saves correctly
- [ ] Update profile image — upload works, new avatar displays
- [ ] DB: `SELECT first_name, last_name, position, height, weight, bio, profile_image_url FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson');`

#### 2.7b Offers Tab
- [ ] "Add Offer" button opens offer form
- [ ] Fill out offer (school, division, scholarship type) and save
- [ ] Offer appears in offers list
- [ ] Edit an existing offer — changes save correctly
- [ ] Delete an offer — offer removed from list
- [ ] DB: `SELECT * FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson');` (offers stored in profile JSONB or offers table)

#### 2.7c Stats Tab
- [ ] "Add Game" button opens game form
- [ ] Fill out game (date, opponent, result, stats) and save
- [ ] Game appears in stats list with correct data
- [ ] Edit a game — changes save correctly
- [ ] Delete a game — game removed from list
- [ ] DB: `SELECT pg.*, pgs.stats FROM player_games pg LEFT JOIN player_game_stats pgs ON pg.id = pgs.game_id WHERE pg.player_id = (SELECT id FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson')) ORDER BY pg.game_date DESC;`

#### 2.7d Highlights Tab
- [ ] "Add Highlight" button opens form
- [ ] Add highlight with Hudl link and title — saves correctly
- [ ] Highlight appears in list
- [ ] Edit highlight — changes save correctly
- [ ] Delete highlight — removed from list
- [ ] DB: `SELECT * FROM player_highlights WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC;`

### 2.8 Follow / Unfollow
- [ ] Navigate to another user's profile (e.g., Marcus Williams)
- [ ] Click "Follow" — button changes to "Following"
- [ ] Check your following count incremented
- [ ] Click "Following" to unfollow — button changes back to "Follow"
- [ ] DB (follow): `SELECT f.*, u1.username AS follower, u2.username AS following FROM follows f JOIN users u1 ON f.follower_id = u1.id JOIN users u2 ON f.following_id = u2.id WHERE u1.username = 'jakethompson';`
- [ ] DB (counts): `SELECT followers_count, following_count FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson');`

### 2.9 Profile Views
- [ ] Log in as another account (e.g., `collegecoach@test.com`)
- [ ] Navigate to Jake Thompson's profile
- [ ] Log back in as `hsplayer@test.com`
- [ ] Check profile view count on My Profile page
- [ ] DB: `SELECT pv.*, u.username AS viewer FROM profile_views pv JOIN users u ON pv.viewer_id = u.id WHERE pv.profile_id = (SELECT id FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson')) ORDER BY pv.created_at DESC;`

### 2.10 Messages (`tabs/messages.html`)
- [ ] Conversation sidebar loads (empty if no conversations)
- [ ] Start a new conversation: navigate to another user's profile, click "Message"
- [ ] Conversation appears in sidebar
- [ ] Type and send a text message — message appears in thread
- [ ] Receive a message (log in as other user and reply) — message appears in real-time or on refresh
- [ ] Search conversations by username works
- [ ] Delete/hide a conversation — conversation removed from sidebar
- [ ] DB (conversation): `SELECT c.*, cp.user_id, u.username FROM conversations c JOIN conversation_participants cp ON c.id = cp.conversation_id JOIN users u ON cp.user_id = u.id WHERE c.id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson'));`
- [ ] DB (messages): `SELECT m.content, m.read, u.username AS sender, m.created_at FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson')) ORDER BY m.created_at DESC LIMIT 10;`

### 2.11 Notifications (`tabs/notifications.html`)
- [ ] Notifications page loads
- [ ] Filter tabs work: All, Messages, Follows, Interactions
- [ ] Notification counts display on each tab
- [ ] Click a notification — navigates to related content (post, profile, message)
- [ ] "Mark All Read" button marks all as read
- [ ] Delete individual notification works
- [ ] DB: `SELECT type, title, message, is_read, created_at FROM notifications WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC LIMIT 10;`

### 2.12 Settings (`tabs/settings.html`)

#### 2.12a Account Settings
- [ ] Current email displays (disabled field)
- [ ] Change email flow: enter new email, confirm email, enter password
- [ ] Submit — verification code sent (check terminal)
- [ ] Enter `123456` — email changes successfully
- [ ] DB: `SELECT * FROM pending_email_changes WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson');`
- [ ] DB (after verify): `SELECT email FROM users WHERE username = 'jakethompson';`

#### 2.12b Privacy Settings
- [ ] Profile visibility toggle (Public / Private) works
- [ ] Message permissions toggle works (Everyone / Followers Only)
- [ ] DB: `SELECT profile_visibility, message_permissions FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'jakethompson');`

#### 2.12c Password Change
- [ ] Enter current password, new password, confirm new password
- [ ] Submit — password changes successfully
- [ ] Log out and log back in with new password
- [ ] (Reset password back to `Test123!@#` for continued testing)

#### 2.12d Account Deletion
- [ ] "Delete Account" button shows confirmation modal
- [ ] Confirm deletion — account deleted, redirected to landing page
- [ ] DB: `SELECT * FROM users WHERE username = 'jakethompson';` (should return 0 rows)
- [ ] **Re-seed database after this test:** `cd backend && npm run seed`

### 2.13 Sidebar & Navigation
- [ ] User dropdown menu (click avatar in sidebar footer): My Profile, Settings, Logout links work
- [ ] Logout modal: "Are you sure?" confirmation appears
- [ ] Confirm logout — clears session, redirects to sign-in page
- [ ] Sidebar toggle (collapse/expand) works and state persists on page reload
- [ ] Mobile: hamburger menu opens sidebar overlay
- [ ] Mobile: all sidebar nav links work
- [ ] Mobile: sidebar closes when a link is clicked

### 2.14 View Other Profiles
- [ ] View a coach profile — correct layout with coaching info
- [ ] View a college player profile — correct layout with college info
- [ ] View a transfer player profile — correct layout with transfer info
- [ ] View an "other" profile — correct layout with subheader
- [ ] Follow/unfollow buttons work on all viewed profiles
- [ ] "Message" button works on all viewed profiles (respects message permissions)

### 2.15 Type Verification Redirect
- [ ] HS Player visiting `collegeplayer/mainpage-player.html` gets redirected back to `hsplayer/`
- [ ] HS Player visiting `transferplayer/mainpage-player.html` gets redirected back to `hsplayer/`
- [ ] HS Player visiting `collegecoach/mainpage-coach.html` gets redirected appropriately

---

## Part 3: College Player (collegeplayer@test.com)

### 3.1 Login & Dashboard
- [ ] Login with `collegeplayer@test.com` / `Test123!@#`
- [ ] Redirected to `collegeplayer/mainpage-player.html`
- [ ] Sidebar footer shows "Marcus Williams" with subtitle: position, team, division
- [ ] DB: `SELECT u.username, pp.first_name, pp.last_name, pp.position, pp.team_name, pp.college_division FROM users u JOIN player_profiles pp ON u.id = pp.user_id WHERE u.email = 'collegeplayer@test.com';`

### 3.2 Feed & Posts
- [ ] Feed loads (Following + Discover tabs)
- [ ] Create, like, comment, repost, save posts — all work (same as HS Player 2.3–2.5)

### 3.3 Discover Page
- [ ] "Find Coaches" section loads with filter options
- [ ] "Connect with Players" section loads
- [ ] All dropdowns render cleanly (no white space gaps)

### 3.4 My Profile
- [ ] Profile header shows college-specific info: position, team, division, conference
- [ ] Edit profile — college-specific fields (division, conference, team) editable
- [ ] All tabs work: Overview, Posts, Replies, Likes, Offers, Stats, Highlights
- [ ] Add/edit/delete offers, stats, highlights — all work (same as HS Player 2.7b–2.7d)

### 3.5 Transfer Portal (`tabs/transfer-portal.html`)
- [ ] Page loads with portal enrollment option
- [ ] "Enter Transfer Portal" button works — status changes to enrolled
- [ ] Portal status indicator shows enrolled state
- [ ] "Leave Portal" button works — status reverts
- [ ] DB: `SELECT transfer FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'marcuswilliams');`

### 3.6 Messages, Notifications, Settings
- [ ] Messages: send/receive messages work (same as HS Player 2.10)
- [ ] Notifications: all filters and actions work (same as HS Player 2.11)
- [ ] Settings: email change, privacy, password change all work (same as HS Player 2.12)

### 3.7 Follow, Profile Views, Sidebar, Navigation
- [ ] All follow/unfollow flows work (same as HS Player 2.8)
- [ ] Profile views tracked (same as HS Player 2.9)
- [ ] Sidebar, mobile nav, logout all work (same as HS Player 2.13)

### 3.8 Type Verification Redirect
- [ ] College Player visiting `hsplayer/mainpage-player.html` gets redirected to `collegeplayer/`
- [ ] College Player visiting `transferplayer/mainpage-player.html` gets redirected to `collegeplayer/`

---

## Part 4: Transfer Player (transferplayer@test.com)

### 4.1 Login & Dashboard
- [ ] Login with `transferplayer@test.com` / `Test123!@#`
- [ ] Redirected to `transferplayer/mainpage-player.html`
- [ ] Sidebar footer shows "DeShawn Carter" with subtitle: position, height, weight, YOE
- [ ] DB: `SELECT u.username, pp.first_name, pp.last_name, pp.position, pp.height, pp.weight, pp.eligibility, pp.transfer FROM users u JOIN player_profiles pp ON u.id = pp.user_id WHERE u.email = 'transferplayer@test.com';`

### 4.2 Feed & Posts
- [ ] Feed loads (Following + Discover tabs)
- [ ] Create, like, comment, repost, save posts — all work (same as HS Player 2.3–2.5)

### 4.3 Discover Page
- [ ] Page loads with coach and player discovery
- [ ] All dropdowns render cleanly (no white space gaps)

### 4.4 My Profile
- [ ] Profile header shows transfer-specific info: position, height, weight, years of eligibility
- [ ] Edit profile — transfer-specific fields editable
- [ ] All tabs work: Overview, Posts, Replies, Likes, Offers, Stats, Highlights
- [ ] Add/edit/delete offers, stats, highlights — all work

### 4.5 Transfer Portal (`tabs/transfer-portal.html`)
- [ ] Page loads with transfer portal status
- [ ] Portal enrollment/exit functionality works
- [ ] DB: `SELECT transfer FROM player_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'deshawncarter');`

### 4.6 Messages, Notifications, Settings
- [ ] All messaging flows work (same as HS Player 2.10)
- [ ] All notification flows work (same as HS Player 2.11)
- [ ] All settings flows work (same as HS Player 2.12)

### 4.7 Follow, Profile Views, Sidebar, Navigation
- [ ] All follow/unfollow flows work (same as HS Player 2.8)
- [ ] Profile views tracked (same as HS Player 2.9)
- [ ] Sidebar, mobile nav, logout all work (same as HS Player 2.13)

### 4.8 Type Verification Redirect
- [ ] Transfer Player visiting `hsplayer/mainpage-player.html` gets redirected to `transferplayer/`
- [ ] Transfer Player visiting `collegeplayer/mainpage-player.html` gets redirected to `transferplayer/`

---

## Part 5: High School Coach (hscoach@test.com)

### 5.1 Login & Dashboard
- [ ] Login with `hscoach@test.com` / `Test123!@#`
- [ ] Redirected to `hscoach/mainpage-coach.html`
- [ ] Sidebar footer shows "Mike Rodriguez" with subtitle: team, state (comma-separated, orange color)
- [ ] DB: `SELECT u.username, cp.first_name, cp.last_name, cp.team_name, cp.state, cp.position_title FROM users u JOIN coach_profiles cp ON u.id = cp.user_id WHERE u.email = 'hscoach@test.com';`

### 5.2 Feed & Posts
- [ ] Feed loads (Following + Discover tabs)
- [ ] Create, like, comment, repost, save posts — all work (same as HS Player 2.3–2.5)

### 5.3 Discover Players (`tabs/discover-players.html`)
- [ ] Page loads with player discovery filters
- [ ] **Position filter** dropdown works — all positions listed cleanly (no optgroup titles, no white space)
- [ ] **Graduation Year** filter works
- [ ] **State** filter works
- [ ] **Height, Weight, GPA** sliders/filters work
- [ ] "Reset Filters" clears all selections
- [ ] Player cards display correctly with stats
- [ ] Click a player card — navigates to their profile
- [ ] "Load More" loads additional players
- [ ] Mobile: filter FAB button opens filter modal with all filters

### 5.4 My Profile (`tabs/my-profile.html`)
- [ ] Profile header shows: avatar, name, title, school, state
- [ ] Edit profile — coach-specific fields editable (team, title, state, bio)
- [ ] Profile image upload works
- [ ] Tabs work: Overview, Posts, Replies, Likes
- [ ] DB: `SELECT first_name, last_name, team_name, state, position_title, bio, profile_image_url FROM coach_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'coachrodriguez');`

### 5.5 Messages, Notifications, Settings
- [ ] All messaging flows work (same as HS Player 2.10)
- [ ] All notification flows work (same as HS Player 2.11)
- [ ] All settings flows work (same as HS Player 2.12)
- [ ] DB (privacy): `SELECT profile_visibility, message_permissions FROM coach_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'coachrodriguez');`

### 5.6 Follow, Sidebar, Navigation
- [ ] All follow/unfollow flows work (same as HS Player 2.8)
- [ ] DB (counts): `SELECT followers_count, following_count FROM coach_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'coachrodriguez');`
- [ ] Sidebar, mobile nav, logout all work (same as HS Player 2.13)

### 5.7 Coach Profile Views
- [ ] Log in as a player account, navigate to Coach Rodriguez's profile
- [ ] Log back in as `hscoach@test.com`, check view count
- [ ] DB: `SELECT cpv.*, u.username AS viewer FROM coach_profile_views cpv JOIN users u ON cpv.viewer_id = u.id WHERE cpv.coach_profile_id = (SELECT id FROM coach_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'coachrodriguez')) ORDER BY cpv.created_at DESC;`

### 5.8 Type Verification Redirect
- [ ] HS Coach visiting `collegecoach/mainpage-coach.html` gets redirected to `hscoach/`
- [ ] HS Coach visiting `hsplayer/mainpage-player.html` gets redirected appropriately

---

## Part 6: College Coach (collegecoach@test.com)

### 6.1 Login & Dashboard
- [ ] Login with `collegecoach@test.com` / `Test123!@#`
- [ ] Redirected to `collegecoach/mainpage-coach.html`
- [ ] Sidebar footer shows "Sarah Johnson" with subtitle: team, state, division (orange color)
- [ ] DB: `SELECT u.username, cp.first_name, cp.last_name, cp.team_name, cp.state, cp.college_division, cp.conference FROM users u JOIN coach_profiles cp ON u.id = cp.user_id WHERE u.email = 'collegecoach@test.com';`

### 6.2 Feed & Posts
- [ ] Feed loads (Following + Discover tabs)
- [ ] Create, like, comment, repost, save posts — all work (same as HS Player 2.3–2.5)

### 6.3 Discover Players (`tabs/discover-players.html`)
- [ ] Page loads with player discovery filters
- [ ] Position filter dropdown works — clean, no white space gaps
- [ ] All filters work: Graduation Year, State, Height, Weight, GPA
- [ ] Player cards display correctly
- [ ] "Load More" works
- [ ] Mobile: filter modal works

### 6.4 My Profile (`tabs/my-profile.html`)
- [ ] Profile header shows: avatar, name, title, team, division, conference, state
- [ ] Edit profile — all coach fields editable
- [ ] Profile image upload works
- [ ] Tabs work: Overview, Posts, Replies, Likes

### 6.5 Recruiting Board (`tabs/recruiting-board.html`)

#### 6.5a Personal Board
- [ ] Page loads with personal board initialized
- [ ] Class year selector works (switch between years)
- [ ] Offense/Defense toggle buttons switch views
- [ ] Position slots display according to board config
- [ ] DB: `SELECT id, board_name, is_personal, offense_positions, defense_positions FROM recruiting_boards WHERE owner_user_id = (SELECT id FROM users WHERE username = 'coachjohnson') AND is_personal = true;`

#### 6.5b Add Player to Board
- [ ] Navigate to a player's profile
- [ ] "Add to Board" button appears
- [ ] Click — player added to personal board
- [ ] Return to recruiting board — player appears in correct position/year
- [ ] DB: `SELECT id, board_name, players FROM recruiting_boards WHERE owner_user_id = (SELECT id FROM users WHERE username = 'coachjohnson') AND is_personal = true;`

#### 6.5c Remove Player from Board
- [ ] Click remove on a player in the board — player removed
- [ ] DB: verify player removed from board's players JSONB

#### 6.5d Board Configuration
- [ ] Edit position layout (add/remove position slots)
- [ ] Save config — persists on page reload
- [ ] DB: `SELECT offense_positions, defense_positions FROM recruiting_boards WHERE owner_user_id = (SELECT id FROM users WHERE username = 'coachjohnson') AND is_personal = true;`

#### 6.5e Shared Board
- [ ] "Create Shared Board" button opens form
- [ ] Enter board name and create — new shared board appears
- [ ] Switch between personal and shared boards
- [ ] Add player to shared board — works correctly
- [ ] DB: `SELECT id, board_name, is_personal, collab FROM recruiting_boards WHERE owner_user_id = (SELECT id FROM users WHERE username = 'coachjohnson') AND is_personal = false;`

#### 6.5f Shared Board Collaboration
- [ ] Invite another coach to shared board (search coaches, send invite)
- [ ] Log in as invited coach — notification received
- [ ] Accept invite — shared board appears in their board list
- [ ] Collaborator can add/remove players
- [ ] Remove collaborator — they lose access
- [ ] Transfer ownership — new owner can manage board
- [ ] Leave board — collaborator removed from board
- [ ] Delete shared board — board removed for all participants

### 6.6 Recruit Assistant (`tabs/recruit-assistant.html`)
- [ ] Page loads with welcome screen and suggestion chips
- [ ] Click "New Chat" — creates new chat session
- [ ] Type a search query (e.g., "Find me a QB from Texas with 3.5+ GPA")
- [ ] AI responds with player results (or mock response in dev)
- [ ] Chat appears in sidebar history
- [ ] Click a previous chat — loads chat messages
- [ ] Edit chat title — title updates in sidebar
- [ ] Delete a chat — removed from sidebar
- [ ] "Baseline Metrics" modal opens and saves settings
- [ ] DB: `SELECT * FROM ai_chat_history WHERE user_id = (SELECT id FROM users WHERE username = 'coachjohnson') ORDER BY created_at DESC LIMIT 5;`

### 6.7 Transfer Portal (`tabs/transfer-portal.html`)
- [ ] Page loads with transfer player search interface
- [ ] Position filter works — clean dropdown, no white space
- [ ] Years of Eligibility filter works
- [ ] State filter works
- [ ] Transfer player cards display correctly
- [ ] "Load More" loads additional players
- [ ] Click a player — navigates to their profile
- [ ] Portal Watchlist: add/remove players from watchlist
- [ ] DB: `SELECT pw.*, u.username FROM portal_watchlist pw JOIN users u ON pw.coach_id = u.id WHERE pw.coach_id = (SELECT id FROM users WHERE username = 'coachjohnson');`

### 6.8 Messages, Notifications, Settings
- [ ] All messaging flows work (same as HS Player 2.10)
- [ ] All notification flows work (same as HS Player 2.11)
- [ ] All settings flows work (same as HS Player 2.12)

### 6.9 Follow, Profile Views, Sidebar, Navigation
- [ ] All follow/unfollow flows work (same as HS Player 2.8)
- [ ] Coach profile views tracked (same as HS Coach 5.7)
- [ ] Sidebar, mobile nav, logout all work (same as HS Player 2.13)

### 6.10 Type Verification Redirect
- [ ] College Coach visiting `hscoach/mainpage-coach.html` gets redirected to `collegecoach/`

---

## Part 7: Other User (other@test.com)

### 7.1 Login & Dashboard
- [ ] Login with `other@test.com` / `Test123!@#`
- [ ] Redirected to `other/mainpage-other.html`
- [ ] Sidebar footer shows "Robert Thompson" with subheader text
- [ ] DB: `SELECT u.username, op.first_name, op.last_name, op.subheader, op.bio FROM users u JOIN other_profiles op ON u.id = op.user_id WHERE u.email = 'other@test.com';`

### 7.2 Feed & Posts
- [ ] Feed loads (Following + Discover tabs)
- [ ] Create, like, comment, repost, save posts — all work (same as HS Player 2.3–2.5)

### 7.3 Discover Page (`tabs/discover-players.html`)
- [ ] Page loads with player and coach discovery
- [ ] All filters and dropdowns work cleanly
- [ ] Player and coach cards display correctly

### 7.4 My Profile (`tabs/my-profile.html`)
- [ ] Profile header shows: avatar, name, subheader
- [ ] Edit profile — other-specific fields editable (subheader, bio)
- [ ] Profile image upload works
- [ ] Tabs work: Overview, Posts, Replies, Likes
- [ ] DB: `SELECT first_name, last_name, subheader, bio, profile_image_url FROM other_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'robertthompson');`

### 7.5 Messages, Notifications, Settings
- [ ] All messaging flows work (same as HS Player 2.10)
- [ ] All notification flows work (same as HS Player 2.11)
- [ ] All settings flows work (same as HS Player 2.12)
- [ ] DB (privacy): `SELECT profile_visibility, message_permissions FROM other_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'robertthompson');`

### 7.6 Follow, Sidebar, Navigation
- [ ] All follow/unfollow flows work (same as HS Player 2.8)
- [ ] DB (counts): `SELECT followers_count, following_count FROM other_profiles WHERE user_id = (SELECT id FROM users WHERE username = 'robertthompson');`
- [ ] Sidebar, mobile nav, logout all work (same as HS Player 2.13)

---

## Part 8: Cross-Role Interactions

### 8.1 Cross-Profile Navigation
- [ ] As HS Player, view a College Coach's profile — navigates to `collegecoach/` view
- [ ] As College Coach, view a HS Player's profile — navigates to `hsplayer/` view
- [ ] As Other, view a Transfer Player's profile — navigates to `transferplayer/` view
- [ ] As HS Coach, view an Other user's profile — navigates to `other/` view
- [ ] Shared profile view page (`shared/view-profile.html`) works when accessed with `?userId=` parameter

### 8.2 Cross-Role Messaging
- [ ] HS Player sends message to College Coach — both sides see conversation
- [ ] College Coach replies — HS Player receives message
- [ ] Other user messages HS Player — works if message permissions allow
- [ ] DB: Verify `conversation_participants` includes both users in each conversation

### 8.3 Cross-Role Follow & Notifications
- [ ] Coach follows Player — player receives follow notification
- [ ] Player follows Coach — coach receives follow notification
- [ ] Like someone's post — they receive a notification
- [ ] Comment on someone's post — they receive a notification
- [ ] Repost someone's post — they receive a notification
- [ ] DB: `SELECT n.type, n.title, n.message, n.is_read, u.username AS related_user FROM notifications n LEFT JOIN users u ON n.related_user_id = u.id ORDER BY n.created_at DESC LIMIT 20;`

### 8.4 Private Profile Follow Requests
- [ ] Set a player profile to Private (Settings > Privacy)
- [ ] As another user, try to follow — follow request sent instead of instant follow
- [ ] DB: `SELECT fr.*, u1.username AS requester, u2.username AS target, fr.status FROM follow_requests fr JOIN users u1 ON fr.requester_id = u1.id JOIN users u2 ON fr.target_id = u2.id ORDER BY fr.created_at DESC;`
- [ ] Log in as the private profile user — notification shows follow request
- [ ] Accept follow request — requester now appears in followers
- [ ] DB: `SELECT * FROM follows WHERE following_id = (SELECT id FROM users WHERE username = 'jakethompson') ORDER BY created_at DESC;`
- [ ] Decline follow request — requester does not appear in followers
- [ ] Cancel outgoing follow request — request removed

### 8.5 Message Permissions
- [ ] Set profile message permissions to "Followers Only"
- [ ] As a non-follower, attempt to message — "Message" button should be disabled or show restriction
- [ ] As a follower, attempt to message — should work normally

---

## Part 9: Registration Flow (Fresh Accounts)

> **Note:** Test this last or use a separate browser/incognito window. Re-seed after.

### 9.1 Player Registration
- [ ] Navigate to Get Started > "I'm a Player"
- [ ] Fill out create-profile form: name, username, email, password, school, state, grad year, position, height, weight
- [ ] Username availability check works in real-time
- [ ] Password validation checklist updates as you type
- [ ] Submit — account created, redirected to verify-email page
- [ ] Enter `123456` — email verified, redirected to dashboard
- [ ] DB: `SELECT u.*, pp.first_name, pp.last_name, pp.position FROM users u LEFT JOIN player_profiles pp ON u.id = pp.user_id WHERE u.email = '<your test email>';`

### 9.2 Coach Registration
- [ ] Navigate to Get Started > "I'm a Coach"
- [ ] Fill out create-coach-profile form: name, username, email, password, school, state, title
- [ ] Division dropdown works — clean, no white space gaps
- [ ] Submit — account created, redirected to verify-email
- [ ] Enter `123456` — verified, redirected to dashboard
- [ ] DB: `SELECT u.*, cp.first_name, cp.last_name, cp.team_name FROM users u LEFT JOIN coach_profiles cp ON u.id = cp.user_id WHERE u.email = '<your test email>';`

### 9.3 Other Registration
- [ ] Navigate to Get Started > "Other Users"
- [ ] Fill out create-profile form for other user type
- [ ] Submit — account created, redirected to verify-email
- [ ] Enter `123456` — verified, redirected to dashboard
- [ ] DB: `SELECT u.*, op.first_name, op.last_name FROM users u LEFT JOIN other_profiles op ON u.id = op.user_id WHERE u.email = '<your test email>';`

### 9.4 Registration Edge Cases
- [ ] Try registering with an already-taken username — error message shown
- [ ] Try registering with an already-taken email — error message shown
- [ ] Try registering with a weak password (e.g., "pass") — validation prevents submission
- [ ] Resend verification code — new code sent (check terminal), timer displayed

---

## Part 10: Final Checks

### 10.1 Dropdown Styling (All Roles)
- [ ] All division dropdowns render cleanly — no white space between options
- [ ] All position filter dropdowns render cleanly — no optgroup labels
- [ ] All state dropdowns render cleanly
- [ ] All graduation year / eligibility dropdowns render cleanly

### 10.2 Real-Time Features
- [ ] Open two browser tabs with two different users
- [ ] Send a message from User A to User B — message appears in User B's tab in real-time
- [ ] Typing indicator shows when one user is typing
- [ ] Unread message badge updates without page refresh (polls every 30s)
- [ ] Unread notification badge updates without page refresh

### 10.3 Error Handling
- [ ] Access a protected page without logging in — redirected to sign-in
- [ ] Access a non-existent profile — appropriate error message shown
- [ ] API request with invalid data — error message displayed (not a crash)

### 10.4 Media & File Uploads
- [ ] Upload profile image (< 5MB) — displays correctly
- [ ] Upload post with image — displays in feed
- [ ] Upload post with video — plays in feed
- [ ] Upload post with 4 media files — all display correctly
- [ ] Attempt to upload a file > 200MB — error message shown
- [ ] DB (uploads check): `SELECT profile_image_url FROM player_profiles WHERE profile_image_url IS NOT NULL LIMIT 5;`

### 10.5 Responsive Design
- [ ] All pages render correctly at desktop width (1200px+)
- [ ] All pages render correctly at tablet width (768px–1199px)
- [ ] All pages render correctly at mobile width (< 768px)
- [ ] Sidebar collapses to hamburger menu on mobile
- [ ] Post creation uses mobile modal on small screens
- [ ] Filter modals work on mobile for discover/transfer portal pages

### 10.6 Database Integrity Final Check
```sql
-- Check all users have profiles
SELECT u.id, u.username, u.role,
  CASE
    WHEN u.role = 'player' THEN (SELECT COUNT(*) FROM player_profiles pp WHERE pp.user_id = u.id)
    WHEN u.role = 'coach' THEN (SELECT COUNT(*) FROM coach_profiles cp WHERE cp.user_id = u.id)
    WHEN u.role = 'other' THEN (SELECT COUNT(*) FROM other_profiles op WHERE op.user_id = u.id)
  END AS has_profile
FROM users u;

-- Check follow count consistency
SELECT u.username,
  pp.followers_count AS stored_followers,
  (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS actual_followers,
  pp.following_count AS stored_following,
  (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS actual_following
FROM users u
JOIN player_profiles pp ON u.id = pp.user_id;

-- Check for orphaned records
SELECT 'orphaned_posts' AS issue, COUNT(*) FROM posts p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id)
UNION ALL
SELECT 'orphaned_comments', COUNT(*) FROM post_comments pc WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = pc.user_id)
UNION ALL
SELECT 'orphaned_messages', COUNT(*) FROM messages m WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.sender_id)
UNION ALL
SELECT 'orphaned_notifications', COUNT(*) FROM notifications n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.user_id);
```
