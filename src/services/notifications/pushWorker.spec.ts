import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => { handlers[type] = handler; },
    location: { origin: 'https://crm.example' },
    registration: { showNotification },
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
  };
  runInNewContext(readFileSync('public/push-worker.js', 'utf8'), { self, URL });
  return { handlers, showNotification, openWindow };
}

describe('push worker', () => {
  it('shows message details and keeps the conversation path', async () => {
    const { handlers, showNotification } = worker();
    let pending: Promise<unknown> | undefined;
    handlers.push({ data: { json: () => ({ title: 'Ana', body: 'Olá', url: 'https://crm.example/conversations/123' }) }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(showNotification).toHaveBeenCalledWith('Ana', expect.objectContaining({ body: 'Olá', data: { target: '/conversations/123' } }));
  });

  it('shows a safe generic notification for null data and rejects external targets', async () => {
    const { handlers, showNotification } = worker();
    handlers.push({ data: { json: () => null }, waitUntil: () => {} });
    expect(showNotification).toHaveBeenCalledWith('Nova notificação', expect.objectContaining({ data: { target: '/conversations' } }));
    handlers.push({ data: { json: () => ({ url: 'https://evil.example/conversations/123' }) }, waitUntil: () => {} });
    expect(showNotification).toHaveBeenLastCalledWith('Nova notificação', expect.objectContaining({ data: { target: '/conversations' } }));
  });

  it('opens the requested conversation when no app window exists', async () => {
    const { handlers, openWindow } = worker();
    let pending: Promise<unknown> | undefined;
    handlers.notificationclick({ notification: { data: { target: '/conversations/123' }, close: vi.fn() }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(openWindow).toHaveBeenCalledWith('https://crm.example/conversations/123');
  });
});
