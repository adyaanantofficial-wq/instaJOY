(function () {
  const config = window.INSTAJOY_CONFIG || {};
  const supabase =
    window.supabaseClient ||
    (window.supabase && window.supabase.auth ? window.supabase : null) ||
    (window.supabase?.createClient ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null);

  const AUTH_STORAGE_KEY = 'INSTAJOY_AUTH_MODE';
  const PENDING_PROFILE_KEY = 'instajoy_pending_profile';
  const DEFAULT_AVATAR = config.DEFAULT_AVATAR || 'ilogo.png';
  const MAX_IMAGE_BYTES = 200 * 1024;
  const MAX_REEL_BYTES = 1024 * 1024;
  const MAX_REEL_DURATION_SECONDS = 30;
  const MAX_AVATAR_BYTES = 180 * 1024;
  const VIEW_IDS = ['authView', 'homeView', 'reelsView', 'messagesView', 'searchView', 'notificationsView', 'profileView'];

  const state = {
    authMode: 'landing',
    authPanel: 'login',
    activeView: 'home',
    user: null,
    profile: null,
    profileUsername: null,
    profileUserId: null,
    capabilities: {
      profilesTable: 'unknown',
      postsSchema: 'unknown',
      reelsAvailable: 'unknown',
    },
    posts: [],
    reels: [],
    messages: {
      conversations: [],
      activeUser: null,
      threads: {},
    },
    likedPostIds: new Set(),
    postLoading: false,
    reelLoading: false,
    currentCommentPostId: null,
    realtimeSubscribed: {
      base: false,
      userId: null,
    },
    previewUrls: {
      image: '',
      reel: '',
      avatar: '',
    },
  };

  const dom = {};
  let videoObserver = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheDom();
    bindEvents();

    if (!supabase?.auth) {
      showLanding();
      showToast('Supabase is not configured correctly. Check frontend/js/config.js.', 'error');
      return;
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        handleAuthStateChange(session).catch((error) => {
          console.error(error);
          showToast(humanizeError(error), 'error');
        });
      }, 0);
    });

    window.addEventListener('hashchange', () => {
      if (state.authMode === 'landing') {
        return;
      }

      const requestedView = normalizeViewName(window.location.hash.replace(/^#/, ''));
      if (requestedView !== state.activeView) {
        handleNav(requestedView);
      }
    });

    try {
      await restoreSession();
      await renderApp();
      await subscribeRealtime();
    } catch (error) {
      console.error(error);
      setLandingMode();
      showLanding();
      showToast(humanizeError(error), 'error');
    }
  }

  function cacheDom() {
    dom.landingPage = document.getElementById('landingPage');
    dom.appShell = document.getElementById('appShell');
    dom.authView = document.getElementById('authView');
    dom.bottomNav = document.getElementById('bottomNav');
    dom.homeFeed = document.getElementById('homeFeed');
    dom.homeLoadMore = document.getElementById('homeLoadMore');
    dom.homeEmpty = document.getElementById('homeEmpty');
    dom.reelsFeed = document.getElementById('reelsFeed');
    dom.reelsLoadMore = document.getElementById('reelsLoadMore');
    dom.searchInput = document.getElementById('searchInput');
    dom.searchStatus = document.getElementById('searchStatus');
    dom.userSearchResults = document.getElementById('userSearchResults');
    dom.postSearchResults = document.getElementById('postSearchResults');
    dom.notificationsList = document.getElementById('notificationsList');
    dom.profileSummary = document.getElementById('profileSummary');
    dom.profileGrid = document.getElementById('profileGrid');
    dom.profileRefresh = document.getElementById('profileRefresh');
    dom.openCreateButton = document.getElementById('openCreateButton');
    dom.brandSubtitle = document.getElementById('brandSubtitle');
    dom.toastHost = document.getElementById('toastHost');
    dom.createModal = document.getElementById('createModal');
    dom.createForm = document.getElementById('createForm');
    dom.textFields = document.getElementById('textFields');
    dom.imageFields = document.getElementById('imageFields');
    dom.reelFields = document.getElementById('reelFields');
    dom.textCategory = document.getElementById('textCategory');
    dom.textPostBody = document.getElementById('textPostBody');
    dom.imageCaption = document.getElementById('imageCaption');
    dom.imageInput = document.getElementById('imageInput');
    dom.imageHint = document.getElementById('imageHint');
    dom.imagePreview = document.getElementById('imagePreview');
    dom.reelCaption = document.getElementById('reelCaption');
    dom.reelInput = document.getElementById('reelInput');
    dom.reelHint = document.getElementById('reelHint');
    dom.reelPreview = document.getElementById('reelPreview');
    dom.commentsModal = document.getElementById('commentsModal');
    dom.commentsList = document.getElementById('commentsList');
    dom.commentForm = document.getElementById('commentForm');
    dom.commentInput = document.getElementById('commentInput');
    dom.loginBtn = document.getElementById('loginBtn');
    dom.guestBtn = document.getElementById('guestBtn');
    dom.topbarAction = document.getElementById('topbarAction');
    dom.notificationButton = document.getElementById('notificationButton');
    dom.suggestedAccounts = document.getElementById('suggestedAccounts');
    dom.suggestedFollowList = document.getElementById('suggestedFollowList');
    dom.messagesView = document.getElementById('messagesView');
    dom.messagesRefresh = document.getElementById('messagesRefresh');
    dom.conversationList = document.getElementById('conversationList');
    dom.messageThread = document.getElementById('messageThread');
    dom.chatHeader = document.getElementById('chatHeader');
    dom.chatBackButton = document.getElementById('chatBackButton');
    dom.messageComposer = document.getElementById('messageComposer');
    dom.messageInput = document.getElementById('messageInput');
    dom.markAllNotifications = document.getElementById('markAllNotifications');
    dom.profileEditModal = document.getElementById('profileEditModal');
    dom.profileEditForm = document.getElementById('profileEditForm');
    dom.profileBioInput = document.getElementById('profileBioInput');
    dom.profileImageInput = document.getElementById('profileImageInput');
    dom.profileImagePreview = document.getElementById('profileImagePreview');
    dom.removeProfileImage = document.getElementById('removeProfileImage');
  }

  function bindEvents() {
    dom.loginBtn?.addEventListener('click', () => showAuthView('login'));
    dom.guestBtn?.addEventListener('click', handleGuestMode);
    dom.notificationButton?.addEventListener('click', () => handleNav('notifications'));
    dom.topbarAction?.addEventListener('click', handleTopbarAction);
    dom.homeLoadMore?.addEventListener('click', () => loadHomeFeed(false));
    dom.reelsLoadMore?.addEventListener('click', () => loadReelsFeed(false));
    dom.searchInput?.addEventListener('input', debounce(handleSearch, 250));
    dom.openCreateButton?.addEventListener('click', openCreateModal);
    dom.createForm?.addEventListener('submit', handleCreatePost);
    dom.imageInput?.addEventListener('change', handleImageSelection);
    dom.reelInput?.addEventListener('change', handleReelSelection);
    dom.commentForm?.addEventListener('submit', handleCommentSubmit);
    dom.markAllNotifications?.addEventListener('click', markAllNotificationsRead);
    dom.messagesRefresh?.addEventListener('click', () => loadConversations(true));
    dom.messageComposer?.addEventListener('submit', handleMessageSubmit);
    dom.chatBackButton?.addEventListener('click', () => {
      state.messages.activeUser = null;
      renderConversations();
      renderActiveConversation();
    });
    dom.profileRefresh?.addEventListener('click', () => {
      loadProfile(state.profileUsername || state.profile?.username || null, state.profileUserId || state.user?.id || null);
    });
    dom.profileEditForm?.addEventListener('submit', handleProfileEditSubmit);
    dom.profileImageInput?.addEventListener('change', handleProfileImageSelection);

    document.querySelectorAll('.nav-button[data-view]').forEach((button) => {
      button.addEventListener('click', () => handleNav(button.dataset.view));
    });

    document.body.addEventListener('click', handleBodyClick);
  }

  async function restoreSession() {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }

    const session = sessionData?.session;
    if (session?.user) {
      state.authMode = 'user';
      state.user = session.user;
      const profileResult = await ensureCurrentUserProfile();
      if (!profileResult.ok) {
        showToast(profileResult.message, 'error');
      } else if (profileResult.warning) {
        showToast(profileResult.warning, 'info');
      }
      await attemptRegisterFcmToken();
      clearLegacyGuestFlag();
      return;
    }

    if (sessionStorage.getItem(AUTH_STORAGE_KEY) === 'guest' || localStorage.getItem('guest') === 'true') {
      state.authMode = 'guest';
      state.user = null;
      state.profile = null;
      state.profileUserId = null;
      return;
    }

    setLandingMode();
  }

  async function handleAuthStateChange(session) {
    const user = session?.user || null;

    if (!user) {
      if (state.authMode === 'guest') {
        return;
      }

      setLandingMode();
      showLanding();
      return;
    }

    state.authMode = 'user';
    state.user = user;
    sessionStorage.setItem(AUTH_STORAGE_KEY, 'user');
    clearLegacyGuestFlag();
    const profileResult = await ensureCurrentUserProfile();
    if (!profileResult.ok) {
      showToast(profileResult.message, 'error');
    }
    await attemptRegisterFcmToken();
    await renderApp();
    await subscribeRealtime();
  }

  async function renderApp() {
    if (state.authMode === 'landing') {
      showLanding();
      return;
    }

    dom.landingPage.hidden = true;
    dom.appShell.hidden = false;
    dom.bottomNav.hidden = false;
    dom.authView.hidden = true;

    updateWriteAccessUi();
    updateTopbarAction();
    renderView(normalizeViewName(window.location.hash.replace(/^#/, '')));
    await hydrateActiveView(true);
  }

  function showLanding() {
    state.activeView = 'landing';
    dom.landingPage.hidden = false;
    dom.appShell.hidden = true;
    dom.bottomNav.hidden = true;
    dom.authView.hidden = true;
    updateTopbarAction();
  }

  function showAuthView(panel) {
    state.activeView = 'auth';
    state.authPanel = panel || state.authPanel || 'login';
    dom.landingPage.hidden = true;
    dom.appShell.hidden = false;
    dom.bottomNav.hidden = true;
    dom.authView.hidden = false;
    dom.authView.innerHTML = renderAuthForms();
    bindAuthFormEvents();
    updateTopbarAction();
  }

  function renderAuthForms() {
    return `
      <div class="auth-card">
        <div class="auth-brand">
          <img src="${escapeHtml(DEFAULT_AVATAR)}" alt="instaJOY logo">
          <h2>Welcome to instaJOY</h2>
          <p>Use one clean flow for login, signup, and guest browsing.</p>
        </div>
        <div class="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button class="chip-button ${state.authPanel === 'login' ? 'is-active' : ''}" type="button" data-auth-switch="login">Login</button>
          <button class="chip-button ${state.authPanel === 'signup' ? 'is-active' : ''}" type="button" data-auth-switch="signup">Create account</button>
        </div>
        <p class="auth-helper">
          ${state.authPanel === 'login'
            ? 'Sign in to post, like, comment, follow, and message.'
            : 'Choose a unique username. If email confirmation is enabled, we will ask you to verify before logging in.'}
        </p>
        <form id="supabaseLoginForm" class="form-stack" ${state.authPanel === 'login' ? '' : 'hidden'}>
          <label>
            Email
            <input id="loginEmail" type="email" autocomplete="email" spellcheck="false" required>
          </label>
          <label>
            Password
            <input id="loginPassword" type="password" autocomplete="current-password" required>
          </label>
          <button class="primary-button" type="submit">Login</button>
        </form>
        <form id="supabaseSignupForm" class="form-stack" ${state.authPanel === 'signup' ? '' : 'hidden'}>
          <label>
            Username
            <input id="signupUsername" type="text" autocomplete="username" minlength="3" maxlength="30" placeholder="letters, numbers, dots, underscores" spellcheck="false" required>
          </label>
          <label>
            Email
            <input id="signupEmail" type="email" autocomplete="email" spellcheck="false" required>
          </label>
          <label>
            Password
            <input id="signupPassword" type="password" minlength="6" autocomplete="new-password" required>
          </label>
          <button class="primary-button" type="submit">Create Account</button>
        </form>
      </div>
    `;
  }

  function bindAuthFormEvents() {
    document.getElementById('supabaseLoginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('supabaseSignupForm')?.addEventListener('submit', handleSignup);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form?.querySelector('button[type="submit"]');
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value || '';

    if (!email || !password) {
      showToast('Enter your email and password to continue.', 'error');
      return;
    }

    submitButton?.setAttribute('disabled', 'disabled');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(humanizeError(error), 'error');
        return;
      }

      if (!data?.user) {
        showToast('Login did not return a user session. Please try again.', 'error');
        return;
      }

      state.user = data.user;
      state.authMode = 'user';
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'user');
      clearLegacyGuestFlag();
      const profileResult = await ensureCurrentUserProfile();
      if (!profileResult.ok) {
        showToast(profileResult.message, 'error');
      } else if (profileResult.warning) {
        showToast(profileResult.warning, 'info');
      }
      await attemptRegisterFcmToken();
      showToast('Logged in successfully.', 'success');
      await enterInteractiveView('home');
    } finally {
      submitButton?.removeAttribute('disabled');
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form?.querySelector('button[type="submit"]');
    const rawUsername = document.getElementById('signupUsername')?.value.trim() || '';
    const username = normalizeUsername(rawUsername);
    const email = document.getElementById('signupEmail')?.value.trim() || '';
    const password = document.getElementById('signupPassword')?.value || '';

    if (!isValidUsername(username)) {
      showToast('Usernames must be 3-30 characters and use only letters, numbers, dots, or underscores.', 'error');
      return;
    }

    if (!email || !password) {
      showToast('Email and password are required to create an account.', 'error');
      return;
    }

    submitButton?.setAttribute('disabled', 'disabled');

    try {
      const usernameAvailable = await ensureUsernameAvailable(username);
      if (!usernameAvailable) {
        showToast('That username is already taken. Please choose another one.', 'error');
        return;
      }

      const pendingProfile = {
        id: null,
        username,
        display_name: rawUsername,
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'https://sites.google.com/view/instajoy/home',
          data: {
            username,
            display_name: rawUsername,
          },
        },
      });

      if (error) {
        showToast(humanizeError(error), 'error');
        return;
      }

      if (!data?.user) {
        showToast('Account creation finished, but no user data was returned. Please try signing in.', 'error');
        return;
      }

      pendingProfile.id = data.user.id;
      sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(pendingProfile));

      const session = data.session || (await supabase.auth.getSession()).data?.session;
      if (!session?.user) {
        showToast('Account created. Confirm your email before logging in.', 'success');
        state.authPanel = 'login';
        showAuthView('login');
        return;
      }

      state.user = session.user;
      state.authMode = 'user';
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'user');
      clearLegacyGuestFlag();

      const profileResult = await ensureProfileRecord(pendingProfile);
      if (!profileResult.ok) {
        showToast(profileResult.message, 'error');
      } else if (profileResult.warning) {
        showToast(profileResult.warning, 'info');
      } else {
        showToast('Account created. Welcome to instaJOY!', 'success');
      }

      await ensureCurrentUserProfile();
      await attemptRegisterFcmToken();
      await enterInteractiveView('home');
    } finally {
      submitButton?.removeAttribute('disabled');
    }
  }

  async function handleGuestMode() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Sign-out before guest mode failed', error);
    }

    state.user = null;
    state.profile = null;
    state.profileUsername = null;
    state.profileUserId = null;
    state.posts = [];
    state.reels = [];
    state.likedPostIds.clear();
    state.authMode = 'guest';
    sessionStorage.setItem(AUTH_STORAGE_KEY, 'guest');
    localStorage.setItem('guest', 'true');
    showToast('Guest mode enabled. Browse freely, write actions are disabled.', 'info');
    await enterInteractiveView('home');
  }

  async function handleTopbarAction() {
    if (state.activeView === 'auth') {
      setLandingMode();
      showLanding();
      return;
    }

    if (state.authMode === 'guest') {
      setLandingMode();
      showLanding();
      return;
    }

    if (state.activeView === 'search') {
      if (dom.searchInput) {
        dom.searchInput.value = '';
      }
      renderSearchPlaceholder();
      return;
    }

    if (state.activeView === 'notifications') {
      await markAllNotificationsRead();
      return;
    }

    if (state.activeView === 'messages') {
      await loadConversations(true);
      return;
    }

    if (state.activeView === 'profile' && state.user?.id === state.profileUserId) {
      openProfileEditModal();
      return;
    }

    if (state.authMode === 'user' && state.activeView === 'profile' && state.user?.id !== state.profileUserId) {
      await loadProfile(state.profileUsername, state.profileUserId);
      return;
    }

    if (state.activeView === 'reels') {
      await loadReelsFeed(true);
      return;
    }

    if (state.activeView === 'home') {
      await loadHomeFeed(true);
      return;
    }

    if (state.authMode === 'user' && state.activeView === 'landing') {
      await logoutUser();
    }
  }

  async function handleBodyClick(event) {
    const authSwitch = event.target.closest('[data-auth-switch]');
    if (authSwitch) {
      state.authPanel = authSwitch.dataset.authSwitch === 'signup' ? 'signup' : 'login';
      showAuthView(state.authPanel);
      return;
    }

    const closeButton = event.target.closest('[data-close-modal]');
    if (closeButton) {
      closeModal(closeButton.dataset.closeModal);
      return;
    }

    const typeButton = event.target.closest('[data-create-type]');
    if (typeButton) {
      setCreateType(typeButton.dataset.createType);
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
      return;
    }

    const {
      action,
      username,
      postId,
      userId,
      avatarUrl,
      displayName,
    } = actionButton.dataset;
    if (action === 'view-profile') {
      state.profileUsername = username || null;
      state.profileUserId = userId || null;
      renderView('profile');
      loadProfile(state.profileUsername, state.profileUserId);
      return;
    }

    if (action === 'toggle-like' && postId) {
      toggleLike(postId);
      return;
    }

    if (action === 'comment' && postId) {
      openCommentsModal(postId);
      return;
    }

    if (action === 'share' && postId) {
      sharePost(postId);
      // Asynchronously log strong intent
      if (state.authMode === 'user') supabase.rpc('log_interaction', { p_post_id: postId, p_interaction: 'share', p_weight: 2.0 }).catch(()=>{});
      return;
    }
    
    if (action === 'hide-post' && postId) {
      if (state.authMode === 'user') supabase.rpc('log_interaction', { p_post_id: postId, p_interaction: 'hide' }).catch(()=>{});
      showToast('Post hidden. We will show you less of this.', 'success');
      return;
    }

    if (action === 'toggle-follow' && userId) {
      await toggleFollow(userId, actionButton.dataset.following === 'true');
      return;
    }

    if (action === 'refresh-suggestions') {
      loadSuggestedFollows().catch((error) => console.warn(error));
      return;
    }

    if (action === 'message-user' && userId) {
      openConversation({
        id: userId,
        username: username || 'member',
        avatar_url: avatarUrl || DEFAULT_AVATAR,
        display_name: displayName || username || 'member',
      });
      return;
    }

    if (action === 'logout') {
      logoutUser();
    }
  }

  async function sharePost(postId) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(postId)}`;
    const shareText = `Check out this instaJOY post: ${shareUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Share on instaJOY',
          text: shareText,
          url: shareUrl,
        });
        showToast('Share dialog opened.', 'success');
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        showToast('Share link copied to clipboard.', 'success');
        return;
      }

      throw new Error('Sharing is not supported in this browser.');
    } catch (error) {
      showToast('Could not share this item right now. Copy the link manually to share it.', 'error');
    }
  }

  async function handleNav(viewName) {
    renderView(viewName);
    await hydrateActiveView(true);
  }

  function renderView(viewName) {
    const normalizedView = normalizeViewName(viewName);
    state.activeView = normalizedView;
    dom.brandSubtitle.textContent = getViewSubtitle(normalizedView);
    VIEW_IDS.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.hidden = id !== `${normalizedView}View`;
      }
    });
    document.querySelectorAll('.nav-button[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === normalizedView);
    });
    syncHash(normalizedView);
    updateTopbarAction();
    updateWriteAccessUi();
  }

  async function enterInteractiveView(viewName) {
    dom.landingPage.hidden = true;
    dom.appShell.hidden = false;
    dom.bottomNav.hidden = false;
    renderView(viewName || 'home');
    await hydrateActiveView(true);
  }

  async function logoutUser() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Logout failed', error);
    }

    showToast('Logged out successfully.', 'success');
    setLandingMode();
    showLanding();
  }

  function setLandingMode() {
    state.authMode = 'landing';
    state.user = null;
    state.profile = null;
    state.profileUsername = null;
    state.profileUserId = null;
    state.posts = [];
    state.reels = [];
    state.messages = {
      conversations: [],
      activeUser: null,
      threads: {},
    };
    state.likedPostIds.clear();
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
    clearLegacyGuestFlag();
    clearPreviewUrl('image');
    clearPreviewUrl('reel');
    clearPreviewUrl('avatar');
  }

  async function hydrateActiveView(forceRefresh) {
    if (state.activeView === 'home') {
      await loadHomeFeed(forceRefresh);
      loadSuggestedFollows().catch((error) => {
        console.warn('Suggested accounts failed to load', error);
      });
      return;
    }

    if (state.activeView === 'reels') {
      await loadReelsFeed(forceRefresh);
      return;
    }

    if (state.activeView === 'search') {
      renderSearchPlaceholder();
      return;
    }

    if (state.activeView === 'notifications') {
      await loadNotifications();
      return;
    }

    if (state.activeView === 'profile') {
      if (state.authMode === 'user' && state.user) {
        state.profileUserId = state.profileUserId || state.user.id;
        state.profileUsername = state.profileUsername || state.profile?.username || state.user?.user_metadata?.username || null;
      }
      await loadProfile(state.profileUsername || state.profile?.username || null, state.profileUserId || state.user?.id || null);
      return;
    }

    if (state.activeView === 'messages') {
      await loadConversations(forceRefresh);
    }
  }

  function syncHash(viewName) {
    const normalizedView = normalizeViewName(viewName);
    if (normalizedView === 'home') {
      window.history.replaceState(null, '', '#home');
      return;
    }

    window.history.replaceState(null, '', `#${normalizedView}`);
  }

  function normalizeViewName(viewName) {
    return VIEW_IDS.includes(`${viewName}View`) ? viewName : 'home';
  }

  function clearLegacyGuestFlag() {
    sessionStorage.removeItem('guest');
    localStorage.removeItem('guest');
  }

  async function ensureCurrentUserProfile() {
    if (!state.user) {
      return { ok: false, message: 'No active user session.' };
    }

    const { data, error } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (data) {
      state.capabilities.profilesTable = 'available';
      state.profile = data;
      state.user.profile = data;
      state.profileUsername = data.username;
      state.profileUserId = data.id || state.user.id;
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      return { ok: true };
    }

    if (isProfilesSetupCompatibilityError(error)) {
      state.capabilities.profilesTable = 'missing';
      const fallbackProfile = buildProfileDraft(state.user, readPendingProfile() || {});
      state.profile = fallbackProfile;
      state.user.profile = fallbackProfile;
      state.profileUsername = fallbackProfile.username;
      state.profileUserId = state.user.id;
      return {
        ok: true,
        degraded: true,
      };
    }

    if (error && !isProfilesSetupCompatibilityError(error)) {
      return { ok: false, message: humanizeError(error) };
    }

    const storedPending = readPendingProfile();
    const draft = storedPending?.id === state.user.id ? storedPending : buildProfileDraft(state.user, storedPending || {});
    const result = await ensureProfileRecord(draft);

    if (result.ok) {
      state.profile = result.profile;
      state.user.profile = result.profile;
      state.profileUsername = result.profile.username;
      state.profileUserId = result.profile.id || state.user.id;
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
    }

    return result;
  }

  async function ensureProfileRecord(profileDraft) {
    if (!state.user) {
      return { ok: false, message: 'You must be logged in to create a profile.' };
    }

    const payload = buildProfileDraft(state.user, profileDraft);
    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      if (isProfilesSetupCompatibilityError(error)) {
        state.capabilities.profilesTable = 'missing';
        state.profile = payload;
        state.user.profile = payload;
        state.profileUsername = payload.username;
        state.profileUserId = payload.id || state.user.id;
        return {
          ok: true,
          profile: payload,
          degraded: true,
        };
      }
      return { ok: false, message: humanizeProfileError(error, payload.username) };
    }

    state.capabilities.profilesTable = 'available';
    state.profileUserId = data.id || state.user.id;
    return { ok: true, profile: data };
  }

  function buildProfileDraft(user, overrides) {
    const baseUsername =
      normalizeUsername(overrides?.username) ||
      normalizeUsername(user?.user_metadata?.username) ||
      normalizeUsername(user?.email?.split('@')[0]) ||
      `user_${String(user?.id || '').slice(0, 8).toLowerCase()}`;

    const username = baseUsername.slice(0, 30) || `user_${String(user?.id || '').slice(0, 8).toLowerCase()}`;
    const displayName = (overrides?.display_name || user?.user_metadata?.display_name || username).trim().slice(0, 50);

    return {
      id: user.id,
      username,
      display_name: displayName || username,
    };
  }

  function readPendingProfile() {
    const rawValue = sessionStorage.getItem(PENDING_PROFILE_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch {
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      return null;
    }
  }

  async function ensureUsernameAvailable(username) {
    const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1);
    if (error) {
      if (isMissingProfilesTableError(error)) {
        state.capabilities.profilesTable = 'missing';
        return true;
      }
      throw error;
    }
    state.capabilities.profilesTable = 'available';
    return !data?.length;
  }

  async function loadHomeFeed(reset) {
    if (state.postLoading) {
      return;
    }

    if (reset) {
      state.posts = [];
    }

    state.postLoading = true;
    dom.homeLoadMore.hidden = true;
    dom.homeEmpty.hidden = true;
    if (reset || !state.posts.length) {
      dom.homeFeed.innerHTML = '<div class="empty-state">Loading feed...</div>';
    }

    const rangeStart = state.posts.length;
    const rangeEnd = rangeStart + 9;
    const { data, error } = await selectPostsWithAuthors(rangeStart, rangeEnd);

    state.postLoading = false;
    if (error) {
      dom.homeFeed.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(error))}</div>`;
      return;
    }

    const newPosts = (data || []).map(normalizePostRecord);
    state.posts = reset ? newPosts : state.posts.concat(newPosts);
    await refreshLikedPostsForVisibleFeed();
    renderHomeFeed();
    dom.homeLoadMore.hidden = newPosts.length < 10;
  }

  async function refreshLikedPostsForVisibleFeed() {
    if (state.authMode !== 'user' || !state.user || !state.posts.length) {
      state.likedPostIds.clear();
      return;
    }

    const postIds = state.posts.map((post) => post.id);
    const { data, error } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', state.user.id)
      .in('post_id', postIds);

    if (error) {
      console.warn('Failed to load likes', error.message);
      return;
    }

    state.likedPostIds = new Set((data || []).map((item) => item.post_id));
  }

  function renderHomeFeed() {
    if (!dom.homeFeed) {
      return;
    }

    if (!state.posts.length) {
      dom.homeFeed.innerHTML = `<div class="empty-state">${state.authMode === 'guest' ? 'No public posts are available yet. You can still explore as a guest.' : 'No posts yet. Create the first moment.'}</div>`;
      return;
    }

    dom.homeFeed.innerHTML = state.posts.map((post) => renderPostCard(post)).join('');
    prepareAutoPlayVideos(dom.homeFeed);
  }

  function renderPostCard(post) {
    const normalized = normalizePostRecord(post);
    const author = deriveAuthor(normalized);
    const createdAt = new Date(normalized.created_at).toLocaleString();
    const liked = state.likedPostIds.has(normalized.id);
    const likeDisabled = state.authMode !== 'user';
    const copy = normalized.type === 'text' ? normalized.content || normalized.caption || '' : normalized.caption || normalized.content || '';
    const media = normalized.type === 'reel'
      ? (normalized.media_url ? `<video controls preload="metadata" muted loop playsinline data-auto-play-video src="${escapeHtml(normalized.media_url)}" class="post-image reel-video"></video>` : '')
      : (normalized.image_url ? `<img src="${escapeHtml(normalized.image_url)}" alt="Post image" loading="lazy" decoding="async" class="post-image">` : '');

    // Upgraded Premium Post Card HTML matching modern IG/FB styling
    return `
      <article class="card post-card" data-post-id="${normalized.id}">
        <header class="post-header">
          <div class="post-author">
            <img src="${escapeHtml(author.avatar_url || DEFAULT_AVATAR)}" class="avatar small" alt="${escapeHtml(author.username || 'anonymous')}" loading="lazy" data-action="view-profile" data-username="${escapeHtml(author.username || '')}" data-user-id="${escapeHtml(normalized.user_id || '')}" style="cursor: pointer;">
            <div>
              <strong data-action="view-profile" data-username="${escapeHtml(author.username || '')}" data-user-id="${escapeHtml(normalized.user_id || '')}">${escapeHtml(author.username || 'anonymous')}</strong>
              <div class="post-meta">${escapeHtml(createdAt)}</div>
            </div>
          </div>
          <button class="ghost-button compact" aria-label="Hide Post" data-action="hide-post" data-post-id="${normalized.id}">✕</button>
        </header>
        
        ${media}
        
        <div class="post-body">
          ${normalized.category ? `<span class="post-chip" style="margin-bottom:8px; display:inline-block;">${escapeHtml(normalized.category)}</span><br>` : ''}
          <strong>${escapeHtml(author.username || 'anonymous')}</strong> ${escapeHtml(copy)}
        </div>
        
        <footer class="post-actions">
          <button class="action-button ${liked ? 'liked' : ''}" data-action="toggle-like" data-post-id="${normalized.id}" ${likeDisabled ? 'disabled' : ''}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="${liked ? '#ed4956' : 'none'}" stroke="${liked ? '#ed4956' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <button class="action-button" data-action="comment" data-post-id="${normalized.id}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </button>
          <button class="action-button" data-action="share" data-post-id="${normalized.id}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </footer>
      </article>
    `;
  }

  async function toggleLike(postId) {
    if (!requireUserSession('liking posts')) {
      return;
    }

    const isLiked = state.likedPostIds.has(postId);
    let error = null;

    if (isLiked) {
      ({ error } = await supabase.from('likes').delete().match({ user_id: state.user.id, post_id: postId }));
      if (!error) {
        state.likedPostIds.delete(postId);
      }
    } else {
      ({ error } = await supabase.from('likes').insert({ user_id: state.user.id, post_id: postId }));
      if (!error) {
        state.likedPostIds.add(postId);
      }
    }

    if (error) {
      showToast(humanizeError(error), 'error');
      return;
    }

    renderHomeFeed();
    if (state.activeView === 'profile' && (state.profileUsername || state.profileUserId)) {
      loadProfile(state.profileUsername, state.profileUserId || state.user?.id || null);
    }
  }

  async function openCommentsModal(postId) {
    state.currentCommentPostId = postId;
    dom.commentsModal.hidden = false;
    await loadComments(postId);
    dom.commentForm.hidden = state.authMode !== 'user';
  }

  async function loadComments(postId) {
    dom.commentsList.innerHTML = '<div class="empty-state">Loading comments...</div>';

    const { data, error } = await selectCommentsWithAuthors(postId);

    if (error) {
      dom.commentsList.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(error))}</div>`;
      return;
    }

    if (!data?.length) {
      dom.commentsList.innerHTML = `<div class="empty-state">${state.authMode === 'user' ? 'No comments yet. Start the conversation.' : 'No comments yet. Login to join the conversation.'}</div>`;
      return;
    }

    dom.commentsList.innerHTML = data.map((comment) => {
      const username = deriveAuthor(comment).username || 'anonymous';
      return `
        <article class="card compact-card">
          <div class="comment-head">
            <strong>${escapeHtml(username)}</strong>
            <span class="post-meta">${escapeHtml(new Date(comment.created_at).toLocaleString())}</span>
          </div>
          <p class="comment-body">${escapeHtml(comment.body)}</p>
        </article>
      `;
    }).join('');
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();

    if (!requireUserSession('commenting')) {
      return;
    }

    const body = dom.commentInput?.value.trim();
    if (!body || !state.currentCommentPostId) {
      showToast('Write a comment before posting.', 'error');
      return;
    }

    const { error } = await supabase.from('comments').insert({
      user_id: state.user.id,
      post_id: state.currentCommentPostId,
      body,
    });

    if (error) {
      showToast(humanizeError(error), 'error');
      return;
    }

    dom.commentInput.value = '';
    showToast('Comment posted.', 'success');
    await loadComments(state.currentCommentPostId);
  }

  function renderSearchPlaceholder() {
    dom.searchStatus.textContent = 'Type at least 2 characters to search users and posts.';
    dom.userSearchResults.innerHTML = '';
    dom.postSearchResults.innerHTML = '';
  }

  async function handleSearch() {
    const query = dom.searchInput?.value.trim();
    if (!query || query.length < 2) {
      renderSearchPlaceholder();
      return;
    }

    dom.searchStatus.textContent = 'Searching...';
    const [usersResult, postsResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_url').ilike('username', `%${query}%`).limit(15),
      selectSearchedPosts(query),
    ]);

    const userSearchError = usersResult.error && !isMissingProfilesTableError(usersResult.error) ? usersResult.error : null;
    if (usersResult.error && isMissingProfilesTableError(usersResult.error)) {
      state.capabilities.profilesTable = 'missing';
    }

    if (userSearchError || postsResult.error) {
      showToast(humanizeError(userSearchError || postsResult.error), 'error');
      dom.searchStatus.textContent = 'Search is unavailable right now.';
      return;
    }

    const users = usersResult.data || [];
    const posts = (postsResult.data || []).map(normalizePostRecord);
    dom.searchStatus.textContent = state.capabilities.profilesTable === 'missing'
      ? `Found ${posts.length} posts. User profile search is unavailable in this deployment.`
      : `Found ${users.length} users and ${posts.length} posts.`;
    dom.userSearchResults.innerHTML = users.length
      ? users.map((user) => {
        const canMessage = state.authMode === 'user' && state.user?.id !== user.id;
        return `
          <article class="card compact-card search-result-card">
            <div class="row-between search-result-head">
              <div>
                <strong>${escapeHtml(user.display_name || user.username)}</strong>
                <div class="post-meta">@${escapeHtml(user.username)}</div>
              </div>
              <div class="search-actions">
                <button
                  class="ghost-button compact"
                  data-action="view-profile"
                  data-username="${escapeHtml(user.username)}"
                  data-user-id="${escapeHtml(user.id)}"
                >
                  Profile
                </button>
                ${canMessage ? `
                  <button
                    class="secondary-button"
                    data-action="message-user"
                    data-user-id="${escapeHtml(user.id)}"
                    data-username="${escapeHtml(user.username)}"
                    data-display-name="${escapeHtml(user.display_name || user.username)}"
                    data-avatar-url="${escapeHtml(user.avatar_url || DEFAULT_AVATAR)}"
                  >
                    Message
                  </button>
                ` : ''}
              </div>
            </div>
          </article>
        `;
      }).join('')
      : `<div class="empty-state">${state.capabilities.profilesTable === 'missing' ? 'Profile search is unavailable until the profiles table exists.' : 'No matching users yet.'}</div>`;
    dom.postSearchResults.innerHTML = posts.length
      ? posts.map((post) => renderPostCard(post)).join('')
      : '<div class="empty-state">No matching posts yet.</div>';
  }

  async function loadReelsFeed(reset) {
    if (state.reelLoading) {
      return;
    }

    if (reset) {
      state.reels = [];
    }

    state.reelLoading = true;
    if (reset || !state.reels.length) {
      dom.reelsFeed.innerHTML = '<div class="empty-state">Loading reels...</div>';
    }

    const { data, error } = await selectReelsWithAuthors();

    state.reelLoading = false;
    if (error) {
      dom.reelsFeed.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(error))}</div>`;
      return;
    }

    state.reels = (data || []).map(normalizePostRecord).filter((post) => post.type === 'reel');
    if (!state.reels.length) {
      dom.reelsFeed.innerHTML = `<div class="empty-state">${state.capabilities.reelsAvailable === false ? 'Reels are not supported by this deployment yet.' : 'No reels yet.'}</div>`;
      return;
    }

    dom.reelsFeed.innerHTML = state.reels.map(renderReelCard).join('');
    prepareAutoPlayVideos(dom.reelsFeed);
  }

  function renderReelCard(reel) {
    const normalized = normalizePostRecord(reel);
    const author = deriveAuthor(normalized);
    return `
      <article class="card reel-card">
        <header class="post-header">
          <div class="post-author">
            <strong>${escapeHtml(author.username || 'anonymous')}</strong>
            <div class="post-meta">${escapeHtml(new Date(normalized.created_at).toLocaleString())}</div>
          </div>
        </header>
        ${normalized.media_url ? `<video controls preload="metadata" muted loop playsinline data-auto-play-video src="${escapeHtml(normalized.media_url)}" class="reel-video"></video>` : ''}
        <div class="post-body">${escapeHtml(normalized.caption || normalized.content || '')}</div>
        <footer class="post-actions">
          <button class="secondary-button" data-action="comment" data-post-id="${normalized.id}">Comments</button>
          <button class="secondary-button" data-action="share" data-post-id="${normalized.id}">Share</button>
        </footer>
      </article>
    `;
  }

  async function loadNotifications() {
    if (state.authMode !== 'user' || !state.user) {
      dom.notificationsList.innerHTML = '<div class="empty-state">Login to view notifications.</div>';
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, message, read, created_at')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      dom.notificationsList.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(error))}</div>`;
      return;
    }

    if (!data?.length) {
      dom.notificationsList.innerHTML = '<div class="empty-state">No notifications yet.</div>';
      return;
    }

    dom.notificationsList.innerHTML = data.map((note) => `
      <article class="card compact-card ${note.read ? '' : 'notification-unread'}">
        <strong>${escapeHtml(note.type)}</strong>
        <p class="comment-body">${escapeHtml(note.message || '')}</p>
        <div class="post-meta">${escapeHtml(new Date(note.created_at).toLocaleString())}</div>
      </article>
    `).join('');
  }

  async function markAllNotificationsRead() {
    if (!requireUserSession('managing notifications')) {
      return;
    }

    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', state.user.id).eq('read', false);
    if (error) {
      showToast(humanizeError(error), 'error');
      return;
    }

    showToast('Notifications marked as read.', 'success');
    await loadNotifications();
  }

  function renderMessagesView() {
    if (!dom.conversationList || !dom.messageThread || !dom.messageComposer || !dom.chatHeader) {
      return;
    }

    if (state.authMode !== 'user' || !state.user) {
      dom.conversationList.innerHTML = '<div class="empty-state">Messages require login. Use Login to access chat.</div>';
      dom.messageThread.innerHTML = '<div class="empty-state">Log in to read and send direct messages.</div>';
      dom.messageComposer.hidden = true;
      dom.chatBackButton.hidden = true;
      dom.chatHeader.querySelector('h3').textContent = 'Messages';
      return;
    }

    renderConversations();
    renderActiveConversation();
  }

  async function loadConversations(forceRefresh) {
    if (state.authMode !== 'user' || !state.user) {
      renderMessagesView();
      return;
    }

    if (!forceRefresh && state.messages.conversations.length) {
      renderMessagesView();
      return;
    }

    dom.conversationList.innerHTML = '<div class="empty-state">Loading conversations...</div>';

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, body, read_at, created_at')
      .or(`sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      dom.conversationList.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(error))}</div>`;
      dom.messageThread.innerHTML = '<div class="empty-state">Messages are unavailable right now.</div>';
      dom.messageComposer.hidden = true;
      return;
    }

    const byUser = new Map();
    const otherUserIds = new Set();

    (data || []).forEach((message) => {
      const otherUserId = message.sender_id === state.user.id ? message.receiver_id : message.sender_id;
      otherUserIds.add(otherUserId);
      const existing = byUser.get(otherUserId);

      if (!existing) {
        byUser.set(otherUserId, {
          otherUserId,
          lastMessage: message,
          unreadCount: message.receiver_id === state.user.id && !message.read_at ? 1 : 0,
        });
        return;
      }

      if (message.receiver_id === state.user.id && !message.read_at) {
        existing.unreadCount += 1;
      }
    });

    let profilesById = new Map();
    if (otherUserIds.size) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', [...otherUserIds]);

      if (!profileError) {
        profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      }
    }

    state.messages.conversations = [...byUser.values()]
      .map((conversation) => ({
        ...conversation,
        user: profilesById.get(conversation.otherUserId) || {
          id: conversation.otherUserId,
          username: 'member',
          display_name: 'member',
          avatar_url: DEFAULT_AVATAR,
        },
      }))
      .sort((left, right) => new Date(right.lastMessage.created_at) - new Date(left.lastMessage.created_at));

    renderMessagesView();

    if (state.messages.activeUser) {
      await loadConversationMessages(state.messages.activeUser.id);
    }
  }

  function renderConversations() {
    if (!dom.conversationList) {
      return;
    }

    if (!state.messages.conversations.length) {
      dom.conversationList.innerHTML = '<div class="empty-state">No conversations yet. Start one from Search or a profile.</div>';
      return;
    }

    dom.conversationList.innerHTML = state.messages.conversations.map((conversation) => `
      <button
        class="conversation-item ${state.messages.activeUser?.id === conversation.user.id ? 'active' : ''}"
        type="button"
        data-action="message-user"
        data-user-id="${escapeHtml(conversation.user.id)}"
        data-username="${escapeHtml(conversation.user.username)}"
        data-display-name="${escapeHtml(conversation.user.display_name || conversation.user.username)}"
        data-avatar-url="${escapeHtml(conversation.user.avatar_url || DEFAULT_AVATAR)}"
      >
        <img class="avatar small" src="${escapeHtml(conversation.user.avatar_url || DEFAULT_AVATAR)}" alt="${escapeHtml(conversation.user.username)}">
        <div class="conversation-main">
          <strong>${escapeHtml(conversation.user.display_name || conversation.user.username)}</strong>
          <div class="meta-line">@${escapeHtml(conversation.user.username)}</div>
          <div class="meta-line">${escapeHtml(truncateText(conversation.lastMessage.body, 72))}</div>
        </div>
        ${conversation.unreadCount ? `<span class="post-chip">${conversation.unreadCount} new</span>` : ''}
      </button>
    `).join('');
  }

  async function openConversation(user) {
    if (!requireUserSession('messaging people')) {
      return;
    }

    state.messages.activeUser = {
      id: user.id,
      username: user.username || 'member',
      display_name: user.display_name || user.username || 'member',
      avatar_url: user.avatar_url || DEFAULT_AVATAR,
    };

    renderView('messages');
    renderMessagesView();
    await loadConversations(false);
    await loadConversationMessages(user.id);
  }

  async function loadConversationMessages(otherUserId) {
    if (!state.user || !otherUserId) {
      return;
    }

    dom.messageThread.innerHTML = '<div class="empty-state">Loading messages...</div>';

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, body, read_at, created_at')
      .or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${state.user.id})`)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      dom.messageThread.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(error))}</div>`;
      dom.messageComposer.hidden = true;
      return;
    }

    state.messages.threads[otherUserId] = data || [];
    await markConversationRead(otherUserId);
    renderActiveConversation();
  }

  async function markConversationRead(otherUserId) {
    if (!state.user || !otherUserId) {
      return;
    }

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', otherUserId)
      .eq('receiver_id', state.user.id)
      .is('read_at', null);

    state.messages.conversations = state.messages.conversations.map((conversation) =>
      conversation.user.id === otherUserId
        ? { ...conversation, unreadCount: 0 }
        : conversation
    );
  }

  function renderActiveConversation() {
    if (!dom.messageThread || !dom.chatHeader || !dom.messageComposer) {
      return;
    }

    if (!state.messages.activeUser) {
      dom.chatHeader.querySelector('h3').textContent = 'Choose a chat';
      dom.chatBackButton.hidden = true;
      dom.messageThread.innerHTML = '<div class="empty-state">Select a conversation or start one from Search or Profile.</div>';
      dom.messageComposer.hidden = true;
      return;
    }

    const activeUser = state.messages.activeUser;
    const messages = state.messages.threads[activeUser.id] || [];
    dom.chatHeader.querySelector('h3').textContent = activeUser.display_name || activeUser.username;
    dom.chatBackButton.hidden = false;
    dom.messageComposer.hidden = false;

    if (!messages.length) {
      dom.messageThread.innerHTML = '<div class="empty-state">No messages yet. Say hello.</div>';
      return;
    }

    dom.messageThread.innerHTML = messages.map((message) => `
      <article class="message-row ${message.sender_id === state.user.id ? 'outgoing' : 'incoming'}">
        <p class="comment-body">${escapeHtml(message.body)}</p>
        <div class="post-meta">${escapeHtml(formatMessageTime(message.created_at))}</div>
      </article>
    `).join('');
    dom.messageThread.scrollTop = dom.messageThread.scrollHeight;
  }

  async function handleMessageSubmit(event) {
    event.preventDefault();

    if (!requireUserSession('sending messages') || !state.messages.activeUser) {
      return;
    }

    const body = dom.messageInput?.value.trim() || '';
    if (!body) {
      showToast('Write a message before sending.', 'error');
      return;
    }

    const { error } = await supabase.from('messages').insert({
      sender_id: state.user.id,
      receiver_id: state.messages.activeUser.id,
      body,
    });

    if (error) {
      showToast(humanizeError(error), 'error');
      return;
    }

    dom.messageInput.value = '';
    await loadConversations(true);
    await loadConversationMessages(state.messages.activeUser.id);
  }

  async function loadProfile(username, userId) {
    const targetUsername = username || null;
    const targetUserId = userId || null;

    if (!targetUsername && !targetUserId) {
      if (state.authMode === 'guest') {
        dom.profileSummary.innerHTML = `
          <div class="empty-state">
            Guest mode has no personal profile. Open another user from Search, or log in to manage your own profile.
          </div>
        `;
        dom.profileGrid.innerHTML = '';
        return;
      }

      showToast('No profile selected.', 'error');
      return;
    }

    if (state.capabilities.profilesTable === 'missing') {
      await renderLegacyProfileFallback(targetUserId || state.user?.id || null, targetUsername);
      return;
    }

    let profileQuery = supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (targetUsername) {
      profileQuery = profileQuery.eq('username', targetUsername);
    } else if (targetUserId) {
      profileQuery = profileQuery.eq('id', targetUserId);
    }

    const { data: users, error: userError } = await profileQuery;

    if (userError || !users?.length) {
      dom.profileSummary.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(userError || new Error('Profile not found.')))}</div>`;
      dom.profileGrid.innerHTML = '';
      return;
    }

    const profile = users[0];
    state.profileUsername = profile.username;
    state.profileUserId = profile.id;
    const [postsResult, followersResult, followingResult] = await Promise.all([
      selectPostsByUser(profile.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id),
    ]);

    if (postsResult.error) {
      showToast(humanizeError(postsResult.error), 'error');
      return;
    }

    const posts = (postsResult.data || []).map(normalizePostRecord);
    const followerCount = followersResult.count || 0;
    const followingCount = followingResult.count || 0;
    const isOwner = state.user?.id === profile.id;
    let profileActionsMarkup = '';

    if (isOwner) {
      state.profile = profile;
      profileActionsMarkup = `
        <div class="profile-actions">
          <button class="primary-button" type="button" id="openProfileEditButton">Edit profile</button>
          <button class="ghost-button" type="button" data-action="logout">Logout</button>
        </div>
      `;
    }

    if (state.authMode === 'user' && state.user && !isOwner) {
      const { data: follows, error: followError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', state.user.id)
        .eq('following_id', profile.id)
        .limit(1);

      if (!followError) {
        const isFollowing = Boolean(follows?.length);
        profileActionsMarkup = `
          <div class="profile-actions">
            <button class="primary-button" id="followToggleButton" type="button">${isFollowing ? 'Unfollow' : 'Follow'}</button>
            <button
              class="ghost-button"
              type="button"
              data-action="message-user"
              data-user-id="${escapeHtml(profile.id)}"
              data-username="${escapeHtml(profile.username)}"
              data-display-name="${escapeHtml(profile.display_name || profile.username)}"
              data-avatar-url="${escapeHtml(profile.avatar_url || DEFAULT_AVATAR)}"
            >
              Message
            </button>
          </div>
        `;
        queueMicrotask(() => {
          document.getElementById('followToggleButton')?.addEventListener('click', () => toggleFollow(profile.id, isFollowing));
        });
      }
    }

    dom.profileSummary.innerHTML = `
      <div class="profile-header">
        <img src="${escapeHtml(profile.avatar_url || DEFAULT_AVATAR)}" alt="${escapeHtml(profile.username)}" class="avatar-large">
        <div class="profile-copy" style="flex: 1;">
          <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 400;">${escapeHtml(profile.username)}</h2>
            ${isOwner ? '' : profileActionsMarkup}
          </div>
          <div class="profile-stats-inline" style="margin-bottom: 12px; display: flex; gap: 24px;">
            <span><strong>${posts.length}</strong> posts</span>
            <span><strong>${followerCount}</strong> followers</span>
            <span><strong>${followingCount}</strong> following</span>
          </div>
          <div class="profile-bio">
            <strong style="display: block;">${escapeHtml(profile.display_name || profile.username)}</strong>
            <p style="margin: 4px 0 0;">${escapeHtml(profile.bio || '')}</p>
          </div>
        </div>
      </div>
      ${isOwner ? '<div class="auth-helper">This is your public profile.</div>' : ''}
      ${isOwner ? profileActionsMarkup : ''}
    `;

    if (isOwner) {
      queueMicrotask(() => {
        document.getElementById('openProfileEditButton')?.addEventListener('click', openProfileEditModal);
      });
    }

    dom.profileGrid.innerHTML = posts.length ? posts.map(renderPostCard).join('') : '<div class="empty-state">No posts on this profile yet.</div>';
    prepareAutoPlayVideos(dom.profileGrid);
  }

  async function toggleFollow(targetUserId, isFollowing) {
    if (!requireUserSession('following people')) {
      return;
    }

    let error = null;
    if (isFollowing) {
      ({ error } = await supabase.from('follows').delete().match({ follower_id: state.user.id, following_id: targetUserId }));
    } else {
      ({ error } = await supabase.from('follows').insert({ follower_id: state.user.id, following_id: targetUserId }));
    }

    if (error) {
      showToast(humanizeError(error), 'error');
      return;
    }

    showToast(isFollowing ? 'Unfollowed successfully.' : 'Started following user.', 'success');
    if (state.activeView === 'profile') {
      await loadProfile(state.profileUsername, state.profileUserId || targetUserId);
    }

    if (state.activeView === 'home') {
      await loadSuggestedFollows();
    }
  }

  function openProfileEditModal() {
    if (!requireUserSession('editing your profile')) {
      return;
    }

    dom.profileBioInput.value = state.profile?.bio || '';
    dom.removeProfileImage.checked = false;
    dom.profileImageInput.value = '';
    clearPreviewUrl('avatar');
    dom.profileImagePreview.hidden = !state.profile?.avatar_url;
    dom.profileImagePreview.innerHTML = state.profile?.avatar_url
      ? `<img src="${escapeHtml(state.profile.avatar_url)}" alt="Current avatar" class="post-image">`
      : '';
    dom.profileEditModal.hidden = false;
  }

  function handleProfileImageSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      clearPreviewUrl('avatar');
      dom.profileImagePreview.hidden = true;
      dom.profileImagePreview.innerHTML = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      showToast('Profile photos must be 180KB or smaller.', 'error');
      event.target.value = '';
      clearPreviewUrl('avatar');
      dom.profileImagePreview.hidden = true;
      dom.profileImagePreview.innerHTML = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPreviewUrl('avatar', previewUrl);
    dom.profileImagePreview.hidden = false;
    dom.profileImagePreview.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Selected profile preview" class="post-image">`;
    dom.removeProfileImage.checked = false;
  }

  async function handleProfileEditSubmit(event) {
    event.preventDefault();

    if (!requireUserSession('editing your profile')) {
      return;
    }

    let avatarUrl = state.profile?.avatar_url || null;
    const removeAvatar = dom.removeProfileImage.checked;
    const avatarFile = dom.profileImageInput.files?.[0];

    if (removeAvatar) {
      avatarUrl = null;
    } else if (avatarFile) {
      if (avatarFile.size > MAX_AVATAR_BYTES) {
        showToast('Profile photos must be 180KB or smaller.', 'error');
        return;
      }

      const uploadResult = await uploadFile(avatarFile, 'avatars');
      if (uploadResult.error) {
        const inlineAvatarResult = await convertImageToDataUrl(avatarFile);
        if (inlineAvatarResult.error) {
          showToast(humanizeError(uploadResult.error), 'error');
          return;
        }
        avatarUrl = inlineAvatarResult.dataUrl;
      } else {
        avatarUrl = uploadResult.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        bio: (dom.profileBioInput?.value || '').trim().slice(0, 160),
        avatar_url: avatarUrl,
      })
      .eq('id', state.user.id)
      .select('*')
      .single();

    if (error) {
      showToast(humanizeError(error), 'error');
      return;
    }

    state.profile = data;
    dom.profileEditModal.hidden = true;
    clearPreviewUrl('avatar');
    dom.profileImagePreview.hidden = true;
    dom.profileImagePreview.innerHTML = '';
    showToast('Profile updated.', 'success');
    await loadProfile(data.username, data.id);
  }

  async function openCreateModal() {
    if (!requireUserSession('creating posts')) {
      return;
    }

    dom.createModal.hidden = false;
    setCreateType('text');
  }

  function setCreateType(type) {
    const normalizedType = ['text', 'image', 'reel'].includes(type) ? type : 'text';
    document.querySelectorAll('[data-create-type]').forEach((button) => {
      button.classList.toggle('active', button.dataset.createType === normalizedType);
    });
    dom.textFields.hidden = normalizedType !== 'text';
    dom.imageFields.hidden = normalizedType !== 'image';
    dom.reelFields.hidden = normalizedType !== 'reel';
  }

  async function handleCreatePost(event) {
    event.preventDefault();

    if (!requireUserSession('creating posts')) {
      return;
    }

    const type = document.querySelector('[data-create-type].active')?.dataset.createType || 'text';
    let payload = {
      user_id: state.user.id,
      type,
      category: null,
      caption: null,
      content: null,
      image_url: null,
      media_url: null,
    };

    if (type === 'text') {
      const content = dom.textPostBody?.value.trim() || '';
      if (!content) {
        showToast('Write something before publishing a text post.', 'error');
        return;
      }
      payload.category = dom.textCategory?.value || null;
      payload.content = content;
      payload.caption = content;
    }

    if (type === 'image') {
      const imageFile = dom.imageInput?.files?.[0];
      if (!imageFile) {
        showToast('Choose an image before publishing.', 'error');
        return;
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        showToast('Images must be 200KB or smaller.', 'error');
        return;
      }
      const uploadResult = await uploadFile(imageFile, 'post-images');
      if (uploadResult.error) {
        if (isBucketMissingError(uploadResult.error)) {
          const inlineImageResult = await convertImageToDataUrl(imageFile);
          if (inlineImageResult.error) {
            showToast(humanizeError(inlineImageResult.error), 'error');
            return;
          }
          payload.image_url = inlineImageResult.dataUrl;
        } else {
          showToast(humanizeError(uploadResult.error), 'error');
          return;
        }
      } else {
        payload.image_url = uploadResult.publicUrl;
      }
      payload.caption = dom.imageCaption?.value.trim() || null;
    }

    if (type === 'reel') {
      if (state.capabilities.reelsAvailable === false) {
        showToast('Reels are not supported by this deployment yet.', 'info');
        return;
      }

      const reelFile = dom.reelInput?.files?.[0];
      if (!reelFile) {
        showToast('Choose a reel before publishing.', 'error');
        return;
      }
      if (reelFile.size > MAX_REEL_BYTES) {
        showToast('Reels must be 1MB or smaller.', 'error');
        return;
      }
      let durationSeconds = 0;
      try {
        durationSeconds = await readVideoDuration(reelFile);
      } catch (error) {
        showToast(humanizeError(error), 'error');
        return;
      }
      if (durationSeconds > MAX_REEL_DURATION_SECONDS) {
        showToast(`Reels must be ${MAX_REEL_DURATION_SECONDS} seconds or shorter.`, 'error');
        return;
      }
      const uploadResult = await uploadFile(reelFile, 'reel-videos');
      if (uploadResult.error) {
        showToast(humanizeError(uploadResult.error), 'error');
        return;
      }
      payload.caption = dom.reelCaption?.value.trim() || null;
      payload.media_url = uploadResult.publicUrl;
    }

    const insertResult = await insertPostWithCompatibility(payload);
    if (!insertResult.ok) {
      showToast(humanizeError(insertResult.error), 'error');
      return;
    }

    resetCreateForm();
    dom.createModal.hidden = true;
    showToast('Post published successfully.', 'success');
    await loadHomeFeed(true);
  }

  async function uploadFile(file, bucket) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ownerPrefix = state.user?.id || 'public';
    const filePath = `${ownerPrefix}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      return { error };
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { publicUrl: publicUrlData.publicUrl };
  }

  async function convertImageToDataUrl(file) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return { dataUrl };
    } catch (error) {
      return { error };
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Image fallback conversion failed.'));
      reader.readAsDataURL(file);
    });
  }

  function readVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
        URL.revokeObjectURL(objectUrl);
        resolve(durationSeconds);
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read reel metadata.'));
      };
      video.src = objectUrl;
    });
  }

  function handleImageSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      clearPreviewUrl('image');
      dom.imagePreview.hidden = true;
      dom.imagePreview.innerHTML = '';
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      dom.imageHint.textContent = 'That image is too large. Keep it at 200KB or smaller.';
      clearPreviewUrl('image');
      dom.imagePreview.hidden = true;
      dom.imagePreview.innerHTML = '';
      return;
    }

    dom.imageHint.textContent = 'Image is ready to upload.';
    dom.imagePreview.hidden = false;
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrl('image', previewUrl);
    dom.imagePreview.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Selected image preview" class="post-image">`;
  }

  async function handleReelSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      clearPreviewUrl('reel');
      dom.reelPreview.hidden = true;
      dom.reelPreview.innerHTML = '';
      return;
    }

    if (file.size > MAX_REEL_BYTES) {
      dom.reelHint.textContent = 'That reel is too large. Keep it at 1MB or smaller.';
      clearPreviewUrl('reel');
      dom.reelPreview.hidden = true;
      dom.reelPreview.innerHTML = '';
      return;
    }

    let durationSeconds = 0;
    try {
      durationSeconds = await readVideoDuration(file);
    } catch (error) {
      dom.reelHint.textContent = humanizeError(error);
      event.target.value = '';
      clearPreviewUrl('reel');
      dom.reelPreview.hidden = true;
      dom.reelPreview.innerHTML = '';
      return;
    }
    if (durationSeconds > MAX_REEL_DURATION_SECONDS) {
      dom.reelHint.textContent = `That reel is too long. Keep it at ${MAX_REEL_DURATION_SECONDS} seconds or shorter.`;
      event.target.value = '';
      clearPreviewUrl('reel');
      dom.reelPreview.hidden = true;
      dom.reelPreview.innerHTML = '';
      return;
    }

    dom.reelHint.textContent = 'Reel is ready to upload.';
    dom.reelPreview.hidden = false;
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrl('reel', previewUrl);
    dom.reelPreview.innerHTML = `<video controls src="${escapeHtml(previewUrl)}" class="reel-video"></video>`;
  }

  function resetCreateForm() {
    dom.createForm?.reset();
    clearPreviewUrl('image');
    clearPreviewUrl('reel');
    dom.imagePreview.hidden = true;
    dom.reelPreview.hidden = true;
    dom.imagePreview.innerHTML = '';
    dom.reelPreview.innerHTML = '';
    dom.imageHint.textContent = 'Images are compressed on-device and on the server to stay under 200KB.';
    dom.reelHint.textContent = 'Reels must be 1MB or smaller and 30 seconds or less.';
    setCreateType('text');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      return;
    }

    modal.hidden = true;
    if (modalId === 'createModal') {
      resetCreateForm();
    }
    if (modalId === 'commentsModal') {
      state.currentCommentPostId = null;
      dom.commentInput.value = '';
    }
    if (modalId === 'profileEditModal') {
      clearPreviewUrl('avatar');
      dom.profileImagePreview.hidden = true;
      dom.profileImagePreview.innerHTML = '';
      dom.profileEditForm?.reset();
    }
  }

  async function subscribeRealtime() {
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      return;
    }

    if (!state.realtimeSubscribed.base) {
      supabase
        .channel('instajoy-posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
          if (state.activeView === 'home') {
            loadHomeFeed(true);
          }
          if (state.activeView === 'reels') {
            loadReelsFeed(true);
          }
        })
        .subscribe();

      supabase
        .channel('instajoy-comments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
          const postId = payload.new?.post_id || payload.old?.post_id;
          if (state.currentCommentPostId && postId === state.currentCommentPostId) {
            loadComments(state.currentCommentPostId);
          }
        })
        .subscribe();

      state.realtimeSubscribed.base = true;
    }

    if (state.authMode !== 'user' || !state.user || state.realtimeSubscribed.userId === state.user.id) {
      return;
    }

    supabase
      .channel(`instajoy-messages-${state.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${state.user.id}`,
        },
        async () => {
          await loadConversations(true);
        }
      )
      .subscribe();

    supabase
      .channel(`instajoy-notifications-${state.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${state.user.id}`,
        },
        async () => {
          if (state.activeView === 'notifications') {
            await loadNotifications();
          }
        }
      )
      .subscribe();

    state.realtimeSubscribed.userId = state.user.id;
  }

  async function attemptRegisterFcmToken() {
    if (!window.INSTAJOY_FCM || state.authMode !== 'user' || !state.user) {
      return;
    }

    if (state.capabilities.profilesTable === 'missing') {
      return;
    }

    try {
      const permission = await window.INSTAJOY_FCM.requestPermission();
      if (!permission) {
        return;
      }

      const token = await window.INSTAJOY_FCM.getFcmToken();
      if (!token) {
        return;
      }

      const { error } = await supabase.from('profiles').update({ fcm_token: token }).eq('id', state.user.id);
      if (error) {
        console.warn('FCM token registration failed', error.message);
      }
    } catch (error) {
      console.warn('FCM bootstrap failed', error);
    }
  }

  function requireUserSession(actionName) {
    if (state.authMode === 'user' && state.user) {
      return true;
    }

    showToast(`Login required for ${actionName}. Guest mode is view-only.`, 'info');
    return false;
  }

  async function selectPostsWithAuthors(rangeStart, rangeEnd) {
    if (state.authMode === 'user' && state.user) {
      // Use the new Instagram-grade Smart Feed Algorithm
      const hour = new Date().getHours();
      const sessionContext = (hour >= 20 || hour <= 4) ? 'night' : 'general';
      const limit = rangeEnd - rangeStart;
      
      const { data, error } = await supabase.rpc('get_smart_feed', { viewer_id: state.user.id, limit_count: limit, offset_count: rangeStart, session_context: sessionContext });
      if (!error && data) return { data, error: null }; // Fallback to standard if fails
    }
    return runPostQueryPlan({ mode: 'feed', limit: rangeEnd - rangeStart, offset: rangeStart });
  }

  async function selectSearchedPosts(query) {
    return runPostQueryPlan({ mode: 'search', query, limit: 15 });
  }

  async function selectReelsWithAuthors() {
    return runPostQueryPlan({ mode: 'reels', limit: 18 });
  }

  async function selectCommentsWithAuthors(postId) {
    const joinedResult = await supabase
      .from('comments')
      .select('id, body, created_at, user_id, profiles(username, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!joinedResult.error) {
      state.capabilities.profilesTable = 'available';
      return joinedResult;
    }

    if (!isMissingProfilesTableError(joinedResult.error)) {
      return joinedResult;
    }

    state.capabilities.profilesTable = 'missing';
    return supabase
      .from('comments')
      .select('id, body, created_at, user_id')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
  }

  async function selectPostsByUser(userId) {
    return runPostQueryPlan({ mode: 'profile', userId, limit: 30 });
  }

  async function runPostQueryPlan(options) {
    const variants = buildPostQueryVariants(options);
    let lastRecoverableError = null;

    for (const variant of variants) {
      const result = await executePostQueryVariant(variant, options);
      if (!result.error) {
        applyPostSchemaVariant(variant.name);
        return { data: result.data || [], error: null };
      }

      if (isRecoverablePostSelectError(result.error)) {
        if (isMissingProfilesTableError(result.error)) {
          state.capabilities.profilesTable = 'missing';
        }
        lastRecoverableError = result.error;
        continue;
      }

      return result;
    }

    return { data: [], error: lastRecoverableError };
  }

  function buildPostQueryVariants(options) {
    const baseVariants = [
      {
        name: 'modern_joined',
        select: 'id, user_id, type, category, caption, content, image_url, media_url, created_at, profiles(username, avatar_url)',
        searchMode: 'caption_content',
        localReelFilter: false,
      },
      {
        name: 'modern_plain',
        select: 'id, user_id, type, category, caption, content, image_url, media_url, created_at',
        searchMode: 'caption_content',
        localReelFilter: false,
      },
      {
        name: 'legacy_media_joined',
        select: 'id, user_id, caption, content, image_url, media_url, created_at, profiles(username, avatar_url)',
        searchMode: 'caption_content',
        localReelFilter: true,
      },
      {
        name: 'legacy_media_plain',
        select: 'id, user_id, caption, content, image_url, media_url, created_at',
        searchMode: 'caption_content',
        localReelFilter: true,
      },
      {
        name: 'legacy_content_joined',
        select: 'id, user_id, caption, content, image_url, created_at, profiles(username, avatar_url)',
        searchMode: 'caption_content',
        localReelFilter: true,
      },
      {
        name: 'legacy_content_plain',
        select: 'id, user_id, caption, content, image_url, created_at',
        searchMode: 'caption_content',
        localReelFilter: true,
      },
      {
        name: 'legacy_caption_joined',
        select: 'id, user_id, caption, image_url, created_at, profiles(username, avatar_url)',
        searchMode: 'caption_only',
        localReelFilter: true,
      },
      {
        name: 'legacy_caption_plain',
        select: 'id, user_id, caption, image_url, created_at',
        searchMode: 'caption_only',
        localReelFilter: true,
      },
    ];

    if (options.mode === 'reels') {
      return baseVariants.filter((variant) => variant.name.includes('modern') || variant.name.includes('legacy_media'));
    }

    return baseVariants;
  }

  async function executePostQueryVariant(variant, options) {
    let query = supabase.from('posts').select(variant.select).order('created_at', { ascending: false });

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options.mode === 'search') {
      if (variant.searchMode === 'caption_content') {
        query = query.or(`caption.ilike.%${options.query}%,content.ilike.%${options.query}%`);
      } else {
        query = query.ilike('caption', `%${options.query}%`);
      }
    }

    if (options.mode === 'reels' && !variant.localReelFilter) {
      query = query.eq('type', 'reel');
    }

    if (options.mode === 'feed') {
      query = query.range(options.rangeStart, options.rangeEnd);
    } else {
      const requestedLimit = options.mode === 'reels' && variant.localReelFilter
        ? Math.max((options.limit || 12) * 3, 30)
        : (options.limit || 15);
      query = query.limit(requestedLimit);
    }

    const result = await query;
    if (result.error || !result.data) {
      return result;
    }

    let data = result.data.map(normalizePostRecord);
    if (options.mode === 'reels') {
      data = data.filter((post) => post.type === 'reel').slice(0, options.limit || 12);
    }

    return { data, error: null };
  }

  function applyPostSchemaVariant(variantName) {
    if (variantName.includes('modern')) {
      state.capabilities.postsSchema = 'modern';
      state.capabilities.reelsAvailable = true;
    } else if (variantName.includes('legacy_media')) {
      state.capabilities.postsSchema = 'legacy_media';
      state.capabilities.reelsAvailable = true;
    } else if (variantName.includes('legacy_content')) {
      state.capabilities.postsSchema = 'legacy_content';
      state.capabilities.reelsAvailable = false;
    } else {
      state.capabilities.postsSchema = 'legacy_caption';
      state.capabilities.reelsAvailable = false;
    }

    if (variantName.endsWith('_joined')) {
      state.capabilities.profilesTable = 'available';
    } else if (variantName.endsWith('_plain')) {
      state.capabilities.profilesTable = 'missing';
    }
  }

  function normalizePostRecord(post) {
    const normalized = { ...(post || {}) };
    normalized.caption = normalized.caption || normalized.content || '';
    normalized.content = normalized.content || normalized.caption || '';
    normalized.image_url = normalized.image_url || null;
    normalized.media_url = normalized.media_url || null;
    normalized.category = typeof normalized.category === 'string' && normalized.category.trim() ? normalized.category : null;
    normalized.type = resolvePostType(normalized);
    return normalized;
  }

  function resolvePostType(post) {
    if (post?.type === 'reel' || post?.type === 'image' || post?.type === 'text') {
      return post.type;
    }

    if (post?.media_url) {
      return 'reel';
    }

    if (post?.image_url) {
      return 'image';
    }

    return 'text';
  }

  async function renderLegacyProfileFallback(userId, username) {
    const targetUserId = userId || state.user?.id || null;
    const isOwner = Boolean(targetUserId && state.user?.id === targetUserId);

    state.profileUserId = targetUserId;
    state.profileUsername = isOwner ? (state.profile?.username || username || null) : (username || null);

    if (!targetUserId) {
      dom.profileSummary.innerHTML = `
        <div class="empty-state">
          Profile details are unavailable in this deployment.
        </div>
      `;
      dom.profileGrid.innerHTML = '';
      return;
    }

    const postsResult = await selectPostsByUser(targetUserId);
    if (postsResult.error) {
      dom.profileSummary.innerHTML = `<div class="empty-state">${escapeHtml(humanizeError(postsResult.error))}</div>`;
      dom.profileGrid.innerHTML = '';
      return;
    }

    const posts = (postsResult.data || []).map(normalizePostRecord);
    const displayName = isOwner
      ? (state.profile?.display_name || state.profile?.username || state.user?.user_metadata?.display_name || state.user?.email?.split('@')[0] || 'You')
      : (username || 'Member');
    const subtitle = isOwner
      ? `@${escapeHtml(state.profile?.username || normalizeUsername(displayName) || 'member')}`
      : 'Limited profile view';
    const note = isOwner
      ? 'Your account is working in compatibility mode because the public profiles table is missing.'
      : 'This profile is shown in compatibility mode because public profile records are unavailable.';

    dom.profileSummary.innerHTML = `
      <div class="profile-header">
        <img src="${escapeHtml(DEFAULT_AVATAR)}" alt="${escapeHtml(displayName)}" class="avatar-large">
        <div class="profile-copy">
          <h2>${escapeHtml(displayName)}</h2>
          <div class="post-meta">${subtitle}</div>
          <p>${note}</p>
        </div>
      </div>
      <div class="profile-stats-inline">
        <span><strong>${posts.length}</strong> posts</span>
      </div>
    `;

    dom.profileGrid.innerHTML = posts.length ? posts.map(renderPostCard).join('') : '<div class="empty-state">No posts on this profile yet.</div>';
    prepareAutoPlayVideos(dom.profileGrid);
  }

  async function insertPostWithCompatibility(payload) {
    const variants = buildPostInsertVariants(payload);
    let lastError = null;

    for (const variant of variants) {
      const { error } = await supabase.from('posts').insert(variant);
      if (!error) {
        rememberPostInsertVariant(variant);
        return { ok: true };
      }

      if (isRecoverablePostInsertError(error, payload.type, variant)) {
        lastError = error;
        continue;
      }

      return { ok: false, error };
    }

    return { ok: false, error: lastError || new Error('Post could not be created.') };
  }

  function buildPostInsertVariants(payload) {
    if (payload.type === 'text') {
      const text = payload.content || payload.caption || '';
      return [
        { user_id: payload.user_id, type: 'text', category: payload.category, content: text, caption: text },
        { type: 'text', category: payload.category, content: text, caption: text },
        { user_id: payload.user_id, type: 'text', content: text, caption: text },
        { type: 'text', content: text, caption: text },
        { user_id: payload.user_id, content: text, caption: text },
        { content: text, caption: text },
        { user_id: payload.user_id, caption: text },
        { caption: text },
      ];
    }

    if (payload.type === 'image') {
      return [
        { user_id: payload.user_id, type: 'image', caption: payload.caption, image_url: payload.image_url },
        { type: 'image', caption: payload.caption, image_url: payload.image_url },
        { user_id: payload.user_id, caption: payload.caption, image_url: payload.image_url },
        { caption: payload.caption, image_url: payload.image_url },
      ];
    }

    return [
      { user_id: payload.user_id, type: 'reel', caption: payload.caption, media_url: payload.media_url },
      { type: 'reel', caption: payload.caption, media_url: payload.media_url },
      { user_id: payload.user_id, caption: payload.caption, media_url: payload.media_url },
      { caption: payload.caption, media_url: payload.media_url },
    ];
  }

  function rememberPostInsertVariant(variant) {
    if (Object.prototype.hasOwnProperty.call(variant, 'media_url')) {
      state.capabilities.reelsAvailable = true;
    }

    if (Object.prototype.hasOwnProperty.call(variant, 'type')) {
      state.capabilities.postsSchema = state.capabilities.postsSchema === 'unknown' ? 'modern' : state.capabilities.postsSchema;
    } else if (Object.prototype.hasOwnProperty.call(variant, 'content')) {
      state.capabilities.postsSchema = 'legacy_content';
    } else {
      state.capabilities.postsSchema = 'legacy_caption';
    }
  }

  function isRecoverablePostSelectError(error) {
    return isMissingProfilesTableError(error)
      || isMissingPostColumnError(error, 'type')
      || isMissingPostColumnError(error, 'category')
      || isMissingPostColumnError(error, 'content')
      || isMissingPostColumnError(error, 'media_url');
  }

  function isRecoverablePostInsertError(error, postType, variant) {
    if (isMissingPostColumnError(error, 'type') || isMissingPostColumnError(error, 'category') || isMissingPostColumnError(error, 'content')) {
      return true;
    }

    if (isPostOwnershipCompatibilityError(error, variant)) {
      return true;
    }

    if (isMissingPostColumnError(error, 'media_url')) {
      state.capabilities.reelsAvailable = false;
      return postType === 'reel' && Object.prototype.hasOwnProperty.call(variant, 'type');
    }

    if (isMissingPostColumnError(error, 'image_url')) {
      return postType === 'image' && Object.prototype.hasOwnProperty.call(variant, 'type');
    }

    return false;
  }

  function isPostOwnershipCompatibilityError(error, variant) {
    const message = String(error?.message || '').toLowerCase();
    const hasExplicitUserId = Object.prototype.hasOwnProperty.call(variant, 'user_id');

    if (hasExplicitUserId) {
      if (isMissingProfilesTableError(error)) {
        return true;
      }

      if ((message.includes('foreign key') || message.includes('violates foreign key')) && (message.includes('profiles') || message.includes('user_id'))) {
        return true;
      }

      if ((message.includes('row-level security') || message.includes('violates row-level security')) && message.includes('user_id')) {
        return true;
      }
    }

    if (!hasExplicitUserId) {
      if ((message.includes('null value') || message.includes('not-null')) && message.includes('user_id')) {
        return true;
      }

      if ((message.includes('row-level security') || message.includes('violates row-level security')) && message.includes('user_id')) {
        return true;
      }
    }

    return false;
  }

  function isMissingPostColumnError(error, columnName) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes(`column posts.${columnName}`) && message.includes('does not exist');
  }

  function isBucketMissingError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('bucket not found') || message.includes('the resource was not found') && message.includes('bucket');
  }

  function deriveAuthor(record) {
    if (record?.profiles) {
      return record.profiles;
    }

    if (record?.user_id && state.user?.id && record.user_id === state.user.id) {
      return {
        username: state.profile?.username || state.user?.user_metadata?.username || state.user?.email?.split('@')[0] || 'you',
        avatar_url: state.profile?.avatar_url || DEFAULT_AVATAR,
      };
    }

    return {
      username: 'member',
      avatar_url: DEFAULT_AVATAR,
    };
  }

  function setPreviewUrl(kind, nextUrl) {
    clearPreviewUrl(kind);
    state.previewUrls[kind] = nextUrl || '';
  }

  function clearPreviewUrl(kind) {
    const previousUrl = state.previewUrls[kind];
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    state.previewUrls[kind] = '';
  }

  function prepareAutoPlayVideos(container) {
    if (!container || typeof IntersectionObserver === 'undefined') {
      return;
    }

    if (!videoObserver) {
      videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target;
            if (!(video instanceof HTMLVideoElement)) {
              return;
            }

            if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
              video.play().catch(() => {});
              // Track deep watch engagement intent if playing for a while
              video.dataset.watchStart = Date.now();
              return;
            }

            video.pause();
            if (video.dataset.watchStart && state.authMode === 'user') {
               const watchedMs = Date.now() - parseInt(video.dataset.watchStart, 10);
               // If watched more than 5 seconds, log a strong positive signal
               if (watchedMs > 5000 && video.closest('.post-card')) {
                 const pid = video.closest('.post-card').dataset.postId;
                 if (pid) supabase.rpc('log_interaction', { p_post_id: pid, p_interaction: 'watch_full' }).catch(()=>{});
               }
               delete video.dataset.watchStart;
            }
          });
        },
        {
          threshold: [0.2, 0.72],
          rootMargin: '120px 0px',
        }
      );
    }

    container.querySelectorAll('[data-auto-play-video]').forEach((video) => {
      videoObserver.observe(video);
    });
  }

  function truncateText(value, maxLength) {
    const normalized = String(value || '');
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
  }

  function formatMessageTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'just now';
    }

    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function updateTopbarAction() {
    if (!dom.topbarAction) {
      return;
    }

    if (state.activeView === 'auth') {
      dom.topbarAction.textContent = 'Back';
      return;
    }

    if (state.authMode === 'guest') {
      dom.topbarAction.textContent = 'Exit Guest';
      return;
    }

    if (state.activeView === 'notifications') {
      dom.topbarAction.textContent = 'Read all';
      return;
    }

    if (state.activeView === 'search') {
      dom.topbarAction.textContent = 'Clear';
      return;
    }

    if (state.activeView === 'messages') {
      dom.topbarAction.textContent = 'Refresh';
      return;
    }

    if (state.activeView === 'profile' && state.user?.id === state.profileUserId) {
      dom.topbarAction.textContent = 'Edit';
      return;
    }

    dom.topbarAction.textContent = 'Refresh';
  }

  function updateWriteAccessUi() {
    if (!dom.openCreateButton) {
      return;
    }

    const isGuest = state.authMode !== 'user';
    dom.openCreateButton.disabled = isGuest;
    dom.openCreateButton.title = isGuest ? 'Login to create posts.' : 'Create a new post';
  }

  function getViewSubtitle(viewName) {
    if (viewName === 'home') return state.authMode === 'guest' ? 'Home - Guest' : 'Home';
    if (viewName === 'reels') return 'Reels';
    if (viewName === 'search') return 'Search';
    if (viewName === 'notifications') return 'Alerts';
    if (viewName === 'profile') return 'Profile';
    if (viewName === 'messages') return 'Messages';
    if (viewName === 'auth') return 'Login';
    return 'instaJOY';
  }

  function normalizeUsername(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9._]/g, '')
      .slice(0, 30);
  }

  function isValidUsername(value) {
    return /^[a-z0-9._]{3,30}$/.test(value);
  }

  function isMissingProfilesTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const hint = String(error?.hint || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    const combined = `${message} ${details} ${hint}`;

    return combined.includes('schema cache')
      || combined.includes('public.profiles')
      || combined.includes(' relation "profiles" ')
      || combined.includes(` relation "public.profiles" `)
      || combined.includes('could not find the table')
      || combined.includes('could not find a relationship')
      || (combined.includes('profiles') && (combined.includes('does not exist') || combined.includes('not found')))
      || code === '42p01'
      || code === 'pgrst200'
      || code === 'pgrst205';
  }

  function isProfilesSetupCompatibilityError(error) {
    if (isMissingProfilesTableError(error)) {
      return true;
    }

    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const hint = String(error?.hint || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    const combined = `${message} ${details} ${hint}`;

    return code === '42501'
      || combined.includes('permission denied for table profiles')
      || combined.includes('violates row-level security')
      || combined.includes('row-level security policy')
      || combined.includes('new row violates row-level security policy for table "profiles"')
      || combined.includes('infinite recursion detected in policy for relation "profiles"');
  }

  function humanizeProfileError(error, attemptedUsername) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('duplicate key') || message.includes('unique')) {
      return `The username "${attemptedUsername}" is already taken. Please choose another one.`;
    }
    return humanizeError(error);
  }

  function humanizeError(error) {
    const rawMessage = String(error?.message || error || 'Something went wrong.');
    const message = rawMessage.toLowerCase();

    if (error?.status === 429 || message.includes('rate limit')) {
      if (message.includes('email')) {
        return 'Too many signup emails were requested. Wait a minute before trying again.';
      }
      if (message.includes('signup')) {
        return 'Too many signup attempts were made. Wait a short moment before trying again.';
      }
      if (message.includes('login')) {
        return 'Too many login attempts were made. Wait a short moment before trying again.';
      }
      return 'Too many requests were made. Please wait a moment and try again.';
    }

    if (message.includes('invalid login credentials')) {
      return 'Incorrect email or password.';
    }

    if (message.includes('email not confirmed')) {
      return 'Please confirm your email before logging in.';
    }

    if (message.includes('user already registered')) {
      return 'An account with this email already exists. Try logging in instead.';
    }

    if (
      message.includes('schema cache')
      || message.includes('public.profiles')
      || message.includes('relation "profiles" does not exist')
      || message.includes('permission denied for table profiles')
      || message.includes('row-level security policy')
      || message.includes('infinite recursion detected in policy for relation "profiles"')
    ) {
      return 'Your Supabase public profile setup is incomplete. Apply the latest file in supabase/migrations or supabase/schema.sql, then refresh the app.';
    }

    if (message.includes('column posts.type') && message.includes('does not exist')) {
      return 'This deployment is using an older posts table. The app has switched to compatibility mode for the feed.';
    }

    if (message.includes('column posts.media_url') && message.includes('does not exist')) {
      return 'Reels are not supported by this deployment yet.';
    }

    if (message.includes('relation "public.messages" does not exist') || message.includes('relation "messages" does not exist')) {
      return 'Messaging is not configured yet. Apply the latest Supabase migration to create the messages table and policies.';
    }

    if (message.includes('column posts.content') && message.includes('does not exist')) {
      return 'This deployment stores text posts in a legacy format. Compatibility mode is active.';
    }

    if (message.includes('bucket not found')) {
      return 'Supabase storage is not fully configured for this deployment. The app will use inline image fallbacks where it can.';
    }

    if (message.includes('foreign key') && message.includes('profiles')) {
      return 'Posting is blocked because the linked profiles table is missing or not connected correctly in Supabase.';
    }

    if (message.includes('you cannot message yourself')) {
      return 'You cannot send a message to your own account.';
    }

    if (message.includes('you cannot follow yourself')) {
      return 'You cannot follow your own account.';
    }

    if (message.includes('row-level security') || message.includes('violates row-level security')) {
      return 'This action is blocked by Supabase security rules. Check that the required tables and RLS policies are applied.';
    }

    if (message.includes('storage') && message.includes('bucket')) {
      return 'Storage buckets are missing. Create the required Supabase buckets before uploading files.';
    }

    return rawMessage;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  function showToast(message, variant) {
    if (!dom.toastHost) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${variant || ''}`.trim();
    toast.textContent = message;
    dom.toastHost.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }
})();
