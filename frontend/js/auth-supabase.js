/**
 * Supabase Authentication Module for instaJOY
 * Handles auth flow: login, signup, guest mode, logout, session persistence
 */

(function initSupabaseAuth() {
  const config = window.INSTAJOY_CONFIG || {};
  
  // Validate Supabase config
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('Supabase config missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
    return;
  }

  // Import Supabase auth JS
  const { createClient } = window.supabase;
  
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    }
  });

  // Auth state management
  const AuthState = {
    // Local session tracking
    SESSION_STORAGE_KEY: 'INSTAJOY_SESSION',
    GUEST_MODE_KEY: 'INSTAJOY_GUEST_MODE',
    GUEST_SESSION_KEY: 'INSTAJOY_GUEST_SESSION_ID',

    // Current session
    currentSession: null,
    currentUser: null,
    isGuest: false,
    isLoading: true,

    // Initialize from stored session
    async init() {
      this.isLoading = true;
      
      try {
        // Check for stored session
        const storedSession = sessionStorage.getItem(this.SESSION_STORAGE_KEY);
        const isGuestMode = sessionStorage.getItem(this.GUEST_MODE_KEY) === 'true';

        if (isGuestMode) {
          // Restore guest session
          this.isGuest = true;
          const guestId = sessionStorage.getItem(this.GUEST_SESSION_KEY) || this.generateGuestId();
          this.currentSession = { user: { id: guestId, app_metadata: { provider: 'guest' } } };
          sessionStorage.setItem(this.GUEST_SESSION_KEY, guestId);
          return { session: this.currentSession, user: this.currentSession.user };
        }

        // Try to restore Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.warn('Session restore error:', error);
          return { session: null, user: null };
        }

        if (session) {
          this.currentSession = session;
          this.currentUser = session.user;
          this.isGuest = false;
          // Verify user profile exists
          await this.ensureProfile(session.user);
          return { session, user: session.user };
        }

        return { session: null, user: null };
      } catch (error) {
        console.error('Auth init error:', error);
        return { session: null, user: null };
      } finally {
        this.isLoading = false;
      }
    },

    // Sign up with email/password
    async signup(email, password, username = '') {
      try {
        const safeUsername = username || email.split('@')[0];
        const displayName = safeUsername;

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              username: safeUsername,
            }
          }
        });

        if (error) throw error;
        
        this.currentSession = { user: data.user };
        this.currentUser = data.user;
        this.isGuest = false;

        // Create profile for new user
        if (data.user) {
          await this.ensureProfile(data.user);
        }

        return { success: true, user: data.user };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Sign in with email/password
    async signin(email, password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        
        this.currentSession = data.session;
        this.currentUser = data.user;
        this.isGuest = false;

        // Verify profile exists
        if (data.user) {
          await this.ensureProfile(data.user);
        }

        return { success: true, user: data.user };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Guest mode session
    async startGuestSession() {
      try {
        // Generate unique guest session ID
        const guestId = this.generateGuestId();
        
        this.isGuest = true;
        this.currentSession = {
          user: {
            id: guestId,
            email: `guest_${guestId}@instajoy.local`,
            app_metadata: { provider: 'guest' }
          }
        };
        this.currentUser = this.currentSession.user;

        // Store in sessionStorage (not localStorage) for session-only persistence
        sessionStorage.setItem(this.GUEST_MODE_KEY, 'true');
        sessionStorage.setItem(this.GUEST_SESSION_KEY, guestId);

        return { success: true, user: this.currentUser };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Generate unique guest ID
    generateGuestId() {
      return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // Ensure user profile exists in database
    async ensureProfile(user) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();

        if (error && error.code === 'PGRST116') {
          // Profile doesn't exist, create it
          const username = user.email?.split('@')[0] || `user_${user.id.substr(0, 8)}`;
          const displayName = user.user_metadata?.display_name || username;

          await supabase.from('profiles').insert({
            id: user.id,
            username: username,
            display_name: displayName,
            bio: '',
            avatar_url: user.user_metadata?.avatar_url || null
          });
        }
      } catch (error) {
        console.warn('Profile ensure error:', error);
      }
    },

    // Logout
    async logout() {
      try {
        // Clear guest mode
        if (this.isGuest) {
          sessionStorage.removeItem(this.GUEST_MODE_KEY);
          sessionStorage.removeItem(this.GUEST_SESSION_KEY);
        } else {
          // Sign out from Supabase
          await supabase.auth.signOut();
        }

        this.currentSession = null;
        this.currentUser = null;
        this.isGuest = false;

        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Get current session
    getSession() {
      return this.currentSession;
    },

    // Get current user
    getUser() {
      return this.currentUser;
    },

    // Check if authenticated
    isAuthenticated() {
      return !!(this.currentUser && (this.isGuest || this.currentSession));
    },

    // Check if guest mode
    isGuestMode() {
      return this.isGuest;
    },

    // Subscribe to auth changes
    onAuthStateChange(callback) {
      const unsubscribe = supabase.auth.onAuthStateChange((event, session) => {
        this.currentSession = session;
        this.currentUser = session?.user || null;
        
        if (event === 'SIGNED_OUT') {
          this.isGuest = false;
          sessionStorage.removeItem(this.GUEST_MODE_KEY);
          sessionStorage.removeItem(this.GUEST_SESSION_KEY);
        }

        callback(event, session);
      });

      return unsubscribe;
    }
  };

  // Export to window for use in app.js
  window.SupabaseAuth = AuthState;
  window.supabaseClient = supabase;

})();
