# Direct Recruit Backend API

Node.js/Express backend with PostgreSQL and Redis for the Direct Recruit platform.

## Setup

1. **Install dependencies**
```bash
npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Install PostgreSQL and Redis**
- PostgreSQL 14+
- Redis 6+

4. **Create database**
```bash
psql -U postgres
CREATE DATABASE direct_recruit;
\q
```

5. **Run migrations**
```bash
npm run migrate
```

6. **Start server**
```bash
npm run dev
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires auth)

### Profiles
- `POST /api/profile/player` - Create/update player profile (requires player role)
- `POST /api/profile/coach` - Create/update coach profile (requires coach role)
- `GET /api/profile/player/:userId` - Get player profile
- `GET /api/profile/coach/:userId` - Get coach profile
- `GET /api/profile/search/players` - Search players
- `GET /api/profile/search/coaches` - Search coaches

## Database Schema

See [schema.sql](scripts/schema.sql) for full schema.

Key tables:
- `users` - Main user accounts
- `player_profiles` - Player-specific data
- `coach_profiles` - Coach-specific data
- `follows` - Follow relationships
- `posts` - User feed posts
- `messages` - Direct messaging
- `conversations` - Message threads
