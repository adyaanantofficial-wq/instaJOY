/**
 * Authentication Module - Login and Signup
 */

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
});

function initializeAuth() {
    // Check if already logged in
    if (isAuthenticated()) {
        window.location.href = 'feed.html';
        return;
    }

    // Setup event listeners
    const loginForm = document.getElementById('loginFormElement');
    const signupForm = document.getElementById('signupFormElement');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Theme toggle
    setupThemeToggle();
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');

    // Validation
    if (!email || !password) {
        showError(errorDiv, 'Please fill in all fields');
        return;
    }

    if (!isValidEmail(email)) {
        showError(errorDiv, 'Invalid email format');
        return;
    }

    // Disable button during request
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
        const response = await login(email, password);

        // Store user data
        localStorage.setItem('currentUser', JSON.stringify(response.user));

        // Redirect to feed
        window.location.href = 'feed.html';
    } catch (error) {
        showError(errorDiv, error.message || 'Login failed. Check your credentials.');
        console.error('Login Error:', error);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
}

/**
 * Handle signup form submission
 */
async function handleSignup(e) {
    e.preventDefault();

    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const signupBtn = document.getElementById('signupBtn');
    const errorDiv = document.getElementById('signupError');

    // Validation
    if (!username || !email || !password || !confirmPassword) {
        showError(errorDiv, 'Please fill in all fields');
        return;
    }

    if (username.length < 3) {
        showError(errorDiv, 'Username must be at least 3 characters');
        return;
    }

    if (!isValidEmail(email)) {
        showError(errorDiv, 'Invalid email format');
        return;
    }

    if (password.length < 6) {
        showError(errorDiv, 'Password must be at least 6 characters');
        return;
    }

    if (password !== confirmPassword) {
        showError(errorDiv, 'Passwords do not match');
        return;
    }

    // Disable button during request
    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating Account...';

    try {
        const response = await register(username, email, password);

        // Store user data
        localStorage.setItem('currentUser', JSON.stringify(response.user));

        // Redirect to feed
        window.location.href = 'feed.html';
    } catch (error) {
        showError(errorDiv, error.message || 'Signup failed. Username or email may be taken.');
        console.error('Signup Error:', error);
    } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = 'Create Account';
    }
}

/**
 * Toggle between login and signup forms
 */
function toggleAuthForm() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    loginForm.classList.toggle('active');
    signupForm.classList.toggle('active');

    // Clear error messages
    const loginError = document.getElementById('loginError');
    const signupError = document.getElementById('signupError');
    
    if (loginError) loginError.style.display = 'none';
    if (signupError) signupError.style.display = 'none';
}

/**
 * Display error message
 */
function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.className = 'form-message error';
    element.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

/**
 * Setup theme toggle
 */
function setupThemeToggle() {
    const theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}
