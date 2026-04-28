# Supabase Security Checklist

- Enable Row-Level Security (RLS) on all tables.
- Use `auth.uid()` in policies to restrict writes to the authenticated owner.
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret and only use it in server-side code or Edge Functions.
- Use Supabase Storage policies for uploaded media.
- Restrict `select`/`insert`/`update`/`delete` operations using explicit policies.
- Validate all inputs before inserting into Supabase.
- Sanitize filenames and uploaded media metadata.
- Enforce HTTPS for frontend and API calls.
- Use CORS allowlists in your backend if you still use `backend/server.js` for legacy APIs.
- Rotate service keys and Firebase server keys regularly.
