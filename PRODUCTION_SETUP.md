# instaJOY Production Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying instaJOY with full Supabase integration, authentication, and production features.

---

## Phase 1: Supabase Setup

### 1.1 Project Configuration
Make sure your Supabase project is created and you have:
- Project URL
- Anonymous Key (for frontend)
- Service Role Key (for backend only - NEVER expose in frontend)

### 1.2 Database Tables
All tables are defined in `supabase/schema.sql`. The required tables are:

```
- auth.users (built-in Supabase)
- profiles (user profiles)
- posts (posts, images, reels)
- stories (24h expiry)
- story_chains (threaded stories)
- story_chain_segments (chain messages)
- time_capsules (scheduled posts)
- mood_preferences (content preferences)
- followers (follow relationships)
- likes (post likes)
- comments (post comments)
- messages (DMs)
- notifications (user notifications)
```

### 1.3 Apply Schema

Run the schema migration:

```bash
# Option A: Via Supabase Dashboard
# 1. Go to SQL Editor
# 2. Create new query
# 3. Paste content of supabase/schema.sql
# 4. Run

# Option B: Via CLI
supabase db reset --version initial
```

### 1.4 Storage Buckets

Create two public storage buckets:

**Bucket: `media`**
- Type: Public
- Files: Post images, reels, stories

**Bucket: `avatars`**
- Type: Public
- Files: User profile pictures

In dashboard:
1. Go to Storage → Buckets
2. Create new bucket
3. Set public access
4. Create RLS policies (see SECURITY.md)

---

## Phase 2: Frontend Configuration

### 2.1 Update Config

Edit `frontend/js/config.js`:

```javascript
window.INSTAJOY_CONFIG = Object.freeze({
    API_BASE_URL: '/api',
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-anon-key',
    // ... other config
});
```

### 2.2 Environment Variables

Create `.env.local` (if using build process):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Phase 3: Authentication Setup

### 3.1 Email Auth

In Supabase Dashboard → Authentication → Providers:
- Enable Email provider
- Configure email templates
- Set redirect URLs

### 3.2 Redirect URLs

Add to Auth → URL Configuration:
```
- http://localhost:3000
- http://localhost:5173
- https://yourdomain.com
- https://www.yourdomain.com
```

### 3.3 Email Templates

Customize in Supabase Dashboard:
- Confirmation email
- Password reset email
- Invite email

---

## Phase 4: Deploy Frontend

### 4.1 Build (if using build tools)

```bash
npm run build
```

### 4.2 Deploy to Server/Hosting

Options:
- **Vercel**: `vercel deploy`
- **Netlify**: `netlify deploy`
- **Self-hosted**: Copy files to server
- **Docker**: Use included Dockerfile

### 4.3 Update Config for Production

Ensure config.js points to production Supabase project:

```javascript
SUPABASE_URL: 'https://prod-project.supabase.co',
SUPABASE_ANON_KEY: 'prod-anon-key',
```

---

## Phase 5: Security Hardening

### 5.1 RLS Policies

All tables have RLS policies. Enable Row Level Security:

```sql
-- Run for each table
ALTER TABLE public.[table_name] ENABLE ROW LEVEL SECURITY;
```

### 5.2 Storage Policies

Configure in Supabase Dashboard → Storage → Policies:

```sql
-- Allow users to upload their own media
create policy "Users can upload media" on storage.objects
  for insert to authenticated with check (
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow public read
create policy "Public media read" on storage.objects
  for select using (bucket_id = 'media');
```

### 5.3 Secrets

Store secrets securely:
- Service Role Key: Backend only, NEVER commit
- Database password: In secure vault
- API keys: Environment variables

---

## Phase 6: Testing

### 6.1 Auth Flow

Test:
- [ ] Sign up with email
- [ ] Confirm email
- [ ] Sign in with email
- [ ] Guest mode access
- [ ] Logout and clear session
- [ ] Session persistence on reload

### 6.2 Post Creation

Test:
- [ ] Create text post
- [ ] Create post with photo
- [ ] Create carousel post
- [ ] Create reel/video
- [ ] Add hashtags
- [ ] Add location
- [ ] Privacy controls
- [ ] Real-time feed update

### 6.3 Feed

Test:
- [ ] Load feed items
- [ ] Infinite scroll
- [ ] Like/unlike posts
- [ ] Comment on posts
- [ ] Share posts
- [ ] Save posts

### 6.4 Profile

Test:
- [ ] View own profile
- [ ] Edit profile
- [ ] Upload avatar
- [ ] View other profiles
- [ ] Follow/unfollow users
- [ ] View user posts

### 6.5 Messages

Test:
- [ ] Send message
- [ ] Receive message
- [ ] Conversation list
- [ ] Real-time updates

---

## Phase 7: Monitoring

### 7.1 Logs

Monitor in Supabase Dashboard:
- Database logs
- API logs
- Auth logs
- Storage logs

### 7.2 Metrics

Check:
- Response times
- Error rates
- Database query performance
- Storage usage
- Auth success rates

### 7.3 Alerts

Set up alerts for:
- High error rates (>5%)
- Slow queries (>1s)
- Storage quota (>80%)
- Auth failures (>10%)

---

## Troubleshooting

### Issue: Auth not working

**Solution:**
1. Check Supabase keys in config.js
2. Verify redirect URLs in Auth settings
3. Check browser console for errors
4. Check Supabase logs

### Issue: Posts not saving

**Solution:**
1. Verify RLS policies allow insert
2. Check user is authenticated
3. Verify required fields present
4. Check database logs

### Issue: Images not uploading

**Solution:**
1. Verify storage bucket exists
2. Check storage policies allow upload
3. Verify file size < 200MB
4. Check CORS configuration

### Issue: Slow queries

**Solution:**
1. Check database indexes
2. Analyze slow query logs
3. Optimize RLS policies
4. Add caching if needed

---

## Performance Optimization

### 7.1 Database

```sql
-- Add indexes for common queries
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_followers_user ON followers(user_id);
CREATE INDEX idx_likes_post ON likes(post_id);
```

### 7.2 Caching

- Use browser localStorage for user data
- Cache profile images with CDN
- Cache frequently accessed posts
- Set HTTP cache headers

### 7.3 Lazy Loading

- Load posts in batches of 10
- Load images lazily
- Load comments on demand
- Defer non-critical scripts

---

## Backup & Recovery

### 7.1 Regular Backups

```bash
# Backup Supabase database
supabase db dump --file backup.sql

# Restore from backup
supabase db push < backup.sql
```

### 7.2 Data Export

```bash
# Export all posts
curl "https://your-project.supabase.co/rest/v1/posts" \
  -H "Authorization: Bearer $ANON_KEY" \
  > posts_export.json
```

---

## Maintenance

### Regular Tasks

- [ ] Monitor error logs daily
- [ ] Check storage usage weekly
- [ ] Review slow queries weekly
- [ ] Backup database daily
- [ ] Update dependencies monthly
- [ ] Security audit quarterly

### Update Process

1. Test changes in development
2. Create database migration
3. Deploy to staging
4. Run full test suite
5. Deploy to production
6. Monitor logs

---

## Next Steps

1. **Setup Supabase**: Complete Phase 1-2
2. **Deploy**: Complete Phase 3-4
3. **Test**: Complete Phase 5-6
4. **Monitor**: Complete Phase 7+

For detailed security setup, see [SECURITY.md](SECURITY.md)
For API reference, see [API.md](API.md)
