# instaJOY - Complete Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Backend Setup (Render)](#backend-setup-render)
3. [Database Setup (MongoDB Atlas)](#database-setup-mongodb-atlas)
4. [Frontend Setup (GitHub Pages)](#frontend-setup-github-pages)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)
8. [Performance Tips](#performance-tips)

---

## Prerequisites

Before starting, ensure you have:
- A GitHub account (free)
- A MongoDB Atlas account (free tier)
- A Render account (free tier)
- Node.js installed locally (for development testing)
- Git installed locally

---

## Backend Setup (Render)

### Step 1: Prepare Your Repository

1. Create a new GitHub repository named `instaJOY`
2. Clone it locally:
```bash
git clone https://github.com/YOUR_USERNAME/instaJOY.git
cd instaJOY
```

3. Copy your backend files into the `backend/` folder
4. Copy your frontend files into the `frontend/` folder

5. Commit and push:
```bash
git add .
git commit -m "Initial commit: instaJOY project"
git push origin main
```

### Step 2: Create Render Web Service

1. Go to [https://render.com](https://render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository (`instaJOY`)
4. Configure:
   - **Name**: `instajoy-backend`
   - **Region**: Choose closest to your users
   - **Runtime**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free

5. Add Environment Variables in Render Dashboard:
   - Click on your service
   - Go to **Environment**
   - Add all variables from `.env.example`:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/instajoy
PORT=5000
NODE_ENV=production
JWT_SECRET=your-super-secret-key-change-this-in-production-12345
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this-12345
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://YOUR_USERNAME.github.io/instaJOY
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

6. Click **"Create Web Service"**
7. Wait for deployment (2-5 minutes)
8. Note your backend URL: `https://instajoy-backend.onrender.com`

### Step 3: Monitor Backend

- Check logs in Render dashboard
- Test health endpoint: `https://instajoy-backend.onrender.com/api/health`
- Should return: `{"status":"OK",...}`

---

## Database Setup (MongoDB Atlas)

### Step 1: Create MongoDB Account

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Try Free"**
3. Sign up with email

### Step 2: Create Free Cluster

1. After signup, click **"Build a Database"**
2. Choose **M0 Free Tier**
3. Select region closest to you
4. Click **"Create Cluster"** (takes 1-2 minutes)

### Step 3: Setup Security

1. Go to **"Security Quickstart"**
2. Create database user:
   - **Username**: `instajoy_user`
   - **Password**: Generate strong password (save this!)
   - Click **"Create User"**

3. Add IP Whitelist:
   - Click **"My IP"** to add current IP
   - OR Add `0.0.0.0/0` for any IP (less secure but works for free tier)

### Step 4: Get Connection String

1. Click **"Connect"** button
2. Choose **"Drivers"**
3. Copy connection string (looks like):
```
mongodb+srv://instajoy_user:PASSWORD@cluster.mongodb.net/instajoy?retryWrites=true&w=majority
```

4. Replace:
   - `PASSWORD` with your database password
   - This is your `MONGODB_URI`

### Step 5: Create Database

1. In Atlas dashboard, click **"Collections"**
2. Click **"Create Database"**
   - **Name**: `instajoy`
   - **Collection**: (leave empty)
3. Click **"Create"**

---

## Frontend Setup (GitHub Pages)

### Step 1: Configure API URL

In `frontend/js/api.js`, update:

```javascript
const API_BASE_URL = 'https://instajoy-backend.onrender.com/api';
```

Replace with your actual Render backend URL.

### Step 2: Enable GitHub Pages

1. Go to your GitHub repository
2. Click **Settings** → **Pages**
3. Under "Source", select **Deploy from a branch**
4. Select branch: `main`
5. Select folder: `/frontend` (if using subdirectory)
6. Click **Save**

### Step 3: Access Your Frontend

Your site will be available at:
```
https://YOUR_USERNAME.github.io/instaJOY
```

Wait 2-3 minutes for deployment.

### Step 4: Test Frontend

1. Visit `https://YOUR_USERNAME.github.io/instaJOY`
2. Test login/signup
3. Create a post
4. Follow users

---

## Configuration

### Update Frontend URLs

Before deploying, ensure all frontend files point to correct backend:

**File: `frontend/js/api.js`**
```javascript
const API_BASE_URL = 'https://instajoy-backend.onrender.com/api';
```

**File: `frontend/index.html`**
- Verify form IDs and styling

### Render Backend Configuration

Environment variables already set in Render dashboard.

### MongoDB Atlas Configuration

- IP Whitelist: Allow `0.0.0.0/0` for free tier
- Database User: Created in security setup
- Network Access: Configured

---

## Testing

### Test Backend

```bash
# Test health endpoint
curl https://instajoy-backend.onrender.com/api/health

# Test registration
curl -X POST https://instajoy-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test Frontend

1. Navigate to `https://YOUR_USERNAME.github.io/instaJOY`
2. Register new account
3. Login
4. Upload post with image
5. Like/comment on posts
6. Follow users
7. Check profile

---

## Troubleshooting

### Backend Won't Start on Render

**Error**: `Cannot find module`

**Solution**:
1. Ensure `cd backend && npm install` is in Build Command
2. Check `package.json` exists in backend folder
3. Redeploy: Manual Deploy in Render Dashboard

### MongoDB Connection Error

**Error**: `MongoServerError` or `Cannot connect to MongoDB`

**Solution**:
1. Verify `MONGODB_URI` in Render env vars
2. Check IP Whitelist in MongoDB Atlas (add `0.0.0.0/0`)
3. Verify credentials (username/password) are correct
4. Test connection string locally:
```bash
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/instajoy"
```

### CORS Error in Browser

**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Solution**:
1. Check `FRONTEND_URL` in Render backend env vars
2. Should be: `https://YOUR_USERNAME.github.io/instaJOY`
3. Redeploy backend after updating

### Images Not Displaying

**Error**: `Image loading failed` or blank images

**Solution**:
1. Verify image is being compressed before upload in `feed.js`
2. Check image size limit (5MB)
3. Test with smaller images first

### Slow Performance

**Tips**:
1. Use lazy loading (already implemented)
2. Compress images before upload
3. Render free tier uses shared resources
4. Upgrade to paid tier if needed

---

## Performance Tips

### Mobile Optimization

✓ Lazy-loaded images reduce initial load
✓ Skeleton loaders provide better UX
✓ Responsive design works on all phones
✓ Infinite scroll reduces memory usage

### Backend Performance

✓ Indexed MongoDB queries
✓ Rate limiting prevents abuse
✓ JWT tokens for fast auth
✓ Pagination on feed (10 posts per page)

### Frontend Performance

✓ CSS animations use hardware acceleration
✓ JavaScript deferred from critical path
✓ No heavy frameworks (vanilla JS)
✓ Gzipped assets on GitHub Pages

### Monitoring

- **Backend Logs**: Check Render Dashboard
- **Error Tracking**: Use browser console (DevTools)
- **Performance**: Check Network tab in DevTools

---

## Security Checklist

Before production deployment:

- ✓ Change `JWT_SECRET` to long random string
- ✓ Change `JWT_REFRESH_SECRET` to different random string
- ✓ Use strong MongoDB password (20+ chars)
- ✓ Set `FRONTEND_URL` to actual GitHub Pages URL
- ✓ Enable HTTPS everywhere (automatic with Render/GitHub)
- ✓ Don't commit `.env` file (use `.env.example`)
- ✓ Rate limiting enabled for auth endpoints
- ✓ Input validation on all endpoints
- ✓ Password hashing with bcrypt
- ✓ CORS restricted to frontend domain

---

## Scaling Beyond Free Tier

### When to Upgrade

- Free tier: ~1,000 monthly users
- Users/posts grow beyond this
- Need faster response times

### Recommended Upgrades

**Backend**:
- Render Starter Plan: $7/month

**Database**:
- MongoDB Atlas M2: $9/month (better performance)
- Backup enabled

**Frontend**:
- Remains free on GitHub Pages

**CDN**:
- Cloudflare Free: Better image delivery

---

## Next Steps

1. Deploy backend to Render
2. Create MongoDB Atlas database
3. Deploy frontend to GitHub Pages
4. Test all features
5. Share with friends!
6. Monitor performance and logs
7. Gradually add more features

---

## Support

For issues:
1. Check error logs (Render Dashboard)
2. Check browser console (DevTools)
3. Verify all env variables are set correctly
4. Test API endpoints with curl
5. Check GitHub Pages deployment status

Good luck! 🚀
