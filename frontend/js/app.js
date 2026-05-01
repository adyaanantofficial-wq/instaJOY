(function bootstrapInstaJOY() {
    const config = window.INSTAJOY_CONFIG || {};
    const API_BASE_URL = config.API_BASE_URL || '/api';
    const DEFAULT_AVATAR = config.DEFAULT_AVATAR || 'ilogo.png';
    const TOKEN_KEY = config.TOKEN_KEY || 'instajoy_access_token';
    const REFRESH_TOKEN_KEY = config.REFRESH_TOKEN_KEY || 'instajoy_refresh_token';
    const USER_KEY = config.USER_KEY || 'instajoy_user';
    const AUTH_STORAGE_KEY = 'INSTAJOY_AUTH_MODE';
    const MAX_IMAGE_BYTES = 200 * 1024;
    const MAX_REEL_BYTES = 1024 * 1024;
    const MAX_REEL_DURATION = 30;
    const MAX_AVATAR_BYTES = 180 * 1024;
    const TEXT_POST_CATEGORIES = ['jokes', 'ideas', 'fun-knowledge'];

    const state = {
        authMode: 'login',
        // `authState` tracks runtime mode: 'guest' or 'user' (stored in localStorage as `authMode`)
        authState: null,
        activeView: 'auth',
        session: {
            token: localStorage.getItem(TOKEN_KEY) || '',
            refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
            user: parseStoredUser(),
        },
        home: {
            items: [],
            cursor: null,
            hasMore: true,
            loading: false,
            mood: 'happy',
        },
        suggestions: {
            items: [],
            loading: false,
        },
        stories: {
            items: [],
            loading: false,
            lastRefreshed: null,
        },
        storyViewer: {
            activeIndex: 0,
            isOpen: false,
        },
        reels: {
            items: [],
            cursor: null,
            hasMore: true,
            loading: false,
        },
        search: {
            query: '',
            timer: null,
        },
        messages: {
            conversations: [],
            activeUser: null,
            threads: {},
        },
        notifications: [],
        profile: {
            username: null,
            data: null,
            posts: [],
            pendingImageData: null,
        },
        create: {
            type: 'text',
            imageData: null,
            imagePreviewUrl: '',
            reelFile: null,
            reelObjectUrl: '',
            reelDuration: 0,
        },
        comments: {
            targetType: '',
            targetId: '',
        },
    };

    const dom = {};
    let pagerObserver = null;
    let reelObserver = null;

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheDom();
        // Initialize auth mode: prefer session-scoped `INSTAJOY_AUTH_MODE`, fall back to legacy localStorage
        const storedMode = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem('authMode');
        const legacyGuest = (sessionStorage.getItem('guest') === 'true') || (localStorage.getItem('guest') === 'true');
        if (storedMode === 'guest' || legacyGuest) {
            state.authState = 'guest';
        } else if (storedMode === 'user') {
            state.authState = 'user';
        } else if (state.session.token) {
            state.authState = 'user';
        } else {
            state.authState = null; // Default to null to show landing page
        }
        
        renderAuthView();
        bindStaticEvents();
        renderMoodChips();
        updateMoodHeading();
        setupObservers();
        normalizeDemoMediaPaths();

        try {
            const hash = window.location.hash.replace(/^#/, '');
            const shouldShowAppFromHash = ['home', 'reels', 'search', 'messages', 'notifications', 'profile'].includes(hash)
                || hash.startsWith('post-')
                || hash.startsWith('profile-')
                || hash.startsWith('messages-');

            if (state.session.token && state.authState === 'user') {
                if (dom.landingPage) dom.landingPage.hidden = true;
                await hydrateSession();
                await enterAuthedApp(true);
            } else if (state.authState === 'guest') {
                // Guest mode: skip auth, go directly to home feed
                if (dom.landingPage) dom.landingPage.hidden = true;
                state.session.user = { id: 'guest', username: 'Guest User', avatar: DEFAULT_AVATAR };
                persistSession();
                await enterAuthedApp(true);
            } else if (shouldShowAppFromHash) {
                // Support direct links to home/reels/search while preserving guest preview mode.
                if (dom.landingPage) dom.landingPage.hidden = true;
                state.authState = 'guest';
                state.session.user = { id: 'guest', username: 'Guest User', avatar: DEFAULT_AVATAR };
                persistSession();
                await enterAuthedApp(true);
            } else {
                if (dom.landingPage) dom.landingPage.hidden = false;
                if (dom.appShell) dom.appShell.hidden = true;
            }
        } catch (error) {
            clearSession();
            if (dom.landingPage) dom.landingPage.hidden = false;
            if (dom.appShell) dom.appShell.hidden = true;
            showToast(error.message || 'Session expired. Please log in again.', 'error');
        } finally {
            window.setTimeout(() => {
                dom.splashScreen.classList.add('is-hidden');
            }, 420);
        }

        window.addEventListener('hashchange', async () => {
            if (state.session.token || isGuestMode()) {
                await resolveHashRoute();
            }
        });
    }

    function cacheDom() {
        dom.landingPage = document.getElementById('landingPage');
        dom.splashScreen = document.getElementById('splashScreen') || { classList: { add: () => {} } };
        dom.appShell = document.getElementById('appShell');
        dom.authView = document.getElementById('authView');
        dom.bottomNav = document.getElementById('bottomNav');
        dom.brandSubtitle = document.getElementById('brandSubtitle');
        dom.topbarAction = document.getElementById('topbarAction');
        dom.homeView = document.getElementById('homeView');
        dom.homeFeed = document.getElementById('homeFeed');
        dom.homeLoadMore = document.getElementById('homeLoadMore');
        dom.homeEmpty = document.getElementById('homeEmpty');
        dom.suggestionList = document.getElementById('suggestionList') || document.getElementById('suggestedFollowList');
        dom.refreshSuggestionsBtn = document.getElementById('refreshSuggestionsBtn') || document.querySelector('[data-action="refresh-suggestions"]');
        dom.storiesShell = document.getElementById('storiesShell') || document.getElementById('storiesStrip');
        dom.moodChipRow = document.getElementById('moodChipRow') || document.getElementById('moodSelector');
        dom.moodHeading = document.getElementById('moodHeading') || document.getElementById('moodLabel');
        dom.storyModal = document.getElementById('storyModal');
        dom.storyVideo = document.getElementById('storyVideo');
        dom.storyProgress = document.getElementById('storyProgress');
        dom.storyMetaAvatar = document.getElementById('storyMetaAvatar');
        dom.storyMetaUser = document.getElementById('storyMetaUser');
        dom.storyMetaTime = document.getElementById('storyMetaTime');
        dom.homeEmpty = document.getElementById('homeEmpty');
        dom.reelsView = document.getElementById('reelsView');
        dom.reelsFeed = document.getElementById('reelsFeed');
        dom.reelsLoadMore = document.getElementById('reelsLoadMore');
        dom.reelsEmpty = document.getElementById('reelsEmpty');
        dom.searchView = document.getElementById('searchView');
        dom.searchInput = document.getElementById('searchInput');
        dom.searchStatus = document.getElementById('searchStatus');
        dom.userSearchResults = document.getElementById('userSearchResults');
        dom.postSearchResults = document.getElementById('postSearchResults');
        dom.messagesView = document.getElementById('messagesView');
        dom.messagesRefresh = document.getElementById('messagesRefresh');
        dom.conversationList = document.getElementById('conversationList');
        dom.messageThread = document.getElementById('messageThread');
        dom.chatHeader = document.getElementById('chatHeader');
        dom.chatBackButton = document.getElementById('chatBackButton');
        dom.messageComposer = document.getElementById('messageComposer');
        dom.messageInput = document.getElementById('messageInput');
        dom.notificationsView = document.getElementById('notificationsView');
        dom.notificationsList = document.getElementById('notificationsList');
        dom.markAllNotifications = document.getElementById('markAllNotifications');
        dom.profileView = document.getElementById('profileView');
        dom.profileSummary = document.getElementById('profileSummary');
        dom.profileGrid = document.getElementById('profileGrid');
        dom.profileRefresh = document.getElementById('profileRefresh');
        dom.createModal = document.getElementById('createModal');
        dom.openCreateButton = document.getElementById('openCreateButton');
        dom.createForm = document.getElementById('createForm');
        dom.createSubmit = document.getElementById('createSubmit');
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
        dom.profileEditModal = document.getElementById('profileEditModal');
        dom.profileEditForm = document.getElementById('profileEditForm');
        dom.profileBioInput = document.getElementById('profileBioInput');
        dom.profileImageInput = document.getElementById('profileImageInput');
        dom.profileImagePreview = document.getElementById('profileImagePreview');
        dom.removeProfileImage = document.getElementById('removeProfileImage');
        dom.toastHost = document.getElementById('toastHost');
    }

    // ============================================
    // GUEST MODE HELPER & LANDING PAGE HANDLERS
    // ============================================
    
    function isGuestMode() {
        return state.authState === 'guest' || sessionStorage.getItem(AUTH_STORAGE_KEY) === 'guest' || localStorage.getItem('guest') === 'true';
    }

    function requireLogin(actionName) {
        if (isGuestMode()) {
            showToast(`Login required for ${actionName}. Guest mode allows viewing only.`, 'info');
            return false;
        }
        return true;
    }

    const GUEST_ENGAGEMENT_KEY = 'instajoy_guest_engagement_v1';
    const GUEST_COMMENTS_KEY = 'instajoy_guest_comments_v1';

    function readGuestEngagementMap() {
        try {
            return JSON.parse(sessionStorage.getItem(GUEST_ENGAGEMENT_KEY) || '{}');
        } catch (_) {
            return {};
        }
    }

    function writeGuestEngagementMap(map) {
        try {
            sessionStorage.setItem(GUEST_ENGAGEMENT_KEY, JSON.stringify(map || {}));
        } catch (_) {}
    }

    function persistGuestPostFields(postId, patch) {
        if (!postId || !patch) {
            return;
        }
        const map = readGuestEngagementMap();
        map[postId] = { ...(map[postId] || {}), ...patch };
        writeGuestEngagementMap(map);
    }

    function mergeGuestFieldsOntoPost(post) {
        if (!isGuestMode() || !post || !post.id) {
            return;
        }
        const o = readGuestEngagementMap()[post.id];
        if (!o || typeof o !== 'object') {
            return;
        }
        if (typeof o.isLiked === 'boolean') {
            post.isLiked = o.isLiked;
            post.liked = o.isLiked;
        }
        if (Number.isFinite(o.likeCount)) {
            post.likeCount = o.likeCount;
            post.likes = o.likeCount;
        }
        if (typeof o.isSaved === 'boolean') {
            post.isSaved = o.isSaved;
        }
        if (o.reactionType) {
            post.reactionType = o.reactionType;
        }
        if (Number.isFinite(o.commentCount)) {
            post.commentCount = o.commentCount;
            post.comments = o.commentCount;
        }
    }

    function applyGuestEngagementToFeedItems(items) {
        if (!isGuestMode() || !Array.isArray(items)) {
            return;
        }
        items.forEach(mergeGuestFieldsOntoPost);
    }

    function readGuestCommentStore() {
        try {
            return JSON.parse(sessionStorage.getItem(GUEST_COMMENTS_KEY) || '{}');
        } catch (_) {
            return {};
        }
    }

    function writeGuestCommentStore(store) {
        try {
            sessionStorage.setItem(GUEST_COMMENTS_KEY, JSON.stringify(store || {}));
        } catch (_) {}
    }

    function getGuestLocalComments(postId) {
        const store = readGuestCommentStore();
        return Array.isArray(store[postId]) ? store[postId] : [];
    }

    function appendGuestLocalComment(postId, text) {
        const store = readGuestCommentStore();
        const list = Array.isArray(store[postId]) ? store[postId] : [];
        const username = state.session.user?.username || 'You';
        list.push({
            id: `local-${Date.now()}`,
            text,
            createdAt: new Date().toISOString(),
            author: {
                username,
                profileImage: state.session.user?.profileImage || state.session.user?.avatar || DEFAULT_AVATAR,
            },
        });
        store[postId] = list;
        writeGuestCommentStore(store);
    }

    function mergeCommentLists(serverComments, localComments) {
        const merged = (serverComments || []).concat(localComments || []);
        merged.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        return merged;
    }
    
    function handleGuest() {
        // Switch to guest mode and clear any existing authenticated session
        setAuthMode('guest');
        clearSession();
        state.session.user = { id: 'guest', username: 'Guest User', avatar: DEFAULT_AVATAR };
        persistSession();
        
        if (dom.landingPage) dom.landingPage.hidden = true;
        enterAuthedApp(true);
    }

    function setAuthMode(mode) {
        state.authState = mode === 'user' ? 'user' : 'guest';
        try {
            sessionStorage.setItem(AUTH_STORAGE_KEY, state.authState);
            if (state.authState === 'guest') {
                sessionStorage.setItem('guest', 'true');
            } else {
                sessionStorage.removeItem('guest');
            }
        } catch (e) {
            // ignore storage errors
        }
    }

    function bindStaticEvents() {
        // Landing page buttons
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                if (dom.landingPage) dom.landingPage.hidden = true;
                showAuthView();
            });
        }
        document.getElementById('guestBtn')?.addEventListener('click', handleGuest);
        
        document.body.addEventListener('click', handleBodyClick);

        dom.topbarAction?.addEventListener('click', handleTopbarAction);
        dom.refreshSuggestionsBtn?.addEventListener('click', () => loadFriendSuggestions(true));
        dom.homeLoadMore?.addEventListener('click', () => loadHomeFeed());
        dom.reelsLoadMore?.addEventListener('click', () => loadReels());
        dom.messagesRefresh?.addEventListener('click', () => loadConversations(true));
        dom.markAllNotifications?.addEventListener('click', markAllNotificationsRead);
        if (dom.profileRefresh) {
            dom.profileRefresh.addEventListener('click', () => {
                if (state.profile.username) {
                    loadProfile(state.profile.username, true);
                }
            });
        }
        dom.openCreateButton?.addEventListener('click', openCreateModal);
        dom.createForm?.addEventListener('submit', handleCreateSubmit);
        dom.imageInput?.addEventListener('change', handleImageSelection);
        dom.reelInput?.addEventListener('change', handleReelSelection);
        dom.commentForm?.addEventListener('submit', handleCommentSubmit);
        dom.messageComposer?.addEventListener('submit', handleMessageSubmit);
        dom.searchInput?.addEventListener('input', handleSearchInput);
        dom.profileEditForm?.addEventListener('submit', handleProfileEditSubmit);
        dom.profileImageInput?.addEventListener('change', handleProfileImageSelection);
        if (dom.chatBackButton) {
            dom.chatBackButton.addEventListener('click', () => {
                state.messages.activeUser = null;
                renderConversations();
                renderActiveConversation();
            });
        }
    }

    function setupObservers() {
        if (dom.homeLoadMore || dom.reelsLoadMore) {
            pagerObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    if (entry.target === dom.homeLoadMore && state.activeView === 'home' && state.home.hasMore) {
                        loadHomeFeed();
                    }

                    if (entry.target === dom.reelsLoadMore && state.activeView === 'reels' && state.reels.hasMore) {
                        loadReels();
                    }
                });
            },
            { rootMargin: '320px 0px' }
        );

            if (dom.homeLoadMore) pagerObserver.observe(dom.homeLoadMore);
            if (dom.reelsLoadMore) pagerObserver.observe(dom.reelsLoadMore);
        }

        if (typeof IntersectionObserver !== 'undefined') {
            reelObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const video = entry.target;

                    if (!video || state.activeView !== 'reels') {
                        return;
                    }

                    if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
                        const playAttempt = video.play();
                        if (playAttempt && typeof playAttempt.catch === 'function') {
                            playAttempt.catch(() => {});
                        }
                    } else {
                        video.pause();
                    }
                });
            },
            { threshold: [0.12, 0.72] }
            );
        }
    }

    async function hydrateSession() {
        const response = await apiRequest('/auth/me');
        state.session.user = response.user;
        // ensure we are in authenticated mode and persist
        setAuthMode('user');
        persistSession();
        return response;
    }

    async function enterAuthedApp(useHash) {
        if (dom.appShell) dom.appShell.hidden = false;
        if (dom.bottomNav) dom.bottomNav.hidden = false;
        
        // Show guest badge if in guest mode
        const guestBadge = document.getElementById('guestBadge');
        if (guestBadge && isGuestMode()) {
            guestBadge.hidden = false;
        }

        // Disable or hide write actions for guest users
        if (dom.openCreateButton) {
            dom.openCreateButton.hidden = isGuestMode();
        }
        // Hide messages nav if guest
        document.querySelectorAll('.nav-button[data-view="messages"]').forEach((btn) => {
            btn.hidden = isGuestMode();
        });

        await fetchStories();
        
        if (useHash) {
            const handled = await resolveHashRoute();
            if (handled) {
                return;
            }
        }

        await switchView('home');
    }

    function showAuthView() {
        state.activeView = 'auth';
        state.authState = null;
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem('guest');
        if (dom.landingPage) dom.landingPage.hidden = true;
        if (dom.appShell) dom.appShell.hidden = false;
        if (dom.bottomNav) dom.bottomNav.hidden = true;
        if (dom.authView) dom.authView.hidden = false;
        if (dom.brandSubtitle) dom.brandSubtitle.textContent = 'Welcome';
        if (dom.topbarAction) dom.topbarAction.hidden = true;

        [
            dom.homeView,
            dom.reelsView,
            dom.messagesView,
            dom.searchView,
            dom.notificationsView,
            dom.profileView,
        ].forEach((view) => {
            if (view) view.hidden = true;
        });
    }

    async function switchView(viewName) {
        // Allow access if token OR guest exists, redirect only if BOTH are missing
        if (!state.session.token && !isGuestMode()) {
            showAuthView();
            return;
        }

        state.activeView = viewName;
        if (dom.authView) dom.authView.hidden = true;
        if (dom.bottomNav) dom.bottomNav.hidden = false;
        if (dom.topbarAction) dom.topbarAction.hidden = false;

        const viewMap = {
            home: dom.homeView,
            reels: dom.reelsView,
            messages: dom.messagesView,
            search: dom.searchView,
            notifications: dom.notificationsView,
            profile: dom.profileView,
        };

        Object.entries(viewMap).forEach(([key, element]) => {
            if (element) element.hidden = key !== viewName;
        });

        updateNav(viewName);
        updateTopbar(viewName);

        if (viewName === 'home') {
            await Promise.all([
                state.home.items.length ? Promise.resolve() : loadHomeFeed(true),
                loadFriendSuggestions(state.suggestions.items.length === 0),
            ]);
        }

        if (viewName === 'reels' && !state.reels.items.length) {
            await loadReels(true);
        }

        if (viewName === 'messages') {
            await loadConversations();
        }

        if (viewName === 'notifications') {
            await loadNotifications();
        }

        if (viewName === 'profile') {
            const username = state.profile.username || state.session.user.username;
            await loadProfile(username);
        }
    }

    function updateNav(activeView) {
        document.querySelectorAll('.nav-button[data-view]').forEach((button) => {
            button.classList.toggle('active', button.dataset.view === activeView);
        });
    }

    function updateTopbar(viewName) {
        const labels = {
            home: 'Home',
            reels: 'Reels',
            messages: 'Messages',
            search: 'Search',
            notifications: 'Notifications',
            profile: 'Profile',
        };

        dom.brandSubtitle.textContent = labels[viewName] || 'instaJOY';

        if (viewName === 'profile' && state.profile.data && state.profile.data.isOwnProfile) {
            dom.topbarAction.textContent = 'Edit';
            return;
        }

        if (viewName === 'notifications') {
            dom.topbarAction.textContent = 'Read all';
            return;
        }

        if (viewName === 'search') {
            dom.topbarAction.textContent = 'Clear';
            return;
        }

        dom.topbarAction.textContent = 'Refresh';
    }

    async function handleTopbarAction() {
        if (state.activeView === 'profile' && state.profile.data && state.profile.data.isOwnProfile) {
            openProfileEditModal();
            return;
        }

        if (state.activeView === 'notifications') {
            await markAllNotificationsRead();
            return;
        }

        if (state.activeView === 'search') {
            clearSearch();
            return;
        }

        if (state.activeView === 'home') {
            await loadHomeFeed(true);
            return;
        }

        if (state.activeView === 'reels') {
            await loadReels(true);
            return;
        }

        if (state.activeView === 'messages') {
            await loadConversations(true);
            return;
        }

        if (state.activeView === 'profile' && state.profile.username) {
            await loadProfile(state.profile.username, true);
        }
    }

    async function resolveHashRoute() {
        const hash = window.location.hash.replace(/^#/, '');

        if (!hash) {
            return false;
        }

        if (hash.startsWith('post-')) {
            await switchView('home');
            await focusPost(hash.slice(5));
            return true;
        }

        if (hash.startsWith('profile-')) {
            const username = hash.slice(8);
            if (username) {
                await switchView('profile');
                await loadProfile(username, true);
                return true;
            }
        }

        if (hash.startsWith('messages-')) {
            const userId = hash.slice(9);
            await switchView('messages');
            await openConversationById(userId);
            return true;
        }

        if (hash === 'home') {
            await switchView('home');
            return true;
        }

        if (hash === 'reels') {
            await switchView('reels');
            return true;
        }

        if (hash === 'search') {
            await switchView('search');
            return true;
        }

        if (hash === 'messages') {
            await switchView('messages');
            return true;
        }

        if (hash === 'notifications') {
            await switchView('notifications');
            return true;
        }

        if (hash === 'profile') {
            await switchView('profile');
            return true;
        }

        if (hash.startsWith('reels')) {
            await switchView('reels');
            return true;
        }

        return false;
    }

    function renderAuthView() {
        dom.authView.innerHTML = `
            <div class="auth-card">
                <div class="auth-brand">
                    <img src="${DEFAULT_AVATAR}" alt="instaJOY">
                    <h2>instaJOY</h2>
                    <p>Behavior inspired by social apps, built with an original lightweight experience.</p>
                </div>
                <form id="loginForm" class="form-stack" ${state.authMode === 'login' ? '' : 'hidden'}>
                    <label>
                        Email
                        <input id="loginEmail" type="email" autocomplete="email" required>
                    </label>
                    <label>
                        Password
                        <input id="loginPassword" type="password" autocomplete="current-password" required>
                    </label>
                    <button class="primary-button" type="submit">Log in</button>
                </form>
                <form id="signupForm" class="form-stack" ${state.authMode === 'signup' ? '' : 'hidden'}>
                    <label>
                        Username
                        <input id="signupUsername" type="text" minlength="3" maxlength="30" autocomplete="username" required>
                    </label>
                    <label>
                        Email
                        <input id="signupEmail" type="email" autocomplete="email" required>
                    </label>
                    <label>
                        Password
                        <input id="signupPassword" type="password" minlength="6" autocomplete="new-password" required>
                    </label>
                    <button class="primary-button" type="submit">Create account</button>
                </form>
                <div class="auth-switch">
                    <span>${state.authMode === 'login' ? "New here?" : 'Already have an account?'}</span>
                    <button class="text-button" type="button" data-action="toggle-auth-mode">
                        ${state.authMode === 'login' ? 'Sign up' : 'Log in'}
                    </button>
                </div>
            </div>
        `;

        dom.authView.querySelector('#loginForm')?.addEventListener('submit', handleLogin);
        dom.authView.querySelector('#signupForm')?.addEventListener('submit', handleSignup);
    }

    async function handleLogin(event) {
        event.preventDefault();

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await apiRequest('/auth/login', {
                method: 'POST',
                body: { email, password },
                auth: false,
            });
            storeSession(response);
            await enterAuthedApp(true);
            showToast('Welcome back.', 'success');
        } catch (error) {
            showToast(error.message || 'Login failed', 'error');
        }
    }

    async function handleSignup(event) {
        event.preventDefault();

        const username = document.getElementById('signupUsername').value.trim().toLowerCase();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;

        try {
            const response = await apiRequest('/auth/register', {
                method: 'POST',
                body: { username, email, password },
                auth: false,
            });
            storeSession(response);
            await enterAuthedApp(true);
            showToast('Account ready. Let’s share something joyful.', 'success');
        } catch (error) {
            showToast(error.message || 'Signup failed', 'error');
        }
    }

    async function loadHomeFeed(reset) {
        if (state.home.loading) {
            return;
        }

        if (reset) {
            state.home.items = [];
            state.home.cursor = null;
            state.home.hasMore = true;
        }

        if (!state.home.hasMore && !reset) {
            return;
        }

        state.home.loading = true;
        if (dom.homeLoadMore) {
            dom.homeLoadMore.textContent = 'Loading...';
            dom.homeLoadMore.hidden = false;
        }

        try {
            const query = new URLSearchParams({ limit: '8' });
            if (state.home.cursor) {
                query.set('cursor', state.home.cursor);
            }
            if (state.home.mood && state.home.mood !== 'mixed') {
                query.set('mood', state.home.mood);
            }

            if (!state.home.items.length && dom.homeFeed) {
                dom.homeFeed.innerHTML = renderFeedSkeleton(3);
            }

            // Pass auth: false so guests don't send tokens but still fetch the public feed
            const response = await apiRequest(`/posts/feed?${query.toString()}`, { auth: false });
            const nextPosts = Array.isArray(response.posts) ? response.posts : [];
            const filteredPosts = filterFeedPosts(nextPosts, state.home.mood);
            state.home.items = state.home.items.concat(filteredPosts);
            state.home.cursor = response.nextCursor || null;
            state.home.hasMore = Boolean(response.hasMore);

            if (!state.home.items.length && isGuestMode()) {
                const demoData = window.INSTAJOY_DEMO_DATA || { posts: [] };
                state.home.items = Array.isArray(demoData.posts) ? filterFeedPosts(demoData.posts, state.home.mood) : [];
                state.home.items = state.home.items.length ? state.home.items : (demoData.posts || []);
            }

            applyGuestEngagementToFeedItems(state.home.items);
            state.home.items = rankFeedItems(state.home.items, state.home.mood);

            renderHomeFeed();
        } catch (error) {
            if (isGuestMode()) {
                // Fallback to demo data if public API fails for guests
                const demoData = window.INSTAJOY_DEMO_DATA || { posts: [] };
                state.home.items = Array.isArray(demoData.posts) ? filterFeedPosts(demoData.posts, state.home.mood) : [];
                state.home.items = state.home.items.length ? state.home.items : (demoData.posts || []);
                state.home.hasMore = false;
                applyGuestEngagementToFeedItems(state.home.items);
                state.home.items = rankFeedItems(state.home.items, state.home.mood);
                renderHomeFeed();
            } else {
                showToast(error.message || 'Failed to load feed', 'error');
            }
        } finally {
            state.home.loading = false;
            if (dom.homeLoadMore) {
                dom.homeLoadMore.textContent = 'Load more posts';
                dom.homeLoadMore.hidden = !state.home.hasMore;
            }
        }
    }

    function renderHomeFeed() {
        if (!dom.homeFeed) return;

        applyGuestEngagementToFeedItems(state.home.items);
        
        if (!state.home.items.length) {
            if (state.home.loading) {
                dom.homeFeed.innerHTML = renderFeedSkeleton(3);
                if (dom.homeEmpty) dom.homeEmpty.hidden = true;
                return;
            }

            dom.homeFeed.innerHTML = '';
            if (dom.homeEmpty) {
                dom.homeEmpty.hidden = false;
                dom.homeEmpty.textContent = 'No posts yet. Use + Post to publish the first one.';
            }
            return;
        }

        if (dom.homeEmpty) {
            dom.homeEmpty.hidden = true;
        }
        dom.homeFeed.innerHTML = state.home.items.map((post) => renderPostCard(post)).join('');
        
        // Show guest badge if in guest mode
        const guestBadge = document.getElementById('guestBadge');
        if (guestBadge && isGuestMode() && state.home.items.length > 0) {
            guestBadge.hidden = false;
        }
    }

    function renderFriendSuggestions() {
        if (!dom.suggestionList) return;

        if (state.suggestions.loading) {
            dom.suggestionList.innerHTML = '<div class="empty-state">Loading suggestions…</div>';
            return;
        }

        const items = state.suggestions.items || [];
        if (!items.length) {
            dom.suggestionList.innerHTML = '<div class="empty-state">No suggestions available right now.</div>';
            return;
        }

        dom.suggestionList.innerHTML = items.map((user) => `
            <article class="suggestion-card" data-user-id="${user.id}">
                <div class="suggestion-details">
                    <img class="avatar small" src="${user.avatar || DEFAULT_AVATAR}" alt="${user.username} avatar">
                    <div class="suggestion-copy">
                        <strong>${user.username}</strong>
                        <span>${user.title || 'Recommended social creator'}</span>
                        <span class="suggestion-meta">${user.mutuals || 0} mutual connections</span>
                        <span>${user.bio || 'A curated recommendation to broaden your network.'}</span>
                    </div>
                </div>
                <div class="suggestion-actions">
                    <button class="follow-button ${user.following ? 'following' : ''}" type="button" data-action="follow" data-user-id="${user.id}">
                        ${user.following ? 'Following' : 'Follow'}
                    </button>
                </div>
            </article>
        `).join('');
    }

    async function loadFriendSuggestions(forceRefresh = false) {
        if (state.suggestions.loading && !forceRefresh) {
            return;
        }

        state.suggestions.loading = true;
        renderFriendSuggestions();

        try {
            let suggestions = [];
            if (!forceRefresh && state.suggestions.items.length) {
                suggestions = state.suggestions.items;
            } else {
                const response = await apiRequest('/users/suggestions', { auth: false });
                if (response && Array.isArray(response.suggestions) && response.suggestions.length) {
                    suggestions = response.suggestions;
                } else {
                    suggestions = (window.INSTAJOY_DEMO_DATA && Array.isArray(window.INSTAJOY_DEMO_DATA.suggestions)) ? window.INSTAJOY_DEMO_DATA.suggestions : [];
                }
            }

            state.suggestions.items = (suggestions || []).map((user) => ({
                id: user.id || user.username || `suggestion-${Math.random().toString(36).slice(2)}`,
                username: user.username || user.name || 'guest_user',
                avatar: user.avatar || user.profileImage || DEFAULT_AVATAR,
                title: user.title || 'Recommended creator',
                mutuals: Number(user.mutuals || 0),
                bio: user.bio || user.description || 'A thoughtful person worth connecting with.',
                following: Boolean(user.following),
            }));
        } catch (error) {
            state.suggestions.items = (window.INSTAJOY_DEMO_DATA && Array.isArray(window.INSTAJOY_DEMO_DATA.suggestions)) ? window.INSTAJOY_DEMO_DATA.suggestions : [];
        } finally {
            state.suggestions.loading = false;
            renderFriendSuggestions();
        }
    }

    function handleFriendSuggestionClick(event) {
        const button = event.target.closest('button[data-action="follow"]');
        if (!button) return;

        const userId = button.dataset.userId;
        const selected = state.suggestions.items.find((item) => item.id === userId);
        if (!selected) return;

        selected.following = !selected.following;
        button.textContent = selected.following ? 'Following' : 'Follow';
        button.classList.toggle('following', selected.following);
        showToast(selected.following ? `Following ${selected.username}` : `Unfollowed ${selected.username}`, 'success');
    }

    function renderFeedSkeleton(count = 2) {
        return Array.from({ length: count }, () => `
            <li class="skeleton-card" aria-hidden="true">
                <div class="skeleton-header">
                    <div class="skeleton-avatar skeleton"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-name skeleton"></div>
                        <div class="skeleton-time skeleton"></div>
                    </div>
                </div>
                <div class="skeleton-image skeleton"></div>
                <div class="skeleton-text skeleton"></div>
            </li>
        `).join('');
    }

    function filterFeedPosts(posts, mood) {
        const normalize = (value) => String(value || '').toLowerCase();
        const moodKeywords = {
            happy: ['happy', 'joy', 'sunny', 'positive', 'smile'],
            motivation: ['motivation', 'goal', 'hustle', 'dream', 'build'],
            calm: ['calm', 'peace', 'zen', 'mindful', 'relax'],
            music: ['music', 'song', 'beat', 'melody', 'audio'],
            fun: ['fun', 'laugh', 'joke', 'meme', 'party'],
            learn: ['learn', 'study', 'tutorial', 'tips', 'guide'],
            explore: ['travel', 'explore', 'adventure', 'discover', 'journey'],
        };

        const keywords = moodKeywords[mood] || [];
        if (!keywords.length || mood === 'mixed') {
            return posts;
        }

        return posts.filter((post) => {
            const text = normalize(post.text || post.content?.text);
            const category = normalize(post.category);
            if (keywords.some((keyword) => category.includes(keyword) || text.includes(keyword))) {
                return true;
            }
            if (category.includes(mood)) {
                return true;
            }
            return false;
        });
    }

    function rankFeedItems(items, mood) {
        return (items || []).slice().map((post) => {
            const following = Boolean(post.author?.isFollowed || post.author?.following || post.following);
            const engagement = Math.min(1, (((post.likeCount || post.likes || 0) + ((post.commentCount || post.comments || 0) * 2)) / 400));
            const freshness = 1 - Math.min(1, (Date.now() - new Date(post.createdAt || post.timestamp || Date.now())) / (1000 * 60 * 60 * 24 * 7));
            const moodRelevance = mood === 'mixed' ? 0.5 : (filterFeedPosts([post], mood).length ? 1 : 0);
            const trending = Math.min(1, Number(post.trendingScore || post.popularity || ((post.likeCount || 0) / 200)) || 0);

            post.__instaJOYScore = 0.35 * (following ? 1 : 0) + 0.25 * engagement + 0.2 * moodRelevance + 0.1 * freshness + 0.1 * trending;
            return post;
        }).sort((a, b) => (b.__instaJOYScore || 0) - (a.__instaJOYScore || 0));
    }

    async function fetchStories(forceRefresh = false) {
        if (state.stories.loading && !forceRefresh) return;
        state.stories.loading = true;

        try {
            const response = await apiRequest('/stories?limit=10', { auth: false });
            state.stories.items = Array.isArray(response.stories) ? response.stories : [];
        } catch (error) {
            state.stories.items = Array.isArray(window.INSTAJOY_DEMO_DATA?.stories) ? window.INSTAJOY_DEMO_DATA.stories.slice() : [];
        } finally {
            if (!state.stories.items.length) {
                state.stories.items = [{
                    id: 'instajoy-default',
                    username: 'instaJOY',
                    avatar: DEFAULT_AVATAR,
                    thumb: DEFAULT_AVATAR,
                    video: 'instaJOY (1) (1).mp4',
                    timestamp: new Date(),
                }];
            }
            state.stories.lastRefreshed = Date.now();
            state.stories.loading = false;
            renderStories();
            if (!state.stories.refreshInterval) {
                state.stories.refreshInterval = window.setInterval(() => fetchStories(true), 30000);
            }
        }
    }

    function renderStories() {
        if (!dom.storiesShell) return;
        const staticItems = [
            { label: 'Your story', icon: '+' },
            { label: '+ Create chain', icon: '🔗' },
        ];

        const dynamicItems = (state.stories.items || []).map((story, index) => `
            <div class="story-item">
                <button class="story-card story-ring" type="button" data-action="open-story" data-story-index="${index}" aria-label="Open story from ${escapeHtml(story.username || 'story')}">
                    <img class="story-avatar" src="${getAvatar(story.avatar)}" alt="${escapeHtml(story.username)}" onerror="this.src='ilogo.png'">
                </button>
                <div class="story-label">${escapeHtml(story.username || 'instaJOY')}</div>
            </div>
        `).join('');

        dom.storiesShell.innerHTML = staticItems.map((item) => `
            <div class="story-item">
                <button class="story-card story-action" type="button" aria-label="${item.label}">
                    <span class="story-icon">${item.icon}</span>
                </button>
                <div class="story-label">${item.label}</div>
            </div>
        `).join('') + dynamicItems;
    }

    async function applyMoodFilter(mood) {
        state.home.mood = mood || 'mixed';
        renderMoodChips();
        updateMoodHeading();
        await loadHomeFeed(true);
    }

    function renderMoodChips() {
        if (!dom.moodChipRow) return;
        const moods = [
            { key: 'happy', label: '😀 Happy' },
            { key: 'motivation', label: '🔥 Motivation' },
            { key: 'calm', label: '😌 Calm' },
            { key: 'music', label: '🎵 Music' },
            { key: 'fun', label: '😂 Fun' },
            { key: 'learn', label: '📚 Learn' },
            { key: 'explore', label: '🌍 Explore' },
            { key: 'mixed', label: '⭐ Mixed' },
        ];

        dom.moodChipRow.innerHTML = moods.map((mood) => `
            <button type="button" class="mood-chip ${state.home.mood === mood.key ? 'active' : ''}" data-action="select-mood" data-mood="${mood.key}">
                ${mood.label}
            </button>
        `).join('');
    }

    function updateMoodHeading() {
        if (!dom.moodHeading) return;
        const display = state.home.mood === 'mixed' ? 'Mixed' : state.home.mood.charAt(0).toUpperCase() + state.home.mood.slice(1);
        dom.moodHeading.textContent = `Because you're in ${display} mood`;
    }

    function openStoryViewer(index) {
        const stories = state.stories.items || [];
        const story = stories[index];
        if (!story || !dom.storyModal || !dom.storyVideo) return;

        state.storyViewer.activeIndex = index;
        state.storyViewer.isOpen = true;
        dom.storyModal.hidden = false;
        dom.storyModal.setAttribute('aria-hidden', 'false');
        dom.storyProgress.innerHTML = stories.map((_, barIndex) => `
            <span class="story-progress-bar ${barIndex === index ? 'active' : ''}" style="--progress:${barIndex === index ? 1 : 0}"></span>
        `).join('');
        dom.storyMetaAvatar.src = getAvatar(story.avatar);
        dom.storyMetaAvatar.alt = escapeHtml(story.username || 'Story user');
        dom.storyMetaUser.textContent = story.username || 'instaJOY';
        dom.storyMetaTime.textContent = formatShortDate(story.timestamp || new Date());
        dom.storyVideo.src = story.video || '';
        dom.storyVideo.poster = story.thumb || DEFAULT_AVATAR;
        dom.storyVideo.currentTime = 0;
        dom.storyVideo.play().catch(() => {});
    }

    function closeStoryViewer() {
        if (!dom.storyModal || !dom.storyVideo) return;
        state.storyViewer.isOpen = false;
        dom.storyModal.hidden = true;
        dom.storyModal.setAttribute('aria-hidden', 'true');
        dom.storyVideo.pause();
    }

    function switchStory(delta) {
        const stories = state.stories.items || [];
        if (!stories.length) return;
        let nextIndex = state.storyViewer.activeIndex + delta;
        if (nextIndex < 0) nextIndex = stories.length - 1;
        if (nextIndex >= stories.length) nextIndex = 0;
        openStoryViewer(nextIndex);
    }

    async function loadReels(reset) {
        if (state.reels.loading) {
            return;
        }

        if (reset) {
            state.reels.items = [];
            state.reels.cursor = null;
            state.reels.hasMore = true;
        }

        if (!state.reels.hasMore && !reset) {
            return;
        }

        state.reels.loading = true;
        if (dom.reelsLoadMore) {
            dom.reelsLoadMore.textContent = 'Loading...';
            dom.reelsLoadMore.hidden = false;
        }

        try {
            const query = new URLSearchParams({ limit: '4' });
            if (state.reels.cursor) {
                query.set('cursor', state.reels.cursor);
            }

            const response = await apiRequest(`/reels/feed?${query.toString()}`, { auth: false });
            state.reels.items = state.reels.items.concat(response.reels || []);
            state.reels.cursor = response.nextCursor || null;
            state.reels.hasMore = Boolean(response.hasMore);
            renderReels();
        } catch (error) {
            if (isGuestMode()) {
                state.reels.items = [];
                state.reels.hasMore = false;
                renderReels();
            } else {
                showToast(error.message || 'Failed to load reels', 'error');
            }
        } finally {
            state.reels.loading = false;
            if (dom.reelsLoadMore) {
                dom.reelsLoadMore.textContent = 'Load more reels';
                dom.reelsLoadMore.hidden = !state.reels.hasMore;
            }
        }
    }

    function renderReels() {
        if (!dom.reelsFeed) return;
        
        if (!state.reels.items.length) {
            dom.reelsFeed.innerHTML = '';
            if (dom.reelsEmpty) {
                dom.reelsEmpty.hidden = false;
                dom.reelsEmpty.textContent = 'No reels yet. Your 30-second stories can go here.';
            }
            return;
        }

        if (dom.reelsEmpty) {
            dom.reelsEmpty.hidden = true;
        }
        dom.reelsFeed.innerHTML = state.reels.items.map((reel) => renderReelCard(reel)).join('');
        if (reelObserver) {
            dom.reelsFeed.querySelectorAll('video[data-reel-video]').forEach((video) => {
                reelObserver.observe(video);
            });
        }
    }

    async function loadConversations(forceRefresh) {
        if (state.activeView !== 'messages' && !forceRefresh) {
            return;
        }

        try {
            if (isGuestMode()) {
                // No messages for guests
                state.messages.conversations = [];
            } else {
                const response = await apiRequest('/messages/conversations');
                state.messages.conversations = response.conversations || [];
            }
            renderConversations();
        } catch (error) {
            showToast(error.message || 'Failed to load conversations', 'error');
        }
    }

    function renderConversations() {
        if (!dom.conversationList) return;
        
        const conversations = state.messages.conversations;

        if (!conversations.length) {
            dom.conversationList.innerHTML = `<div class="empty-state">No conversations yet. Start one from Search or Profile.</div>`;
            return;
        }

        dom.conversationList.innerHTML = conversations
            .map((conversation) => {
                const active = state.messages.activeUser && state.messages.activeUser.id === conversation.user.id;
                return `
                    <button class="conversation-item ${active ? 'active' : ''}" type="button" data-action="open-conversation" data-user-id="${conversation.user.id}">
                        <img class="avatar small" src="${getAvatar(conversation.user.profileImage)}" alt="${escapeHtml(conversation.user.username)}" onerror="this.src='ilogo.png'">
                        <div class="conversation-main">
                            <strong>${escapeHtml(conversation.user.username)}</strong>
                            <div class="meta-line">${escapeHtml(truncateText(conversation.lastMessage.text, 62))}</div>
                        </div>
                        <div class="meta-line">${conversation.unreadCount ? `${conversation.unreadCount} new` : formatShortDate(conversation.lastMessage.createdAt)}</div>
                    </button>
                `;
            })
            .join('');
    }

    async function openConversationById(userId) {
        const conversation = state.messages.conversations.find((item) => item.user.id === userId);

        if (conversation) {
            await openConversation(conversation.user);
            return;
        }

        const fallbackUser = await findUserById(userId);
        if (fallbackUser) {
            await openConversation(fallbackUser);
        }
    }

    async function openConversation(user) {
        state.messages.activeUser = user;
        renderConversations();
        await loadConversation(user.id);
        renderActiveConversation();
    }

    async function loadConversation(userId) {
        try {
            const response = await apiRequest(`/messages/${userId}`);
            state.messages.threads[userId] = response.messages || [];
            renderActiveConversation();
            await loadConversations(true);
        } catch (error) {
            showToast(error.message || 'Failed to load messages', 'error');
        }
    }

    function renderActiveConversation() {
        if (!dom.messageThread || !dom.messageComposer || !dom.chatHeader || !dom.chatBackButton) return;
        
        const activeUser = state.messages.activeUser;

        if (!activeUser) {
            const chatHeaderH3 = dom.chatHeader.querySelector('h3');
            if (chatHeaderH3) chatHeaderH3.textContent = 'Choose a chat';
            dom.chatBackButton.hidden = true;
            dom.messageThread.className = 'message-thread empty-thread';
            dom.messageThread.innerHTML = '<p>Select a conversation or start one from Search or Profile.</p>';
            dom.messageComposer.hidden = true;
            return;
        }

        const chatHeaderH3 = dom.chatHeader.querySelector('h3');
        if (chatHeaderH3) chatHeaderH3.textContent = activeUser.username;
        dom.chatBackButton.hidden = window.innerWidth > 819;
        dom.messageComposer.hidden = false;

        const messages = state.messages.threads[activeUser.id] || [];
        if (!messages.length) {
            dom.messageThread.className = 'message-thread empty-thread';
            dom.messageThread.innerHTML = '<p>No messages yet. Start the conversation below.</p>';
            return;
        }

        dom.messageThread.className = 'message-thread';
        dom.messageThread.innerHTML = messages
            .map((message) => {
                const outgoing = message.senderId === state.session.user.id;
                return `
                    <div class="message-row ${outgoing ? 'outgoing' : 'incoming'}">
                        <div>${escapeHtml(message.text)}</div>
                        <div class="meta-line">${formatDateTime(message.createdAt)}${outgoing && message.readAt ? ' • seen' : ''}</div>
                    </div>
                `;
            })
            .join('');

        dom.messageThread.scrollTop = dom.messageThread.scrollHeight;
    }

    async function handleMessageSubmit(event) {
        event.preventDefault();

        if (!requireLogin('messaging')) return;

        if (!state.messages.activeUser) {
            return;
        }

        const text = dom.messageInput.value.trim();
        if (!text) {
            return;
        }

        try {
            const response = await apiRequest('/messages', {
                method: 'POST',
                body: {
                    receiverId: state.messages.activeUser.id,
                    text,
                },
            });
            const userId = state.messages.activeUser.id;
            state.messages.threads[userId] = (state.messages.threads[userId] || []).concat(response.message);
            dom.messageInput.value = '';
            renderActiveConversation();
            await loadConversations(true);
        } catch (error) {
            showToast(error.message || 'Message failed to send', 'error');
        }
    }

    async function loadNotifications() {
        try {
            const response = await apiRequest('/notifications');
            state.notifications = response.notifications || [];
            renderNotifications();
        } catch (error) {
            showToast(error.message || 'Failed to load notifications', 'error');
        }
    }

    function renderNotifications() {
        if (!state.notifications.length) {
            dom.notificationsList.innerHTML = '<div class="empty-state">You are all caught up.</div>';
            return;
        }

        dom.notificationsList.innerHTML = state.notifications
            .map((notification) => {
                const unread = !notification.readAt;
                const actorName = notification.actor ? notification.actor.username : 'Someone';
                return `
                    <div class="notification-item">
                        <img class="avatar small" src="${getAvatar(notification.actor && notification.actor.profileImage)}" alt="${escapeHtml(actorName)}">
                        <div class="notification-main">
                            <strong>${escapeHtml(actorName)}</strong>
                            <div>${escapeHtml(notification.text)}</div>
                            <div class="meta-line">${formatDateTime(notification.createdAt)}${unread ? ' • unread' : ''}</div>
                        </div>
                        <div class="search-actions">
                            ${
                                notification.entityType === 'post'
                                    ? `<button class="secondary-button" type="button" data-action="focus-post" data-post-id="${notification.entityId}">Open</button>`
                                    : ''
                            }
                            ${
                                notification.type === 'follow' && notification.actor
                                    ? `<button class="secondary-button" type="button" data-action="open-profile" data-username="${notification.actor.username}">Profile</button>`
                                    : ''
                            }
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    async function markAllNotificationsRead() {
        try {
            await apiRequest('/notifications/read-all', { method: 'POST' });
            state.notifications = state.notifications.map((notification) => ({
                ...notification,
                readAt: new Date().toISOString(),
            }));
            renderNotifications();
        } catch (error) {
            showToast(error.message || 'Unable to mark notifications as read', 'error');
        }
    }

    async function loadProfile(username, forceRefresh) {
        const normalized = String(username || '').trim().toLowerCase();

        if (!normalized) {
            return;
        }

        if (!forceRefresh && state.profile.username === normalized && state.profile.data && state.activeView === 'profile') {
            renderProfile();
            return;
        }

        try {
            const profileResponse =
                normalized === state.session.user.username
                    ? await apiRequest('/users/me/profile')
                    : await apiRequest(`/users/${encodeURIComponent(normalized)}`);
            const postsResponse = await apiRequest(`/posts/user/${encodeURIComponent(normalized)}`);

            state.profile.username = normalized;
            state.profile.data = profileResponse.profile;
            state.profile.posts = postsResponse.posts || [];
            applyGuestEngagementToFeedItems(state.profile.posts);
            renderProfile();
            updateTopbar('profile');
        } catch (error) {
            showToast(error.message || 'Failed to load profile', 'error');
        }
    }

    function renderProfile() {
        const profile = state.profile.data;

        if (!profile) {
            dom.profileSummary.innerHTML = '';
            dom.profileGrid.innerHTML = '';
            return;
        }

        dom.profileSummary.innerHTML = `
            <div class="profile-top">
                <img class="profile-avatar" src="${getAvatar(profile.profileImage)}" alt="${escapeHtml(profile.username)}">
                <div class="profile-title">
                    <h2>${escapeHtml(profile.username)}</h2>
                    <div class="microcopy">${escapeHtml(profile.bio || 'A little bio can live here.')}</div>
                </div>
            </div>
            <div class="profile-stats">
                <div class="stat-card"><strong>${profile.postCount}</strong><span>Posts</span></div>
                <div class="stat-card"><strong>${profile.reelCount}</strong><span>Reels</span></div>
                <div class="stat-card"><strong>${profile.followerCount}</strong><span>Followers</span></div>
                <div class="stat-card"><strong>${profile.followingCount}</strong><span>Following</span></div>
            </div>
            <div class="search-actions">
                ${
                    profile.isOwnProfile
                        ? `<button class="primary-button" type="button" data-action="edit-profile">Edit profile</button>
                           <button class="secondary-button" type="button" data-action="logout">Log out</button>`
                        : `<button class="primary-button" type="button" data-action="${profile.isFollowing ? 'unfollow-user' : 'follow-user'}" data-user-id="${profile.id}">
                                ${profile.isFollowing ? 'Unfollow' : 'Follow'}
                           </button>
                           <button class="secondary-button" type="button" data-action="message-user" data-user-id="${profile.id}" data-username="${profile.username}">Message</button>`
                }
            </div>
        `;

        if (!state.profile.posts.length) {
            dom.profileGrid.innerHTML = '<div class="empty-state">No posts yet.</div>';
            return;
        }

        dom.profileGrid.innerHTML = state.profile.posts
            .map((post) => {
                if (post.type === 'image' && post.imageData) {
                    return `
                        <button class="grid-card image-card" type="button" data-action="focus-post" data-post-id="${post.id}">
                            <img src="${post.imageData}" alt="${escapeHtml(post.text || 'Post image')}" loading="lazy">
                        </button>
                    `;
                }

                return `
                    <button class="grid-card" type="button" data-action="focus-post" data-post-id="${post.id}">
                        <div class="grid-text">
                            <span class="post-badge">${escapeHtml(formatCategory(post.category || 'text'))}</span>
                            <p>${escapeHtml(truncateText(post.text, 160))}</p>
                            <div class="post-grid-copy">
                                <span>${post.likeCount} likes</span>
                                <span>${post.commentCount} comments</span>
                            </div>
                        </div>
                    </button>
                `;
            })
            .join('');
    }

    function handleSearchInput(event) {
        const query = event.target.value.trim();
        state.search.query = query;

        if (state.search.timer) {
            window.clearTimeout(state.search.timer);
        }

        if (query.length < 2) {
            clearSearch(true);
            return;
        }

        dom.searchStatus.textContent = 'Searching...';
        state.search.timer = window.setTimeout(() => {
            runSearch(query);
        }, 280);
    }

    async function runSearch(query) {
        try {
            const response = await apiRequest(`/search?q=${encodeURIComponent(query)}`);
            renderSearchResults(response.users || [], response.posts || []);
            dom.searchStatus.textContent = `${(response.users || []).length} users and ${(response.posts || []).length} text posts found.`;
        } catch (error) {
            dom.searchStatus.textContent = 'Search failed. Try again.';
            showToast(error.message || 'Search failed', 'error');
        }
    }

    function renderSearchResults(users, posts) {
        dom.userSearchResults.innerHTML = users.length
            ? users.map((user) => renderUserSearchCard(user)).join('')
            : '<div class="empty-state">No matching users yet.</div>';

        dom.postSearchResults.innerHTML = posts.length
            ? posts.map((post) => renderPostCard(post, true)).join('')
            : '<div class="empty-state">No text posts matched that keyword.</div>';
    }

    function clearSearch(soft) {
        state.search.query = '';
        if (!soft) {
            dom.searchInput.value = '';
        }
        dom.searchStatus.textContent = 'Type at least 2 characters to search.';
        dom.userSearchResults.innerHTML = '';
        dom.postSearchResults.innerHTML = '';
    }

    function openCreateModal() {
        if (!requireLogin('posting')) return;
        resetCreateForm();
        openModal(dom.createModal);
    }

    function resetCreateForm() {
        state.create.type = 'text';
        state.create.imageData = null;
        state.create.imagePreviewUrl = '';
        state.create.reelFile = null;
        if (state.create.reelObjectUrl) {
            URL.revokeObjectURL(state.create.reelObjectUrl);
        }
        state.create.reelObjectUrl = '';
        state.create.reelDuration = 0;
        dom.createForm.reset();
        dom.imagePreview.hidden = true;
        dom.imagePreview.innerHTML = '';
        dom.reelPreview.hidden = true;
        dom.reelPreview.innerHTML = '';
        dom.imageHint.textContent = 'Images are compressed on-device and on the server to stay under 200KB.';
        dom.reelHint.textContent = 'Reels must be 1MB or smaller and 30 seconds or less.';
        switchCreateType('text');
    }

    function switchCreateType(type) {
        state.create.type = type;
        dom.textFields.hidden = type !== 'text';
        dom.imageFields.hidden = type !== 'image';
        dom.reelFields.hidden = type !== 'reel';
        document.querySelectorAll('.tab-button').forEach((button) => {
            button.classList.toggle('active', button.dataset.createType === type);
        });
    }

    async function handleImageSelection(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        try {
            const image = await compressImageFile(file, MAX_IMAGE_BYTES, 1440);
            state.create.imageData = image.dataUri;
            dom.imagePreview.hidden = false;
            dom.imagePreview.innerHTML = `
                <img class="preview-image" src="${image.dataUri}" alt="Selected image preview">
                <div class="microcopy">Compressed to ${formatBytes(image.sizeBytes)} for upload.</div>
            `;
            dom.imageHint.textContent = `Ready: ${formatBytes(image.sizeBytes)}.`;
        } catch (error) {
            state.create.imageData = null;
            dom.imageInput.value = '';
            dom.imagePreview.hidden = true;
            dom.imagePreview.innerHTML = '';
            dom.imageHint.textContent = error.message;
            showToast(error.message, 'error');
        }
    }

    async function handleReelSelection(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        try {
            if (!/^video\/(mp4|webm|ogg)$/i.test(file.type)) {
                throw new Error('Only MP4, WebM, and OGG reels are supported.');
            }

            if (file.size > MAX_REEL_BYTES) {
                throw new Error('Reel must be 1MB or smaller before upload.');
            }

            const metadata = await readVideoMetadata(file);
            if (metadata.duration > MAX_REEL_DURATION) {
                throw new Error('Reel duration must be 30 seconds or less.');
            }

            if (state.create.reelObjectUrl) {
                URL.revokeObjectURL(state.create.reelObjectUrl);
            }

            state.create.reelFile = file;
            state.create.reelDuration = metadata.duration;
            state.create.reelObjectUrl = metadata.objectUrl;
            dom.reelPreview.hidden = false;
            dom.reelPreview.innerHTML = `
                <video class="preview-video" src="${metadata.objectUrl}" controls playsinline muted preload="metadata"></video>
                <div class="microcopy">${formatBytes(file.size)} • ${metadata.duration.toFixed(1)}s</div>
            `;
            dom.reelHint.textContent = 'Ready to publish.';
        } catch (error) {
            if (state.create.reelObjectUrl) {
                URL.revokeObjectURL(state.create.reelObjectUrl);
                state.create.reelObjectUrl = '';
            }
            state.create.reelFile = null;
            state.create.reelDuration = 0;
            dom.reelInput.value = '';
            dom.reelPreview.hidden = true;
            dom.reelPreview.innerHTML = '';
            dom.reelHint.textContent = error.message;
            showToast(error.message, 'error');
        }
    }

    async function handleCreateSubmit(event) {
        event.preventDefault();

        dom.createSubmit.disabled = true;
        dom.createSubmit.textContent = 'Publishing...';

        try {
            if (state.create.type === 'text') {
                const text = dom.textPostBody.value.trim();
                const category = dom.textCategory.value;

                if (!text) {
                    throw new Error('Text posts cannot be empty.');
                }

                if (!TEXT_POST_CATEGORIES.includes(category)) {
                    throw new Error('Choose a valid text category.');
                }

                await apiRequest('/posts', {
                    method: 'POST',
                    body: { type: 'text', text, category },
                });
            }

            if (state.create.type === 'image') {
                if (!state.create.imageData) {
                    throw new Error('Choose an image first.');
                }

                await apiRequest('/posts', {
                    method: 'POST',
                    body: {
                        type: 'image',
                        text: dom.imageCaption.value.trim(),
                        imageData: state.create.imageData,
                    },
                });
            }

            if (state.create.type === 'reel') {
                if (!state.create.reelFile) {
                    throw new Error('Choose a reel first.');
                }

                const videoData = await fileToDataUrl(state.create.reelFile);
                await apiRequest('/reels', {
                    method: 'POST',
                    body: {
                        caption: dom.reelCaption.value.trim(),
                        videoData,
                        durationSeconds: state.create.reelDuration,
                    },
                });
            }

            closeModal(dom.createModal);
            await Promise.all([loadHomeFeed(true), loadReels(true)]);
            if (state.profile.username) {
                await loadProfile(state.profile.username, true);
            }
            showToast('Published successfully.', 'success');
        } catch (error) {
            showToast(error.message || 'Publishing failed', 'error');
        } finally {
            dom.createSubmit.disabled = false;
            dom.createSubmit.textContent = 'Publish';
        }
    }

    async function handleCommentSubmit(event) {
        event.preventDefault();

        const text = dom.commentInput?.value.trim();
        if (!text || !state.comments.targetType || !state.comments.targetId) {
            return;
        }

        if (isGuestMode()) {
            if (state.comments.targetType !== 'post') {
                showToast('Sign in to comment on reels.', 'info');
                return;
            }
            appendGuestLocalComment(state.comments.targetId, text);
            updateCommentCount(state.home.items, state.comments.targetId, 1);
            updateCommentCount(state.profile.posts, state.comments.targetId, 1);
            const post = state.home.items.find((p) => p.id === state.comments.targetId)
                || state.profile.posts.find((p) => p.id === state.comments.targetId);
            const cc = post ? (post.commentCount ?? post.comments ?? 0) : 0;
            persistGuestPostFields(state.comments.targetId, { commentCount: cc });
            dom.commentInput.value = '';
            await openComments(state.comments.targetType, state.comments.targetId);
            showToast('Comment added (saved on this device).', 'success');
            return;
        }

        if (!requireLogin('commenting')) return;

        try {
            if (state.comments.targetType === 'post') {
                await apiRequest(`/posts/${state.comments.targetId}/comments`, {
                    method: 'POST',
                    body: { text },
                });
                updateCommentCount(state.home.items, state.comments.targetId, 1);
                updateCommentCount(state.profile.posts, state.comments.targetId, 1);
            } else {
                await apiRequest(`/reels/${state.comments.targetId}/comments`, {
                    method: 'POST',
                    body: { text },
                });
                updateCommentCount(state.reels.items, state.comments.targetId, 1);
            }

            dom.commentInput.value = '';
            await openComments(state.comments.targetType, state.comments.targetId);
        } catch (error) {
            showToast(error.message || 'Failed to add comment', 'error');
        }
    }

    async function openComments(targetType, targetId) {
        if (!dom.commentsModal || !dom.commentsList) {
            showToast('Comments panel is not available on this page.', 'error');
            return;
        }

        state.comments.targetType = targetType;
        state.comments.targetId = targetId;
        openModal(dom.commentsModal);
        dom.commentsList.innerHTML = '<div class="empty-state">Loading comments...</div>';

        const endpoint =
            targetType === 'post'
                ? `/posts/${targetId}/comments`
                : `/reels/${targetId}/comments`;

        let serverComments = [];
        try {
            const response = await apiRequest(endpoint, { auth: false });
            serverComments = response.comments || [];
        } catch (error) {
            if (!isGuestMode()) {
                dom.commentsList.innerHTML = '<div class="empty-state">Could not load comments.</div>';
                showToast(error.message || 'Failed to load comments', 'error');
                return;
            }
        }

        const localExtras = isGuestMode() && targetType === 'post' ? getGuestLocalComments(targetId) : [];
        renderComments(mergeCommentLists(serverComments, localExtras));
    }

    function renderComments(comments) {
        if (!comments.length) {
            dom.commentsList.innerHTML = '<div class="empty-state">No comments yet. Be the first.</div>';
            return;
        }

        dom.commentsList.innerHTML = comments
            .map((comment) => {
                return `
                    <div class="search-item">
                        <img class="avatar small" src="${getAvatar(comment.author && comment.author.profileImage)}" alt="${escapeHtml(comment.author ? comment.author.username : 'User')}">
                        <div class="search-main">
                            <strong>${escapeHtml(comment.author ? comment.author.username : 'User')}</strong>
                            <div>${escapeHtml(comment.text)}</div>
                            <div class="meta-line">${formatDateTime(comment.createdAt)}</div>
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    function openProfileEditModal() {
        if (!state.profile.data || !state.profile.data.isOwnProfile) {
            return;
        }

        state.profile.pendingImageData = null;
        dom.profileBioInput.value = state.profile.data.bio || '';
        dom.removeProfileImage.checked = false;
        dom.profileImageInput.value = '';
        dom.profileImagePreview.hidden = true;
        dom.profileImagePreview.innerHTML = '';
        openModal(dom.profileEditModal);
    }

    async function handleProfileImageSelection(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        try {
            const image = await compressImageFile(file, MAX_AVATAR_BYTES, 512);
            state.profile.pendingImageData = image.dataUri;
            dom.profileImagePreview.hidden = false;
            dom.profileImagePreview.innerHTML = `
                <img class="preview-image" src="${image.dataUri}" alt="Profile preview">
                <div class="microcopy">Compressed to ${formatBytes(image.sizeBytes)}.</div>
            `;
        } catch (error) {
            state.profile.pendingImageData = null;
            dom.profileImageInput.value = '';
            dom.profileImagePreview.hidden = true;
            dom.profileImagePreview.innerHTML = '';
            showToast(error.message || 'Failed to prepare profile image', 'error');
        }
    }

    async function handleProfileEditSubmit(event) {
        event.preventDefault();

        try {
            await apiRequest('/users/me/profile', {
                method: 'PATCH',
                body: {
                    bio: dom.profileBioInput.value.trim(),
                    profileImage: state.profile.pendingImageData || undefined,
                    removeProfileImage: dom.removeProfileImage.checked,
                },
            });

            closeModal(dom.profileEditModal);
            await loadProfile(state.session.user.username, true);
            state.session.user = {
                ...state.session.user,
                profileImage: state.profile.data.profileImage,
                bio: state.profile.data.bio,
            };
            persistSession();
            showToast('Profile updated.', 'success');
        } catch (error) {
            showToast(error.message || 'Could not update profile', 'error');
        }
    }

    async function focusPost(postId) {
        const existing = state.home.items.find((post) => post.id === postId);

        if (existing) {
            window.setTimeout(() => {
                const element = document.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
            return;
        }

        try {
            const response = await apiRequest(`/posts/${postId}`);
            state.home.items = [response.post].concat(state.home.items.filter((post) => post.id !== postId));
            renderHomeFeed();
            window.setTimeout(() => {
                const element = document.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
        } catch (error) {
            showToast(error.message || 'Could not open that post', 'error');
        }
    }

    function collectPostTargets(postId) {
        return [state.home.items.find((item) => item.id === postId), state.profile.posts.find((item) => item.id === postId)].filter(Boolean);
    }

    async function togglePostLike(postId) {
        const targets = collectPostTargets(postId);
        if (!targets.length) {
            return;
        }

        if (isGuestMode()) {
            const post = targets[0];
            const wasLiked = Boolean(post.isLiked || post.liked);
            const base = Number(post.likeCount ?? post.likes ?? 0);
            const nextLiked = !wasLiked;
            const nextCount = Math.max(0, base + (nextLiked ? 1 : -1));
            targets.forEach((target) => {
                target.isLiked = nextLiked;
                target.liked = nextLiked;
                target.likeCount = nextCount;
                target.likes = nextCount;
            });
            persistGuestPostFields(postId, { isLiked: nextLiked, likeCount: nextCount });
            renderHomeFeed();
            if (state.activeView === 'profile') {
                renderProfile();
            }
            return;
        }

        if (!requireLogin('liking posts')) return;

        try {
            if (targets[0].isLiked) {
                await apiRequest(`/posts/${postId}/like`, { method: 'DELETE' });
                targets.forEach((target) => {
                    target.isLiked = false;
                    target.likeCount = Math.max(0, (target.likeCount ?? target.likes ?? 0) - 1);
                    target.likes = target.likeCount;
                });
            } else {
                await apiRequest(`/posts/${postId}/like`, { method: 'POST' });
                targets.forEach((target) => {
                    target.isLiked = true;
                    target.likeCount = (target.likeCount ?? target.likes ?? 0) + 1;
                    target.likes = target.likeCount;
                });
            }

            renderHomeFeed();
            if (state.activeView === 'profile') {
                renderProfile();
            }
        } catch (error) {
            showToast(error.message || 'Could not update like', 'error');
        }
    }

    async function toggleSavePost(postId) {
        const targets = collectPostTargets(postId);
        if (!targets.length) {
            return;
        }

        if (isGuestMode()) {
            const next = !targets[0].isSaved;
            targets.forEach((t) => { t.isSaved = next; });
            persistGuestPostFields(postId, { isSaved: next });
            renderHomeFeed();
            showToast(next ? 'Saved to this device.' : 'Removed from saved.', 'success');
            return;
        }

        if (!requireLogin('saving posts')) return;

        try {
            if (targets[0].isSaved) {
                await apiRequest(`/posts/${postId}/save`, { method: 'DELETE' });
                targets.forEach((t) => { t.isSaved = false; });
                showToast('Removed from saved.', 'success');
            } else {
                await apiRequest(`/posts/${postId}/save`, { method: 'POST' });
                targets.forEach((t) => { t.isSaved = true; });
                showToast('Post saved.', 'success');
            }
            renderHomeFeed();
        } catch (error) {
            showToast(error.message || 'Could not update save', 'error');
        }
    }

    function openPostReactionPicker(postId, anchorEl) {
        const targets = collectPostTargets(postId);
        if (!targets.length) {
            return;
        }

        if (isGuestMode()) {
            if (!window.ReactionEngine?.renderRadialMenu) {
                showToast('Reactions are unavailable.', 'error');
                return;
            }
            window.ReactionEngine.renderRadialMenu(postId, anchorEl, (reactionKey) => {
                targets.forEach((t) => { t.reactionType = reactionKey; });
                persistGuestPostFields(postId, { reactionType: reactionKey });
                renderHomeFeed();
                const r = window.ReactionEngine.getReaction(reactionKey);
                showToast(`Reacted with ${r.label}.`, 'success');
            });
            return;
        }

        if (!requireLogin('reacting to posts')) return;

        if (!window.ReactionEngine?.renderRadialMenu) {
            showToast('Reactions are unavailable.', 'error');
            return;
        }

        window.ReactionEngine.renderRadialMenu(postId, anchorEl, async (reactionKey) => {
            try {
                await apiRequest(`/posts/${postId}/reaction`, {
                    method: 'POST',
                    body: { reactionType: reactionKey },
                });
                collectPostTargets(postId).forEach((t) => { t.reactionType = reactionKey; });
                renderHomeFeed();
                const r = window.ReactionEngine.getReaction(reactionKey);
                showToast(`Reacted with ${r.label}.`, 'success');
            } catch (error) {
                showToast(error.message || 'Could not save reaction', 'error');
            }
        });
    }

    async function sharePostNative(postId) {
        const shareUrl = `${window.location.origin}${window.location.pathname}#post-${encodeURIComponent(postId)}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'instaJOY',
                    text: 'Check out this post on instaJOY',
                    url: shareUrl,
                });
                showToast('Share completed.', 'success');
                return;
            }
        } catch (err) {
            if (err && err.name === 'AbortError') {
                return;
            }
        }
        await copyShareLink(shareUrl, 'Post link copied.');
    }

    async function toggleReelLike(reelId) {
        if (!requireLogin('liking reels')) return;

        const reel = state.reels.items.find((item) => item.id === reelId);
        if (!reel) {
            return;
        }

        try {
            if (reel.isLiked) {
                await apiRequest(`/reels/${reelId}/like`, { method: 'DELETE' });
                reel.isLiked = false;
                reel.likeCount = Math.max(0, reel.likeCount - 1);
            } else {
                await apiRequest(`/reels/${reelId}/like`, { method: 'POST' });
                reel.isLiked = true;
                reel.likeCount += 1;
            }

            renderReels();
        } catch (error) {
            showToast(error.message || 'Could not update reel like', 'error');
        }
    }

    async function followUser(userId) {
        try {
            await apiRequest(`/follows/${userId}`, { method: 'POST' });
            await loadProfile(state.profile.username, true);
            showToast('Followed successfully.', 'success');
        } catch (error) {
            showToast(error.message || 'Follow failed', 'error');
        }
    }

    async function unfollowUser(userId) {
        try {
            await apiRequest(`/follows/${userId}`, { method: 'DELETE' });
            await loadProfile(state.profile.username, true);
            showToast('Unfollowed successfully.', 'success');
        } catch (error) {
            showToast(error.message || 'Unfollow failed', 'error');
        }
    }

    async function deletePost(postId) {
        try {
            await apiRequest(`/posts/${postId}`, { method: 'DELETE' });
            state.home.items = state.home.items.filter((item) => item.id !== postId);
            state.profile.posts = state.profile.posts.filter((item) => item.id !== postId);
            renderHomeFeed();
            if (state.activeView === 'profile') {
                renderProfile();
            }
            showToast('Post deleted.', 'success');
        } catch (error) {
            showToast(error.message || 'Delete failed', 'error');
        }
    }

    async function handleBodyClick(event) {
        const target = event.target.closest('[data-action], [data-view], [data-close-modal], [data-create-type]');

        if (!target) {
            if (event.target.classList.contains('modal-shell')) {
                closeModal(event.target);
            }
            return;
        }

        if (target.dataset.view) {
            if (target.dataset.view === 'profile' && state.session.user) {
                state.profile.username = state.session.user.username;
            }
            await switchView(target.dataset.view);
            return;
        }

        if (target.dataset.closeModal) {
            closeModal(document.getElementById(target.dataset.closeModal));
            return;
        }

        if (target.dataset.createType) {
            switchCreateType(target.dataset.createType);
            return;
        }

        const action = target.dataset.action;

        if (action === 'toggle-auth-mode') {
            state.authMode = state.authMode === 'login' ? 'signup' : 'login';
            renderAuthView();
            return;
        }

        if (action === 'toggle-post-like') {
            await togglePostLike(target.dataset.postId);
            return;
        }

        if (action === 'save-post' && target.dataset.postId) {
            await toggleSavePost(target.dataset.postId);
            return;
        }

        if (action === 'react-post' && target.dataset.postId) {
            openPostReactionPicker(target.dataset.postId, target);
            return;
        }

        if (action === 'toggle-reel-like') {
            await toggleReelLike(target.dataset.reelId);
            return;
        }

        if (action === 'open-comments') {
            await openComments(target.dataset.targetType, target.dataset.targetId);
            return;
        }

        if (action === 'select-mood') {
            await applyMoodFilter(target.dataset.mood);
            return;
        }

        if (action === 'open-story') {
            openStoryViewer(Number(target.dataset.storyIndex));
            return;
        }

        if (action === 'story-prev') {
            switchStory(-1);
            return;
        }

        if (action === 'story-next') {
            switchStory(1);
            return;
        }

        if (action === 'close-story') {
            closeStoryViewer();
            return;
        }

        if (action === 'share-post' && target.dataset.postId) {
            await sharePostNative(target.dataset.postId);
            return;
        }

        if (action === 'share-reel') {
            const shareUrl = `${window.location.origin}${window.location.pathname}#reels`;
            await copyShareLink(shareUrl, 'Reel link copied.');
            return;
        }

        if (action === 'delete-post') {
            if (window.confirm('Delete this post?')) {
                await deletePost(target.dataset.postId);
            }
            return;
        }

        if (action === 'open-profile') {
            await switchView('profile');
            await loadProfile(target.dataset.username, true);
            window.location.hash = `profile-${target.dataset.username}`;
            return;
        }

        if (action === 'follow') {
            handleFriendSuggestionClick(event);
            return;
        }

        if (action === 'open-conversation') {
            const userId = target.dataset.userId;
            const conversation = state.messages.conversations.find((item) => item.user.id === userId);
            if (conversation) {
                await openConversation(conversation.user);
            }
            return;
        }

        if (action === 'message-user') {
            await switchView('messages');
            await openConversation({
                id: target.dataset.userId,
                username: target.dataset.username,
                profileImage: target.dataset.profileImage || null,
            });
            window.location.hash = `messages-${target.dataset.userId}`;
            return;
        }

        if (action === 'focus-post') {
            await switchView('home');
            await focusPost(target.dataset.postId);
            window.location.hash = `post-${target.dataset.postId}`;
            return;
        }

        if (action === 'follow-user') {
            await followUser(target.dataset.userId);
            return;
        }

        if (action === 'unfollow-user') {
            await unfollowUser(target.dataset.userId);
            return;
        }

        if (action === 'edit-profile') {
            openProfileEditModal();
            return;
        }

        if (action === 'logout') {
            await logout();
        }
    }

    async function logout() {
        try {
            if (state.session.token) {
                await apiRequest('/auth/logout', { method: 'POST' });
            }
        } catch (error) {
            // Best-effort logout.
        }

        clearSession();
        state.home = { items: [], cursor: null, hasMore: true, loading: false };
        state.reels = { items: [], cursor: null, hasMore: true, loading: false };
        state.messages = { conversations: [], activeUser: null, threads: {} };
        state.notifications = [];
        state.profile = { username: null, data: null, posts: [], pendingImageData: null };
        resetCreateForm();
        
        // Reset auth mode and return to landing page
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem('guest');
        state.authState = null;
        
        if (dom.landingPage) dom.landingPage.hidden = false;
        if (dom.appShell) dom.appShell.hidden = true;
        window.location.hash = '';
        showToast('Logged out successfully.', 'success');
    }

    async function copyShareLink(link, message) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(link);
            } else {
                const tempInput = document.createElement('textarea');
                tempInput.value = link;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                tempInput.remove();
            }

            showToast(message, 'success');
        } catch (error) {
            showToast('Could not copy the link.', 'error');
        }
    }

    function openModal(element) {
        if (!element) {
            return;
        }
        element.hidden = false;
    }

    function closeModal(element) {
        if (!element) {
            return;
        }
        element.hidden = true;
        if (element === dom.commentsModal) {
            dom.commentInput.value = '';
        }
        if (element === dom.profileEditModal) {
            dom.profileImageInput.value = '';
            dom.removeProfileImage.checked = false;
            state.profile.pendingImageData = null;
        }
    }

    function renderPostCard(post, compact) {
        // Handle both API format and demo format
        const author = post.author || {};
        const text = post.text || post.content?.text || '';
        const image = post.imageData || post.content?.image || '';
        const timestamp = post.createdAt || post.timestamp || new Date();
        const likeCount = post.likeCount ?? post.likes ?? 0;
        const commentCount = post.commentCount ?? post.comments ?? 0;
        const isLiked = post.isLiked || post.liked || false;
        const isSaved = Boolean(post.isSaved);
        const reactionKey = post.reactionType || '';
        const activeReaction = reactionKey && window.ReactionEngine
            ? window.ReactionEngine.getReaction(reactionKey)
            : null;
        const showDelete = author.id === state.session.user?.id && !compact;

        const textContent = text ? `<p class="post-text">${escapeHtml(text)}</p>` : '';
        const imageContent = image
            ? `<img class="${compact ? 'preview-image' : 'post-media'}" src="${image}" alt="${escapeHtml(text || 'instaJOY post image')}" loading="lazy" onerror="this.style.display='none'">`
            : '';
        const badge = post.category ? `<span class="post-badge">${escapeHtml(formatCategory(post.category))}</span>` : '';

        let timeDisplay;
        if (typeof timestamp === 'string') {
            timeDisplay = formatDateTime(timestamp);
        } else if (timestamp instanceof Date) {
            timeDisplay = formatDistanceToNow(timestamp) + ' ago';
        } else {
            timeDisplay = 'just now';
        }

        const reactionSummary = activeReaction
            ? `<div class="post-reaction-summary">You reacted <strong>${escapeHtml(activeReaction.emoji)} ${escapeHtml(activeReaction.label)}</strong></div>`
            : '';

        const heartFill = isLiked ? '#ed4956' : 'none';
        const heartStroke = isLiked ? '#ed4956' : 'currentColor';
        const bookmarkFill = isSaved ? 'currentColor' : 'none';

        const openWrap = compact ? '' : '<li class="feed-post-wrap">';
        const closeWrap = compact ? '' : '</li>';

        return `
            ${openWrap}
            <article class="post-card feed-post-card" data-post-id="${post.id}">
                <div class="card-header">
                    <button class="avatar-row text-button" type="button" data-action="open-profile" data-username="${escapeHtml(author.username || '')}">
                        <img class="avatar" src="${getAvatar(author.profileImage || author.avatar)}" alt="${escapeHtml(author.username || 'User')}" onerror="this.src='ilogo.png'">
                        <span class="user-copy">
                            <strong>${escapeHtml(author.username || 'Unknown')}</strong>
                            <span>${timeDisplay}</span>
                        </span>
                    </button>
                    ${showDelete ? `<button class="ghost-button compact" type="button" data-action="delete-post" data-post-id="${post.id}">Delete</button>` : ''}
                </div>
                <div class="card-body">
                    ${badge}
                    ${imageContent}
                    ${textContent}
                </div>
                <div class="post-engagement-stats">
                    <span class="post-stat-pair"><strong>${escapeHtml(String(likeCount))}</strong> likes</span>
                    <button type="button" class="post-stat-pair post-stat-button text-button" data-action="open-comments" data-target-type="post" data-target-id="${post.id}">
                        <strong>${escapeHtml(String(commentCount))}</strong> comments
                    </button>
                </div>
                <div class="post-action-toolbar">
                    <div class="post-action-icons">
                        <button class="icon-action-btn ${isLiked ? 'is-liked' : ''}" type="button" data-action="toggle-post-like" data-post-id="${post.id}" aria-label="${isLiked ? 'Unlike' : 'Like'}">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                        <button class="icon-action-btn ${activeReaction ? 'is-reacting' : ''}" type="button" data-action="react-post" data-post-id="${post.id}" aria-label="React" title="${activeReaction ? `Reacted: ${activeReaction.label}` : 'React'}">
                            ${activeReaction
            ? `<span class="reaction-toolbar-emoji">${escapeHtml(activeReaction.emoji)}</span>`
            : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`}
                        </button>
                        <button class="icon-action-btn" type="button" data-action="open-comments" data-target-type="post" data-target-id="${post.id}" aria-label="Comment">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        </button>
                        <button class="icon-action-btn" type="button" data-action="share-post" data-post-id="${post.id}" aria-label="Share">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        </button>
                    </div>
                    <button class="icon-action-btn ${isSaved ? 'is-saved' : ''}" type="button" data-action="save-post" data-post-id="${post.id}" aria-label="${isSaved ? 'Unsave' : 'Save'}" title="${isSaved ? 'Saved' : 'Save post'}">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="${bookmarkFill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                </div>
                ${reactionSummary}
            </article>
            ${closeWrap}
        `;
    }

    function renderReelCard(reel) {
        const author = reel.author || {};

        return `
            <article class="reel-card">
                <div class="card-header">
                    <button class="avatar-row text-button" type="button" data-action="open-profile" data-username="${escapeHtml(author.username || '')}">
                        <img class="avatar" src="${getAvatar(author.profileImage)}" alt="${escapeHtml(author.username || 'User')}">
                        <span class="user-copy">
                            <strong>${escapeHtml(author.username || 'Unknown')}</strong>
                            <span>${formatDateTime(reel.createdAt)}</span>
                        </span>
                    </button>
                </div>
                <div class="card-body">
                    <video class="reel-video" data-reel-video src="${reel.videoData}" muted loop playsinline controls preload="metadata"></video>
                    ${reel.caption ? `<p class="post-text">${escapeHtml(reel.caption)}</p>` : ''}
                    <div class="action-row">
                        <button class="chip-button ${reel.isLiked ? 'is-active' : ''}" type="button" data-action="toggle-reel-like" data-reel-id="${reel.id}">
                            ${reel.isLiked ? 'Unlike' : 'Like'} • ${reel.likeCount}
                        </button>
                        <button class="chip-button" type="button" data-action="open-comments" data-target-type="reel" data-target-id="${reel.id}">
                            Comment • ${reel.commentCount}
                        </button>
                        <button class="chip-button" type="button" data-action="share-reel" data-reel-id="${reel.id}">
                            Share
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    function renderStories() {
        if (!dom.storiesShell) return;
        const staticItems = [
            { label: 'Your story', icon: '+', className: 'story-create' },
            { label: '+ Create chain', icon: '🔗', className: 'story-link' },
        ];

        const dynamicItems = (state.stories.items || []).map((story, index) => `
            <div class="story-item">
                <button class="story-card story-ring" type="button" data-action="open-story" data-story-index="${index}" aria-label="Open story from ${escapeHtml(story.username || 'story')}">
                    <img class="story-avatar" src="${getAvatar(story.avatar)}" alt="${escapeHtml(story.username)}" onerror="this.src='ilogo.png'">
                </button>
                <div class="story-label">${escapeHtml(story.username || 'instaJOY')}</div>
            </div>
        `).join('');

        dom.storiesShell.innerHTML = staticItems.map((item) => `
            <div class="story-item">
                <button class="story-card story-action ${item.className || ''}" type="button" aria-label="${item.label}">
                    <span class="story-icon">${item.icon}</span>
                </button>
                <div class="story-label">${item.label}</div>
            </div>
        `).join('') + dynamicItems;
    }

    function renderMoodChips() {
        if (!dom.moodChipRow) return;
        const moods = [
            { key: 'happy', label: '😄 Happy' },
            { key: 'motivation', label: '🔥 Motivation' },
            { key: 'calm', label: '😌 Calm' },
            { key: 'music', label: '🎵 Music' },
            { key: 'fun', label: '😂 Fun' },
            { key: 'learn', label: '📚 Learn' },
            { key: 'explore', label: '🌍 Explore' },
            { key: 'mixed', label: '⭐ Mixed' },
        ];

        dom.moodChipRow.innerHTML = moods.map((mood) => `
            <button type="button" class="mood-chip ${state.home.mood === mood.key ? 'active' : ''}" data-action="select-mood" data-mood="${mood.key}">
                ${mood.label}
            </button>
        `).join('');
    }

    function renderUserSearchCard(user) {
        return `
            <div class="search-item">
                <img class="avatar small" src="${getAvatar(user.profileImage)}" alt="${escapeHtml(user.username)}">
                <div class="search-main">
                    <strong>${escapeHtml(user.username)}</strong>
                    <div class="meta-line">${escapeHtml(user.bio || 'No bio yet.')}</div>
                </div>
                <div class="search-actions">
                    <button class="secondary-button" type="button" data-action="open-profile" data-username="${user.username}">Profile</button>
                    <button class="secondary-button" type="button" data-action="message-user" data-user-id="${user.id}" data-username="${user.username}" data-profile-image="${escapeHtml(user.profileImage || '')}">Message</button>
                </div>
            </div>
        `;
    }

    async function findUserById(userId) {
        const existingConversation = state.messages.conversations.find((item) => item.user.id === userId);
        if (existingConversation) {
            return existingConversation.user;
        }

        if (state.profile.data && state.profile.data.id === userId) {
            return state.profile.data;
        }

        return null;
    }

    async function apiRequest(path, options) {
        const settings = options || {};
        const headers = {};

        if (settings.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        // Do not attach auth header in guest mode. Only attach if explicitly allowed and token exists.
        if (!isGuestMode() && settings.auth !== false && state.session.token) {
            headers.Authorization = `Bearer ${state.session.token}`;
        }

        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: settings.method || 'GET',
            headers,
            body: settings.body !== undefined ? JSON.stringify(settings.body) : undefined,
        });

        const payload = await response.json().catch(() => ({}));

        if (response.status === 401 && settings.auth !== false && state.session.refreshToken && !settings._retried) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                return apiRequest(path, { ...settings, _retried: true });
            }
        }

        if (!response.ok) {
            throw new Error(payload.message || 'Request failed');
        }

        return payload;
    }

    async function refreshAccessToken() {
        if (!state.session.refreshToken) {
            return false;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: state.session.refreshToken }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.message || 'Refresh failed');
            }

            state.session.token = payload.token;
            state.session.refreshToken = payload.refreshToken || state.session.refreshToken;
            persistSession();
            return true;
        } catch (error) {
            clearSession();
            return false;
        }
    }

    function storeSession(response) {
        state.session.token = response.token;
        state.session.refreshToken = response.refreshToken;
        state.session.user = response.user;
        // mark authenticated mode and persist
        setAuthMode('user');
        persistSession();
    }

    function persistSession() {
        localStorage.setItem(TOKEN_KEY, state.session.token || '');
        localStorage.setItem(REFRESH_TOKEN_KEY, state.session.refreshToken || '');
        if (state.session.user) {
            localStorage.setItem(USER_KEY, JSON.stringify(state.session.user));
        }
        // persist authMode as well
        try {
            sessionStorage.setItem(AUTH_STORAGE_KEY, state.authState || 'guest');
        } catch (e) {}
    }

    function clearSession() {
        state.session = {
            token: '',
            refreshToken: '',
            user: null,
        };
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        // switch to guest mode after clearing authenticated session
        setAuthMode('guest');
    }

    function parseStoredUser() {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            localStorage.removeItem(USER_KEY);
            return null;
        }
    }

    function showToast(message, variant) {
        const toast = document.createElement('div');
        toast.className = `toast ${variant || ''}`.trim();
        toast.textContent = message;
        dom.toastHost.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 3200);
    }

    function getAvatar(value) {
        return value || DEFAULT_AVATAR;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCategory(category) {
        return String(category || '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'just now';
        }

        const diffMs = Date.now() - date.getTime();
        const diffMinutes = Math.round(diffMs / 60000);

        if (diffMinutes < 1) {
            return 'just now';
        }

        if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        }

        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) {
            return `${diffHours}h ago`;
        }

        const diffDays = Math.round(diffHours / 24);
        if (diffDays < 7) {
            return `${diffDays}d ago`;
        }

        return date.toLocaleDateString();
    }

    function formatDistanceToNow(date) {
        if (!date) return 'just now';
        if (!(date instanceof Date)) date = new Date(date);
        if (Number.isNaN(date.getTime())) return 'just now';

        const diffMs = Date.now() - date.getTime();
        const diffMinutes = Math.round(diffMs / 60000);

        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m`;
        
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h`;
        
        const diffDays = Math.round(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d`;
        
        const diffWeeks = Math.round(diffDays / 7);
        if (diffWeeks < 4) return `${diffWeeks}w`;
        
        return `${Math.round(diffDays / 30)}mo`;
    }

    function formatShortDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function formatBytes(bytes) {
        if (!bytes) {
            return '0 B';
        }
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function normalizeDemoMediaPaths() {
        const expectedVideo = 'instaJOY (1) (1).mp4';
        if (Array.isArray(window.INSTAJOY_DEMO_DATA?.stories)) {
            window.INSTAJOY_DEMO_DATA.stories.forEach((story) => {
                if (story && typeof story.video === 'string' && story.video.includes('instaJOY')) {
                    story.video = expectedVideo;
                }
            });
        }
    }

    function truncateText(text, maxLength) {
        const value = String(text || '');
        return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
    }

    function estimateDataUriBytes(dataUri) {
        const base64 = String(dataUri || '').split(',')[1] || '';
        return Math.ceil((base64.length * 3) / 4);
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
        });
    }

    function readImage(file) {
        return fileToDataUrl(file).then(
            (dataUri) =>
                new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve({ image, dataUri });
                    image.onerror = () => reject(new Error('Could not load image'));
                    image.src = dataUri;
                })
        );
    }

    async function compressImageFile(file, maxBytes, maxDimension) {
        if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
            throw new Error('Only JPEG, PNG, and WebP images are supported.');
        }

        const { image } = await readImage(file);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        let width = image.width;
        let height = image.height;

        if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let quality = 0.82;
        let attempt = canvas.toDataURL('image/jpeg', quality);
        let bytes = estimateDataUriBytes(attempt);

        while (bytes > maxBytes && quality > 0.5) {
            quality -= 0.08;
            attempt = canvas.toDataURL('image/jpeg', quality);
            bytes = estimateDataUriBytes(attempt);
        }

        while (bytes > maxBytes && width > 480 && height > 480) {
            width = Math.max(480, Math.round(width * 0.86));
            height = Math.max(480, Math.round(height * 0.86));
            canvas.width = width;
            canvas.height = height;
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            attempt = canvas.toDataURL('image/jpeg', quality);
            bytes = estimateDataUriBytes(attempt);
        }

        if (bytes > maxBytes) {
            throw new Error(`Image must stay under ${Math.floor(maxBytes / 1024)}KB.`);
        }

        return {
            dataUri: attempt,
            sizeBytes: bytes,
        };
    }

    function readVideoMetadata(file) {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                resolve({
                    duration: video.duration,
                    objectUrl,
                });
            };
            video.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Could not read reel metadata.'));
            };
            video.src = objectUrl;
        });
    }

    function updateCommentCount(items, targetId, delta) {
        const item = (items || []).find((entry) => entry.id === targetId);
        if (item) {
            const base = item.commentCount ?? item.comments ?? 0;
            const next = Math.max(0, base + delta);
            item.commentCount = next;
            item.comments = next;
        }
    }
})();
