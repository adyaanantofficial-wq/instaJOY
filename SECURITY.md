# Security Notes

instaJOY is configured to follow the required production safety baseline:

- MongoDB Atlas credentials live in environment variables only
- JWT access is verified on protected routes
- Passwords are hashed with bcrypt
- CORS only allows configured frontend origins
- Login and content creation are rate-limited
- User text is bounded and normalized before storage
- Search input is regex-escaped
- Image uploads are compressed server-side with `sharp`
- Allowed upload types are explicitly whitelisted
- Likes and follows use unique database indexes to reduce abuse and duplicates
- Graceful shutdown closes the shared MongoDB client cleanly

For a deployment-ready checklist, see [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md).
