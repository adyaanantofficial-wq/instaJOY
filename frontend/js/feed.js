/**
 * Feed Module - Post display, creation, and interactions
 */

let currentPage = 1;
let isLoading = false;
let hasMorePosts = true;
let selectedPostId = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeFeed();
});

function initializeFeed() {
    // Check authentication
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Load current user
    loadCurrentUser();

    // Setup event listeners
    setupEventListeners();

    // Load initial feed
    loadFeed();

    // Setup infinite scroll
    setupInfiniteScroll();

    // Setup theme
    setupThemeToggle();
}

/**
 * Load and display current user
 */
async function loadCurrentUser() {
    try {
        const user = getCurrentUser();
        if (!user) throw new Error('Invalid token');

        const profile = await getCurrentUserProfile();
        
        // Update profile image in creator section
        const profileImg = document.getElementById('creatorProfileImg');
        if (profile.profileImage) {
            profileImg.src = profile.profileImage;
        }

        // Cache for later
        sessionStorage.setItem('currentUserData', JSON.stringify(profile));
    } catch (error) {
        console.error('Load Current User Error:', error);
        logout();
        window.location.href = 'index.html';
    }
}

/**
 * Setup event listeners for feed interactions
 */
function setupEventListeners() {
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const postImage = document.getElementById('postImage');
    const createPostBtn = document.getElementById('createPostBtn');
    const removeImageBtn = document.getElementById('removeImageBtn');

    uploadImageBtn?.addEventListener('click', () => postImage.click());
    
    postImage?.addEventListener('change', handleImageSelect);
    
    createPostBtn?.addEventListener('click', handleCreatePost);
    
    removeImageBtn?.addEventListener('click', removeImagePreview);

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    themeToggle?.addEventListener('click', toggleTheme);
}

/**
 * Handle image selection for posts
 */
async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        // Compress image for mobile optimization
        const compressedImage = await compressImage(file, 800);
        
        // Show preview
        const previewImg = document.getElementById('previewImg');
        const imagePreview = document.getElementById('imagePreview');
        
        previewImg.src = compressedImage;
        imagePreview.style.display = 'block';
        
        // Store base64 for submission
        sessionStorage.setItem('selectedImage', compressedImage);
    } catch (error) {
        console.error('Image Selection Error:', error);
        alert('Failed to process image');
    }
}

/**
 * Remove image preview
 */
function removeImagePreview() {
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('postImage').value = '';
    sessionStorage.removeItem('selectedImage');
}

/**
 * Create new post
 */
async function handleCreatePost() {
    const caption = document.getElementById('postCaption').value.trim();
    const imageBase64 = sessionStorage.getItem('selectedImage');
    const createPostBtn = document.getElementById('createPostBtn');

    if (!caption && !imageBase64) {
        alert('Please add a caption or image');
        return;
    }

    if (caption.length > 2200) {
        alert('Caption is too long (max 2200 characters)');
        return;
    }

    createPostBtn.disabled = true;
    createPostBtn.textContent = 'Posting...';

    try {
        const response = await createPost(caption, imageBase64);

        // Clear form
        document.getElementById('postCaption').value = '';
        removeImagePreview();

        // Refresh feed
        currentPage = 1;
        hasMorePosts = true;
        document.getElementById('postsFeed').innerHTML = '';
        await loadFeed();

        // Show success message
        showNotification('Post created successfully!');
    } catch (error) {
        console.error('Create Post Error:', error);
        alert('Failed to create post: ' + error.message);
    } finally {
        createPostBtn.disabled = false;
        createPostBtn.textContent = 'Post';
    }
}

/**
 * Load feed posts with pagination
 */
async function loadFeed() {
    if (isLoading || !hasMorePosts) return;

    isLoading = true;
    document.getElementById('loadingSkeleton').style.display = 'flex';

    try {
        const response = await getFeed(currentPage, 10);
        
        if (!response.posts || response.posts.length === 0) {
            hasMorePosts = false;
            document.getElementById('noMorePosts').style.display = 'block';
        } else {
            renderPosts(response.posts);
            currentPage++;
        }
    } catch (error) {
        console.error('Load Feed Error:', error);
    } finally {
        isLoading = false;
        document.getElementById('loadingSkeleton').style.display = 'none';
    }
}

/**
 * Render posts to DOM
 */
function renderPosts(posts) {
    const feed = document.getElementById('postsFeed');
    const currentUserData = JSON.parse(sessionStorage.getItem('currentUserData') || '{}');

    posts.forEach((post) => {
        const postHTML = createPostElement(post, currentUserData);
        feed.insertAdjacentHTML('beforeend', postHTML);
    });

    // Add event listeners to new posts
    attachPostEventListeners();
}

/**
 * Create post HTML element
 */
