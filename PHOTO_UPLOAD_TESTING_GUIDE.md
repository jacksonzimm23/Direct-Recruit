# Photo Upload Feature - Testing Guide

**Feature:** Profile Photo Upload Integration
**Date Implemented:** 2025-11-24
**Files Modified:**
- `frontend/player/tabs/my-profile.html`
- `frontend/player/tabs/my-profile.js`
- `frontend/player/tabs/my-profile.css`
- `frontend/coach/tabs/my-profile.html`
- `frontend/coach/tabs/my-profile.js`
- `frontend/coach/tabs/my-profile.css`

---

## Overview

The photo upload feature allows both players and coaches to upload a profile image from their "My Profile" page. The feature includes:

✅ Client-side validation (file type and size)
✅ Loading spinner during upload
✅ Live preview of uploaded image
✅ Success toast notification
✅ Error handling with user feedback
✅ Updates avatar in both header and sidebar
✅ Only visible on own profile (hidden when viewing others)

---

## Prerequisites

Before testing, ensure:

1. **Backend is running** on `http://localhost:5000`
2. **Database is set up** with player_profiles and coach_profiles tables
3. **Upload endpoint exists**: `POST /api/upload/profile-image`
4. **User is registered and logged in** (as either player or coach)
5. **Profile is created** for the logged-in user

---

## Test Cases

### Test 1: Access Photo Upload Button

**Objective:** Verify the photo upload button is visible on own profile

**Steps:**
1. Log in as a player or coach
2. Navigate to "My Profile" tab
3. Look for the camera icon button in the bottom-right corner of the profile avatar

**Expected Result:**
- ✅ Camera button is visible on your own profile
- ✅ Button has a blue background with white camera icon
- ✅ Button shows hover effect (orange background) when mouse hovers over it

**Test Data:** N/A

---

### Test 2: Hidden Photo Button on Other Profiles

**Objective:** Verify the photo upload button is hidden when viewing someone else's profile

**Steps:**
1. Log in as any user
2. Navigate to another user's profile by clicking on their name from the feed
3. Check the profile avatar area

**Expected Result:**
- ✅ Camera button is NOT visible on other users' profiles
- ✅ Only the avatar image/placeholder is shown

**Test Data:** You need at least 2 registered users to test this

---

### Test 3: Valid Image Upload (JPEG)

**Objective:** Successfully upload a valid JPEG image

**Steps:**
1. Navigate to "My Profile"
2. Click the camera button on the avatar
3. Select a JPEG image file (e.g., `test-photo.jpg`) that is less than 5MB
4. Wait for upload to complete

**Expected Result:**
- ✅ File picker dialog opens
- ✅ Loading spinner appears in the avatar area during upload
- ✅ Camera button becomes disabled and semi-transparent during upload
- ✅ Image preview appears in the avatar circle
- ✅ Green success toast appears in top-right corner: "Profile photo updated successfully!"
- ✅ Avatar in the sidebar (bottom-left) also updates with the new image
- ✅ Image persists after page refresh

**Test Data:**
- File: Any JPEG image under 5MB
- Recommended: 500x500px or larger square image

---

### Test 4: Valid Image Upload (PNG)

**Objective:** Successfully upload a valid PNG image

**Steps:**
1. Navigate to "My Profile"
2. Click the camera button
3. Select a PNG image file (e.g., `test-photo.png`) that is less than 5MB
4. Wait for upload

**Expected Result:**
- ✅ Same as Test 3, but with PNG file

**Test Data:**
- File: Any PNG image under 5MB
- Recommended: 500x500px or larger square image

---

### Test 5: Invalid File Type

**Objective:** Reject non-image files

**Steps:**
1. Navigate to "My Profile"
2. Click the camera button
3. Try to select a non-image file:
   - PDF file (`.pdf`)
   - Word document (`.docx`)
   - Video file (`.mp4`)
   - GIF file (`.gif`) - Note: GIFs are not in the allowed types

**Expected Result:**
- ✅ Alert appears: "Please select a valid image file (JPG, JPEG, or PNG)"
- ✅ No upload occurs
- ✅ Avatar remains unchanged
- ✅ Button re-enables immediately

**Test Data:**
- Any non-JPEG/PNG file

---

### Test 6: File Size Validation (Over 5MB)

**Objective:** Reject files larger than 5MB

**Steps:**
1. Navigate to "My Profile"
2. Click the camera button
3. Select an image file larger than 5MB

**Expected Result:**
- ✅ Alert appears: "File size must be less than 5MB"
- ✅ No upload occurs
- ✅ Avatar remains unchanged
- ✅ Button re-enables immediately

**Test Data:**
- Image file > 5MB (you can create one by saving a high-resolution photo)

---

