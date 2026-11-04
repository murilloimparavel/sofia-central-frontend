import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function worker() {
  const handlers = {}, shown = [], opened = [];
  const store = new Map();
  const self = {
    location: { origin: 'https://crm.example.com' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    registration: { showNotification: async (...args) => shown.push(args), getNotifications: async () => [] },
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
  };
  vm.runInNewContext(readFileSync(new URL('../../public/push-sw.js', import.meta.url), 'utf8'), {
    self, URL, Response,
    caches: { open: async () => ({ put: async (k, v) => store.set(k, v), match: async k => store.get(k)?.clone() }) },
  });
  const dispatch = async (name, data) => {
    let done;
    handlers[name]({ ...data, waitUntil: promise => { done = promise; } });
    await done;
  };
  return { shown, opened, dispatch, user: userId => dispatch('message', { data: { type: 'PUSH_USER', userId }, ports: [] }) };
}
const payload = { user_id: 'u1', title: 'WhatsApp · Reservas', body: 'Abra o app para ver a mensagem.', tag: 'notification-1', url: 'https://crm.example.com/conversations/42' };
test('shows the channel for the subscribed user and carries the conversation URL', async () => {
  const w = worker(); await w.user('u1');
  await w.dispatch('push', { data: { json: () => payload } });
  assert.equal(w.shown[0][0], 'WhatsApp · Reservas');
  assert.equal(w.shown[0][1].data.url, payload.url);
});
test('does not expose notifications after logout or to a different user', async () => {
  const w = worker(); await w.user('u2');
  await w.dispatch('push', { data: { json: () => payload } });
  await w.user(null);
  await w.dispatch('push', { data: { json: () => payload } });
  assert.equal(w.shown.length, 0);
});
test('click opens the conversation, rejects external URLs and stale user alerts', async () => {
  const w = worker(); await w.user('u1');
  const click = url => w.dispatch('notificationclick', { notification: { close() {}, data: { userId: 'u1', url } } });
  await click(payload.url);
  await click('https://evil.example/conversations/42');
  await click('https://crm.example.com/settings');
  await w.user('u2'); await click(payload.url);
  assert.deepEqual(w.opened, [payload.url]);
});
test('malformed push payload does not crash the worker', async () => {
  const w = worker(); await w.user('u1');
  await w.dispatch('push', { data: { json: () => { throw Error('invalid JSON'); } } });
  assert.equal(w.shown.length, 0);
});
