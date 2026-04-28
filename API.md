# instaJOY API Documentation

Complete REST API reference for instaJOY backend.

**Base URL**: `https://instajoy-backend.onrender.com/api`

## Table of Contents
1. [Authentication](#authentication)
2. [Users](#users)
3. [Posts](#posts)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)

---

## Authentication

### Register User
Create a new user account.

```
POST /auth/register
```

**Request**:
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response** (201):
```json
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

**Validation**:
- Username: 3-30 chars, alphanumeric, dots, underscores only
- Email: Valid email format
- Password: Minimum 6 characters

**Errors**:
- `400`: Username/email already exists
- `400`: Validation failed

---

### Login User
Authenticate user and get tokens.

```
POST /auth/login
```

**Request**:
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response** (200):
```json
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

**Errors**:
- `401`: Invalid credentials

---

### Refresh Token
Get new access token using refresh token.

```
POST /auth/refresh
```

**Request**:
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response** (200):
```json
{
  "success": true,
  "token": "eyJhbGc..."
}
```

**Errors**:
- `400`: Refresh token required
- `401`: Invalid refresh token

---

### Get Current User
Get authenticated user's profile.

```
GET /auth/me
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200):
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "bio": "Just a guy who loves coding",
    "profileImage": "data:image/jpeg;base64,...",
    "followers": ["507f1f77bcf86cd799439012"],
    "following": ["507f1f77bcf86cd799439013"],
    "postsCount": 42,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Errors**:
- `401`: Not authenticated
- `404`: User not found

---

## Users

### Get User Profile
Get public profile of any user.

```
GET /user/:username
```

**Parameters**:
- `username` (string): Username to retrieve

**Response** (200):
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "bio": "Just a guy who loves coding",
    "profileImage": "data:image/jpeg;base64,...",
    "followers": ["507f1f77bcf86cd799439012"],
    "following": ["507f1f77bcf86cd799439013"],
    "postsCount": 42,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Errors**:
- `404`: User not found

---

### Update Profile
Update current user's profile.

```
POST /user/profile/update
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request**:
```json
{
  "bio": "Updated bio",
  "profileImage": "data:image/jpeg;base64,..."
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Profile updated",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "bio": "Updated bio",
    "profileImage": "data:image/jpeg;base64,..."
  }
}
```

**Validation**:
- Bio: Maximum 150 characters
- Image: Maximum 5MB base64 string

**Errors**:
- `401`: Not authenticated
- `400`: Validation failed

---

### Follow User
Follow another user.

```
POST /user/follow
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request**:
```json
{
  "userId": "507f1f77bcf86cd799439012"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Followed user"
}
```

**Errors**:
- `401`: Not authenticated
- `400`: Cannot follow yourself
- `404`: User not found

---

### Unfollow User
Unfollow another user.

```
POST /user/unfollow
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request**:
```json
{
  "userId": "507f1f77bcf86cd799439012"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Unfollowed user"
}
```

**Errors**:
- `401`: Not authenticated
- `404`: User not found

---

### Get Suggested Users
Get list of suggested users to follow.

```
GET /user/suggested?limit=5
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `limit` (number, optional): Number of suggestions (default: 5)

**Response** (200):
```json
{
  "success": true,
  "users": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "username": "jane_doe",
      "profileImage": "data:image/jpeg;base64,...",
      "bio": "Photography enthusiast",
      "followers": []
    }
  ]
}
```

**Errors**:
- `401`: Not authenticated

---

## Posts

### Create Post
Create a new post.

```
POST /posts/create
```

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request**:
```json
{
  "caption": "Beautiful sunset! #nature #photography",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**Response** (201):
```json
{
  "success": true,
  "message": "Post created",
  "post": {
    "_id": "507f1f77bcf86cd799439014",
    "author": {
      "_id": "507f1f77bcf86cd799439011",
      "username": "john_doe",
      "profileImage": "data:image/jpeg;base64,..."
    },
    "caption": "Beautiful sunset! #nature #photography",
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "likes": [],
    "comments": [],
    "createdAt": "2024-01-20T15:30:00Z"
  }
}
```

**Validation**:
- Caption: Maximum 2200 characters
- Image: Maximum 5MB base64 string
- At least caption OR image required

**Errors**:
- `401`: Not authenticated
- `400`: No caption or image provided
- `400`: Image too large

---

### Get Feed
Get paginated feed of posts from followed users.

```
GET /posts/feed?page=1&limit=10
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Posts per page (default: 10)

**Response** (200):
```json
{
  "success": true,
  "posts": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "author": {
        "_id": "507f1f77bcf86cd799439011",
        "username": "john_doe",
        "profileImage": "data:image/jpeg;base64,..."
      },
      "caption": "Beautiful sunset!",
      "image": "data:image/jpeg;base64,...",
      "likes": ["507f1f77bcf86cd799439015"],
      "comments": [
        {
          "_id": "507f1f77bcf86cd799439016",
          "author": {
            "_id": "507f1f77bcf86cd799439015",
            "username": "jane_doe",
            "profileImage": "data:image/jpeg;base64,..."
          },
          "text": "Amazing shot!",
          "createdAt": "2024-01-20T16:00:00Z"
        }
      ],
      "createdAt": "2024-01-20T15:30:00Z"
    }
  ]
}
```

**Errors**:
- `401`: Not authenticated

---

### Get User's Posts
Get all posts by a specific user.

```
GET /posts/user/:username
```

**Parameters**:
- `username` (string): Username whose posts to retrieve

**Response** (200):
```json
{
  "success": true,
  "posts": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "author": {...},
      "caption": "Beautiful sunset!",
      "image": "data:image/jpeg;base64,...",
      "likes": [],
      "comments": [],
      "createdAt": "2024-01-20T15:30:00Z"
    }
  ]
}
```

**Errors**:
- `404`: User not found

---

### Delete Post
Delete a post (must be author).

```
DELETE /posts/:postId
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Parameters**:
- `postId` (string): Post ID to delete

