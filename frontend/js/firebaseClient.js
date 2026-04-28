window.INSTAJOY_FCM = (() => {
  const config = window.INSTAJOY_CONFIG || {};
  const firebaseConfig = {
    apiKey: config.FIREBASE_API_KEY,
    authDomain: `${config.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: config.FIREBASE_PROJECT_ID,
    messagingSenderId: config.FIREBASE_MESSAGING_SENDER_ID,
    appId: config.FIREBASE_APP_ID,
  };

  function initFirebase() {
    if (!window.firebase || !window.firebase.messaging) {
      console.warn('Firebase messaging not available');
      return null;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    return firebase.messaging();
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        return registration;
      } catch (error) {
        console.warn('Service worker registration failed', error);
      }
    }

    return null;
  }

  async function getFcmToken() {
    const messaging = initFirebase();
    if (!messaging || !config.FIREBASE_VAPID_KEY) {
      return null;
    }

    try {
      await registerServiceWorker();
      const token = await messaging.getToken({ vapidKey: config.FIREBASE_VAPID_KEY });
      return token;
    } catch (error) {
      console.warn('Unable to get FCM token', error);
      return null;
    }
  }

  async function requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return {
    initFirebase,
    requestPermission,
    getFcmToken,
  };
})();
