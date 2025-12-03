# Frontend-Backend Integration Checklist

> Last Updated: 2025-11-24
> Track the connection status of all frontend pages to backend APIs

---

## ✅ FULLY INTEGRATED (Already Working)

- [x] **Landing Page** - signin.html
  - Login with email/password
  - Redirects to dashboard based on role

- [x] **Registration** - get-started.html
  - Role selection (player/coach)
  - Account creation

- [x] **Player Profile Creation** - create-profile.html
  - Two-step registration
  - Creates player profile with all fields

- [x] **Coach Profile Creation** - create-coach-profile.html
  - Two-step registration
  - Creates coach profile with all fields

- [x] **Feed System** - mainpage-player.html & mainpage-coach.html
  - Load personalized feed
  - Create posts with media
  - Like/unlike posts
  - View/add comments

- [x] **Profile Viewing** - my-profile.html (both player & coach)
  - View own profile
  - View other user profiles
  - Follow/unfollow users

- [x] **Search** - Integrated in main pages
  - Search players and coaches
  - Basic search functionality works

- [x] **Profile Photo Upload** - my-profile.html (both player & coach)
  - Upload profile images (JPEG/PNG)
  - Client-side validation (file type and size)
  - Loading states and preview
  - Success/error feedback
  - ✅ **COMPLETED: 2025-11-24**

---

## ⚠️ PARTIALLY INTEGRATED (Needs Additional Work)

*All features in this section have been completed. This section is now empty.*

---

## ❌ NO BACKEND INTEGRATION (Needs Full Implementation)

### 2. Forgot Password
**Location:** `frontend/landingpage/forgot-password.html`
**Status:** Form exists but only logs to console
**Lines:** forgot-password.js:11-15

**TODO:**
- [ ] Create backend endpoint: `POST /api/auth/forgot-password`
- [ ] Generate password reset token
- [ ] Send reset email
- [ ] Create reset password page
- [ ] Create backend endpoint: `POST /api/auth/reset-password`
- [ ] Update forgot-password.js to call API

---

### 3. Discover Players (Player View)
**Location:** `frontend/player/tabs/discover-players.html`
**Status:** Client-side filtering of hardcoded HTML cards
**Lines:** discover-players.js:70, 94

**TODO:**
- [ ] Check if backend endpoint exists: `GET /api/profile/search/players`
- [ ] Add filters to API: position, graduation year, state
- [ ] Update discover-players.js to fetch from API
- [ ] Remove hardcoded player cards
- [ ] Implement dynamic player card generation
- [ ] Add pagination or infinite scroll
- [ ] Test all filter combinations

**Potential Backend Endpoint:** `GET /api/profile/search/players?position=QB&graduationYear=2025&state=OH`

---

### 4. Discover Players (Coach View)
**Location:** `frontend/coach/tabs/discover-players.html`
**Status:** Client-side filtering with sliders (height, weight, GPA)
**Lines:** discover-players.js:132

**TODO:**
- [ ] Check if backend endpoint exists: `GET /api/profile/search/players`
- [ ] Add advanced filters to API: height range, weight range, GPA range, SAT/ACT
- [ ] Update discover-players.js to fetch from API
- [ ] Remove hardcoded player cards
- [ ] Implement dynamic player card generation
- [ ] Add real-time filtering (debounced API calls)
- [ ] Test slider filters
- [ ] Test position and state filters

**Potential Backend Endpoint:** `GET /api/profile/search/players?minHeight=72&maxHeight=78&position=QB&minGPA=3.5`

---

### 5. Messages (Player & Coach)
**Location:** `frontend/player/tabs/messages.html` & `frontend/coach/tabs/messages.html`
**Status:** Completely simulated with mock conversations
**Lines:** messages.js:274, 286, 305, 322

**TODO:**

#### Backend:
- [ ] Verify endpoint exists: `GET /api/messages/conversations`
- [ ] Verify endpoint exists: `POST /api/messages/conversations`
- [ ] Verify endpoint exists: `GET /api/messages/conversations/:id`
- [ ] Verify endpoint exists: `POST /api/messages/conversations/:id/messages`
- [ ] Verify endpoint exists: `POST /api/messages/conversations/:id/read`

