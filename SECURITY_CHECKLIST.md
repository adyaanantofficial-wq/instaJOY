# Security Checklist

- [x] Root `.gitignore` blocks `.env`
- [x] `backend/.env` is also ignored
- [x] Root `.env.example` exists
- [x] Backend `.env.example` exists
- [x] No frontend secrets
- [x] JWT auth middleware protects sensitive routes
- [x] Password hashing uses `bcryptjs`
- [x] MongoDB native driver only
- [x] CORS is restricted to configured origins
- [x] General API rate limiting is enabled
- [x] Auth-specific rate limiting is enabled
- [x] Content creation rate limiting is enabled
- [x] Image MIME and size validation is enforced
- [x] Reel MIME, size, and duration validation is enforced
- [x] Duplicate likes are blocked by a unique index
- [x] Duplicate follows are blocked by a unique index
