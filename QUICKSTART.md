# Quick Start: Deploy instaJOY with Supabase

## 5-Minute Setup

### Step 1: Get Your Supabase Keys
1. Go to supabase.com and create a project
2. Get your **Project URL** and **Anon Key**
3. Create two storage buckets: `media` and `avatars`

### Step 2: Update Configuration
Edit `frontend/js/config.js`:

```javascript
window.INSTAJOY_CONFIG = Object.freeze({
    API_BASE_URL: '/api',
    SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',  // ← REPLACE
    SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',                // ← REPLACE
    // ... rest stays the same
});
```

### Step 3: Apply Database Schema
1. In Supabase Dashboard → SQL Editor
2. Create new query
3. Paste contents of `supabase/schema.sql`
4. Click "Run"

### Step 4: Serve Files
**Option A: Python (Easy)**
```bash
python -m http.server 8000
# Visit http://localhost:8000
```

**Option B: Node.js**
```bash
npx http-server
# Visit http://localhost:8080
```

**Option C: Docker**
```bash
docker run -p 8000:80 -v $(pwd):/usr/share/nginx/html nginx
# Visit http://localhost:8000
```

### Step 5: Test Auth
1. Open http://localhost:8000
2. Click "Login" 
3. Create new account with email
4. Confirm in Supabase → Auth → Users
5. Click "Continue as Guest" to test guest mode

### Step 6: Test Post Creation
1. After logging in, click "+Post" button
2. Write text and click "Post"
3. Post appears in feed (or will appear after feed implementation)

Done! 🎉

---

## Feature Status

### ✅ Working
- Authentication (email/password + guest mode)
- Post creation (text, photo, carousel, video)
- Navigation layout
- Header/notifications positioning
- Database schema
- Storage upload infrastructure

### ⚠️ Partial
- Feed loading (engine created, needs app.js integration)
- Engagement (buttons exist, need database integration)

### ⏳ Coming Soon
- Real-time feed updates
- Comments system
- Story system
- Message system
- Search system
- Profile system

---

## Configuration Checklist

- [ ] Get Supabase URL
- [ ] Get Supabase Anon Key
- [ ] Update config.js
- [ ] Create storage buckets
- [ ] Apply schema.sql
- [ ] Test sign up
- [ ] Test post creation
- [ ] Test guest mode

See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) for complete deployment guide.
