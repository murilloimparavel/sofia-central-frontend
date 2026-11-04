import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/services/core/api';
import { disableWebPush, enableWebPush, isWebPushEnabled, syncWebPush, sendWebPushTest } from './webPushService';
vi.mock('@/services/core/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
const subscription = {
  endpoint: 'https://push.example/device',
  toJSON: () => ({ endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'auth' } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};
const reg = {
  active: { postMessage: vi.fn((_data, ports) => ports[0].postMessage({ ok: true })) },
  pushManager: { getSubscription: vi.fn(), subscribe: vi.fn().mockResolvedValue(subscription) },
};
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') });
  vi.stubGlobal('MessageChannel', class {
    port1 = { onmessage: null as null | (() => void), close: vi.fn() };
    port2 = { postMessage: () => this.port1.onmessage?.() };
  });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: vi.fn().mockResolvedValue(reg), getRegistration: vi.fn().mockResolvedValue(reg),
  } });
  reg.pushManager.getSubscription.mockResolvedValue(subscription);
  vi.mocked(api.post).mockResolvedValue({ data: {} });
  vi.mocked(api.delete).mockResolvedValue({ data: {} });
  vi.mocked(api.get).mockResolvedValue({ data: { public_key: 'AQID' } });
});
describe('web push lifecycle', () => {
  it('sends the test request only for the current enrolled endpoint', async () => {
    localStorage.setItem('sofia-web-push-enabled', 'true');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { delay_seconds: 10 } });
    expect(await sendWebPushTest()).toBe(10);
    expect(api.post).toHaveBeenCalledWith('/notification_subscriptions/test', { endpoint: subscription.endpoint });
  });
  it('requires real enrollment before sending a test', async () => {
    await expect(sendWebPushTest()).rejects.toThrow('Ative as notificações');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('does not treat permission alone as an active subscription', async () => {
    expect(await isWebPushEnabled()).toBe(false);
    localStorage.setItem('sofia-web-push-enabled', 'true');
    expect(await isWebPushEnabled()).toBe(true);
    reg.pushManager.getSubscription.mockResolvedValueOnce(null);
    expect(await isWebPushEnabled()).toBe(false);
  });
  it('registers the flattened browser keys and associates the worker with the user', async () => {
    await enableWebPush('u1');
    expect(api.post).toHaveBeenCalledWith('/notification_subscriptions', {
      notification_subscription: { subscription_type: 'browser_push', subscription_attributes: {
        endpoint: subscription.endpoint, p256dh: 'key', auth: 'auth',
      } },
    });
    expect(reg.active.postMessage).toHaveBeenLastCalledWith({ type: 'PUSH_USER', userId: 'u1' }, expect.any(Array));
    expect(await isWebPushEnabled()).toBe(true);
  });
  it('creates a subscription with the existing public VAPID key', async () => {
    reg.pushManager.getSubscription.mockResolvedValueOnce(null);
    await enableWebPush('u1');
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) });
  });
  it('does not register an endpoint when permission is denied', async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValueOnce('denied');
    await expect(enableWebPush('u1')).rejects.toThrow('Permita as notificações');
    expect(api.post).not.toHaveBeenCalled();
    expect(localStorage.getItem('sofia-web-push-enabled')).toBeNull();
  });
  it('does not reactivate a user when logout overlaps enrollment', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const enabling = enableWebPush('u1');
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());
    await disableWebPush();
    finish({ data: {} });
    await enabling;
    expect(reg.active.postMessage).toHaveBeenLastCalledWith({ type: 'PUSH_USER', userId: null }, expect.any(Array));
    expect(localStorage.getItem('sofia-web-push-enabled')).toBeNull();
  });
  it('does not mark push enabled when registration with the API fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('offline'));
    await expect(enableWebPush('u1')).rejects.toThrow('offline');
    expect(await isWebPushEnabled()).toBe(false);
  });
  it('unsubscribes locally when the server is unreachable during logout', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error('offline'));
    await expect(disableWebPush()).rejects.toThrow('offline');
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(reg.active.postMessage).toHaveBeenCalledWith({ type: 'PUSH_USER', userId: null }, expect.any(Array));
  });
  it('unsubscribes even if the service worker cannot acknowledge logout', async () => {
    reg.active.postMessage.mockImplementationOnce(() => { throw new Error('worker unavailable'); });
    await expect(disableWebPush()).rejects.toThrow('worker unavailable');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
  it('does not prompt for permission or subscribe without a previous opt-in during login', async () => {
    await syncWebPush('u2');
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