### Test 7: Cancel File Selection

**Objective:** User can cancel the file picker without issues

**Steps:**
1. Navigate to "My Profile"
2. Click the camera button
3. Click "Cancel" in the file picker dialog (don't select a file)

**Expected Result:**
- ✅ File picker closes
- ✅ No error messages appear
- ✅ Avatar remains unchanged
- ✅ Button remains enabled and functional

**Test Data:** N/A

---

### Test 8: Upload Error Handling (Backend Unavailable)

**Objective:** Gracefully handle upload errors

**Steps:**
1. Stop the backend server
2. Navigate to "My Profile"
3. Click the camera button
4. Select a valid image file

**Expected Result:**
- ✅ Loading spinner appears briefly
- ✅ Error alert appears: "Failed to upload photo: [error message]"
- ✅ Original avatar (or placeholder) is restored
- ✅ Button re-enables
- ✅ No success toast appears

**Test Data:**
- Any valid JPEG/PNG file
- Backend server must be stopped

---

### Test 9: Multiple Consecutive Uploads

**Objective:** User can upload multiple images in succession

**Steps:**
1. Navigate to "My Profile"
2. Upload a valid image (wait for success)
3. Immediately click the camera button again
4. Upload a different image
5. Repeat 2-3 times

**Expected Result:**
- ✅ Each upload works independently
- ✅ Avatar updates each time
- ✅ Success toast appears for each upload
- ✅ No errors or UI glitches
- ✅ Latest image is displayed after all uploads

**Test Data:**
- 3-4 different valid image files

---

### Test 10: Upload on Player vs Coach Profile

**Objective:** Feature works for both user types

**Steps:**
1. Test all above scenarios with a **player** account
2. Test all above scenarios with a **coach** account

**Expected Result:**
- ✅ Feature behaves identically for both players and coaches
- ✅ No differences in functionality
- ✅ Both profiles can upload and display images correctly

**Test Data:**
- One player account
- One coach account

---

### Test 11: Image Preview Before Upload Completes

**Objective:** User sees preview immediately

**Steps:**
1. Navigate to "My Profile"
2. Click the camera button
3. Select a valid image
4. Observe the avatar area during the upload process

**Expected Result:**
- ✅ Loading spinner appears first (very brief)
- ✅ Image preview appears in avatar circle before server upload completes
- ✅ If upload succeeds, image remains
- ✅ If upload fails, original avatar is restored

**Test Data:**
- Valid image file

---

### Test 12: Success Toast Auto-Dismiss

**Objective:** Success message disappears automatically

**Steps:**
1. Upload a valid image successfully
2. Observe the green success toast in the top-right corner
3. Wait 3 seconds

**Expected Result:**
- ✅ Toast appears with slide-in animation
- ✅ Toast is visible for 3 seconds
- ✅ Toast slides out and disappears after 3 seconds
- ✅ No manual dismissal needed

**Test Data:**
- Valid image file

---

### Test 13: Responsive Design (Mobile View)

**Objective:** Feature works on mobile/tablet screens

**Steps:**
1. Resize browser window to mobile width (< 768px)
2. Navigate to "My Profile"
3. Attempt to upload an image

**Expected Result:**
- ✅ Camera button is still visible and accessible
- ✅ File picker opens correctly on mobile
- ✅ Upload process works the same
- ✅ Toast notification is visible and readable

**Test Data:**
- Valid image file

---

### Test 14: Browser Compatibility

**Objective:** Feature works across browsers

**Test in each browser:**
- Chrome/Edge (Chromium)
- Firefox
- Safari (if on Mac)

**Expected Result:**
- ✅ File picker opens correctly in all browsers
- ✅ Image preview works in all browsers
- ✅ Upload succeeds in all browsers
- ✅ Animations and transitions work smoothly

**Test Data:**
- Valid image file

---

## Backend Integration Testing

### Test 15: Verify Backend Response

**Objective:** Confirm backend returns correct data

**Steps:**
1. Open browser DevTools (F12) → Network tab
2. Upload a valid image
3. Find the `profile-image` request in the Network tab
4. Check the response

**Expected Response:**
```json
{
  "imageUrl": "http://localhost:5000/uploads/profile-images/[filename]",
  "message": "Profile image uploaded successfully"
}
```

**Expected Result:**
- ✅ Status code: 200 OK
- ✅ Response contains `imageUrl` field
- ✅ Image URL is accessible (can open in new tab)

---

### Test 16: Verify Database Update

**Objective:** Confirm profile is updated in database

**Steps:**
1. Upload a valid image
2. Query the database for your user's profile

**For Players:**
```sql
SELECT profile_image_url FROM player_profiles WHERE user_id = [your_user_id];
```

**For Coaches:**
```sql
SELECT profile_image_url FROM coach_profiles WHERE user_id = [your_user_id];
```

**Expected Result:**
- ✅ `profile_image_url` column is updated with the new image URL
- ✅ URL matches the response from the upload endpoint

---

### Test 17: File Storage on Server

**Objective:** Verify file is saved on the server

**Steps:**
1. Upload a valid image
2. Check the server's `backend/uploads/profile-images/` directory
3. Look for the uploaded file

**Expected Result:**
- ✅ Image file exists in the directory
- ✅ File is accessible via the URL returned by the API
- ✅ File name is unique (likely includes timestamp or UUID)

---

## Edge Cases and Security

### Test 18: Rapid Click Prevention

**Objective:** User can't spam the upload button

**Steps:**
1. Click the camera button
2. Select a file but don't wait for upload
3. Try clicking the camera button again

**Expected Result:**
- ✅ Button is disabled during upload
- ✅ Multiple uploads cannot be triggered simultaneously
- ✅ Button re-enables after upload completes

---

### Test 19: XSS Prevention (File Name)

**Objective:** Malicious file names don't cause issues

**Steps:**
1. Rename an image file to: `<script>alert('xss')</script>.jpg`
2. Upload the file

**Expected Result:**
- ✅ Upload succeeds (server should sanitize filename)
- ✅ No script execution occurs
- ✅ Image displays correctly

---

### Test 20: Authentication Check

**Objective:** Unauthenticated users cannot upload

**Steps:**
1. Clear browser cookies/localStorage (log out)
2. Try to navigate to "My Profile"
3. OR: Manually call the upload API without a token

**Expected Result:**
- ✅ User is redirected to login page
- ✅ OR: API returns 401 Unauthorized
- ✅ No upload occurs

---

## Regression Testing

### Test 21: Other Profile Features Still Work

**Objective:** Ensure new feature doesn't break existing functionality

**Steps:**
1. After uploading a photo, test:
   - ✅ Edit Profile button still works
   - ✅ Share Profile button still works
   - ✅ Profile tabs (Overview, Stats, Highlights, Academics) still switch correctly
   - ✅ Follow/Unfollow button works (on other profiles)
   - ✅ Profile information displays correctly

**Expected Result:**
- ✅ All existing features continue to function normally

---

## Performance Testing

### Test 22: Upload Speed

**Objective:** Measure upload time for different file sizes

**Test Files:**
- 100KB image
- 500KB image
- 1MB image
- 3MB image

**Expected Result:**
- ✅ 100KB: < 1 second
- ✅ 500KB: < 2 seconds
- ✅ 1MB: < 3 seconds
- ✅ 3MB: < 5 seconds

*Note: Times may vary based on network speed*

---

## Known Limitations

1. **File Types:** Only JPEG, JPG, and PNG are supported (no GIF, WebP, etc.)
2. **File Size:** Maximum 5MB per image
3. **Image Processing:** No automatic cropping or resizing on the frontend (images are uploaded as-is)
4. **Deletion:** No option to remove/delete a profile photo (only replace)

---

## Bug Reporting Template

If you find a bug, use this template:

**Bug Title:** [Short description]

**Steps to Reproduce:**
1.
2.
3.

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Browser/Device:**
[Chrome 120, Windows 11, etc.]

**Screenshots:**
[If applicable]

**Console Errors:**
[Any errors from browser console]

---

## Test Sign-Off

After completing all tests, fill out this checklist:

### Player Profile Tests
- [ ] Test 1-17: All passed
- [ ] Test 18-20: Edge cases handled
- [ ] Test 21: No regression issues
- [ ] Test 22: Performance acceptable

### Coach Profile Tests
- [ ] Test 1-17: All passed
- [ ] Test 18-20: Edge cases handled
- [ ] Test 21: No regression issues
- [ ] Test 22: Performance acceptable

### Overall
- [ ] All browsers tested
- [ ] Mobile view tested
- [ ] Backend integration verified
- [ ] Database updates confirmed
- [ ] No critical bugs found

**Tested By:** _______________
**Date:** _______________
**Status:** [ ] PASS  [ ] FAIL

**Notes:**
_________________________________
_________________________________
_________________________________

---

## Quick Test Checklist (5 Minutes)

For a rapid smoke test, run these essential tests:

1. ✅ Upload a valid JPEG (< 5MB)
2. ✅ Upload a valid PNG (< 5MB)
3. ✅ Try to upload a file > 5MB (should reject)
4. ✅ Try to upload a PDF (should reject)
5. ✅ Refresh page and verify image persists
6. ✅ View another user's profile (button should be hidden)

If all pass → Feature is working correctly
If any fail → Run full test suite above

---

**End of Testing Guide**
