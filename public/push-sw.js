/* Push only: deliberately no fetch handler or offline cache of CRM data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const stateCache = 'sofia-push-state-v1';
const stateUrl = new URL('/__push_user__', self.location.origin).href;
self.addEventListener('message', event => {
  if (event.data?.type !== 'PUSH_USER') return;
  event.waitUntil((async () => {
    const cache = await caches.open(stateCache);
    await cache.put(stateUrl, new Response(JSON.stringify({ userId: event.data.userId })));
    if (!event.data.userId) {
      for (const notification of await self.registration.getNotifications()) notification.close();
    }
    event.ports[0]?.postMessage({ ok: true });
  })());
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data.json(); } catch { return; }
    if (!payload || typeof payload !== 'object') return;
    const cache = await caches.open(stateCache);
    const state = await cache.match(stateUrl);
    const userId = state ? (await state.json()).userId : null;
    if (!userId || String(payload.user_id) !== String(userId)) return;
    // Native push is the only system-notification path when subscribed; the
    // websocket keeps updating the in-app notification list without duplicates.
    await self.registration.showNotification(payload.title || 'SOFIA Central', {
      body: payload.body || 'Abra o app para ver a mensagem.',
      icon: '/favicon-192.png',
      tag: payload.tag,
      data: { url: payload.url, userId },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const cache = await caches.open(stateCache);
    const state = await cache.match(stateUrl);
    if (!state || String((await state.json()).userId) !== String(event.notification.data.userId)) return;
    const target = new URL(event.notification.data.url || '/conversations', self.location.origin);
    const allowedPath = /^\/conversations\/\d+$/.test(target.pathname) || target.pathname === '/profile/notificacoes';
    if (target.origin !== self.location.origin || !allowedPath) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(item => new URL(item.url).origin === target.origin);
    if (client) { await client.navigate(target.href); await client.focus(); }
    else await self.clients.openWindow(target.href);
  })());
});
