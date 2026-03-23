Small schools using AI to match to recruiting areas / hs pipelines
Big schools know who the big time recruits are , benefit more from transfer portal 


Local dev: Edit code → test on 127.0.0.1:5500 with backend on port 5000
Push to git: git add, git commit, git push origin main
Deploy: SSH into EC2 → cd ~/direct-recruit && git pull origin main → restart PM2 only if backend files changed

psql "host=direct-recruit-db.c6t02cia6f8p.us-east-1.rds.amazonaws.com user=dr_admin dbname=direct_recruit sslmode=require"

SELECT pg_size_pretty(pg_database_size('direct_recruit'));




Currently working on: 


To do:
- when a person follows a private account, unrequests, they cannot click follow again since the follow notification sent to the private account
- transfer portal analysis page, personality test with spider map? 
- team logos for offers tab 
- scroll bars 
- landing page 
- multiple accounts for multi-sport athletes 
- team account confirmation, team pages contact DR directly 
- change account type 




Password: Test123!@#

Email	Role
hsplayer@test.com	High School Player
collegeplayer@test.com	College Player
transferplayer@test.com	Transfer Player
hscoach@test.com	High School Coach
collegecoach@test.com	College Coach
other@test.com	Other (Parent/Fan)




