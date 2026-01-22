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



Currently working on: profile visibility, viewing profile without edit modals from a single view profile file 
Critical for working website (to-do still):
- profile visibility
- message permisions


To do:
- add others as part of search 
- store collegeplayer info from create a profile page (number, conferences, elig)
- team account confirmation 

- fix comp % for QB stats input, also fix career stats season to be descending order 
- feed logic for your network vs discover (what posts are shown) 
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


Prompt for viewing profiles cross-folder
Cross-Folder Profile Navigation Guide
Overview
When a user clicks on another user's profile, they navigate to that user's profile folder (hsplayer, collegeplayer, transferplayer, hscoach, collegecoach, or other). The from parameter tracks the originating page for sidebar highlighting and back navigation.

Part 1: Profile Navigation Links
Pattern for navigating to a profile:


// Navigate to appropriate profile folder based on user type
window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from={source}`;
Determining the folder:


// For players - based on playerType data attribute or profile data
let folder = 'hsplayer';
if (playerType === 'transfer' || profile.transfer === 'y' || profile.is_transfer_player) {
    folder = 'transferplayer';
} else if (playerType === 'college' || (profile.college_division && 
    ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(profile.college_division))) {
    folder = 'collegeplayer';
}

// For coaches - based on isCollege data attribute or college_division
const isCollegeCoach = card.dataset.isCollege === 'true' || 
    (profile.college_division && ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(profile.college_division));
const folder = isCollegeCoach ? 'collegecoach' : 'hscoach';

// For other user types
const folder = 'other';
Valid from values: discover, messages, notifications, feed, profile, search, recruiting, transfer-portal

Part 2: Sidebar Highlighting
In sidebar-nav.js (each profile folder has its own):


// Check for 'from' parameter to determine which nav item should be active
const urlParams = new URLSearchParams(window.location.search);
const fromPage = urlParams.get('from');

// Map 'from' values to page names
const fromPageMap = {
    'notifications': 'notifications',
    'discover': 'discover-players',
    'messages': 'messages',
    'feed': 'mainpage-player',  // or 'mainpage-coach' for coach folders
    'profile': 'my-profile',
    'search': 'discover-players',
    'recruiting': 'recruiting-board',
    'transfer-portal': 'transfer-portal'
};

// Use fromPage for active state if viewing another user's profile
const activePageName = (fromPage && fromPageMap[fromPage]) ? fromPageMap[fromPage] : pageName;
Part 3: Adding a New Source Page
Files to modify:

Source page JS file (e.g., frontend/{profile}/tabs/{source-page}.js):

Add navigation with from parameter:

window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from={new-source}`;
All sidebar-nav.js files (6 files - one per profile folder):

Add mapping in fromPageMap:

'{new-source}': '{nav-item-page-name}'
Part 4: Example Implementation
Adding profile links from a new "events" page:

In events.js:

// When clicking on a user's profile
const username = card.dataset.username;
const playerType = card.dataset.playerType;

let folder = 'hsplayer';
if (playerType === 'transfer') folder = 'transferplayer';
else if (playerType === 'college') folder = 'collegeplayer';

window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=events`;
In each sidebar-nav.js, add to fromPageMap:

'events': 'events'
Part 5: Special Cases
When you have full profile data (e.g., from API response or notification data):


let folder = 'hsplayer';
if (role === 'coach') {
    const hasCollegeDivision = profile.college_division &&
        ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(profile.college_division);
    folder = hasCollegeDivision ? 'collegecoach' : 'hscoach';
} else if (role === 'other') {
    folder = 'other';
} else {
    if (profile.transfer === 'y' || profile.is_transfer_player) {
        folder = 'transferplayer';
    } else if (profile.college_division &&
        ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(profile.college_division)) {
        folder = 'collegeplayer';
    }
}
window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from={source}`;
Profile Folders Reference
User Type	Folder
High School Player	hsplayer
College Player	collegeplayer
Transfer Player	transferplayer
High School Coach	hscoach
College Coach	collegecoach
Other (agents, brands, etc.)	other

