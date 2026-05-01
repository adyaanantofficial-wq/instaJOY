/**
 * Supabase Authentication Module for instaJOY
 * Handles login, signup, logout, session persistence, and profile bootstrap.
 */

(function initSupabaseAuth() {
  const config = window.INSTAJOY_CONFIG || {};

  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('Supabase config missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
    return;
  }

  const { createClient } = window.supabase;
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  const AuthState = {
    currentSession: null,
    currentUser: null,
    isLoading: true,

    async init() {
      this.isLoading = true;

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Session restore error:', error);
          return { session: null, user: null };
        }

        if (!session?.user) {
          this.currentSession = null;
          this.currentUser = null;
          return { session: null, user: null };
        }

        this.currentSession = session;
        this.currentUser = session.user;
        await this.ensureProfile(session.user);
        return { session, user: session.user };
      } catch (error) {
        console.error('Auth init error:', error);
        return { session: null, user: null };
      } finally {
        this.isLoading = false;
      }
    },

    async signup(email, password, username = '') {
      try {
        const safeUsername = String(username || email.split('@')[0] || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._]/g, '')
          .slice(0, 30);
        const displayName = safeUsername || 'member';

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              username: displayName,
            },
          },
        });

        if (error) throw error;

        this.currentSession = data.session || null;
        this.currentUser = data.user || null;

        if (data.user) {
          await this.ensureProfile(data.user);
        }

        return { success: true, user: data.user };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    async signin(email, password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        this.currentSession = data.session || null;
        this.currentUser = data.user || null;

        if (data.user) {
          await this.ensureProfile(data.user);
        }

        return { success: true, user: data.user };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    async ensureProfile(user) {
      if (!user?.id) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data?.id) {
          return;
        }

        const usernameBase = String(
          user.user_metadata?.username
          || user.email?.split('@')[0]
          || `user_${String(user.id).slice(0, 8)}`
        )
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._]/g, '')
          .slice(0, 30) || `user_${String(user.id).replace(/-/g, '').slice(0, 8)}`;
        const displayName = user.user_metadata?.display_name || usernameBase;

        const { error: insertError } = await supabase.from('profiles').insert({
          id: user.id,
          username: usernameBase,
          display_name: displayName.slice(0, 50),
          bio: '',
          avatar_url: user.user_metadata?.avatar_url || null,
        });

        if (insertError && insertError.code !== '23505') {
          throw insertError;
        }
      } catch (error) {
        console.warn('Profile ensure error:', error);
      }
    },

    async logout() {
      try {
        await supabase.auth.signOut();
        this.currentSession = null;
        this.currentUser = null;
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    getSession() {
      return this.currentSession;
    },

    getUser() {
      return this.currentUser;
    },

    isAuthenticated() {
      return Boolean(this.currentUser && this.currentSession);
    },

    isGuestMode() {
      return false;
    },

    onAuthStateChange(callback) {
      const subscription = supabase.auth.onAuthStateChange((event, session) => {
        this.currentSession = session || null;
        this.currentUser = session?.user || null;
        callback(event, session);
      });

      return subscription;
    },
  };

  window.SupabaseAuth = AuthState;
  window.supabaseClient = supabase;
})();
