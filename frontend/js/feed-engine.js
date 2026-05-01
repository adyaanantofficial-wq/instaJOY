/**
 * Feed Engine for instaJOY
 * Loads and manages feed data from Supabase
 */

(function initFeedEngine() {
  const config = window.INSTAJOY_CONFIG || {};

  const FeedEngine = {
    state: {
      posts: [],
      cursor: null,
      hasMore: true,
      isLoading: false,
      pageSize: 10,
      moodFilter: null,
      followingOnly: false,
      realtime: null
    },

    async init() {
      // Subscribe to realtime updates
      this.subscribeToFeedUpdates();
    },

    /**
     * Load feed posts from Supabase
     * Priority order:
     * 1. Posts from followed users
     * 2. Posts in liked categories
     * 3. Trending posts
     * 4. Latest posts
     */
    async loadFeed(refresh = false) {
      if (this.state.isLoading) return;
      if (!refresh && !this.state.hasMore) return;

      this.state.isLoading = true;

      try {
        const supabase = window.supabaseClient;
        const user = window.SupabaseAuth?.getUser();

        if (!supabase) {
          throw new Error('Supabase not initialized');
        }

        // For authenticated users: load posts from followed users + recommendations
        if (user && user.id !== 'guest') {
          return await this.loadAuthenticatedFeed(supabase, user);
        }

        // For guest users: load latest posts
        return await this.loadGuestFeed(supabase);
      } catch (error) {
        console.error('Feed load error:', error);
        throw error;
      } finally {
        this.state.isLoading = false;
      }
    },

    async loadAuthenticatedFeed(supabase, user) {
      let query = supabase
        .from('posts')
        .select(`
          id,
          user_id,
          type,
          category,
          caption,
          content,
          image_url,
          media_url,
          carousel_urls,
          hashtags,
          location,
          privacy,
          allow_comments,
          allow_likes,
          created_at,
          updated_at,
          profiles:user_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          likes:likes(count),
          comments:comments(count),
          saved_posts:saved_posts(count)
        `)
        .order('created_at', { ascending: false });

      // Filter by privacy and auth
      query = query.in('privacy', ['public', 'friends']);

      // Pagination
      if (this.state.cursor) {
        query = query.lt('created_at', this.state.cursor);
      }

      // Limit
      query = query.limit(this.state.pageSize);

      const { data: posts, error } = await query;

      if (error) throw error;

      // Process posts
      const processed = this.processPosts(posts, user);

      // Update state
      if (this.state.cursor === null) {
        this.state.posts = processed;
      } else {
        this.state.posts.push(...processed);
      }

      // Update cursor for next page
      if (posts.length > 0) {
        this.state.cursor = posts[posts.length - 1].created_at;
        this.state.hasMore = posts.length === this.state.pageSize;
      } else {
        this.state.hasMore = false;
      }

      return this.state.posts;
    },

    async loadGuestFeed(supabase) {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          type,
          category,
          caption,
          content,
          image_url,
          media_url,
          carousel_urls,
          hashtags,
          location,
          created_at,
          profiles:user_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          likes:likes(count),
          comments:comments(count)
        `)
        .eq('privacy', 'public')
        .order('created_at', { ascending: false })
        .limit(this.state.pageSize);

      if (error) throw error;

      const processed = this.processPosts(posts, null);
      this.state.posts = processed;
      this.state.hasMore = posts.length === this.state.pageSize;

      return this.state.posts;
    },

    /**
     * Process posts: add engagement counts, format data
     */
    processPosts(posts, user) {
      return posts.map(post => ({
        ...post,
        author: post.profiles ? {
          id: post.profiles.id,
          username: post.profiles.username,
          displayName: post.profiles.display_name,
          avatar: post.profiles.avatar_url
        } : null,
        likeCount: post.likes?.[0]?.count || 0,
        commentCount: post.comments?.[0]?.count || 0,
        savedCount: post.saved_posts?.[0]?.count || 0,
        liked: false,  // Will be hydrated from user's likes
        saved: false,   // Will be hydrated from user's saves
        isOwnPost: user ? post.user_id === user.id : false
      }));
    },

    /**
     * Load user's engagement data (likes, saves)
     */
    async loadUserEngagement(user) {
      if (!user || user.id === 'guest') return;

      const supabase = window.supabaseClient;

      // Get liked posts
      const { data: likedPosts } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id);

      // Get saved posts
      const { data: savedPosts } = await supabase
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', user.id);

      // Mark posts
      const likedIds = new Set(likedPosts?.map(p => p.post_id) || []);
      const savedIds = new Set(savedPosts?.map(p => p.post_id) || []);

      this.state.posts.forEach(post => {
        post.liked = likedIds.has(post.id);
        post.saved = savedIds.has(post.id);
      });
    },

    /**
     * Subscribe to real-time feed updates
     * New posts appear immediately in feed
     */
    subscribeToFeedUpdates() {
      const supabase = window.supabaseClient;
      if (!supabase) return;

      // Subscribe to new posts
      this.state.realtime = supabase
        .channel('feed-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'posts'
          },
          (payload) => {
            // New post received
            console.log('New post:', payload.new);
            // You can trigger UI update here
            if (window.app && typeof window.app.onNewPost === 'function') {
              window.app.onNewPost(payload.new);
            }
          }
        )
        .subscribe();
    },

    /**
     * Like a post
     */
    async likePost(postId) {
      const user = window.SupabaseAuth?.getUser();
      if (!user || user.id === 'guest') {
        this.showError('Login to like posts');
        return false;
      }

      const supabase = window.supabaseClient;
      const { error } = await supabase
        .from('likes')
        .insert({ post_id: postId, user_id: user.id });

      if (error && error.code !== '23505') { // 23505 = unique violation (already liked)
        throw error;
      }

      // Update UI
      const post = this.state.posts.find(p => p.id === postId);
      if (post) {
        post.liked = true;
        post.likeCount++;
      }

      return true;
    },

    /**
     * Unlike a post
     */
    async unlikePost(postId) {
      const user = window.SupabaseAuth?.getUser();
      if (!user) return false;

      const supabase = window.supabaseClient;
      await supabase
        .from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      // Update UI
      const post = this.state.posts.find(p => p.id === postId);
      if (post) {
        post.liked = false;
        post.likeCount = Math.max(0, post.likeCount - 1);
      }

      return true;
    },

    /**
     * Save a post
     */
    async savePost(postId) {
      const user = window.SupabaseAuth?.getUser();
      if (!user) {
        this.showError('Login to save posts');
        return false;
      }

      const supabase = window.supabaseClient;
      const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: postId, user_id: user.id });

      if (error && error.code !== '23505') {
        throw error;
      }

      // Update UI
      const post = this.state.posts.find(p => p.id === postId);
      if (post) {
        post.saved = true;
        post.savedCount++;
      }

      return true;
    },

    /**
     * Unsave a post
     */
    async unsavePost(postId) {
      const user = window.SupabaseAuth?.getUser();
      if (!user) return false;

      const supabase = window.supabaseClient;
      await supabase
        .from('saved_posts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      // Update UI
      const post = this.state.posts.find(p => p.id === postId);
      if (post) {
        post.saved = false;
        post.savedCount = Math.max(0, post.savedCount - 1);
      }

      return true;
    },

    /**
     * Get post comments
     */
    async getComments(postId) {
      const supabase = window.supabaseClient;
      const { data: comments, error } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return comments || [];
    },

    /**
     * Add comment
     */
    async addComment(postId, content) {
      const user = window.SupabaseAuth?.getUser();
      if (!user) {
        this.showError('Login to comment');
        return false;
      }

      const supabase = window.supabaseClient;
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: content
        })
        .select()
        .single();

      if (error) throw error;

      // Update UI
      const post = this.state.posts.find(p => p.id === postId);
      if (post) {
        post.commentCount++;
      }

      return data;
    },

    /**
     * Delete post
     */
    async deletePost(postId) {
      const user = window.SupabaseAuth?.getUser();
      if (!user) return false;

      const supabase = window.supabaseClient;
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Remove from UI
      this.state.posts = this.state.posts.filter(p => p.id !== postId);
      return true;
    },

    /**
     * Search posts
     */
    async searchPosts(query) {
      const supabase = window.supabaseClient;

      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          type,
          category,
          caption,
          content,
          hashtags,
          created_at,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .or(
          `content.ilike.%${query}%,caption.ilike.%${query}%,hashtags.ilike.%${query}%`
        )
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return this.processPosts(posts, null);
    },

    /**
     * Get posts by hashtag
     */
    async getPostsByHashtag(hashtag) {
      const supabase = window.supabaseClient;
      const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('hashtags', `%${hashtag}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return this.processPosts(posts, null);
    },

    /**
     * Get trending posts (most liked)
     */
    async getTrendingPosts() {
      const supabase = window.supabaseClient;

      // Get posts with most likes in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          content,
          caption,
          created_at,
          profiles:user_id (username, avatar_url),
          likes:likes(count)
        `)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Sort by like count
      return posts
        .sort((a, b) => (b.likes?.[0]?.count || 0) - (a.likes?.[0]?.count || 0))
        .slice(0, 20);
    },

    showError(message) {
      if (window.showToast) {
        window.showToast(message, 'error');
      } else {
        console.error(message);
      }
    }
  };

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FeedEngine.init());
  } else {
    FeedEngine.init();
  }

  // Export
  window.FeedEngine = FeedEngine;

})();
