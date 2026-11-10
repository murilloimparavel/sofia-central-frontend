import api from '@/services/core/api';

const ACTIVE_KEY = 'sofia-web-push-active';

export function supportsWebPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(padded);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/push-worker.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

async function save(subscription: PushSubscription): Promise<void> {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys?.auth) throw new Error('Invalid push subscription');
  await api.post('/notification_subscriptions', {
    notification_subscription: {
      subscription_type: 'browser_push',
      subscription_attributes: { endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth },
    },
  });
  localStorage.setItem(ACTIVE_KEY, '1');
}

export async function enableWebPush(): Promise<void> {
  if (!supportsWebPush()) throw new Error('unsupported');
  // This call must occur directly in the click handler, especially on iOS.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission');
  const worker = await registration();
  const response = await api.get<{ vapid_public_key: string }>('/notification_subscriptions');
  const key = response.data.vapid_public_key;
  if (!key) throw new Error('missing-key');
  const existing = await worker.pushManager.getSubscription();
  const subscription = existing || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) });
  await save(subscription);
}

export async function syncWebPush(): Promise<boolean> {
  if (!supportsWebPush() || Notification.permission !== 'granted') return false;
  const worker = await navigator.serviceWorker.getRegistration('/');
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) {
    localStorage.removeItem(ACTIVE_KEY);
    return false;
  }
  try {
    await save(subscription);
    return true;
  } catch (error) {
    localStorage.removeItem(ACTIVE_KEY);
    throw error;
  }
}

export async function disableWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const worker = await navigator.serviceWorker.getRegistration('/');
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) {
    localStorage.removeItem(ACTIVE_KEY);
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
  if (unsubscribed) localStorage.removeItem(ACTIVE_KEY);
  if (failed || !unsubscribed) throw new Error('unsubscribe-failed');
}

export function hasActiveWebPush(): boolean {
  try { return localStorage.getItem(ACTIVE_KEY) === '1'; } catch { return false; }
}
