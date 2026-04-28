# Final Delivery

## Security checklist

- `.env` is ignored by git at the repo root and in `backend/`
- Secrets are server-side only
- JWT-protected routes use bearer verification middleware
- Login and content creation are rate-limited
- CORS is restricted to configured GitHub Pages and local dev origins
- Input is trimmed and bounded before storage
- Search regex input is escaped
- Passwords are hashed with `bcryptjs`
- Image MIME types are restricted to JPEG, PNG, and WebP
- Reel MIME types are restricted to MP4, WebM, and OGG
- Image uploads are compressed and revalidated server-side
- Reel uploads are size-checked server-side and duration-checked client-side and server-side
- Duplicate follow/like abuse is blocked with unique indexes
- MongoDB runs through a shared native driver client with clean shutdown

## Performance checklist

- Single-page frontend: no navigation reloads between required app sections
- Mobile-first CSS with lightweight gradients and restrained motion
- No frameworks or heavy UI libraries
- Base64 image uploads are compressed client-side before sending
- Images and profile tiles use lazy loading where appropriate
- Reels pause automatically off-screen via `IntersectionObserver`
- Infinite scrolling uses cursor pagination
- DOM updates are batched through whole-section renders instead of repeated layout thrash
- The frontend uses one CSS file and one JS runtime file for fast static hosting

## Deployment checklist

- Root `package.json` present
- Root `server.js` present
- `start` script: `node server.js`
- No `instaJOY` script in `package.json`
- `.nvmrc` present
- `.env.example` present
- Render build command set to `yarn`
- Render start command set to `yarn start`
- MongoDB URI pulled from env vars only
- Frontend API base updated in `frontend/js/config.js`

## Final folder structure

```text
instaJOY/
├── .env.example
├── .gitignore
├── .nvmrc
├── API.md
├── API_REFERENCE.md
├── DELIVERABLES.md
├── DEPLOYMENT.md
├── QUICKSTART.md
├── README.md
├── SECURITY.md
├── SECURITY_CHECKLIST.md
├── backend/
│   ├── .env.example
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── server.js
│   └── utils/
├── frontend/
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   ├── app.js
│   │   └── config.js
│   ├── feed.html
│   ├── index.html
│   └── profile.html
├── ilogo.png
├── index.html
├── package.json
├── render.yaml
├── server.js
└── start-server.bat
```
