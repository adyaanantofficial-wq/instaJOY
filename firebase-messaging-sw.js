importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDp-lZXneB4AKTsNeWVuMeZahQsvl3jzNo',
  authDomain: 'instajoy-78c2e.firebaseapp.com',
  projectId: 'instajoy-78c2e',
  messagingSenderId: '594278123145',
  appId: '1:594278123145:web:341a4ba842afb33f04e858',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload?.notification || {};

  self.registration.showNotification(notification.title || 'instaJOY', {
    body: notification.body || 'You have a new update.',
    icon: './ilogo.png',
    badge: './ilogo.png',
    data: payload?.data || {},
  });
});
