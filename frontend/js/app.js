/**
 * instaJOY - Main Frontend API & App Module
 * Handles all backend communication and core app logic
 */

// Configuration
const API_BASE_URL = 'http://localhost:5000/api';
const TOKEN_KEY = 'instajoy_token';
const REFRESH_TOKEN_KEY = 'instajoy_refresh_token';
const USER_KEY = 'instajoy_user';

let currentUser = null;
let currentUserId = null;

/**
 * Initialize app on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

/**
 * Initialize the application
 */
async function initializeApp() {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);

    if (token && user) {
        try {
            currentUser = JSON.parse(user);
            currentUserId = currentUser.id;
            
            // Verify token is still valid
            const response = await apiCall('/auth/me');
            if (response.success) {
                showApp();
                return;
            }
        } catch (error) {
            console.log('Token expired, clearing auth');
        }
    }

    // Not logged in, show auth page
    showAuthPage();
}

/**
 * Generic API call function
 */
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const data = await response.json();
            
            if (response.status === 401) {
                clearAuth();
                window.location.reload();
            }

            throw new Error(data.message || `API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Auth Functions
 */

async function signup(username, email, password) {
    const response = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
    });

    if (response.success) {
        setAuth(response.user, response.token, response.refreshToken);
        return true;
    }
    return false;
}

async function login(email, password) {
    const response = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

    if (response.success) {
        setAuth(response.user, response.token, response.refreshToken);
        return true;
    }
    return false;
}

function setAuth(user, token, refreshToken) {
    currentUser = user;
    currentUserId = user.id;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearAuth() {
    currentUser = null;
    currentUserId = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

/**
 * Post Functions
 */

async function createPost(caption, imageUrl, type = 'text') {
    return await apiCall('/posts/create', {
        method: 'POST',
        body: JSON.stringify({ caption, imageUrl, type }),
    });
}

async function getFeed(skip = 0, limit = 10) {
    return await apiCall(`/posts/feed?skip=${skip}&limit=${limit}`);
}

async function likePost(postId) {
    return await apiCall(`/posts/${postId}/like`, { method: 'POST' });
}

async function unlikePost(postId) {
    return await apiCall(`/posts/${postId}/unlike`, { method: 'POST' });
}

async function commentPost(postId, text) {
    return await apiCall(`/posts/${postId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ text }),
    });
}

/**
 * Reel Functions
 */

async function getReelsFeed(skip = 0) {
    return await apiCall(`/reels/feed?skip=${skip}`);
}

async function createReel(caption, videoUrl) {
    return await apiCall('/reels/create', {
        method: 'POST',
        body: JSON.stringify({ caption, videoUrl }),
    });
}

/**
 * User Functions
 */

async function getUserProfile(username) {
    return await apiCall(`/user/${username}`);
}

async function updateProfile(bio, name) {
    return await apiCall('/user/profile/update', {
        method: 'POST',
        body: JSON.stringify({ bio, name }),
    });
}

async function followUser(userId) {
    return await apiCall(`/follow/${userId}`, { method: 'POST' });
}

async function unfollowUser(userId) {
    return await apiCall(`/follow/${userId}/unfollow`, { method: 'POST' });
}

/**
 * Search Functions
 */

async function searchUsers(query) {
    return await apiCall(`/search/users?q=${encodeURIComponent(query)}`);
}

async function searchPosts(query) {
    return await apiCall(`/search/posts?q=${encodeURIComponent(query)}`);
}

/**
 * Message Functions
 */

async function sendMessage(receiverId, text) {
    return await apiCall('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ receiverId, text }),
    });
}

async function getMessages(userId) {
    return await apiCall(`/messages/${userId}`);
}

async function getConversations() {
    return await apiCall('/messages/list/all');
}

/**
 * Notification Functions
 */

async function getNotifications() {
    return await apiCall('/notifications');
}

/**
 * UI Functions
 */

function showAuthPage() {
    // Hide all pages
    document.querySelectorAll('[data-page]').forEach((el) => (el.style.display = 'none'));
    
    // Show auth page
    let authPage = document.getElementById('authPage');
    if (!authPage) {
        authPage = document.createElement('div');
        authPage.id = 'authPage';
        authPage.setAttribute('data-page', 'auth');
        authPage.innerHTML = getAuthPageHTML();
        document.body.appendChild(authPage);
    }
    authPage.style.display = 'block';
}

function showApp() {
    document.querySelectorAll('[data-page]').forEach((el) => (el.style.display = 'none'));
    
    let appPage = document.getElementById('appPage');
    if (!appPage) {
        appPage = document.createElement('div');
        appPage.id = 'appPage';
        appPage.setAttribute('data-page', 'app');
        appPage.innerHTML = getAppPageHTML();
        document.body.appendChild(appPage);
        initializeNavigation();
    }
    appPage.style.display = 'block';
    showPage('feed');
}

function getAuthPageHTML() {
    return `
        <div class="auth-container">
            <div class="auth-logo">
                <img src="ilogo.png" alt="instaJOY">
                <h1>instaJOY</h1>
                <p>Share Your Joy</p>
            </div>
            
            <div class="auth-forms">
                <div id="loginForm" class="auth-form active">
                    <h2>Login</h2>
                    <input type="email" id="loginEmail" placeholder="Email" required>
                    <input type="password" id="loginPassword" placeholder="Password" required>
                    <button onclick="handleLogin()" class="btn-primary">Login</button>
                    <p class="auth-switch">Don't have account? <a href="#" onclick="toggleAuthForm()">Sign Up</a></p>
                </div>
                
                <div id="signupForm" class="auth-form">
                    <h2>Sign Up</h2>
                    <input type="text" id="signupUsername" placeholder="Username" required>
                    <input type="email" id="signupEmail" placeholder="Email" required>
                    <input type="password" id="signupPassword" placeholder="Password" required>
                    <button onclick="handleSignup()" class="btn-primary">Sign Up</button>
                    <p class="auth-switch">Already have account? <a href="#" onclick="toggleAuthForm()">Login</a></p>
                </div>
            </div>
        </div>
    `;
}

