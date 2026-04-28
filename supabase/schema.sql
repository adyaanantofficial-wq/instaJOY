-- Supabase PostgreSQL schema for instaJOY
-- Main tables: users, posts, likes, comments, follows, notifications
-- Read-only guest access; authenticated users can modify only own data.

-- Users table linked to Supabase Auth
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  bio text,
  avatar_url text,
  fcm_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users public read" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users self manage" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id)
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
  FOR DELETE USING (auth.uid() = id);

-- Posts table
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT auth.random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('text', 'image', 'reel')),
  category text,
  caption text,
  content text,
  image_url text,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts (user_id);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts public read" ON public.posts
  FOR SELECT USING (true);

CREATE POLICY "Posts insert own" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Posts update own" ON public.posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Posts delete own" ON public.posts
  FOR DELETE USING (auth.uid() = user_id);

-- Likes table
CREATE TABLE IF NOT EXISTS public.likes (
  id uuid PRIMARY KEY DEFAULT auth.random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes (post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes (user_id);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes public read" ON public.likes
  FOR SELECT USING (true);

CREATE POLICY "Likes insert own" ON public.likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Likes delete own" ON public.likes
  FOR DELETE USING (auth.uid() = user_id);

-- Comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT auth.random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments (post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments (user_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments public read" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "Comments insert own" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Comments delete own" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);

-- Follows table
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT auth.random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows public read" ON public.follows
  FOR SELECT USING (true);

CREATE POLICY "Follows insert own" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Follows delete own" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT auth.random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id),
  type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications (user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications owner read" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Notifications insert service" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Notifications delete own" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Utility view for feed
CREATE VIEW IF NOT EXISTS public.post_feed AS
SELECT
  posts.id,
  posts.user_id,
  posts.type,
  posts.category,
  posts.caption,
  posts.content,
  posts.image_url,
  posts.media_url,
  posts.created_at,
  users.username,
  users.avatar_url
FROM public.posts
JOIN public.users ON posts.user_id = users.id;

GRANT SELECT ON public.post_feed TO anon;
