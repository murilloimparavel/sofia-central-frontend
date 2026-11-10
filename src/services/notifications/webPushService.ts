import api from '@/services/core/api';
import { useAuthStore } from '@/store/authStore';

const ACTIVE_KEY = 'sofia-web-push-active';
const OWNER_KEY = 'sofia-web-push-owner';

function currentUserId(): string {
  return String(useAuthStore.getState().currentUser?.id ?? '');
}

function clearLocalState(): void {
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(OWNER_KEY);
}

export function supportsWebPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(padded);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

function sameKey(current: ArrayBuffer, expected: Uint8Array): boolean {
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/push-worker.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

async function save(subscription: PushSubscription, userId: string): Promise<void> {
  if (!userId || currentUserId() !== userId) throw new Error('session-changed');
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys?.auth) throw new Error('Invalid push subscription');
  await api.post('/notification_subscriptions', {
    notification_subscription: {
      subscription_type: 'browser_push',
      subscription_attributes: { endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth },
    },
  });
  if (currentUserId() !== userId) {
    await subscription.unsubscribe();
    clearLocalState();
    throw new Error('session-changed');
  }
  localStorage.setItem(OWNER_KEY, userId);
  localStorage.setItem(ACTIVE_KEY, '1');
}

export async function enableWebPush(): Promise<void> {
  if (!supportsWebPush()) throw new Error('unsupported');
  const userId = currentUserId();
  if (!userId) throw new Error('session-changed');
  // This call must occur directly in the click handler, especially on iOS.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission');
  const worker = await registration();
  const response = await api.get<{ vapid_public_key: string }>('/notification_subscriptions');
  const key = response.data.vapid_public_key;
  if (!key) throw new Error('missing-key');
  const expectedKey = applicationServerKey(key);
  let existing = await worker.pushManager.getSubscription();
  if (existing && localStorage.getItem(OWNER_KEY) !== userId) {
    await existing.unsubscribe();
    clearLocalState();
    existing = null;
  }
  const currentKey = existing?.options?.applicationServerKey;
  if (existing && currentKey && !sameKey(currentKey, expectedKey)) {
    await removeWebPush();
    existing = null;
  }
  const subscription = existing || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
  await save(subscription, userId);
}

let pendingSync: Promise<boolean> | undefined;

export function syncWebPush(): Promise<boolean> {
  if (!pendingSync) pendingSync = performSync().finally(() => { pendingSync = undefined; });
  return pendingSync;
}

async function performSync(): Promise<boolean> {
  const userId = currentUserId();
  if (!userId) return false;
  if (!supportsWebPush() || Notification.permission !== 'granted') {
    clearLocalState();
    return false;
  }
  const worker = await navigator.serviceWorker.getRegistration('/');
  let subscription = await worker?.pushManager.getSubscription();
  if (!worker || !subscription) {
    clearLocalState();
    return false;
  }
  if (localStorage.getItem(OWNER_KEY) !== userId) {
    await subscription.unsubscribe();
    clearLocalState();
    return false;
  }
  try {
    const response = await api.get<{ vapid_public_key: string }>('/notification_subscriptions');
    const key = response.data.vapid_public_key;
    if (!key) throw new Error('missing-key');
    const expectedKey = applicationServerKey(key);
    const currentKey = subscription.options?.applicationServerKey;
    if (currentKey && !sameKey(currentKey, expectedKey)) {
      await removeWebPush();
      subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
    }
    await save(subscription, userId);
    return true;
  } catch (error) {
    clearLocalState();
    throw error;
  }
}

export async function disconnectLocalWebPush(): Promise<void> {
  await pendingSync?.catch(() => {});
  clearLocalState();
  if (!('serviceWorker' in navigator)) return;
  const worker = await navigator.serviceWorker.getRegistration('/');
  const subscription = await worker?.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
}

export async function disableWebPush(): Promise<void> {
  await pendingSync?.catch(() => {});
  await removeWebPush();
}

async function removeWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const worker = await navigator.serviceWorker.getRegistration('/');
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) {
    clearLocalState();
    return;
  }
  // Remove the local capability even when the network request fails.
  let failed = false;
  try {
    await api.delete('/notification_subscriptions', { data: { endpoint: subscription.endpoint }, timeout: 5000 });
  } catch {
    failed = true;
  }
  const unsubscribed = await subscription.unsubscribe();
  if (unsubscribed) clearLocalState();
  if (failed || !unsubscribed) throw new Error('unsubscribe-failed');
}

export function hasActiveWebPush(): boolean {
  try { return localStorage.getItem(ACTIVE_KEY) === '1'; } catch { return false; }
}
