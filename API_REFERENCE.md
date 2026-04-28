# instaJOY - API Reference

## Base URL
```
Development: http://localhost:5000/api
Production: https://your-render-url/api
```

---

## Authentication Endpoints

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securepassword123"
}

Response 201:
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com"
  },
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}

Response 200:
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com"
  },
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer eyJhbGc...

Response 200:
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "bio": "Love sharing joy!",
    "profileImage": "https://example.com/avatar.jpg",
    "followers": [],
    "following": []
  }
}
```

### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}

Response 200:
{
  "success": true,
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

---

## Post Endpoints

### Create Post
```http
POST /api/posts/create
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "caption": "Amazing moment! 🎉",
  "imageUrl": "https://example.com/image.jpg",
  "type": "image"
}

Response 201:
{
  "success": true,
  "message": "Post created successfully",
  "post": {
    "_id": "507f1f77bcf86cd799439011",
    "authorId": "507f1f77bcf86cd799439011",
    "caption": "Amazing moment! 🎉",
    "imageUrl": "https://example.com/image.jpg",
    "likes": [],
    "comments": [],
    "createdAt": "2026-04-28T10:30:00Z"
  }
}
```

### Get Feed
```http
GET /api/posts/feed?skip=0&limit=10

Response 200:
{
  "success": true,
  "posts": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "caption": "Amazing moment! 🎉",
      "imageUrl": "https://example.com/image.jpg",
      "likes": [],
      "comments": [],
      "isLiked": false,
      "likesCount": 0,
      "commentsCount": 0,
      "author": {
        "_id": "507f1f77bcf86cd799439011",
        "username": "john_doe",
        "profileImage": "https://example.com/avatar.jpg"
      },
      "createdAt": "2026-04-28T10:30:00Z"
    }
  ]
}
```

### Like Post
```http
POST /api/posts/{postId}/like
Authorization: Bearer eyJhbGc...

Response 200:
{
  "success": true,
  "message": "Post liked"
}
```

### Unlike Post
```http
POST /api/posts/{postId}/unlike
Authorization: Bearer eyJhbGc...

Response 200:
{
  "success": true,
  "message": "Post unliked"
}
```

### Comment on Post
```http
POST /api/posts/{postId}/comment
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "text": "Great post! Love it!"
}

Response 201:
{
  "success": true,
  "message": "Comment added",
  "comment": {
    "_id": "507f1f77bcf86cd799439011",
    "authorId": "507f1f77bcf86cd799439011",
    "text": "Great post! Love it!",
    "createdAt": "2026-04-28T10:30:00Z"
  }
}
```

---

## User Endpoints

### Get User Profile
```http
GET /api/user/{username}

Response 200:
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "bio": "Love sharing joy!",
    "profileImage": "https://example.com/avatar.jpg",
    "followers": [],
    "following": [],
    "followerCount": 0,
    "followingCount": 0
  }
}
```

### Update Profile
```http
POST /api/user/profile/update
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "bio": "Updated bio",
  "name": "John Doe"
}

Response 200:
{
  "success": true,
  "message": "Profile updated",
  "user": { ... }
}
```

---

## Follow Endpoints

### Follow User
```http
POST /api/follow/{userId}
Authorization: Bearer eyJhbGc...

Response 200:
{
  "success": true,
  "message": "User followed"
}
```

### Unfollow User
```http
POST /api/follow/{userId}/unfollow
Authorization: Bearer eyJhbGc...

Response 200:
{
  "success": true,
  "message": "User unfollowed"
}
```

---

## Search Endpoints

### Search Users
```http
GET /api/search/users?q=john

Response 200:
{
  "success": true,
  "users": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "username": "john_doe",
      "profileImage": "https://example.com/avatar.jpg"
    }
  ]
}
```

### Search Posts
```http
GET /api/search/posts?q=amazing

Response 200:
{
  "success": true,
  "posts": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "caption": "Amazing moment! 🎉",
      "imageUrl": "https://example.com/image.jpg"
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error description"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Rate Limiting

**Endpoints:** All `/api/` routes
- **Window:** 15 minutes
- **Limit:** 100 requests

**Auth Endpoints:** Login & Register
- **Window:** 15 minutes
- **Limit:** 5 attempts

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer {JWT_TOKEN}
```

**Token Expiration:** 1 hour
**Refresh Token Expiration:** 7 days

---

## Data Limits

- **Bio:** 150 characters max
- **Post Caption:** 500 characters max
- **Comment:** 500 characters max
- **Image Size:** 200 KB max
- **Video Size:** 1 MB max
- **Username:** 3-30 characters
- **Password:** 6 characters min

---

**API Version:** 1.0.0
**Last Updated:** April 2026
