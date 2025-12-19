# Recruiting Board Collaborator System - Testing Guide

## Prerequisites

Before testing, ensure you have:
1. At least 2-3 college coach accounts to test collaboration features
2. Access to the PostgreSQL database via `psql`
3. The backend server running

---

## Step 1: Database Setup

Run these SQL commands in your PostgreSQL database:

```sql
-- Add the collab column (stores array of collaborator user_ids)
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS collab JSONB DEFAULT '[]'::jsonb;

-- Add the owner_user_id column (references users table)
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

-- Populate owner_user_id with existing coach_user_id values
UPDATE recruiting_boards SET owner_user_id = coach_user_id WHERE owner_user_id IS NULL;
```

---

## Step 2: Verify Database Schema

Run this query to verify the columns were added:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'recruiting_boards'
ORDER BY ordinal_position;
```

Expected output should include:
- `collab` (jsonb)
- `owner_user_id` (uuid)

---

## Step 3: View Existing Recruiting Boards

```sql
-- View all recruiting boards with owner info
SELECT
    rb.id,
    rb.class_year,
    rb.coach_user_id,
    rb.owner_user_id,
    rb.collab,
    cp.first_name || ' ' || cp.last_name as owner_name,
    cp.college_name
FROM recruiting_boards rb
LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
WHERE rb.class_year >= 0
ORDER BY cp.last_name, rb.class_year;
```

---

## Step 4: Get Test Coach User IDs

Find college coaches to use for testing:

```sql
-- Get college coach user IDs for testing
SELECT
    u.id as user_id,
    cp.first_name,
    cp.last_name,
    cp.username,
    cp.college_name,
    cp.coach_type
FROM users u
JOIN coach_profiles cp ON u.id = cp.user_id
WHERE u.role = 'coach' AND cp.coach_type = 'college'
ORDER BY cp.last_name;
```

**Note the user_ids of 2-3 coaches for testing.**

---

## Step 5: Testing the Collaborator Flow

### Test 1: Invite Collaborators Button Visibility

1. Log in as **Coach A** (board owner)
2. Navigate to **Recruiting Board** page
3. Verify the **"Invite Collaborators"** button is visible next to the Offense/Defense toggle
4. Click the button to open the modal

**Expected Result:** Modal opens showing:
- Board Owner section with Coach A's name and "Owner" badge
- Search input for finding coaches
- "Current Collaborators" section (empty initially)

---

### Test 2: Search for Coaches

1. In the Invite Collaborators modal, type another coach's name in the search box
2. Wait for search results to appear

**Expected Result:**
- Search results show matching college coaches
- Results include name, username, and college
- Each result has an "Invite" button

---

### Test 3: Send an Invite

1. Click "Invite" on a search result
2. Confirm in the popup modal

**Expected Result:**
- Success toast: "Invite sent successfully!"
- The invited coach appears in "Current Collaborators" with a yellow "Pending" badge
- Search results clear

**Verify in database:**
```sql
-- Check pending invites in notifications
SELECT
    n.id,
    n.user_id,
    n.type,
    n.title,
    n.message,
    n.related_user_id,
    n.related_entity_type,
    n.is_read,
    n.created_at
FROM notifications n
WHERE n.related_entity_type IN ('board_invite', 'board_invite_sent')
ORDER BY n.created_at DESC;
```

---

### Test 4: Cancel a Pending Invite

1. In the collaborators modal, find the pending invite
2. Click the X button next to the pending collaborator
3. Confirm the invite was cancelled

**Expected Result:**
- The pending invite disappears from the list
- Toast: "Invite cancelled"

**Verify in database:**
```sql
-- Verify invite notifications were deleted
SELECT * FROM notifications
WHERE related_entity_type IN ('board_invite', 'board_invite_sent')
ORDER BY created_at DESC;
```

---

### Test 5: Accept an Invite (as the Invited Coach)

1. Send a new invite from Coach A to Coach B
2. Log out and log in as **Coach B**
3. Navigate to the **Notifications** page
4. Find the "Recruiting Board Invite" notification
5. Click the green **Accept** button
6. Confirm in the modal

**Expected Result:**
- Toast: "Invite accepted! You can now access the recruiting board."
- Notification is marked as read
- Coach A receives a notification that the invite was accepted

**Verify in database:**
```sql
-- Check that Coach B was added to collab array
SELECT
    rb.coach_user_id,
    rb.owner_user_id,
    rb.collab,
    cp.first_name || ' ' || cp.last_name as owner_name
FROM recruiting_boards rb
LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
WHERE rb.class_year = 0;

-- Check for accept notification sent to owner
SELECT * FROM notifications
WHERE related_entity_type = 'board_invite_accepted'
ORDER BY created_at DESC;
```

---

### Test 6: View Shared Board (as Collaborator)

1. Stay logged in as **Coach B** (the collaborator)
2. Navigate to **Recruiting Board** page
3. Check for the board selector dropdown

**Expected Result:**
- Dropdown appears with options:
  - "My Board" (Coach B's own board)
  - "[Coach A's Name]'s Board" (shared board)
- "Leave Board" button is hidden when viewing own board

---

### Test 7: Switch to Shared Board

1. Select "[Coach A's Name]'s Board" from the dropdown
2. Observe the board loads

**Expected Result:**
- Board displays Coach A's recruiting data
- "Leave Board" button appears (red)
- "Invite Collaborators" button is hidden (only owners see it)

---

### Test 8: Leave a Shared Board

1. While viewing a shared board, click **"Leave Board"**
2. Confirm in the modal

**Expected Result:**
- Toast: "You have left the board"
- Dropdown switches back to "My Board"
- The shared board option is removed from dropdown

**Verify in database:**
```sql
-- Check that Coach B was removed from collab array
SELECT
    rb.coach_user_id,
    rb.owner_user_id,
    rb.collab
