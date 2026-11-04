import api from '@/services/core/api';

let sessionGeneration = 0;
const preferenceKey = 'sofia-web-push-enabled';
const ownerKey = 'sofia-web-push-user';
export const needsHomeScreen = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  && !window.matchMedia('(display-mode: standalone)').matches
  && !(navigator as Navigator & { standalone?: boolean }).standalone;
export const supportsWebPush = () => window.isSecureContext && 'serviceWorker' in navigator
  && 'PushManager' in window && 'Notification' in window;

async function registration() {
  return navigator.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' });
}

async function setWorkerUser(reg: ServiceWorkerRegistration, userId: string | null) {
  const ready = reg.active ? reg : await navigator.serviceWorker.ready;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error('Não foi possível configurar as notificações.')), 5000);
    channel.port1.onmessage = () => { window.clearTimeout(timeout); resolve(); channel.port1.close(); };
    try { ready.active!.postMessage({ type: 'PUSH_USER', userId }, [channel.port2]); }
    catch (error) { window.clearTimeout(timeout); channel.port1.close(); reject(error); }
  });
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  await api.post('/notification_subscriptions', {
    notification_subscription: {
      subscription_type: 'browser_push',
      subscription_attributes: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    },
  });
}

export async function isWebPushEnabled() {
  if (!supportsWebPush() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  return localStorage.getItem(preferenceKey) === 'true' && !!(await reg?.pushManager.getSubscription());
}

export async function enableWebPush(userId: string) {
  const generation = ++sessionGeneration;
  if (needsHomeScreen()) throw new Error('No iPhone, use Compartilhar → Adicionar à Tela de Início. Abra o app pelo ícone e ative as notificações.');
  if (!supportsWebPush()) throw new Error('Este navegador não suporta push. Abra o app em um navegador compatível com HTTPS.');
  // Request synchronously from the user's tap, before network/service-worker awaits (iOS).
  if (await Notification.requestPermission() !== 'granted') throw new Error('Permita as notificações nos ajustes do navegador ou do aparelho.');
  const reg = await registration();
  await setWorkerUser(reg, null);
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const response = await api.get('/notification_subscriptions');
    const key: string = (response.data.data ?? response.data).public_key;
    const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  }
  await saveSubscription(subscription);
  if (generation !== sessionGeneration) return;
  await setWorkerUser(reg, userId);
  localStorage.setItem(ownerKey, userId);
  localStorage.setItem(preferenceKey, 'true');
}

export async function disableWebPush(removeFromServer = true) {
  ++sessionGeneration;
  localStorage.removeItem(preferenceKey);
  localStorage.removeItem(ownerKey);
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  if (!reg) return;
  let workerError: unknown;
  try { await setWorkerUser(reg, null); } catch (error) { workerError = error; }
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  // Unsubscribe locally even if the API is unreachable during logout.
  try { if (removeFromServer) await api.delete('/notification_subscriptions', { data: { endpoint: subscription.endpoint } }); }
  finally { await subscription.unsubscribe(); }
  if (workerError) throw workerError;
}

export async function syncWebPush(userId: string) {
  const generation = ++sessionGeneration;
  if (!supportsWebPush()) return;
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  if (!reg) return;
  if (localStorage.getItem(ownerKey) !== userId) await setWorkerUser(reg, null);
  if (localStorage.getItem(preferenceKey) !== 'true' || Notification.permission !== 'granted') return;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) { localStorage.removeItem(preferenceKey); return; }
  await saveSubscription(subscription);
  if (generation !== sessionGeneration) return;
  await setWorkerUser(reg, userId);
  localStorage.setItem(ownerKey, userId);
}

export async function sendWebPushTest(): Promise<number> {
  if (!(await isWebPushEnabled())) throw new Error('Ative as notificações neste aparelho antes de enviar um teste.');
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) throw new Error('Ative novamente as notificações neste aparelho.');
  const response = await api.post('/notification_subscriptions/test', { endpoint: subscription.endpoint });
  return (response.data.data ?? response.data).delay_seconds;
}
