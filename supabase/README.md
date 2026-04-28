# instaJOY Supabase Architecture

This folder contains the Supabase PostgreSQL schema and Edge Function samples for the instaJOY social app.

## Contents
- `schema.sql` - production-ready PostgreSQL schema with indexes and RLS policies
- `functions/notify.ts` - Supabase Edge Function for sending Firebase Cloud Messaging notifications
- `functions/logAnalytics.ts` - Supabase Edge Function sample for writing analytics events to MongoDB

## Notes
- **Supabase** is the main backend for core data: profiles, posts, likes, comments, follows, notifications.
- **Firebase FCM** is used only for push notifications.
- **MongoDB** is used only for analytics and logging, not for profiles or posts.
- Supabase Auth stores credentials in `auth.users`; this is a system-managed table and is never queried directly from frontend code.
- Application user data is stored in `public.profiles` and linked to auth via `profiles.id = auth.users.id`.

## Deployment
1. Create a Supabase project.
2. Run `supabase db reset` and apply `supabase/schema.sql`.
   - If you have a direct PostgreSQL connection, you can also run `npm run apply:supabase-schema` after setting `SUPABASE_DB_URL` or `DATABASE_URL` in `.env.local`, `.env`, or your shell.
3. Create Storage buckets:
   - `post-images`
   - `reel-videos`
4. Deploy Edge Functions with `supabase functions deploy notify` and `supabase functions deploy logAnalytics`.
5. Add environment variables in Supabase:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FIREBASE_SERVER_KEY`
   - `MONGODB_URI`
   - `MONGODB_DB`

## Supabase RLS
- Public read access for `profiles`, `posts`, `likes`, `comments`, `follows`.
- Authenticated users can insert, update, or delete only their own rows.
- Notifications are inserted via service role only.
