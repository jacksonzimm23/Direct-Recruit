College Coach
-overview tab ✅
-posts tab (frontend only)
-recruiting tab (display recruiting areas, AI match with these HS athletes)✅
Small schools using AI to match to recruiting areas / hs pipelines
Big schools know who the big time recruitsare , benefit more from transfer portal 




Currently working on: feed backend storing in psql, media storing 


To do:
- feed, feed backend 
- settings page
- others profile 
- turn to app 

Feed
- backend for notifications from posts and interactions
- sidebar footer for subheaders
- storing media 
- verified account icons (team logo)

NEED TO ASK CLAUDE SECURITY, API, AND DATABASE QUESTIONS WHEN ALL DONE WITH FRONT AND BACKEND, HOW TO TURN TO MOBILE APP


Use Amazon RDS for PostgreSQL (need to switch AWS when getting off local server)
- security with psql stuff 

Feed: migrate to Aurora PostgreSQL


Prompt for view profiles and keeping that page highlighted:


Prompt: Sidebar Highlighting When Viewing Profiles From Different Pages
Problem: When viewing someone's profile from a specific tab (like notifications, discover, messages), the originating tab should stay highlighted in the sidebar, not feed. Solution Architecture:
Profile Links - Use the shared/view-profile.html router with a from parameter:

href="../../shared/view-profile.html?username=${username}&from=notifications"
The router determines the correct profile folder (hsplayer, collegeplayer, collegecoach, etc.) based on the viewed user's type.
In each my-profile.js - Update THREE locations: Location 1: Add the active variable in rebuildNavbar():

let notificationsActive = '';
Location 2: Add the case in the if/else chain:

} else if (fromPage === 'notifications') {
    notificationsActive = 'active';
}
Location 3: Update the nav HTML template:

<a href="/frontend/${userFolder}/tabs/notifications.html" class="nav-item ${notificationsActive}">
Location 4: Update updateActiveNavItem() function - add selector and case:

const notificationsNavItem = document.querySelector('.nav-item[href*="notifications"]');
// In the remove active section:
if (notificationsNavItem) notificationsNavItem.classList.remove('active');
// In the if/else chain:
} else if (fromPage === 'notifications' && notificationsNavItem) {
    notificationsNavItem.classList.add('active');
}
Files to modify for each new "from" page:
frontend/{profile}/tabs/{source-page}.js - Add link with from parameter
frontend/{profile}/tabs/my-profile.js - Add variable, case, and update nav HTML