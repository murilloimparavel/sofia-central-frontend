/* This worker handles push only: it does not cache application or API responses. */
self.addEventListener('push', event => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
  } catch { /* show a generic alert */ }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Nova notificação';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const tag = typeof payload.tag === 'string' ? payload.tag : undefined;
  let target = '/conversations';
  try {
    const url = new URL(payload.url, self.location.origin);
    if (url.origin === self.location.origin && /^\/conversations\/[^/]+\/?$/.test(url.pathname)) target = url.pathname;
  } catch { /* retain safe fallback */ }
  event.waitUntil(self.registration.showNotification(title, {
    body, tag, icon: '/favicon-192.png', badge: '/favicon-192.png', data: { target },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.target || '/conversations', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) {
      try {
        const navigated = await client.navigate(target.href);
        if (navigated) await navigated.focus();
        else await self.clients.openWindow(target.href);
      } catch {
        await self.clients.openWindow(target.href);
      }
    } else {
      await self.clients.openWindow(target.href);
    }
  })());
});
