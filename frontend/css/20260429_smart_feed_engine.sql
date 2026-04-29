-- =================================================================================
-- instaJOY Smart Recommendation Engine & Social Graph Architecture
-- =================================================================================

-- 1. ENUMS & SIGNAL TABLES
CREATE TYPE interaction_type AS ENUM ('view', 'watch_full', 'skip', 'save', 'share', 'hide', 'report', 'not_interested');

CREATE TABLE IF NOT EXISTS public.user_post_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    interaction interaction_type NOT NULL,
    weight FLOAT NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_affinity (
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    affinity_score FLOAT NOT NULL DEFAULT 0.0,
    last_interacted_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (viewer_id, creator_id)
);

CREATE TABLE IF NOT EXISTS public.user_interest_profile (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    interest_score FLOAT NOT NULL DEFAULT 0.0,
    PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS public.post_score_cache (
    post_id UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
    engagement_score FLOAT DEFAULT 0.0,
    trending_score FLOAT DEFAULT 0.0,
    spam_penalty FLOAT DEFAULT 0.0,
    last_calculated TIMESTAMPTZ DEFAULT now()
);

-- Indexes for high-speed lookups
CREATE INDEX IF NOT EXISTS idx_interactions_user_post ON public.user_post_interactions(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_post_score_trending ON public.post_score_cache(trending_score DESC);

-- RLS Policies
ALTER TABLE public.user_post_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own interactions" ON public.user_post_interactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 2. SIGNAL PROCESSING (UPSERT TRIGGERS)
-- When a user interacts (likes/comments), we dynamically update their affinity to the creator and interest in the category.
CREATE OR REPLACE FUNCTION update_affinity_and_interest() RETURNS trigger AS $$
DECLARE
    target_creator_id UUID;
    post_cat TEXT;
BEGIN
    -- Get the post owner and category
    SELECT user_id, category INTO target_creator_id, post_cat FROM public.posts WHERE id = NEW.post_id;
    
    -- Update Creator Affinity (Cap at 100)
    IF target_creator_id IS NOT NULL AND target_creator_id != NEW.user_id THEN
        INSERT INTO public.creator_affinity (viewer_id, creator_id, affinity_score, last_interacted_at)
        VALUES (NEW.user_id, target_creator_id, 2.5, now())
        ON CONFLICT (viewer_id, creator_id) DO UPDATE 
        SET affinity_score = LEAST(creator_affinity.affinity_score + 2.5, 100.0), last_interacted_at = now();
    END IF;

    -- Update Interest Profile (Cap at 100)
    IF post_cat IS NOT NULL THEN
        INSERT INTO public.user_interest_profile (user_id, category, interest_score)
        VALUES (NEW.user_id, post_cat, 1.5)
        ON CONFLICT (user_id, category) DO UPDATE 
        SET interest_score = LEAST(user_interest_profile.interest_score + 1.5, 100.0);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_affinity AFTER INSERT ON public.likes FOR EACH ROW EXECUTE PROCEDURE update_affinity_and_interest();
CREATE TRIGGER on_comment_affinity AFTER INSERT ON public.comments FOR EACH ROW EXECUTE PROCEDURE update_affinity_and_interest();

-- 3. INTERACTION LOGGING RPC (Called from Frontend for Saves, Shares, Skips)
CREATE OR REPLACE FUNCTION public.log_interaction(p_post_id UUID, p_interaction TEXT, p_weight FLOAT DEFAULT 1.0)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.user_post_interactions (user_id, post_id, interaction, weight)
    VALUES (auth.uid(), p_post_id, p_interaction::interaction_type, p_weight);
    
    -- Apply negative signals (hide, skip, not_interested)
    IF p_interaction IN ('hide', 'not_interested', 'report') THEN
        -- Immediately drop affinity
        UPDATE public.creator_affinity SET affinity_score = GREATEST(affinity_score - 15.0, 0.0)
        WHERE viewer_id = auth.uid() AND creator_id = (SELECT user_id FROM public.posts WHERE id = p_post_id);
    END IF;
END;
$$;

-- 4. SMART FEED RANKING ALGORITHM
CREATE OR REPLACE FUNCTION public.get_smart_feed(
  viewer_id UUID, 
  limit_count INT, 
  offset_count INT DEFAULT 0,
  session_context TEXT DEFAULT 'general'
)
RETURNS TABLE (
  id UUID, user_id UUID, type TEXT, category TEXT, caption TEXT, content TEXT, 
  image_url TEXT, media_url TEXT, created_at TIMESTAMPTZ, profiles JSONB, smart_score FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- CANDIDATE POOLING: Select max 400 highly relevant posts to avoid scoring millions of rows
  candidate_posts AS (
      -- Pool A: Posts from followed users (Last 7 days)
      SELECT p.* FROM public.posts p
      INNER JOIN public.follows f ON f.following_id = p.user_id
      WHERE f.follower_id = viewer_id AND p.created_at > now() - INTERVAL '7 days'
      UNION
      -- Pool B: High-trending discovery posts (Last 3 days)
      SELECT p.* FROM public.posts p
      LEFT JOIN public.post_score_cache psc ON p.id = psc.post_id
      WHERE p.created_at > now() - INTERVAL '3 days'
      ORDER BY created_at DESC LIMIT 400
  ),
  scored_candidates AS (
      SELECT 
          cp.*,
          pr.username,
          pr.avatar_url,
          -- GET SIGNALS
          COALESCE(ca.affinity_score, 0.0) AS relationship_strength,
          COALESCE(uip.interest_score, 0.0) AS interest_match,
          COALESCE(psc.engagement_score, 0.0) AS global_engagement,
          COALESCE(psc.trending_score, 0.0) AS trending_velocity,
          COALESCE(psc.spam_penalty, 0.0) AS spam_penalty,
          (EXTRACT(EPOCH FROM (now() - cp.created_at)) / 3600.0) AS hours_old,
          EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = viewer_id AND f.following_id = cp.user_id) AS is_followed
      FROM candidate_posts cp
      JOIN public.profiles pr ON cp.user_id = pr.id
      LEFT JOIN public.creator_affinity ca ON ca.viewer_id = viewer_id AND ca.creator_id = cp.user_id
      LEFT JOIN public.user_interest_profile uip ON uip.user_id = viewer_id AND uip.category = cp.category
      LEFT JOIN public.post_score_cache psc ON psc.post_id = cp.id
      WHERE 
          -- Anti-spam & Negative Feedback exclusions
          cp.user_id != viewer_id 
          AND NOT EXISTS (SELECT 1 FROM public.user_post_interactions upi WHERE upi.user_id = viewer_id AND upi.post_id = cp.id AND upi.interaction IN ('hide', 'report', 'not_interested'))
          AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = viewer_id AND b.blocked_id = cp.user_id)
  )
  SELECT 
      sc.id, sc.user_id, sc.type, sc.category, sc.caption, sc.content, 
      sc.image_url, sc.media_url, sc.created_at, 
      jsonb_build_object('username', sc.username, 'avatar_url', sc.avatar_url) AS profiles,
      (
          -- INSTAGRAM FEED RANKING FORMULA
          -- 1. Follow Priority (35% weight)
          (CASE WHEN sc.is_followed THEN 35.0 ELSE 0.0 END) +
          
          -- 2. Engagement Weight (25% weight)
          (LEAST(sc.global_engagement, 100.0) * 0.25) +
          
          -- 3. Interest Match (20% weight)
          (LEAST(sc.interest_match, 100.0) * 0.20) +
          
          -- 4. Recency Decay (10% weight) - Exponential decay half-life of 24 hours
          (100.0 * exp(-sc.hours_old / 24.0) * 0.10) +
          
          -- 5. Trending / Velocity (5% weight)
          (LEAST(sc.trending_velocity, 100.0) * 0.05) +
          
          -- 6. Relationship Strength (5% weight)
          (LEAST(sc.relationship_strength, 100.0) * 0.05)
          
          -- Session Context Modifiers (Boost Reels at Night)
          + (CASE WHEN session_context = 'night' AND sc.type = 'reel' THEN 15.0 ELSE 0.0 END)
          
          -- Penalties
          - sc.spam_penalty
      ) AS smart_score
  FROM scored_candidates sc
  ORDER BY smart_score DESC, sc.created_at DESC
  LIMIT limit_count OFFSET offset_count;
END;
$$;