function createPostElement(post, currentUser) {
    const isLiked = post.likes?.includes(currentUser._id) || false;
    const likeCount = post.likes?.length || 0;
    const commentCount = post.comments?.length || 0;

    return `
        <div class="post-card" data-post-id="${post._id}">
            <div class="post-header">
                <div class="post-user" onclick="openUserProfile('${post.author.username}')">
                    <img src="${post.author.profileImage || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23e0e0e0%22/%3E%3C/svg%3E'}" alt="${post.author.username}" class="avatar-sm">
                    <div class="post-user-info">
                        <div class="post-username">${sanitizeInput(post.author.username)}</div>
                        <div class="post-time">${formatTimeAgo(post.createdAt)}</div>
                    </div>
                </div>
                ${post.author._id === currentUser._id ? `
                    <button class="post-options" onclick="openPostOptions('${post._id}')">⋮</button>
                ` : ''}
            </div>
            
            ${post.image ? `<img src="${post.image}" alt="Post" class="post-image" loading="lazy">` : ''}
            
            <div class="post-content">
                <div class="post-actions">
                    <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post._id}', this)" title="Like">
                        ${isLiked ? '❤️' : '🤍'}
                    </button>
                    <button class="action-btn" onclick="openComments('${post._id}')" title="Comment">💬</button>
                    <button class="action-btn" title="Share">📤</button>
                </div>
                
                <div class="post-stats">
                    <span onclick="openLikes('${post._id}')" style="cursor: pointer;">${likeCount} likes</span>
                </div>
                
                ${post.caption ? `
                    <div class="post-caption">
                        <strong>${sanitizeInput(post.author.username)}</strong> ${sanitizeInput(post.caption)}
                    </div>
                ` : ''}
                
                ${commentCount > 0 ? `
                    <button class="view-comments-btn" onclick="openComments('${post._id}')">
                        View all ${commentCount} comments
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Attach event listeners to dynamically added posts
 */
function attachPostEventListeners() {
    const posts = document.querySelectorAll('.post-card');
    posts.forEach((post) => {
        const image = post.querySelector('.post-image');
        if (image) {
            image.addEventListener('error', () => {
                image.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22 viewBox=%220 0 400 400%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-family=%22sans-serif%22 font-size=%2230%22 fill=%22%23999%22%3EImage not found%3C/text%3E%3C/svg%3E';
            });
        }
    });
}

/**
 * Toggle like on post
 */
async function toggleLike(postId, button) {
    try {
        const isLiked = button.classList.contains('liked');

        if (isLiked) {
            await unlikePost(postId);
        } else {
            await likePost(postId);
        }

        button.classList.toggle('liked');
        button.textContent = button.classList.contains('liked') ? '❤️' : '🤍';
    } catch (error) {
        console.error('Toggle Like Error:', error);
        alert('Failed to update like');
    }
}

/**
 * Open comments modal
 */
async function openComments(postId) {
    selectedPostId = postId;
    const modal = document.getElementById('commentsModal');
    const commentsContainer = document.getElementById('commentsContainer');

    modal.style.display = 'flex';

    try {
        const comments = await getComments(postId);
        
        commentsContainer.innerHTML = '';
        if (comments.length === 0) {
            commentsContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No comments yet</p>';
        } else {
            comments.forEach((comment) => {
                const commentHTML = `
                    <div class="comment">
                        <img src="${comment.author.profileImage || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%23e0e0e0%22/%3E%3C/svg%3E'}" alt="${comment.author.username}" class="comment-avatar">
                        <div class="comment-body">
                            <div class="comment-username">${sanitizeInput(comment.author.username)}</div>
                            <div class="comment-text">${sanitizeInput(comment.text)}</div>
                        </div>
                    </div>
                `;
                commentsContainer.insertAdjacentHTML('beforeend', commentHTML);
            });
        }
    } catch (error) {
        console.error('Load Comments Error:', error);
        alert('Failed to load comments');
    }
}

/**
 * Close comments modal
 */
function closeCommentsModal() {
    document.getElementById('commentsModal').style.display = 'none';
    selectedPostId = null;
}

/**
 * Submit comment
 */
async function submitComment() {
    const commentInput = document.getElementById('commentInput');
    const text = commentInput.value.trim();

    if (!text) {
        alert('Please enter a comment');
        return;
    }

    if (!selectedPostId) return;

    try {
        await addComment(selectedPostId, text);
        commentInput.value = '';

        // Reload comments
        await openComments(selectedPostId);
    } catch (error) {
        console.error('Submit Comment Error:', error);
        alert('Failed to post comment');
    }
}

// Attach submit comment button listener
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitCommentBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitComment);
    }

    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitComment();
            }
        });
    }

    // Close modal when clicking outside
    const modal = document.getElementById('commentsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCommentsModal();
            }
        });
    }
});

/**
 * Setup infinite scroll
 */
function setupInfiniteScroll() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const scrollHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY;
            const clientHeight = window.innerHeight;

            if (scrollTop + clientHeight >= scrollHeight - 500) {
                loadFeed();
            }
        }, 100);
    });
}

/**
 * Open user profile
 */
function openUserProfile(username) {
    sessionStorage.setItem('viewingUsername', username);
    window.location.href = 'profile.html';
}

/**
 * Open post creation (mobile shortcut)
 */
function openCreate() {
    document.getElementById('postCaption').focus();
}

/**
 * Open search (placeholder)
 */
function openSearch() {
    alert('Search feature coming soon');
}

/**
 * Open post options menu
 */
function openPostOptions(postId) {
    const confirmed = confirm('Delete this post?');
    if (confirmed) {
        deletePostHandler(postId);
    }
}

/**
 * Delete post
 */
async function deletePostHandler(postId) {
    try {
        await deletePost(postId);
        document.querySelector(`[data-post-id="${postId}"]`)?.remove();
        showNotification('Post deleted');
    } catch (error) {
        console.error('Delete Post Error:', error);
        alert('Failed to delete post');
    }
}

/**
 * Show notification
 */
function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary);
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 2000;
        animation: slideDown 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Toggle theme
 */
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('themeToggle').textContent = isDark ? '🌙' : '☀️';
}

/**
 * Setup theme on load
 */
function setupThemeToggle() {
    const theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeToggle').textContent = '🌙';
    }
}

/**
 * Open likes list
 */
function openLikes(postId) {
    alert('Likes list feature coming soon');
}
