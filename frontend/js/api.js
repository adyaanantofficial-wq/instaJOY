/**
 * API Module - All backend communication
 * Handles auth, posts, users, social features
 */

// Configuration
const API_BASE_URL = 'https://instajoy-backend.onrender.com/api'; // Replace with your Render URL
const TOKEN_KEY = 'instaJOY_token';
const REFRESH_TOKEN_KEY = 'instaJOY_refresh_token';

/**
 * Generic fetch wrapper with error handling
 */
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Add authorization token
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, try refresh
                await refreshToken();
                // Retry request
                return apiCall(endpoint, options);
            }
            throw new Error(data.message || 'API Error');
        }

        return data;
    } catch (error) {
        console.error('API Call Error:', error);
        throw error;
    }
}

/**
 * Refresh JWT token
 */
async function refreshToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        localStorage.setItem(TOKEN_KEY, data.token);
        if (data.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        }
    } catch (error) {
        console.error('Token Refresh Failed:', error);
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    return !!localStorage.getItem(TOKEN_KEY);
}

/**
 * Get current user data from token
 */
function getCurrentUser() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch (error) {
        console.error('Invalid Token Format:', error);
        return null;
    }
}

/* =====================
   AUTH ENDPOINTS
   ===================== */

async function register(username, email, password) {
    const response = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
    });

    if (response.token) {
        localStorage.setItem(TOKEN_KEY, response.token);
        if (response.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        }
    }

    return response;
}

async function login(email, password) {
    const response = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

    if (response.token) {
        localStorage.setItem(TOKEN_KEY, response.token);
        if (response.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        }
    }

    return response;
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem('currentUser');
}

/* =====================
   USER ENDPOINTS
   ===================== */

async function getUserProfile(username) {
    return apiCall(`/user/${username}`, { method: 'GET' });
}

async function getCurrentUserProfile() {
    const user = getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    return getUserProfile(user.username);
}

async function updateProfile(bio, profileImage) {
    return apiCall('/user/profile/update', {
        method: 'POST',
        body: JSON.stringify({ bio, profileImage }),
    });
}

async function follow(userId) {
    return apiCall('/user/follow', {
        method: 'POST',
        body: JSON.stringify({ userId }),
    });
}

async function unfollow(userId) {
    return apiCall('/user/unfollow', {
        method: 'POST',
        body: JSON.stringify({ userId }),
    });
}

async function getSuggestedUsers(limit = 5) {
    return apiCall(`/user/suggested?limit=${limit}`, { method: 'GET' });
}

/* =====================
   POST ENDPOINTS
   ===================== */

async function createPost(caption, imageBase64) {
    return apiCall('/posts/create', {
        method: 'POST',
        body: JSON.stringify({ caption, image: imageBase64 }),
    });
}

async function getFeed(page = 1, limit = 10) {
    return apiCall(`/posts/feed?page=${page}&limit=${limit}`, {
        method: 'GET',
    });
}

async function getPostsByUser(username) {
    return apiCall(`/posts/user/${username}`, { method: 'GET' });
}

async function deletePost(postId) {
    return apiCall(`/posts/${postId}`, {
        method: 'DELETE',
    });
}

/* =====================
   LIKE ENDPOINTS
   ===================== */

async function likePost(postId) {
    return apiCall(`/posts/${postId}/like`, {
        method: 'POST',
    });
}

async function unlikePost(postId) {
    return apiCall(`/posts/${postId}/unlike`, {
        method: 'POST',
    });
}

/* =====================
   COMMENT ENDPOINTS
   ===================== */

async function getComments(postId) {
    return apiCall(`/posts/${postId}/comments`, { method: 'GET' });
}

async function addComment(postId, text) {
    return apiCall(`/posts/${postId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ text }),
    });
}

async function deleteComment(postId, commentId) {
    return apiCall(`/posts/${postId}/comment/${commentId}`, {
        method: 'DELETE',
    });
}

/* =====================
   UTILITY FUNCTIONS
   ===================== */

/**
 * Convert image to base64
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Compress image for mobile optimization
 */
async function compressImage(file, maxWidth = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}
