College Coach
-overview tab ✅
-posts tab (frontend only)
-recruiting tab (display recruiting areas, AI match with these HS athletes)✅
Small schools using AI to match to recruiting areas / hs pipelines
Big schools know who the big time recruitsare , benefit more from transfer portal 


My Recommendation
Later: Add AWS Secrets Manager when you deploy to production
Much later: Private VPC when you have paying customers and need compliance


psql "host=direct-recruit-db.c6t02cia6f8p.us-east-1.rds.amazonaws.com user=dr_admin dbname=direct_recruit sslmode=require"

SELECT pg_size_pretty(pg_database_size('direct_recruit'));



Currently working on: security 

To do:

- fix comp % for QB stats input, also fix career stats season to be descending order 
- feed logic for your network vs discover (what posts are shown) 
- settings page
- google sign in 
- scroll bars 
- change postgres super user and its password 
- team pages contact DR directly 

GAMEPLANS TO SUCCESS
- Step 1: implement final prototype features (right sidebar, NIL Opportunity Match for college players)
- Step 2: CALL ANDY! 
    - Come up with talking points for Andy call 
- Step 3: DO WHAT ANDY SAYS!
- Step 4: Make 1000000 million dollars / year! 


GEN AI IDEAS
- transferplayer: automated bios based on copy and pasting college bio 
- professional messaging AI bot for players to send coaches (ChatGPT for players to message coaches) ask coaches if they evaluate how they text coaches 
- player-coach matching based on demographics, academics, location, etc. 
- AI chatbot for platform questions
- academic/athletic resume builder 
- transfer portal fit analyzer 
- recruiting experts NCSA 

- COLLEGEPLAYER: NIL Opportunity Matcher 
AI analyzes player's social following, engagement, sport, and location → recommends NIL deal types they'd qualify for and helps draft outreach pitches to brands.





Feed
- verified account icons (team logo)

Use Amazon RDS for PostgreSQL (need to switch AWS when getting off local server)
- security with psql stuff 





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