// Spóra service worker: shows the daily reminder pushes and opens the app when one is tapped.
// No caching — the app always loads fresh from the network.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let msg = { title: 'Spóra', body: 'Ne felejtsd el beírni a mai költéseket!' };
  try { msg = { ...msg, ...event.data.json() }; } catch { /* keep the default text */ }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'spora-reminder',      // a newer reminder replaces an unread older one
    renotify: true,
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find(w => w.url.startsWith(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
