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

  const dataPayload = payload.data || payload.FCM_MSG?.data || payload;
  const notificationTitle = dataPayload.title || payload.notification?.title || "🚨 Crypto Alert Triggered!";
  const notificationBody = dataPayload.body || payload.notification?.body || "Price threshold crossed.";
  
  let symbol = dataPayload.symbol || payload.symbol;
  if (!symbol) {
    const match = (notificationBody + ' ' + notificationTitle).match(/([A-Z0-9]{3,10}USDT)/i);
    if (match) symbol = match[1].toUpperCase();
  }

  const notificationOptions = {
    body: notificationBody,
    icon: '/favicon.ico',
    tag: symbol ? `alert-${symbol}` : 'price-alert',
    renotify: true,
    data: {
      symbol: symbol,
      price: dataPayload.price,
      title: notificationTitle,
      body: notificationBody,
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

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const rawData = event.notification.data || {};
  const dataPayload = rawData.FCM_MSG?.data || rawData.data || rawData;
  let symbol = dataPayload.symbol || rawData.symbol;

  if (!symbol) {
    const textToSearch = (event.notification.body || '') + ' ' + (event.notification.title || '');
    const match = textToSearch.match(/([A-Z0-9]{3,10}USDT)/i);
    if (match) {
      symbol = match[1].toUpperCase();
    }
  }

  // Ensure target URL dynamically uses self.location.origin and strips any hardcoded localhost:3000
  const currentOrigin = self.location.origin;
  let rawLink = dataPayload.link || dataPayload.url || dataPayload.click_action || dataPayload.urlToOpen || '';
  if (rawLink.includes('localhost:3000')) {
    rawLink = rawLink.replace(/http:\/\/localhost:3000/g, currentOrigin);
  }

  let urlToOpen = currentOrigin;
  if (rawLink && !rawLink.includes('localhost')) {
    try {
      const parsed = new URL(rawLink, currentOrigin);
      urlToOpen = parsed.origin + parsed.pathname + parsed.search;
    } catch (e) {
      urlToOpen = symbol ? `${currentOrigin}/?symbol=${encodeURIComponent(symbol)}` : currentOrigin;
    }
  } else {
    urlToOpen = symbol ? `${currentOrigin}/?symbol=${encodeURIComponent(symbol)}` : currentOrigin;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      const targetUrlObj = new URL(urlToOpen, currentOrigin);

      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        try {
          const clientUrlObj = new URL(client.url);
          
          // Match any window client on the exact same production origin
          if (clientUrlObj.origin === targetUrlObj.origin) {
            client.postMessage({
              type: 'FCM_NOTIFICATION_CLICK',
              symbol: symbol,
              urlToOpen: urlToOpen,
              payload: dataPayload
            });
            if ('focus' in client) {
              client.focus();
            }
            if ('navigate' in client && client.url !== urlToOpen) {
              return client.navigate(urlToOpen);
            }
            return;
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
