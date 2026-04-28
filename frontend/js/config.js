window.INSTAJOY_CONFIG = Object.freeze({
    API_BASE_URL:
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:5000/api`
            : 'https://your-render-service.onrender.com/api',
    DEFAULT_AVATAR: 'ilogo.png',
    TOKEN_KEY: 'instajoy_access_token',
    REFRESH_TOKEN_KEY: 'instajoy_refresh_token',
    USER_KEY: 'instajoy_user',
});
