# instaJOY

instaJOY is a production-ready, mobile-first social web app built with:

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: MongoDB Atlas via the native MongoDB driver
- Frontend hosting: GitHub Pages
- Backend hosting: Render Web Service

The app is behavior-inspired by mainstream social platforms, but uses original branding, styling, and lightweight UX for low-end Android devices.

## What works

- Signup, login, logout, refresh-based persistent auth
- JWT-protected API routes
- Text posts with category enforcement
- Image posts with client-side and server-side compression
- Reels with size and duration validation plus auto play/pause
- Like, unlike, comment, share link
- Search users by username
- Search text posts by keyword
- 1-to-1 text messaging with chat history
- Notifications for likes, follows, and new messages
- Editable profile with avatar, bio, follower/following counts, and posts grid
- Render-compatible root start contract

## Final structure

```text
instaJOY/
├── .env.example
├── .gitignore
├── .nvmrc
├── index.html
├── ilogo.png
├── package.json
├── render.yaml
├── server.js
├── start-server.bat
├── backend/
│   ├── .env.example
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── server.js
│   └── utils/
└── frontend/
    ├── css/
    │   └── app.css
    ├── js/
    │   ├── app.js
    │   └── config.js
    ├── feed.html
    ├── index.html
    └── profile.html
```

## Local run

1. Copy `.env.example` to `.env`, or copy `backend/.env.example` to `backend/.env`
2. Fill in `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`
3. Install dependencies:

```bash
yarn install
```

4. Start the API:

```bash
yarn start
```

5. Open the frontend:

- Use GitHub Pages after deployment, or
- Serve the repo root locally with any static server

The frontend uses `frontend/js/config.js` to decide the API base URL:

- Local: `http://127.0.0.1:3000/api`
- Production: update `https://your-render-service.onrender.com/api` to your actual Render API URL

## Important deployment note

Render now reads the root `package.json` and starts the app with:

```bash
yarn start
```

That fixes the old failure where Render tried to execute the app name instead of a real start script.

## Docs

- API routes: [API_REFERENCE.md](API_REFERENCE.md)
- Deployment: [DEPLOYMENT.md](DEPLOYMENT.md)
- Final audit and checklists: [DELIVERABLES.md](DELIVERABLES.md)
- Security details: [SECURITY.md](SECURITY.md)
