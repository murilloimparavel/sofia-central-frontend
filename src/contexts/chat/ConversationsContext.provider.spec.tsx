import React, { useContext } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/types/chat/api';
import { chatService } from '@/services/chat/chatService';
import { ConversationsProvider } from './ConversationsContext';
import { ConversationsContext } from './ConversationsContextInstance';

vi.mock('@/services/chat/chatService', () => ({
  chatService: {
    getConversation: vi.fn(),
    markConversationAsRead: vi.fn(),
  },
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 'agent-1' } }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const conversation = (id: string): Conversation => ({
  id,
  uuid: id,
  status: 'open',
  unread_count: 0,
} as Conversation);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('ConversationsProvider specific conversation requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares one request across concurrent loads and selection', async () => {
    const pending = deferred<Conversation>();
    vi.mocked(chatService.getConversation).mockReturnValueOnce(pending.promise as never);
    let api!: NonNullable<React.ContextType<typeof ConversationsContext>>;
    function Consumer() {
      api = useContext(ConversationsContext)!;
      return null;
    }
    render(<ConversationsProvider><Consumer /></ConversationsProvider>);

    let first!: Promise<Conversation | null>;
    let second!: Promise<Conversation | null>;
    let selection!: Promise<void>;
    await act(async () => {
      first = api.loadSpecificConversation('conv-a');
      second = api.loadSpecificConversation('conv-a');
      selection = api.selectConversation('conv-a') as Promise<void>;
      expect(second).toBe(first);
      expect(chatService.getConversation).toHaveBeenCalledTimes(1);
      pending.resolve(conversation('conv-a'));
      await Promise.all([first, second, selection]);
    });

    expect(await first).toEqual(conversation('conv-a'));
    expect(api.state.conversations).toHaveLength(1);
    expect(api.state.selectedConversationId).toBe('conv-a');
    expect(api.state.selectedConversationData?.id).toBe('conv-a');
  });

  it('does not replace a newer selection when an earlier response arrives late', async () => {
    const oldRequest = deferred<Conversation>();
    const newRequest = deferred<Conversation>();
    vi.mocked(chatService.getConversation).mockImplementation(id =>
      (id === 'old' ? oldRequest.promise : newRequest.promise) as never);
    let api!: NonNullable<React.ContextType<typeof ConversationsContext>>;
    function Consumer() {
      api = useContext(ConversationsContext)!;
      return null;
    }
    render(<ConversationsProvider><Consumer /></ConversationsProvider>);

    await act(async () => {
      const oldSelection = api.selectConversation('old') as Promise<void>;
      const newSelection = api.selectConversation('new') as Promise<void>;
      newRequest.resolve(conversation('new'));
      await newSelection;
      oldRequest.resolve(conversation('old'));
      await oldSelection;
    });

    expect(chatService.getConversation).toHaveBeenCalledTimes(2);
    expect(api.state.selectedConversationId).toBe('new');
    expect(api.state.selectedConversationData?.id).toBe('new');
  });

  it('releases a failed request so a later attempt can retry', async () => {
    const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred<Conversation>();
    vi.mocked(chatService.getConversation)
      .mockReturnValueOnce(pending.promise as never)
      .mockResolvedValueOnce(conversation('conv-a') as never);
    let api!: NonNullable<React.ContextType<typeof ConversationsContext>>;
    function Consumer() {
      api = useContext(ConversationsContext)!;
      return null;
    }
    render(<ConversationsProvider><Consumer /></ConversationsProvider>);

    await act(async () => {
      const first = api.loadSpecificConversation('conv-a');
      const second = api.loadSpecificConversation('conv-a');
      pending.reject(new Error('offline'));
      expect(await Promise.all([first, second])).toEqual([null, null]);
    });
    await act(async () => {
      expect((await api.loadSpecificConversation('conv-a'))?.id).toBe('conv-a');
    });

    expect(chatService.getConversation).toHaveBeenCalledTimes(2);
    loggedError.mockRestore();
  });
});
