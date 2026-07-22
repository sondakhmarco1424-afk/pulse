// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyBAGMlFH6TU1Doo-4uqeEn0s-THnk7mX-s",
  authDomain: "pulse-89cd2.firebaseapp.com",
  projectId: "pulse-89cd2",
  storageBucket: "pulse-89cd2.firebasestorage.app",
  messagingSenderId: "654281558381",
  appId: "1:654281558381:web:7942a262042a9a38a53264"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Extract title and body from data payload (which Go backend uses) or standard notification object
  const notificationTitle = payload.data?.title || payload.notification?.title || "Crypto Alert!";
  
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || "Price alert triggered.",
    icon: '/favicon.ico',
    tag: 'price-alert',
    renotify: true,
    data: {
      symbol: payload.data?.symbol,
      price: payload.data?.price,
      title: notificationTitle,
      body: payload.data?.body || payload.notification?.body || "Price alert triggered.",
      rawPayload: payload
    }
  };

  // Broadcast to open client windows so FE updates logs and toasts in real-time
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    windowClients.forEach((client) => {
      client.postMessage({
        type: 'FCM_BACKGROUND_MESSAGE',
        payload: payload
      });
    });
  });

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const symbol = notificationData.symbol;
  const urlToOpen = symbol ? `${self.location.origin}/?symbol=${encodeURIComponent(symbol)}` : self.location.origin;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      const urlObj = new URL(urlToOpen, self.location.origin);
      const targetOriginPath = urlObj.origin + urlObj.pathname;

      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        try {
          const clientUrlObj = new URL(client.url);
          const clientOriginPath = clientUrlObj.origin + clientUrlObj.pathname;
          
          if (clientOriginPath === targetOriginPath && 'focus' in client) {
            client.postMessage({
              type: 'FCM_NOTIFICATION_CLICK',
              payload: notificationData.rawPayload || {
                data: notificationData,
                notification: { title: notificationData.title, body: notificationData.body }
              }
            });
            return client.focus();
          }
        } catch (e) {
          console.error('Error comparing client URLs:', e);
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
