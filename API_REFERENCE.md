# API Reference

Base URL:

```text
https://your-render-service.onrender.com/api
```

## Auth

- `POST /auth/register`
  Body: `{ "username": "joy_user", "email": "joy@example.com", "password": "secret123" }`
- `POST /auth/login`
  Body: `{ "email": "joy@example.com", "password": "secret123" }`
- `POST /auth/refresh`
  Body: `{ "refreshToken": "..." }`
- `GET /auth/me`
- `POST /auth/logout`

## Users

- `GET /users/me/profile`
- `PATCH /users/me/profile`
  Body:
  `{ "bio": "Short bio", "profileImage": "data:image/jpeg;base64,...", "removeProfileImage": false }`
- `GET /users/:username`

## Follows

- `POST /follows/:userId`
- `DELETE /follows/:userId`
- `GET /follows/:userId/followers`
- `GET /follows/:userId/following`

## Posts

- `POST /posts`
  Text body:
  `{ "type": "text", "text": "A short joke", "category": "jokes" }`
  Image body:
  `{ "type": "image", "text": "Optional caption", "imageData": "data:image/jpeg;base64,..." }`
- `GET /posts/feed?limit=8&cursor=<postId>`
- `GET /posts/user/:username`
- `GET /posts/:postId`
- `GET /posts/:postId/comments`
- `POST /posts/:postId/like`
- `DELETE /posts/:postId/like`
- `POST /posts/:postId/comments`
  Body: `{ "text": "Nice one!" }`
- `DELETE /posts/:postId`

## Reels

- `POST /reels`
  Body:
  `{ "caption": "Quick reel", "videoData": "data:video/mp4;base64,...", "durationSeconds": 12.4 }`
- `GET /reels/feed?limit=4&cursor=<reelId>`
- `GET /reels/:reelId/comments`
- `POST /reels/:reelId/like`
- `DELETE /reels/:reelId/like`
- `POST /reels/:reelId/comments`
  Body: `{ "text": "Love this reel" }`
- `DELETE /reels/:reelId`

## Messages

- `GET /messages/conversations`
- `GET /messages/:userId`
- `POST /messages`
  Body: `{ "receiverId": "<userId>", "text": "Hello!" }`

## Notifications

- `GET /notifications`
- `POST /notifications/read-all`
- `POST /notifications/:notificationId/read`
- `DELETE /notifications/:notificationId`

## Search

- `GET /search?q=joy`
- `GET /search/users?q=joy`
- `GET /search/posts?q=joy`

## Health

- `GET /health`