FROM recruiting_boards rb
WHERE rb.class_year = 0;
```

---

### Test 9: Decline an Invite

1. Send a new invite from Coach A to Coach B
2. Log in as Coach B
3. Navigate to Notifications
4. Click the red **Decline** button
5. Confirm in the modal

**Expected Result:**
- Toast: "Invite declined"
- Notification marked as read
- Coach A receives a notification that the invite was declined

**Verify in database:**
```sql
-- Check for decline notification
SELECT * FROM notifications
WHERE related_entity_type = 'board_invite_declined'
ORDER BY created_at DESC;
```

---

### Test 10: Remove a Collaborator

1. Have Coach B accept an invite from Coach A first
2. Log in as **Coach A** (board owner)
3. Open "Invite Collaborators" modal
4. Find Coach B in the "Current Collaborators" list
5. Click the X button next to their name
6. Confirm removal

**Expected Result:**
- Toast: "Collaborator removed"
- Coach B disappears from the collaborators list

**Verify in database:**
```sql
-- Check collab array is now empty
SELECT collab FROM recruiting_boards
WHERE owner_user_id = '[Coach A user_id]' AND class_year = 0;
```

---

### Test 11: Transfer Ownership

1. Have Coach B accept an invite from Coach A
2. Log in as Coach A (owner)
3. Open "Invite Collaborators" modal
4. Scroll to "Transfer Ownership" section
5. Select Coach B from the dropdown
6. Click "Transfer Ownership"
7. Confirm in the modal

**Expected Result:**
- Toast: "Ownership transferred successfully"
- Modal closes
- Coach A is now a collaborator, Coach B is the owner

**Verify in database:**
```sql
-- Check ownership transferred
SELECT
    rb.owner_user_id,
    rb.collab,
    cp.first_name || ' ' || cp.last_name as new_owner_name
FROM recruiting_boards rb
LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
WHERE rb.coach_user_id = '[Original Coach A user_id]' AND rb.class_year = 0;

-- Check for ownership transfer notification
SELECT * FROM notifications
WHERE related_entity_type = 'board_ownership_transfer'
ORDER BY created_at DESC;
```

---

### Test 12: Real-time Sync (Polling)

1. Have two coach accounts collaborating on the same board
2. Open the board in two different browsers (one for each coach)
3. As Coach A, add a player to the board
4. Wait up to 60 seconds

**Expected Result:**
- Coach B's view automatically updates to show the new player
- No manual refresh required

---

## Useful Debug Queries

### View all notifications for a user
```sql
SELECT
    n.id,
    n.type,
    n.title,
    n.message,
    n.is_read,
    n.related_entity_type,
    n.created_at
FROM notifications n
WHERE n.user_id = '[user_id]'
ORDER BY n.created_at DESC;
```

### View all boards where a user is a collaborator
```sql
SELECT
    rb.coach_user_id,
    rb.owner_user_id,
    cp.first_name || ' ' || cp.last_name as owner_name
FROM recruiting_boards rb
JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
WHERE rb.class_year = 0
  AND rb.collab::jsonb ? '[user_id_to_check]';
```

### Reset collab data for testing
```sql
-- Clear all collaborators (use carefully!)
UPDATE recruiting_boards SET collab = '[]'::jsonb WHERE class_year = 0;

-- Delete all board-related notifications (use carefully!)
DELETE FROM notifications
WHERE related_entity_type IN (
    'board_invite',
    'board_invite_sent',
    'board_invite_accepted',
    'board_invite_declined',
    'board_ownership_transfer'
);
```

---

## Checklist Summary

- [ ] Database columns added (`collab`, `owner_user_id`)
- [ ] Invite Collaborators button visible for owners only
- [ ] Coach search works correctly
- [ ] Sending invite creates notifications for both parties
- [ ] Pending invites show with yellow "Pending" badge
- [ ] Cancelling invite removes it from pending list
- [ ] Accepting invite adds user to collab array
- [ ] Declining invite notifies the owner
- [ ] Shared boards appear in dropdown for collaborators
- [ ] Leave Board removes user from collab array
- [ ] Remove collaborator works for owner
- [ ] Transfer ownership updates owner_user_id and collab array
- [ ] Real-time polling updates board every 60 seconds
- [ ] All notifications display correctly on Notifications page
- [ ] Accept/Decline buttons work on notification cards

---

## Common Issues

### "Invite Collaborators" button not showing
- Verify the user is the board owner
- Check that `owner_user_id` is set correctly in the database

### Search not finding coaches
- Ensure coaches have `coach_type = 'college'` in coach_profiles
- Check that the search query is at least 2 characters

### Shared boards not appearing
- Verify the user's ID is in the `collab` array
- Check that `class_year = 0` row exists for the board

### Notifications not loading
- Check browser console for API errors
- Verify the `/notifications` endpoint is working
