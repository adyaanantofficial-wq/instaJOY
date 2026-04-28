/**
 * Profile Module - User profile display and editing
 */

let viewingUsername = null;
let isOwnProfile = false;

document.addEventListener('DOMContentLoaded', () => {
    initializeProfile();
});

function initializeProfile() {
    // Check authentication
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Get username to view
    viewingUsername = sessionStorage.getItem('viewingUsername');
    const currentUser = getCurrentUser();

    if (!viewingUsername) {
        viewingUsername = currentUser.username;
    }

    isOwnProfile = viewingUsername === currentUser.username;

    // Load profile
    loadProfile();

    // Setup event listeners
    setupEventListeners();

    // Setup theme
    setupThemeToggle();
}

/**
 * Load user profile
 */
async function loadProfile() {
    try {
        const profile = await getUserProfile(viewingUsername);

        // Update header
        document.getElementById('profileUsername').textContent = profile.username;
        document.getElementById('profileBio').textContent = profile.bio || '';
        
        const profileImg = document.getElementById('profileImage');
        if (profile.profileImage) {
            profileImg.src = profile.profileImage;
        } else {
            profileImg.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22150%22 viewBox=%220 0 150 150%22%3E%3Ccircle cx=%2275%22 cy=%2275%22 r=%2275%22 fill=%22%23e0e0e0%22/%3E%3C/svg%3E';
        }

        // Update stats
        document.getElementById('postCount').textContent = profile.posts?.length || 0;
        document.getElementById('followersCount').textContent = profile.followers?.length || 0;
        document.getElementById('followingCount').textContent = profile.following?.length || 0;

        // Setup action buttons
        if (isOwnProfile) {
            document.getElementById('editProfileBtn').style.display = 'inline-block';
            document.getElementById('followBtn').style.display = 'none';
        } else {
            document.getElementById('editProfileBtn').style.display = 'none';
            
            const followBtn = document.getElementById('followBtn');
            const isFollowing = profile.followers?.includes(getCurrentUser()._id) || false;
            followBtn.style.display = 'inline-block';
            followBtn.textContent = isFollowing ? 'Unfollow' : 'Follow';
            followBtn.onclick = () => toggleFollow(profile._id, isFollowing);
        }

        // Load posts
        loadUserPosts(profile._id);

        // Cache profile data
        sessionStorage.setItem('viewingProfile', JSON.stringify(profile));
    } catch (error) {
        console.error('Load Profile Error:', error);
        alert('Failed to load profile');
    }
}

/**
 * Load user posts
 */
async function loadUserPosts(userId) {
    try {
        const response = await getPostsByUser(viewingUsername);
        const grid = document.getElementById('userPostsGrid');

        if (!response.posts || response.posts.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">No posts yet</p>';
            return;
        }

        grid.innerHTML = '';
        response.posts.forEach((post) => {
            const postHTML = `
                <div class="grid-post" onclick="openPostDetail('${post._id}')">
                    ${post.image ? `<img src="${post.image}" alt="Post" loading="lazy">` : ''}
                    <div class="grid-post-overlay">
                        <div class="grid-post-stats">
                            <span>❤️ ${post.likes?.length || 0}</span>
                            <span>💬 ${post.comments?.length || 0}</span>
                        </div>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', postHTML);
        });
    } catch (error) {
        console.error('Load User Posts Error:', error);
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const editProfileBtn = document.getElementById('editProfileBtn');
    const profileImage = document.getElementById('profileImage');

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', openEditProfileModal);
    }

    if (profileImage && isOwnProfile) {
        profileImage.style.cursor = 'pointer';
        profileImage.addEventListener('click', () => {
            document.getElementById('profileImageInput').click();
        });

        document.getElementById('profileImageInput').addEventListener('change', handleProfileImageChange);
    }

    // Setup edit profile form
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', handleEditProfile);
    }

    // Update bio character count
    const bioInput = document.getElementById('editBio');
    if (bioInput) {
        bioInput.addEventListener('input', (e) => {
            document.getElementById('bioCount').textContent = `${e.target.value.length}/150`;
        });
    }

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

/**
 * Open edit profile modal
 */
function openEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    const profile = JSON.parse(sessionStorage.getItem('viewingProfile') || '{}');

    document.getElementById('editUsername').value = profile.username;
    document.getElementById('editBio').value = profile.bio || '';
    document.getElementById('bioCount').textContent = `${(profile.bio || '').length}/150`;

    modal.style.display = 'flex';

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditProfileModal();
        }
    });
}

/**
 * Close edit profile modal
 */
function closeEditProfileModal() {
    document.getElementById('editProfileModal').style.display = 'none';
}

/**
 * Handle profile image change
 */
async function handleProfileImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const compressedImage = await compressImage(file, 400);
        
        // Update profile
        await updateProfile(null, compressedImage);

        // Update UI
        document.getElementById('profileImage').src = compressedImage;

        showNotification('Profile picture updated');
    } catch (error) {
        console.error('Profile Image Update Error:', error);
        alert('Failed to update profile picture');
    }
}

/**
 * Handle edit profile form submission
 */
async function handleEditProfile(e) {
    e.preventDefault();

    const bio = document.getElementById('editBio').value.trim();
    const profileImage = sessionStorage.getItem('profileImage');

    try {
        await updateProfile(bio, profileImage);

        showNotification('Profile updated successfully');
        closeEditProfileModal();

        // Reload profile
        await loadProfile();
    } catch (error) {
        console.error('Edit Profile Error:', error);
        alert('Failed to update profile: ' + error.message);
    }
}

/**
 * Toggle follow/unfollow
 */
async function toggleFollow(userId, isFollowing) {
    try {
        if (isFollowing) {
            await unfollow(userId);
        } else {
            await follow(userId);
        }

        // Reload profile
        await loadProfile();
        showNotification(isFollowing ? 'Unfollowed' : 'Followed');
    } catch (error) {
        console.error('Toggle Follow Error:', error);
        alert('Failed to update follow status');
    }
}

/**
 * Open post detail
 */
function openPostDetail(postId) {
    alert('Post detail view coming soon');
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