**Response** (200):
```json
{
  "success": true,
  "message": "Post deleted"
}
```

**Errors**:
- `401`: Not authenticated
- `403`: Not authorized (not post author)
- `404`: Post not found

---

### Like Post
Like a post.

```
POST /posts/:postId/like
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Parameters**:
- `postId` (string): Post ID to like

**Response** (200):
```json
{
  "success": true,
  "message": "Post liked",
  "likes": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439015"]
}
```

**Errors**:
- `401`: Not authenticated
- `404`: Post not found

---

### Unlike Post
Unlike a post.

```
POST /posts/:postId/unlike
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Parameters**:
- `postId` (string): Post ID to unlike

**Response** (200):
```json
{
  "success": true,
  "message": "Post unliked",
  "likes": ["507f1f77bcf86cd799439015"]
}
```

**Errors**:
- `401`: Not authenticated
- `404`: Post not found

---

### Get Comments
Get all comments on a post.

```
GET /posts/:postId/comments
```

**Parameters**:
- `postId` (string): Post ID

**Response** (200):
```json
{
  "success": true,
  "comments": [
    {
      "_id": "507f1f77bcf86cd799439016",
      "author": {
        "_id": "507f1f77bcf86cd799439015",
        "username": "jane_doe",
        "profileImage": "data:image/jpeg;base64,..."
      },
      "text": "Amazing shot!",
      "createdAt": "2024-01-20T16:00:00Z"
    }
  ]
}
```

**Errors**:
- `404`: Post not found

---

### Add Comment
Add comment to post.

```
POST /posts/:postId/comment
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Parameters**:
- `postId` (string): Post ID

**Request**:
```json
{
  "text": "Amazing shot!"
}
```

**Response** (201):
```json
{
  "success": true,
  "message": "Comment added",
  "comments": [
    {
      "_id": "507f1f77bcf86cd799439016",
      "author": {
        "_id": "507f1f77bcf86cd799439011",
        "username": "john_doe",
        "profileImage": "data:image/jpeg;base64,..."
      },
      "text": "Amazing shot!",
      "createdAt": "2024-01-20T16:05:00Z"
    }
  ]
}
```

**Validation**:
- Text: Cannot be empty
- Text: Maximum 500 characters

**Errors**:
- `401`: Not authenticated
- `400`: Comment cannot be empty
- `404`: Post not found

---

### Delete Comment
Delete a comment (must be author).

```
DELETE /posts/:postId/comment/:commentId
```

**Headers**:
```
Authorization: Bearer <access_token>
```

**Parameters**:
- `postId` (string): Post ID
- `commentId` (string): Comment ID to delete

**Response** (200):
```json
{
  "success": true,
  "message": "Comment deleted"
}
```

**Errors**:
- `401`: Not authenticated
- `403`: Not authorized (not comment author)
- `404`: Post or comment not found

---

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {...}
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## Error Handling

### Status Codes
| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Auth required or failed |
| 403 | Forbidden - Not authorized |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limited |
| 500 | Server Error - Backend error |

### Common Errors

#### 401 Unauthorized
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**Solutions**:
- Include valid JWT token in Authorization header
- Token format: `Bearer <token>`
- Check token expiration

#### 429 Too Many Requests
```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later."
}
```

**Solutions**:
- Wait for rate limit window to reset
- Check response headers for retry info

#### Validation Error
```json
{
  "success": false,
  "message": "Username must be 3-30 characters"
}
```

**Solutions**:
- Follow field validation rules
- Check request format matches spec

---

## Rate Limiting

### Limits
- **Global**: 100 requests per 15 minutes per IP
- **Auth**: 5 login/signup attempts per 15 minutes per IP

### Headers
Response includes rate limit information:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
Retry-After: 120
```

### Strategies
- Implement exponential backoff
- Cache responses where possible
- Use pagination for large datasets

---

## Examples

### Example: Full Auth Flow
```bash
# 1. Register
curl -X POST https://instajoy-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'

# Response includes: token, refreshToken

# 2. Use token to create post
curl -X POST https://instajoy-backend.onrender.com/api/posts/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "caption": "First post!",
    "image": "data:image/jpeg;base64,..."
  }'

# 3. When token expires, refresh it
curl -X POST https://instajoy-backend.onrender.com/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<your_refresh_token>"}'

# Response includes: new token
```

---

## Pagination Example

```bash
# Get first page (10 posts)
curl https://instajoy-backend.onrender.com/api/posts/feed?page=1&limit=10 \
  -H "Authorization: Bearer <token>"

# Get second page
curl https://instajoy-backend.onrender.com/api/posts/feed?page=2&limit=10 \
  -H "Authorization: Bearer <token>"

# Get 20 posts per page
curl https://instajoy-backend.onrender.com/api/posts/feed?page=1&limit=20 \
  -H "Authorization: Bearer <token>"
```

---

**API Version**: 1.0  
**Last Updated**: April 2026  
**Status**: Stable
