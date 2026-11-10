import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/services/core/api', () => ({ default: api }));
import { disableWebPush, enableWebPush, syncWebPush } from './webPushService';

describe('web push subscription lifecycle', () => {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'public-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const manager = { getSubscription: vi.fn(), subscribe: vi.fn() };
  const worker = { pushManager: manager };
  const requestPermission = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted', requestPermission } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn().mockResolvedValue(worker), ready: Promise.resolve(worker), getRegistration: vi.fn().mockResolvedValue(worker) } });
    requestPermission.mockResolvedValue('granted');
    manager.getSubscription.mockResolvedValue(null);
    manager.subscribe.mockResolvedValue(subscription);
    api.get.mockResolvedValue({ data: { vapid_public_key: 'YWJjZA' } });
    api.post.mockResolvedValue({});
    api.delete.mockResolvedValue({});
    subscription.unsubscribe.mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it('registers a new subscription with the authenticated API', async () => {
    await enableWebPush();
    expect(manager.subscribe).toHaveBeenCalledOnce();
    expect(api.post).toHaveBeenCalledWith('/notification_subscriptions', {
      notification_subscription: { subscription_type: 'browser_push', subscription_attributes: { endpoint: subscription.endpoint, p256dh: 'public-key', auth: 'auth-key' } },
    });
  });

  it('does not create an endpoint when permission is denied', async () => {
    requestPermission.mockResolvedValue('denied');
    await expect(enableWebPush()).rejects.toThrow('permission');
    expect(manager.subscribe).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('re-registers an existing subscription for the current session', async () => {
    manager.getSubscription.mockResolvedValue(subscription);
    expect(await syncWebPush()).toBe(true);
    expect(api.post).toHaveBeenCalledOnce();
  });

  it('replaces a subscription when the server VAPID key changes', async () => {
    const stale = { ...subscription, options: { applicationServerKey: new Uint8Array([0, 1]).buffer } };
    manager.getSubscription.mockResolvedValue(stale);
    expect(await syncWebPush()).toBe(true);
    expect(api.delete).toHaveBeenCalledOnce();
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(manager.subscribe).toHaveBeenCalledOnce();
  });

  it('removes the local subscription even if the server is unavailable', async () => {
    manager.getSubscription.mockResolvedValue(subscription);
    api.delete.mockRejectedValue(new Error('offline'));
    await expect(disableWebPush()).rejects.toThrow('unsubscribe-failed');
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
