# Direct Recruit API Reference

Base URL: `http://localhost:5000/api`

## Authentication

All authenticated endpoints require `Authorization: Bearer <token>` header.

### Register
```
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "<your_password>",
  "role": "player" | "coach"
}

Response: { token, user: { id, email, role } }
```

### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "<your_password>"
}

Response: { token, user: { id, email, role, profile_completed } }
```

### Get Current User
```
GET /auth/me
Authorization: Bearer <token>

Response: { user, profile }
```

## Profiles

### Create/Update Player Profile
```
POST /profile/player
Authorization: Bearer <token>
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "high_school": "Lincoln High",
  "graduation_year": 2025,
  "city": "Denver",
  "state": "Colorado",
  "position": "QB",
  "height": 74,
  "weight": 205,
  "gpa": 3.8,
  "sat_score": 1350,
  "act_score": 32,
  "bio": "Starting QB...",
  "player_status": "senior"
}

Response: { message, profile }
```

### Create/Update Coach Profile
```
POST /profile/coach
Authorization: Bearer <token>
Content-Type: application/json

{
  "first_name": "Mike",
  "last_name": "Smith",
  "college_name": "CSU",
  "college_division": "FBS",
  "position_title": "OC",
  "city": "Fort Collins",
  "state": "Colorado",
  "phone": "555-0123",
  "bio": "15 years experience..."
}

Response: { message, profile }
```

### Get Profile
```
GET /profile/player/:userId
GET /profile/coach/:userId
Authorization: Bearer <token>

Response: { profile }
```

### Search
```
GET /profile/search/players?position=QB&state=Colorado&graduation_year=2025
GET /profile/search/coaches?college_division=FBS&state=Colorado
Authorization: Bearer <token>

Response: { players/coaches, count }
```

## Follow System

### Follow User
```
POST /follow/:userId
Authorization: Bearer <token>

Response: { message }
```

### Unfollow User
```
DELETE /follow/:userId
Authorization: Bearer <token>

Response: { message }
```

### Get Followers
```
GET /follow/:userId/followers?limit=50&offset=0
Authorization: Bearer <token>

Response: { followers, count }
```

### Get Following
```
GET /follow/:userId/following?limit=50&offset=0
Authorization: Bearer <token>

Response: { following, count }
```

### Get Follow Counts
```
GET /follow/:userId/counts
Authorization: Bearer <token>

Response: { following_count, followers_count }
```

### Check Follow Status
```
GET /follow/:userId/check
Authorization: Bearer <token>

Response: { isFollowing: true/false }
```

## Posts & Feed

### Create Post
```
POST /posts
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Great practice today!",
  "media_url": "/uploads/...",  // optional
  "media_type": "image" | "video"  // optional
}

Response: { message, post }
```

### Get Feed
```
GET /posts/feed?limit=20&offset=0
Authorization: Bearer <token>

Response: { posts, count }
```

### Get User's Posts
```
GET /posts/user/:userId?limit=20&offset=0
Authorization: Bearer <token>

Response: { posts, count }
```

### Get Single Post
```
GET /posts/:postId
Authorization: Bearer <token>

Response: { post }
```

### Update Post
```
PUT /posts/:postId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated content",
  "media_url": "/uploads/...",
  "media_type": "image"
}

Response: { message, post }
```

### Delete Post
```
DELETE /posts/:postId
Authorization: Bearer <token>

Response: { message }
```

### Like Post
```
POST /posts/:postId/like
Authorization: Bearer <token>

Response: { message }
```

### Unlike Post
```
DELETE /posts/:postId/like
Authorization: Bearer <token>

Response: { message }
```

### Add Comment
```
POST /posts/:postId/comments
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Great post!"
}

Response: { message, comment }
```

### Get Comments
```
GET /posts/:postId/comments?limit=50&offset=0
Authorization: Bearer <token>

Response: { comments, count }
```

## Messaging

### Get Conversations
```
GET /messages/conversations?limit=20&offset=0
Authorization: Bearer <token>

Response: { conversations, count }
```

### Create/Get Conversation
```
POST /messages/conversations
Authorization: Bearer <token>
Content-Type: application/json

{
  "otherUserId": "uuid"
}

Response: { conversation }
```

### Get Messages
```
GET /messages/conversations/:conversationId?limit=50&offset=0
Authorization: Bearer <token>

Response: { messages, count }
```

### Send Message
```
POST /messages/conversations/:conversationId/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello!"
}

Response: { message }
```

### Mark as Read
```
POST /messages/conversations/:conversationId/read
Authorization: Bearer <token>

Response: { message }
```

## File Upload

### Upload Profile Image
```
POST /upload/profile-image
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
  profile_image: <file>

Response: { message, url }
```

### Upload Highlight Video (Players Only)
```
POST /upload/highlight-video
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
  highlight_video: <file>

Response: { message, url }
```

### Upload Post Media
```
POST /upload/post-media
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
  media: <file>

Response: { message, url, media_type }
```

## WebSocket Events

Connect with `socket.io-client`:
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: 'your_jwt_token' }
});
```

### Events to Emit
- `join_conversation(conversationId)` - Join a conversation room
- `leave_conversation(conversationId)` - Leave a conversation room
- `typing_start(conversationId)` - Indicate typing
- `typing_stop(conversationId)` - Stop typing indicator
- `send_message({ conversationId, content })` - Send message via socket

### Events to Listen
- `joined_conversation({ conversationId })` - Successfully joined
- `new_message(message)` - New message received
- `user_typing({ userId, conversationId })` - User is typing
- `user_stopped_typing({ userId, conversationId })` - User stopped typing
- `error({ message })` - Error occurred

## Rate Limits

- General API: 100 requests / 15 min
- Auth endpoints: 5 requests / 15 min
- Post creation: 20 posts / hour
- Messaging: 30 messages / minute

## Error Responses

All errors return:
```json
{
  "error": "Error message"
}
```

Or for validation errors:
```json
{
  "errors": [
    { "msg": "Error message", "param": "field_name" }
  ]
}
```

## Status Codes

- 200: Success
- 201: Created
- 400: Bad Request / Validation Error
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Too Many Requests (Rate Limited)
- 500: Server Error