#### Frontend:
- [ ] Load real conversations from API
- [ ] Remove hardcoded mock data
- [ ] Implement send message functionality
- [ ] Connect Socket.IO for real-time messages
- [ ] Add typing indicators (via Socket.IO)
- [ ] Mark messages as read
- [ ] Show online/offline status
- [ ] Handle message delivery states
- [ ] Add conversation search/filter
- [ ] Test real-time messaging flow

**Critical:** This is a core feature for coach-player communication!

---

### 6. Notifications (Player & Coach)
**Location:** `frontend/player/tabs/notifications.html` & `frontend/coach/tabs/notifications.html`
**Status:** Hardcoded HTML notifications

**TODO:**

#### Backend:
- [ ] Create notifications table in database
- [ ] Create endpoint: `GET /api/notifications`
- [ ] Create endpoint: `POST /api/notifications/:id/read`
- [ ] Create endpoint: `DELETE /api/notifications/:id`
- [ ] Auto-generate notifications for:
  - [ ] New followers
  - [ ] Post likes
  - [ ] Post comments
  - [ ] New messages
  - [ ] Profile views (optional)

#### Frontend:
- [ ] Load notifications from API
- [ ] Remove hardcoded notification HTML
- [ ] Implement mark as read
- [ ] Implement delete notification
- [ ] Add real-time notification updates (Socket.IO)
- [ ] Show notification badge count in navigation
- [ ] Add notification preferences in settings
- [ ] Test all notification types

---

### 7. Settings (Player & Coach)
**Location:** `frontend/player/tabs/settings.html` & `frontend/coach/tabs/settings.html`
**Status:** Forms exist but only log to console
**Lines:** settings.js:148, 163, 214, 417, 447

**TODO:**

#### Account Settings Tab:
- [ ] Create endpoint: `PUT /api/profile/player/:id` or `PUT /api/profile/coach/:id`
- [ ] Wire up profile update form
- [ ] Show success/error messages
- [ ] Reload profile data after update

#### Privacy Settings Tab:
- [ ] Create endpoint: `PUT /api/auth/privacy`
- [ ] Save privacy preferences to database
- [ ] Implement privacy logic (profile visibility, message permissions)

#### Security Settings Tab:
- [ ] Create endpoint: `PUT /api/auth/password`
- [ ] Validate current password
- [ ] Change password
- [ ] Create endpoint: `POST /api/auth/session/revoke`
- [ ] Revoke all sessions (logout everywhere)
- [ ] Create endpoint: `DELETE /api/auth/account`
- [ ] Delete account (with confirmation)

#### Notification Preferences Tab:
- [ ] Create endpoint: `PUT /api/auth/notifications`
- [ ] Save notification preferences
- [ ] Apply preferences to notification generation

---

### 8. Recruiting Board (Coach Only)
**Location:** `frontend/coach/tabs/recruiting-board.html`
**Status:** Drag-and-drop UI works, but no persistence

**TODO:**

#### Backend:
- [ ] Create `recruiting_board` table (columns, player rankings, notes)
- [ ] Create endpoint: `GET /api/recruiting-board`
- [ ] Create endpoint: `POST /api/recruiting-board/players`
- [ ] Create endpoint: `PUT /api/recruiting-board/players/:id`
- [ ] Create endpoint: `DELETE /api/recruiting-board/players/:id`
- [ ] Create endpoint: `PUT /api/recruiting-board/players/:id/column`

#### Frontend:
- [ ] Load saved recruiting board on page load
- [ ] Save player position on drag-and-drop
- [ ] Add notes to players
- [ ] Add tags/labels to players
- [ ] Implement player search to add to board
- [ ] Test drag-and-drop persistence

---

### 9. Transfer Portal (Coach Only)
**Location:** `frontend/coach/tabs/transfer-portal.html`
**Status:** Client-side filtering of mock data
**Lines:** transfer-portal.js:120

**TODO:**

#### Backend:
- [ ] Add `in_transfer_portal` boolean to `player_profiles` table
- [ ] Create endpoint: `GET /api/profile/search/players?portal=true`
- [ ] Support filters: position, eligibility, level, height, weight, GPA
- [ ] Add transfer portal flag to profile update

