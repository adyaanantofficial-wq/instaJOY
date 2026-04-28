# MongoDB Analytics and Logging for instaJOY

MongoDB is used only for non-critical event logging, analytics, and optional AI recommendations.

Collections:
- `analyticsEvents`
  - `event_type`: string
  - `user_id`: uuid or null
  - `source`: string
  - `details`: object
  - `created_at`: timestamp

- `errorLogs`
  - `service`: string
  - `level`: string
  - `message`: string
  - `stack`: string
  - `context`: object
  - `created_at`: timestamp

- `aiRecommendations`
  - `user_id`: uuid
  - `recommendations`: array
  - `meta`: object
  - `created_at`: timestamp

Usage:
- Supabase Edge Functions may send analytics payloads to MongoDB.
- MongoDB must not store core application data such as users, posts, likes, comments, follows, or notifications.
- Use MongoDB only for logs, metrics, and inference-related payloads.
