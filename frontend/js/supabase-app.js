(function () {
  const config = window.INSTAJOY_CONFIG || {};
  const supabase =
    window.supabaseClient ||
    (window.supabase && window.supabase.auth ? window.supabase : null) ||
    (window.supabase?.createClient ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null);

  const state = {
    authMode: 'guest',
    user: null,
    posts: [],
    reels: [],
    likedPostIds: new Set(),
    followingIds: new Set(),
    profileUsername: null,
    pageCursor: null,
    postLoading: false,
    reelLoading: false,
  };

  const dom = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheDom();
    bindEvents();
    await restoreSession();
    await renderApp();
    await subscribeRealtime();
  }

  function cacheDom() {
    dom.landingPage = document.getElementById('landingPage');
    dom.appShell = document.getElementById('appShell');
    dom.authView = document.getElementById('authView');
    dom.bottomNav = document.getElementById('bottomNav');
    dom.homeView = document.getElementById('homeView');
    dom.homeFeed = document.getElementById('homeFeed');
    dom.homeLoadMore = document.getElementById('homeLoadMore');
    dom.homeEmpty = document.getElementById('homeEmpty');
    dom.reelsView = document.getElementById('reelsView');
    dom.reelsFeed = document.getElementById('reelsFeed');
    dom.reelsLoadMore = document.getElementById('reelsLoadMore');
    dom.searchView = document.getElementById('searchView');
    dom.searchInput = document.getElementById('searchInput');
    dom.searchStatus = document.getElementById('searchStatus');
    dom.userSearchResults = document.getElementById('userSearchResults');
    dom.postSearchResults = document.getElementById('postSearchResults');
    dom.notificationsView = document.getElementById('notificationsView');
    dom.notificationsList = document.getElementById('notificationsList');
    dom.profileView = document.getElementById('profileView');
    dom.profileSummary = document.getElementById('profileSummary');
    dom.profileGrid = document.getElementById('profileGrid');
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
    dom.imageInput = document.getElementById('imageInput');
    dom.imagePreview = document.getElementById('imagePreview');
    dom.reelInput = document.getElementById('reelInput');
    dom.reelPreview = document.getElementById('reelPreview');
    dom.loginBtn = document.getElementById('loginBtn');
    dom.guestBtn = document.getElementById('guestBtn');
  }

  function bindEvents() {
    dom.loginBtn?.addEventListener('click', showAuthView);
    dom.guestBtn?.addEventListener('click', handleGuestMode);
    document.querySelectorAll('.nav-button[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => handleNav(btn.dataset.view));
    });
    dom.homeLoadMore?.addEventListener('click', () => loadHomeFeed(true));
    dom.reelsLoadMore?.addEventListener('click', () => loadReelsFeed(true));
    dom.searchInput?.addEventListener('input', debounce(handleSearch, 300));
    dom.openCreateButton?.addEventListener('click', openCreateModal);
    dom.createForm?.addEventListener('submit', handleCreatePost);
    dom.imageInput?.addEventListener('change', handleImageSelection);
    dom.reelInput?.addEventListener('change', handleReelSelection);
  }

  async function restoreSession() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (session && session.user) {
      state.authMode = 'user';
      state.user = session.user;
      await loadCurrentUserProfile();
      await attemptRegisterFcmToken();
    } else if (localStorage.getItem('authMode') === 'guest') {
      state.authMode = 'guest';
    } else {
      state.authMode = 'guest';
    }
  }

  async function renderApp() {
    if (state.authMode === 'guest' && !state.user) {
      showLanding();
      return;
    }

    dom.landingPage.hidden = true;
    dom.appShell.hidden = false;
    dom.bottomNav.hidden = false;
    renderView('home');
    await loadHomeFeed();
  }

  function showLanding() {
    dom.landingPage.hidden = false;
    dom.appShell.hidden = true;
  }

  function showAuthView() {
    dom.landingPage.hidden = true;
    dom.appShell.hidden = false;
    dom.bottomNav.hidden = true;
    dom.authView.hidden = false;
    dom.authView.innerHTML = renderAuthForms();
    bindAuthFormEvents();
  }

  function renderAuthForms() {
    return `
      <div class="auth-card">
        <div class="panel-header"><h3>Login or sign up</h3></div>
        <form id="supabaseLoginForm" class="form-stack">
          <label>Email<input id="loginEmail" type="email" autocomplete="email" required></label>
          <label>Password<input id="loginPassword" type="password" autocomplete="current-password" required></label>
          <button class="primary-button" type="submit">Login</button>
        </form>
        <div class="auth-divider">or</div>
        <form id="supabaseSignupForm" class="form-stack">
          <label>Username<input id="signupUsername" type="text" autocomplete="username" minlength="3" maxlength="30" required></label>
          <label>Email<input id="signupEmail" type="email" autocomplete="email" required></label>
          <label>Password<input id="signupPassword" type="password" autocomplete="new-password" minlength="6" required></label>
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
    submitButton?.setAttribute('disabled', 'disabled');

    try {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.status === 429) {
          showToast('Too many login attempts. Please wait 15 seconds and try again.', 'error');
        } else {
          showToast(error.message || 'Login failed. Check your credentials and try again.', 'error');
        }
        return;
      }

      if (data?.user) {
        state.authMode = 'user';
        state.user = data.user;
        localStorage.setItem('authMode', 'user');
        await loadCurrentUserProfile();
        await attemptRegisterFcmToken();
        showToast('Logged in successfully', 'success');
        renderView('home');
        await loadHomeFeed(true);
      }
    } finally {
      submitButton?.removeAttribute('disabled');
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form?.querySelector('button[type="submit"]');

    if (!submitButton) return;
    submitButton.setAttribute('disabled', 'disabled');

    try {
      const username = document.getElementById('signupUsername').value.trim().toLowerCase();
      const email = document.getElementById('signupEmail').value.trim();
      const password = document.getElementById('signupPassword').value;

      const pendingProfile = {
        id: null,
        username,
        display_name: username,
      };

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        if (error.status === 429) {
          showToast('Too many signup requests. Wait 15 seconds before trying again.', 'error');
        } else {
          showToast(error.message || 'Signup failed. Please try again.', 'error');
        }
        return;
      }

      if (!data?.user) {
        showToast('Signup succeeded but no user object was returned. Please check your email and sign in once your account is confirmed.', 'info');
        return;
      }

      pendingProfile.id = data.user.id;
      localStorage.setItem('pendingProfile', JSON.stringify(pendingProfile));

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        showToast('Account created. Confirm your email before signing in.', 'success');
        return;
      }

      state.authMode = 'user';
      state.user = session.user;
      localStorage.setItem('authMode', 'user');

      const profileInsert = await supabase.from('profiles').insert(pendingProfile);
      if (profileInsert.error) {
        showToast(profileInsert.error.message || 'Profile creation failed. Please try again.', 'error');
        return;
      }

      localStorage.removeItem('pendingProfile');
      await loadCurrentUserProfile();
      await attemptRegisterFcmToken();
      showToast('Account created. Welcome to instaJOY!', 'success');
      renderView('home');
      await loadHomeFeed(true);
    } finally {
      submitButton.removeAttribute('disabled');
    }
  }

  async function handleGuestMode() {
    state.authMode = 'guest';
    state.user = null;
    localStorage.setItem('authMode', 'guest');
    showToast('Guest mode enabled. Browse freely, write actions are disabled.', 'info');
    await renderApp();
  }

  async function loadCurrentUserProfile() {
    if (!state.user) return;

    const { data, error } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (!error && data) {
      state.user.profile = data;
      return;
    }

    const pendingProfileString = localStorage.getItem('pendingProfile');
    if (!pendingProfileString) return;

    let pendingProfile;
    try {
      pendingProfile = JSON.parse(pendingProfileString);
    } catch {
      return;
    }

    if (pendingProfile?.id !== state.user.id) return;

    const insertResult = await supabase.from('profiles').insert(pendingProfile);
    if (!insertResult.error) {
      state.user.profile = pendingProfile;
      localStorage.removeItem('pendingProfile');
    }
  }

  function handleNav(viewName) {
    renderView(viewName);
    if (viewName === 'home') {
      loadHomeFeed();
    } else if (viewName === 'reels') {
      loadReelsFeed();
    } else if (viewName === 'search') {
      renderSearchPlaceholder();
    } else if (viewName === 'notifications') {
      loadNotifications();
    } else if (viewName === 'profile') {
      loadProfile(state.user?.profile?.username || null);
    } else if (viewName === 'messages') {
      renderMessagesView();
    }
  }

  function renderView(viewName) {
    dom.brandSubtitle.textContent = viewName === 'home' ? 'Home' : viewName === 'reels' ? 'Reels' : viewName === 'search' ? 'Search' : viewName === 'notifications' ? 'Alerts' : viewName === 'profile' ? 'Profile' : viewName === 'messages' ? 'Messages' : 'instaJOY';
    ['authView', 'homeView', 'reelsView', 'searchView', 'notificationsView', 'profileView', 'messagesView'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = el.id !== `${viewName}View`;
      }
    });
    document.querySelectorAll('.nav-button[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
  }

  async function loadHomeFeed(reset) {
    if (state.postLoading) return;
    if (reset) {
      state.pageCursor = null;
      state.posts = [];
    }

    state.postLoading = true;
    dom.homeLoadMore.hidden = true;
    dom.homeEmpty.hidden = true;
    dom.homeFeed.innerHTML = '<div class="loading">Loading feed...</div>';

    const rangeStart = state.posts.length;
    const rangeEnd = rangeStart + 9;

    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(username, avatar_url)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(rangeStart, rangeEnd);

    state.postLoading = false;
    if (error) {
      showToast(error.message, 'error');
      if (state.authMode === 'guest') {
        dom.homeFeed.innerHTML = '<div class="empty-state">Guest mode is read-only. Login to see a live feed.</div>';
      }
      return;
    }

    state.posts = state.posts.concat(data || []);
    renderHomeFeed();
    dom.homeLoadMore.hidden = (data || []).length < 10;
  }

  function renderHomeFeed() {
    if (!dom.homeFeed) return;
    if (!state.posts.length) {
      dom.homeFeed.innerHTML = '<div class="empty-state">No posts yet — create the first moment.</div>';
      return;
    }

    dom.homeFeed.innerHTML = state.posts
      .map((post) => renderPostCard(post))
      .join('');
  }

  function renderPostCard(post) {
    const author = post.profiles || {};
    const createdAt = new Date(post.created_at).toLocaleString();
    const likeDisabled = state.authMode === 'guest';
    const liked = state.likedPostIds.has(post.id);
    const likeText = liked ? 'Unlike' : 'Like';

    return `
      <article class="card post-card">
        <header class="post-header">
          <div>
            <strong>${escapeHtml(author.username || 'anonymous')}</strong>
            <div class="post-meta">${createdAt}</div>
          </div>
          <button class="ghost-button" data-action="view-profile" data-username="${escapeHtml(author.username || '')}">Profile</button>
        </header>
        <div class="post-body">${escapeHtml(post.caption || post.content || '')}</div>
        ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" alt="Post image" loading="lazy" class="post-image">` : ''}
        <footer class="post-actions">
          <button class="secondary-button" data-action="toggle-like" data-post-id="${post.id}" ${likeDisabled ? 'disabled' : ''}>${likeText}</button>
          <button class="secondary-button" data-action="comment" data-post-id="${post.id}">Comment</button>
        </footer>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSearchPlaceholder() {
    if (!dom.searchStatus) return;
    dom.searchStatus.textContent = 'Start typing to search users and posts.';
    dom.userSearchResults.innerHTML = '';
    dom.postSearchResults.innerHTML = '';
  }

  async function handleSearch() {
    const query = dom.searchInput?.value.trim();
    if (!query || query.length < 2) {
      dom.searchStatus.textContent = 'Type at least 2 characters to search.';
      dom.userSearchResults.innerHTML = '';
      dom.postSearchResults.innerHTML = '';
      return;
    }

    dom.searchStatus.textContent = 'Searching...';

    const [usersResult, postsResult] = await Promise.all([
      supabase.from('profiles').select('id,username,avatar_url').ilike('username', `%${query}%`).limit(15),
      supabase.from('posts').select('*, profiles(username, avatar_url)').ilike('caption', `%${query}%`).or(`content.ilike.%${query}%`).order('created_at', { ascending: false }).limit(15),
    ]);

    if (usersResult.error || postsResult.error) {
      showToast('Search failed', 'error');
      return;
    }

    dom.searchStatus.textContent = `Found ${usersResult.data.length} users and ${postsResult.data.length} posts.`;
    dom.userSearchResults.innerHTML = usersResult.data
      .map((user) => `<article class="card compact-card"><button class="ghost-button" data-action="view-profile" data-username="${escapeHtml(user.username)}">${escapeHtml(user.username)}</button></article>`)
      .join('');
    dom.postSearchResults.innerHTML = postsResult.data.map((post) => renderPostCard(post)).join('');
  }

  async function loadReelsFeed(reset) {
    if (state.reelLoading) return;
    if (reset) {
      state.reels = [];
    }

    state.reelLoading = true;
    dom.reelsFeed.innerHTML = '<div class="loading">Loading reels...</div>';

    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(username, avatar_url)')
      .eq('type', 'reel')
      .order('created_at', { ascending: false })
      .limit(12);

    state.reelLoading = false;
    if (error) {
      showToast(error.message, 'error');
      return;
    }

    state.reels = data || [];
    dom.reelsFeed.innerHTML = state.reels.map(renderReelCard).join('');
  }

  function renderReelCard(reel) {
    const author = reel.profiles || {};
    return `
      <article class="card reel-card">
        <header class="post-header">
          <div>
            <strong>${escapeHtml(author.username || 'anonymous')}</strong>
            <div class="post-meta">${new Date(reel.created_at).toLocaleString()}</div>
          </div>
        </header>
        ${reel.media_url ? `<video controls preload="metadata" src="${escapeHtml(reel.media_url)}" class="reel-video"></video>` : ''}
        <div class="post-body">${escapeHtml(reel.caption || '')}</div>
      </article>
    `;
  }

  async function loadNotifications() {
    if (state.authMode === 'guest' || !state.user) {
      dom.notificationsList.innerHTML = '<div class="empty-state">Login to view your notifications.</div>';
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    dom.notificationsList.innerHTML = (data || [])
      .map((note) => `<article class="card compact-card"><strong>${escapeHtml(note.type)}</strong><p>${escapeHtml(note.message)}</p></article>`)
      .join('');
  }

  function renderMessagesView() {
    if (state.authMode === 'guest' || !state.user) {
      const messagesView = document.getElementById('messagesView');
      if (messagesView) {
        messagesView.innerHTML = '<div class="empty-state">Messages require login. Use the Login button to access chat.</div>';
      }
      return;
    }

    const messagesView = document.getElementById('messagesView');
    if (messagesView) {
      messagesView.innerHTML = '<div class="empty-state">Realtime chat is coming soon. This demo app supports the feed, profile, and notifications flows.</div>';
    }
  }

  async function loadProfile(username) {
    const targetUsername = username || state.user?.profile?.username;
    if (!targetUsername) {
      showToast('No profile selected', 'error');
      return;
    }

    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', targetUsername)
      .limit(1);

    if (userError || !users?.length) {
      showToast('Profile not found', 'error');
      return;
    }

    const profile = users[0];
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('*, profiles(username, avatar_url)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (postsError) {
      showToast(postsError.message, 'error');
      return;
    }

    dom.profileSummary.innerHTML = `
      <div class="profile-header">
        <img src="${escapeHtml(profile.avatar_url || 'ilogo.png')}" alt="${escapeHtml(profile.username)}" class="avatar-large">
        <div>
          <h2>${escapeHtml(profile.username)}</h2>
          <p>${escapeHtml(profile.bio || 'No bio yet')}</p>
        </div>
      </div>
    `;

    if (state.user && state.user.id !== profile.id) {
      const { data: follows } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', state.user.id)
        .eq('following_id', profile.id)
        .limit(1);

      const isFollowing = follows?.length > 0;
      dom.profileSummary.innerHTML += `<button class="primary-button" id="followToggleButton">${isFollowing ? 'Unfollow' : 'Follow'}</button>`;
      document.getElementById('followToggleButton')?.addEventListener('click', () => toggleFollow(profile.id, isFollowing));
    }

    dom.profileGrid.innerHTML = (posts || []).map(renderPostCard).join('');
  }

  async function toggleFollow(targetUserId, isFollowing) {
    if (state.authMode === 'guest' || !state.user) {
      showToast('Login to follow people', 'info');
      return;
    }

    if (isFollowing) {
      await supabase.from('follows').delete().match({ follower_id: state.user.id, following_id: targetUserId });
      showToast('Unfollowed', 'success');
    } else {
      await supabase.from('follows').insert({ follower_id: state.user.id, following_id: targetUserId });
      showToast('Followed', 'success');
    }

    loadProfile(state.profileUsername || state.user.profile.username);
  }

  async function openCreateModal() {
    if (state.authMode === 'guest') {
      showToast('Login required to create content', 'info');
      return;
    }

    dom.createModal.hidden = false;
  }

  async function handleCreatePost(event) {
    event.preventDefault();
    if (state.authMode === 'guest' || !state.user) {
      showToast('Login required to create posts', 'info');
      return;
    }

    const type = document.querySelector('[data-create-type].active')?.dataset.createType || 'text';
    const caption = document.getElementById('textPostBody')?.value.trim();
    const category = dom.textCategory?.value;
    const imageFile = dom.imageInput?.files?.[0] || null;
    const reelFile = dom.reelInput?.files?.[0] || null;

    let payload = {
      user_id: state.user.id,
      type,
      caption: caption || null,
      category: category || null,
    };

    if (type === 'image' && imageFile) {
      const uploadResult = await uploadFile(imageFile, 'post-images');
      if (uploadResult.error) {
        showToast(uploadResult.error.message || 'Image upload failed', 'error');
        return;
      }
      payload.image_url = uploadResult.publicUrl;
    }

    if (type === 'reel' && reelFile) {
      const uploadResult = await uploadFile(reelFile, 'reel-videos');
      if (uploadResult.error) {
        showToast(uploadResult.error.message || 'Reel upload failed', 'error');
        return;
      }
      payload.media_url = uploadResult.publicUrl;
    }

    const { error } = await supabase.from('posts').insert(payload);
    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Post published', 'success');
    dom.createModal.hidden = true;
    await loadHomeFeed(true);
  }

  async function uploadFile(file, bucket) {
    const filename = `${Date.now()}-${file.name}`;
    const filePath = `${bucket}/${filename}`;
    const { data, error } = await supabase.storage.from(bucket).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      return { error };
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { publicUrl: publicUrlData.publicUrl };
  }

  function handleImageSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    dom.imagePreview.hidden = false;
    dom.imagePreview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="preview" class="post-image">`;
  }

  function handleReelSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    dom.reelPreview.hidden = false;
    dom.reelPreview.innerHTML = `<video controls src="${URL.createObjectURL(file)}" class="reel-video"></video>`;
  }

  async function subscribeRealtime() {
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      return;
    }

    const postsChannel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        loadHomeFeed(true);
      })
      .subscribe();

    const likesChannel = supabase
      .channel('public:likes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
        if (state.user) {
          loadHomeFeed(true);
        }
      })
      .subscribe();

    await Promise.all([postsChannel, likesChannel]);
  }

  async function attemptRegisterFcmToken() {
    if (!window.INSTAJOY_FCM) return;
    const permission = await window.INSTAJOY_FCM.requestPermission();
    if (!permission) return;

    const token = await window.INSTAJOY_FCM.getFcmToken();
    if (!token || !state.user) return;

    const { error } = await supabase.from('profiles').update({ fcm_token: token }).eq('id', state.user.id);
    if (error) {
      console.warn('FCM token registration failed', error.message);
    }
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function showToast(message, variant) {
    const toast = document.createElement('div');
    toast.className = `toast ${variant || ''}`.trim();
    toast.textContent = message;
    dom.toastHost.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }
})();
