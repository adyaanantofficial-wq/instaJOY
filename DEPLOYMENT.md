# Deployment

## Why Render failed before

The old repo only had a runnable Node app inside `backend/`, but Render was deploying from the repository root. Without a root `package.json` + root `server.js` contract, Render fell back to the service/app name and tried to execute:

```text
instaJOY
```

That caused:

```text
bash: instaJOY: command not found
Exit status: 127
```

## Why the fix works

The repo now has:

- Root `package.json`
- Root `server.js`
- Real `start` script: `node server.js`
- No script named `instaJOY`
- Stable Node pinning via `.nvmrc`

Render can now install dependencies from the repo root and start the service with a normal Node command.

## Render Web Service settings

Use a **New Web Service** on Render.

You can also deploy from the included `render.yaml` blueprint if you prefer infrastructure-as-code.

- Root Directory: leave blank
- Runtime: `Node`
- Build Command: `yarn`
- Start Command: `yarn start`
- Instance Type: `Free`

### Required environment variables

- `PORT=3000`
- `MONGODB_URI=...`
- `MONGODB_DB=instajoy`
- `JWT_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `JWT_EXPIRES_IN=2h`
- `JWT_REFRESH_EXPIRES_IN=7d`
- `FRONTEND_URL=https://your-github-username.github.io/instaJOY`
- `FRONTEND_URLS=https://your-github-username.github.io/instaJOY`
- `RATE_LIMIT_WINDOW_MS=900000`
- `RATE_LIMIT_MAX_REQUESTS=150`

### Node version

The repo includes:

- `.nvmrc` set to `22.22.0`
- `package.json` engines: `>=22.22.0 <25`

That gives Render a deterministic LTS target while remaining compatible with modern local Node installs.

## GitHub Pages deployment

Deploy the repository root to GitHub Pages.

1. Push the repo to GitHub
2. Open `Settings` > `Pages`
3. Under `Build and deployment`, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
4. Save
5. Wait for Pages to publish
6. Update `frontend/js/config.js` with your real Render backend URL:

```js
window.INSTAJOY_CONFIG = Object.freeze({
  API_BASE_URL: 'https://your-render-service.onrender.com/api',
  DEFAULT_AVATAR: 'ilogo.png',
  TOKEN_KEY: 'instajoy_access_token',
  REFRESH_TOKEN_KEY: 'instajoy_refresh_token',
  USER_KEY: 'instajoy_user',
});
```

7. Commit that change and push again

## Local verification flow

```bash
yarn install
yarn start
```

API health check:

```bash
curl http://127.0.0.1:3000/api/health
```
