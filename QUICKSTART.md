# Quick Start Guide - instaJOY

Get instaJOY up and running in 30 minutes.

## Prerequisites (5 minutes)

Install these first:
- [Node.js](https://nodejs.org/) (v14+)
- [Git](https://git-scm.com/)
- A GitHub account
- A MongoDB Atlas account (free)
- A Render account (free)

## Local Development (10 minutes)

### 1. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/instaJOY.git
cd instaJOY
```

### 2. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Open .env and add MongoDB connection string
# Edit: MONGODB_URI=mongodb+srv://...
```

### 3. Start Backend

```bash
npm start
```

You should see:
```
╔════════════════════════════════╗
║     instaJOY Backend Server    ║
╚════════════════════════════════╝

Port: 5000
Database: Connected ✓
Ready for requests! 🚀
```

### 4. Test Backend

In another terminal:

```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{"status":"OK","message":"instaJOY Backend is running"}
```

### 5. Start Frontend

In another terminal:

```bash
cd instaJOY/frontend

# Option A: Python web server
python -m http.server 8000

# Option B: Or just open index.html in browser
# Right-click index.html → Open with Browser
```

Visit: `http://localhost:8000`

### 6. Test Full Flow

1. **Register**: Create account
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `password123`

2. **Create Post**: 
   - Click "📸 Photo"
   - Select any image
   - Add caption
   - Click "Post"

3. **Test Like**:
   - Click heart on any post
   - Should turn red

4. **Test Comment**:
   - Click 💬 icon
   - Type comment
   - Click "Post"

5. **Visit Profile**:
   - Click your profile in bottom nav
   - Should show your posts

## Production Deployment (15 minutes)

### 1. Push to GitHub

```bash
cd instaJOY

git add .
git commit -m "Initial instaJOY commit"
git push origin main
```

### 2. MongoDB Atlas Setup

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create free account → Create cluster
3. Create database user (remember password!)
4. Get connection string
5. Copy to `.env` file

### 3. Deploy Backend on Render

1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect GitHub repo
4. Configure:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
5. Add environment variables from `.env.example`
6. Deploy

Copy backend URL (e.g., `https://instajoy-backend.onrender.com`)

### 4. Update Frontend

Edit `frontend/js/api.js`:

```javascript
const API_BASE_URL = 'https://instajoy-backend.onrender.com/api';
```

Push to GitHub:

```bash
git add frontend/js/api.js
git commit -m "Update API URL"
git push origin main
```

### 5. Enable GitHub Pages

1. Go to GitHub repo Settings
2. Click "Pages"
3. Select "Deploy from a branch"
4. Select `main` branch
5. Select `/frontend` folder
6. Save

Wait 2-3 minutes, then visit:
```
https://YOUR_USERNAME.github.io/instaJOY
```

## Troubleshooting

### Backend won't start

```bash
# Check Node version
node --version  # Should be v14+

# Clear node_modules and reinstall
rm -rf backend/node_modules
cd backend && npm install

# Try again
npm start
```

### Can't connect to MongoDB

1. Check connection string in `.env`
2. Verify IP whitelist in MongoDB Atlas
3. Test locally:
   ```bash
   mongosh "your_connection_string"
   ```

### CORS error in browser

1. Update API URL in `frontend/js/api.js`
2. Must match your deployed backend URL
3. Restart frontend

### Images not uploading

1. Check browser console for errors
2. Verify image size < 5MB
3. Try simpler image first

## What's Next?

### Customize
- Change theme colors in `frontend/css/style.css`
- Update logo in `frontend/feed.html`
- Modify welcome message in `frontend/index.html`

### Extend Features
- Add hashtag search
- Implement notifications
- Create trending section
- Add messaging

### Monitor
- Check Render logs for errors
- Review MongoDB usage
- Monitor GitHub Pages deployment

## Key Files to Know

| File | Purpose |
|------|---------|
| `backend/server.js` | Main backend entry |
| `backend/models/User.js` | User database schema |
| `backend/models/Post.js` | Post database schema |
| `backend/controllers/*.js` | Business logic |
| `frontend/index.html` | Login page |
| `frontend/feed.html` | Main feed |
| `frontend/profile.html` | User profile |
| `frontend/js/api.js` | Backend communication |

## Documentation

- [README.md](README.md) - Project overview
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment guide
- [SECURITY.md](SECURITY.md) - Security architecture
- [API.md](API.md) - Complete API reference

## Tips for Success

✅ **Do**:
- Test locally first before deploying
- Use `.env` file for secrets (never commit)
- Check browser console for errors
- Monitor backend logs
- Start simple, add features gradually

❌ **Don't**:
- Commit `.env` file to GitHub
- Use hardcoded API URLs
- Trust user input without validation
- Forget to enable HTTPS
- Ignore error messages

## Need Help?

1. **Check logs**: Render dashboard or browser console
2. **Read docs**: Review DEPLOYMENT.md and API.md
3. **Test API**: Use curl to test endpoints
4. **Search**: Google the error message
5. **Ask**: Create GitHub issue with details

## Performance Tips

```javascript
// Images auto-compress before upload
// Feed loads 10 posts at a time
// Skeleton loaders prevent layout shift
// Lazy loading for images
// No heavy frameworks = fast loading
```

## Security Reminders

Before sharing:
- ✅ Change JWT_SECRET to random string
- ✅ Change JWT_REFRESH_SECRET
- ✅ Use strong MongoDB password
- ✅ Set FRONTEND_URL in backend env
- ✅ Don't share `.env` file
- ✅ Enable rate limiting (automatic)

## Deployment Checklist

- [ ] Backend pushed to GitHub
- [ ] MongoDB Atlas cluster created
- [ ] Render account setup
- [ ] Environment variables set in Render
- [ ] Backend deployed and working
- [ ] Frontend API URL updated
- [ ] Frontend pushed to GitHub
- [ ] GitHub Pages enabled
- [ ] Can register and login
- [ ] Can create post
- [ ] Can like/comment
- [ ] Can follow users

## That's It! 🎉

You now have a fully functional instaJOY instance:

```
✅ User authentication
✅ Post creation with images
✅ Like/comment system
✅ Follow functionality
✅ User profiles
✅ Responsive mobile design
✅ Secure API
✅ Free hosting
```

**Time to celebrate and share with friends!** 🚀

---

**Questions?** Check [DEPLOYMENT.md](DEPLOYMENT.md) or [API.md](API.md)

**Stuck?** Create an issue on GitHub with:
- Error message
- What you were doing
- Screenshots if applicable

Good luck! 💪