function getAppPageHTML() {
    return `
        <div class="app-container">
            <div class="app-header">
                <div class="logo"><img src="ilogo.png" alt="instaJOY"></div>
                <h1>instaJOY</h1>
            </div>
            
            <div class="pages-container">
                <div id="feedPage" class="page" style="display:none">
                    <div id="feedPosts"></div>
                </div>
                <div id="reelsPage" class="page" style="display:none">
                    <div id="reelsContainer"></div>
                </div>
                <div id="searchPage" class="page" style="display:none">
                    <input type="text" id="searchInput" placeholder="Search users or posts...">
                    <div id="searchResults"></div>
                </div>
                <div id="messagesPage" class="page" style="display:none">
                    <div id="conversationsList"></div>
                </div>
                <div id="notificationsPage" class="page" style="display:none">
                    <div id="notificationsList"></div>
                </div>
                <div id="profilePage" class="page" style="display:none">
                    <div id="profileContent"></div>
                </div>
            </div>
            
            <nav class="bottom-nav">
                <button class="nav-btn" onclick="showPage('feed')" data-page="feed">
                    <span class="icon">🏠</span>
                </button>
                <button class="nav-btn" onclick="showPage('reels')" data-page="reels">
                    <span class="icon">▶️</span>
                </button>
                <button class="nav-btn" onclick="showPage('search')" data-page="search">
                    <span class="icon">🔍</span>
                </button>
                <button class="nav-btn" onclick="showPage('messages')" data-page="messages">
                    <span class="icon">💬</span>
                </button>
                <button class="nav-btn" onclick="showPage('notifications')" data-page="notifications">
                    <span class="icon">🔔</span>
                </button>
                <button class="nav-btn" onclick="showPage('profile')" data-page="profile">
                    <span class="icon">👤</span>
                </button>
            </nav>
        </div>
    `;
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach((el) => (el.style.display = 'none'));
    document.getElementById(pageName + 'Page').style.display = 'block';
    
    if (pageName === 'feed') loadFeed();
    else if (pageName === 'reels') loadReels();
    else if (pageName === 'profile') loadProfile();
}

async function loadFeed() {
    try {
        const data = await getFeed();
        const container = document.getElementById('feedPosts');
        
        container.innerHTML = data.posts
            .map((post) => `
                <div class="post">
                    <div class="post-header">
                        <img src="${post.author.profileImage || 'ilogo.png'}" class="avatar">
                        <div>
                            <strong>${post.author.username}</strong>
                        </div>
                    </div>
                    <div class="post-content">
                        ${post.imageUrl ? `<img src="${post.imageUrl}" class="post-image">` : ''}
                        <p>${post.caption}</p>
                    </div>
                    <div class="post-actions">
                        <button onclick="likePostUI('${post._id}', this)">
                            ${post.isLiked ? '❤️' : '🤍'} ${post.likesCount}
                        </button>
                        <button>💬 ${post.commentsCount}</button>
                        <button>📤</button>
                    </div>
                </div>
            `)
            .join('');
    } catch (error) {
        console.error('Error loading feed:', error);
    }
}

async function likePostUI(postId, button) {
    try {
        await likePost(postId);
        button.textContent = '❤️';
    } catch (error) {
        console.error('Error liking post:', error);
    }
}

async function loadReels() {
    try {
        const data = await getReelsFeed();
        const container = document.getElementById('reelsContainer');
        
        container.innerHTML = data.reels
            .map((reel) => `
                <div class="reel">
                    <video src="${reel.videoUrl}" controls></video>
                    <div class="reel-info">
                        <strong>${reel.author.username}</strong>
                        <p>${reel.caption}</p>
                    </div>
                </div>
            `)
            .join('');
    } catch (error) {
        console.error('Error loading reels:', error);
    }
}

async function loadProfile() {
    try {
        const data = await getUserProfile(currentUser.username);
        const container = document.getElementById('profileContent');
        
        container.innerHTML = `
            <div class="profile-header">
                <img src="${data.user.profileImage || 'ilogo.png'}" class="profile-image">
                <h2>${data.user.username}</h2>
                <p>${data.user.bio}</p>
                <div class="profile-stats">
                    <div><strong>${data.user.followerCount || 0}</strong><br>Followers</div>
                    <div><strong>${data.user.followingCount || 0}</strong><br>Following</div>
                </div>
                <button onclick="logout()" class="btn-primary">Logout</button>
            </div>
        `;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function initializeNavigation() {
    // Navigation already initialized in HTML
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    try {
        if (await login(email, password)) {
            showApp();
        } else {
            alert('Login failed');
        }
    } catch (error) {
        alert(error.message);
    }
}

async function handleSignup() {
    const username = document.getElementById('signupUsername').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    if (!username || !email || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    try {
        if (await signup(username, email, password)) {
            showApp();
        } else {
            alert('Signup failed');
        }
    } catch (error) {
        alert(error.message);
    }
}

function toggleAuthForm() {
    document.getElementById('loginForm').classList.toggle('active');
    document.getElementById('signupForm').classList.toggle('active');
}

function logout() {
    clearAuth();
    window.location.href = 'index.html';
}
