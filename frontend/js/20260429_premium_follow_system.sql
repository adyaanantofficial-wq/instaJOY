-- Premium Follow System & Algorithmic Feed Upgrade

-- 1. Account Privacy & Blocking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- 2. Follow Requests for Private Accounts
CREATE TABLE IF NOT EXISTS public.follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their blocks" ON public.blocks
  FOR ALL TO authenticated USING (auth.uid() = blocker_id);

CREATE POLICY "Users can see and manage their follow requests" ON public.follow_requests
  FOR ALL TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 3. Algorithmic Feed Generation (Followed > Engaged > Trending > Suggested)
CREATE OR REPLACE FUNCTION public.get_premium_feed(viewer_id UUID, limit_count INT, offset_count INT DEFAULT 0)
RETURNS TABLE (
  id UUID, user_id UUID, type TEXT, category TEXT, caption TEXT, content TEXT, 
  image_url TEXT, media_url TEXT, created_at TIMESTAMPTZ, username TEXT, avatar_url TEXT, score FLOAT
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT 
    p.id, p.user_id, p.type, p.category, p.caption, p.content, 
    p.image_url, p.media_url, p.created_at, 
    pr.username, pr.avatar_url,
    (
      -- Base score: 100 if followed, 10 if not (Suggested)
      CASE WHEN EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = viewer_id AND f.following_id = p.user_id) THEN 100.0 ELSE 10.0 END
      -- Engagement multipliers (Trending)
      + (SELECT COUNT(*) FROM public.likes l WHERE l.post_id = p.id) * 2.0
      + (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id) * 3.0
      -- Time decay (Gravity): older posts lose score
      - (EXTRACT(EPOCH FROM (now() - p.created_at))/3600.0) * 1.5
    ) as score
  FROM public.posts p
  JOIN public.profiles pr ON p.user_id = pr.id
  WHERE 
    -- Exclude blocked users
    NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = viewer_id AND b.blocked_id = p.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = p.user_id AND b.blocked_id = viewer_id)
    -- Respect private accounts (must follow to see, or be the owner)
    AND (
      pr.is_private = false 
      OR p.user_id = viewer_id 
      OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = viewer_id AND f.following_id = p.user_id)
    )
  ORDER BY score DESC, p.created_at DESC
  LIMIT limit_count OFFSET offset_count;
$$;

-- 4. Notification Trigger for Follow Requests
CREATE OR REPLACE FUNCTION private.notify_follow_request() RETURNS trigger AS $$
BEGIN
  PERFORM private.create_notification(NEW.receiver_id, NEW.sender_id, 'follow', 'profile', NEW.receiver_id, 'requested to follow you');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_request AFTER INSERT ON public.follow_requests FOR EACH ROW EXECUTE PROCEDURE private.notify_follow_request();