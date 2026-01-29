College Coach
-overview tab ✅
-posts tab (frontend only)
-recruiting tab (display recruiting areas, AI match with these HS athletes)✅
Small schools using AI to match to recruiting areas / hs pipelines
Big schools know who the big time recruits are , benefit more from transfer portal 






What needs fixing before production:

CORS - This is critical. Any malicious website can currently make API requests on behalf of logged-in users. Fix with:


cors({ origin: ['https://yourdomain.com'] })
Rate limiting in dev - Attackers don't care about your NODE_ENV

Token invalidation - Without a logout endpoint and token blacklist, stolen tokens remain valid for 7 days

File uploads - Only checking file extension is dangerous (attackers rename malware to .jpg)

Before Deploying
Make sure your production environment has:


NODE_ENV=production
This tells the server to use your domain whitelist instead of localhost. Without this, it will default to development mode.





psql "host=direct-recruit-db.c6t02cia6f8p.us-east-1.rds.amazonaws.com user=dr_admin dbname=direct_recruit sslmode=require"

SELECT pg_size_pretty(pg_database_size('direct_recruit'));



Currently working on: feed page 


To do:
- transfer portal analysis page, personality test with spider map? 
- team logos for offers tab 
- scroll bars 
- landing page 
- multiple accounts for multi-sport athletes 
- team account confirmation, team pages contact DR directly 
- change account type 


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