#### Frontend:
- [ ] Fetch transfer portal players from API
- [ ] Remove hardcoded player cards
- [ ] Implement real filtering with API calls
- [ ] Add contact/message button (integrate with messages)
- [ ] Test all filters
- [ ] Add "Add to Recruiting Board" button

---

## 📊 PROGRESS TRACKER

### Integration Status Summary
- **Total Pages/Features:** 17
- **Fully Integrated:** 8 ✅
- **Partially Integrated:** 0 ⚠️
- **Not Integrated:** 9 ❌

### Completion Percentage
**Current:** ~47% (8/17)
**Target:** 100%

### Recent Updates
- ✅ **2025-11-24:** Profile Photo Upload - COMPLETED

---

## 🎯 RECOMMENDED IMPLEMENTATION ORDER

### Phase 1: Critical Features (Do First)
1. **Messages** - Core communication feature
2. **Settings** - Users need to update profiles and passwords
3. **Notifications** - Important for engagement

### Phase 2: Search & Discovery (Do Second)
4. **Discover Players (Player View)** - Players need to find each other
5. **Discover Players (Coach View)** - Coaches need advanced search
6. **Photo Upload** - Complete profile functionality

### Phase 3: Coach-Specific Features (Do Third)
7. **Transfer Portal** - Important for coaches
8. **Recruiting Board** - Organizational tool for coaches

### Phase 4: Nice-to-Have (Do Last)
9. **Forgot Password** - Edge case, less critical

---

## 📝 NOTES

### API Endpoints Already Available in `frontend/shared/api.js`
Check if these are already defined but just not wired up in the UI:

- `uploadAPI.uploadProfileImage()` - ✅ Exists
- `uploadAPI.uploadHighlightVideo()` - ✅ Exists
- `uploadAPI.uploadPostMedia()` - ✅ Exists
- `messagesAPI.*` - ❓ Check if exists
- `notificationsAPI.*` - ❓ Check if exists

### Backend Routes Already Implemented
Check `backend/routes/` directory for:
- ✅ auth.js - Login, register
- ✅ profile.js - Create/update profiles, search
- ✅ posts.js - Feed, likes, comments
- ✅ follow.js - Follow/unfollow
- ✅ upload.js - File uploads
- ❓ messages.js - Check if exists
- ❓ notifications.js - Check if exists

### Socket.IO Integration
- Backend has Socket.IO setup in `backend/socket.js`
- Frontend needs to connect for:
  - Real-time messages
  - Typing indicators
  - Online status
  - Real-time notifications

---

## 🐛 KNOWN ISSUES TO FIX

1. **Infinite Scroll Placeholder** - mainpage-player.js:212
2. ~~**Photo Upload Alert** - my-profile.js:430~~ ✅ **FIXED: 2025-11-24**
3. **Backend Connection Alerts** - discover-players.js, messages.js, etc.

---

## ✅ TESTING CHECKLIST (After Integration)

Use this checklist AFTER implementing each feature:

### Messages
- [ ] Can send message to another user
- [ ] Can receive message in real-time
- [ ] Typing indicator works
- [ ] Conversations list updates
- [ ] Unread count shows correctly
- [ ] Can mark as read
- [ ] Works for both player and coach

### Notifications
- [ ] New follower generates notification
- [ ] Post like generates notification
- [ ] Comment generates notification
- [ ] Message generates notification
- [ ] Can mark as read
- [ ] Can delete notification
- [ ] Badge count updates in nav

### Settings
- [ ] Can update profile info
- [ ] Can change password
- [ ] Can update privacy settings
- [ ] Can update notification preferences
- [ ] Can delete account (with confirmation)

### Discover Players
- [ ] Position filter works
- [ ] State filter works
- [ ] Graduation year filter works
- [ ] Height/weight sliders work (coach view)
- [ ] GPA filter works (coach view)
- [ ] Results load dynamically
- [ ] Pagination/infinite scroll works

### Transfer Portal
- [ ] Shows only transfer portal players
- [ ] All filters work
- [ ] Can contact player
- [ ] Can add to recruiting board

### Recruiting Board
- [ ] Can add players
- [ ] Drag-and-drop persists
- [ ] Can move between columns
- [ ] Can add notes
- [ ] Can remove players

---

**Good luck with the integration! Check off items as you complete them.**
