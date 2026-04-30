# Verification Checklist

## Frontend
- [ ] Confirm `frontend/js/config.js` is set with real Supabase and Firebase keys.
- [ ] Confirm `index.html` loads Supabase and Firebase scripts before app scripts.
- [ ] Sign in using Supabase Auth from the login UI.
- [ ] Use guest mode and verify feed content loads.
- [ ] Upload a post image and confirm it appears in the feed.
- [ ] Register for push notifications and validate the FCM token is created.

## Supabase
- [ ] Apply `supabase/schema.sql` to the database.
- [ ] Create `post-images`, `reel-videos`, `post-media`, `story-chain`, and `capsule-media` storage buckets.
- [ ] Deploy Edge Functions and verify environment variables are set.
- [ ] Deploy `unlock-capsules` and schedule it to run every 5 minutes.
- [ ] Test `notify` function with a known user ID and notification payload.
- [ ] Test realtime subscriptions on `posts`, `likes`, and `comments`.

## Firebase
- [ ] Configure Firebase project with Cloud Messaging enabled.
- [ ] Register app via Firebase console with the same `project_id`.
- [ ] Upload `frontend/firebase-messaging-sw.js` as the service worker root in GitHub Pages if hosted there.
- [ ] Confirm `FIREBASE_VAPID_KEY` matches the key in the Firebase console.

## MongoDB Analytics
- [ ] Ensure `MONGODB_URI` points to an analytics-only cluster.
- [ ] Create `events` and `logs` collections if required.
- [ ] Validate Edge Function logs are writing analytics events successfully.
