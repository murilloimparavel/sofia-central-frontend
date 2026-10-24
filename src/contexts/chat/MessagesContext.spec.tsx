/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MessagesProvider, useMessages } from './MessagesContext';
import { messagesReducer } from './MessagesContextReducer';
import { chatService } from '@/services/chat/chatService';
import type { Message } from '@/types/chat/api';

vi.mock('@/services/chat/chatService', () => ({
  chatService: {
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageWithAttachments: vi.fn(),
  },
}));

vi.mock('./MessagesContextReducer', async importOriginal => {
  const actual = await importOriginal<typeof import('./MessagesContextReducer')>();
  return { ...actual, messagesReducer: vi.fn(actual.messagesReducer) };
});

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      currentUser: { id: 'user-1', name: 'Agent Test' },
    }),
  },
}));

vi.mock('@/store/unansweredConversationsStore', () => ({
  useUnansweredConversationsStore: {
    getState: () => ({
      fetch: vi.fn(),
    }),
  },
}));

const sampleMessage = (id: string, timestamp: number, convId = 'conv-1'): Message => ({
  id,
  content: `Message ${id}`,
  message_type: 'incoming',
  content_type: 'text',
  status: 'sent',
  created_at: String(timestamp),
  conversation_id: convId,
  sender: { id: 'contact-1', name: 'Customer', type: 'contact' },
  content_attributes: {},
  private: false,
  source_id: null,
  external_source_ids: {},
  attachments: [],
});

describe('MessagesContext optimizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides instant cache (0ms) and avoids duplicate API calls on consecutive loads', async () => {
    const mockMessages = [sampleMessage('m1', 1000), sampleMessage('m2', 2000)];
    vi.mocked(chatService.getMessages).mockResolvedValue({
      data: mockMessages,
      meta: { count: 2 },
    } as any);

    let messagesApi!: ReturnType<typeof useMessages>;

    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }

    render(
      <MessagesProvider>
        <TestConsumer />
      </MessagesProvider>,
    );

    // Initial load
    await act(async () => {
      await messagesApi.loadMessages('conv-1');
    });

    expect(chatService.getMessages).toHaveBeenCalledTimes(1);
    expect(messagesApi.getMessages('conv-1')).toHaveLength(2);

    // Immediate second load should hit memory cache (0ms, no API call)
    await act(async () => {
      await messagesApi.loadMessages('conv-1');
    });

    expect(chatService.getMessages).toHaveBeenCalledTimes(1);
  });

  it('returns stable array reference from getMessages when messages do not change', async () => {
    const mockMessages = [sampleMessage('m1', 1000)];
    vi.mocked(chatService.getMessages).mockResolvedValue({
      data: mockMessages,
      meta: { count: 1 },
    } as any);

    let messagesApi!: ReturnType<typeof useMessages>;

    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }

    render(
      <MessagesProvider>
        <TestConsumer />
      </MessagesProvider>,
    );

    await act(async () => {
      await messagesApi.loadMessages('conv-1');
    });

    const ref1 = messagesApi.getMessages('conv-1');
    const ref2 = messagesApi.getMessages('conv-1');

    // Crucial for performance: reference must be identical to avoid re-rendering entire chat tree
    expect(ref1).toBe(ref2);
  });

  it('syncConversationMessages queries with after: lastPersistedMessage.id and merges new messages', async () => {
    const initial = [sampleMessage('m1', 1000)];
    vi.mocked(chatService.getMessages).mockResolvedValueOnce({
      data: initial,
      meta: { count: 1 },
    } as any);

    let messagesApi!: ReturnType<typeof useMessages>;

    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }

    render(
      <MessagesProvider>
        <TestConsumer />
      </MessagesProvider>,
    );

    await act(async () => {
      await messagesApi.loadMessages('conv-1');
    });

    // Mock incremental sync with m2
    const incremental = [sampleMessage('m2', 2000)];
    vi.mocked(chatService.getMessages).mockResolvedValueOnce({
      data: incremental,
      meta: { count: 1 },
    } as any);

    await act(async () => {
      await messagesApi.syncConversationMessages('conv-1');
    });

    expect(chatService.getMessages).toHaveBeenLastCalledWith('conv-1', {
      after: 'm1',
    });

    const all = messagesApi.getMessages('conv-1');
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('m1');
    expect(all[1].id).toBe('m2');
  });

  it('prefetchMessages populates cache in background without setting messagesLoading', async () => {
    const prefetched = [sampleMessage('m-pre', 1500, 'conv-2')];
    vi.mocked(chatService.getMessages).mockResolvedValueOnce({
      data: prefetched,
      meta: { count: 1 },
    } as any);

    let messagesApi!: ReturnType<typeof useMessages>;

    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }

    render(
      <MessagesProvider>
        <TestConsumer />
      </MessagesProvider>,
    );

    await act(async () => {
      await messagesApi.prefetchMessages('conv-2');
    });

    expect(messagesApi.isMessagesLoading('conv-2')).toBe(false);
    expect(messagesApi.getMessages('conv-2')).toHaveLength(1);
    expect(messagesApi.getMessages('conv-2')[0].id).toBe('m-pre');
  });

  it('shares an in-flight prefetch with opening the same conversation', async () => {
    let resolveRequest!: (value: any) => void;
    vi.mocked(chatService.getMessages).mockImplementationOnce(
      () => new Promise(resolve => { resolveRequest = resolve; }),
    );

    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }
    render(<MessagesProvider><TestConsumer /></MessagesProvider>);

    await act(async () => {
      const prefetch = messagesApi.prefetchMessages('conv-1');
      const open = messagesApi.loadMessages('conv-1');
      expect(chatService.getMessages).toHaveBeenCalledTimes(1);
      resolveRequest({ data: [sampleMessage('m1', 1000)], meta: { count: 1 } });
      await Promise.all([prefetch, open]);
    });

    expect(messagesApi.getMessages('conv-1')).toHaveLength(1);
    expect(messagesApi.isMessagesLoading('conv-1')).toBe(false);
    expect(vi.mocked(messagesReducer).mock.calls.filter(([, action]) =>
      action.type === 'MERGE_INITIAL_MESSAGES')).toHaveLength(1);
  });

  it('reuses an empty cached history without a second GET', async () => {
    vi.mocked(chatService.getMessages).mockResolvedValue({ data: [], meta: { count: 0 } } as any);
    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }
    render(<MessagesProvider><TestConsumer /></MessagesProvider>);

    await act(async () => { await messagesApi.loadMessages('empty'); });
    await act(async () => { await messagesApi.loadMessages('empty'); });
    expect(chatService.getMessages).toHaveBeenCalledTimes(1);
    expect(messagesApi.getMessages('empty')).toHaveLength(0);
  });

  it('preserves a WebSocket message that arrives before the initial GET resolves', async () => {
    let resolveRequest!: (value: any) => void;
    vi.mocked(chatService.getMessages).mockImplementationOnce(
      () => new Promise(resolve => { resolveRequest = resolve; }),
    );
    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }
    render(<MessagesProvider><TestConsumer /></MessagesProvider>);

    await act(async () => {
      const load = messagesApi.loadMessages('conv-1');
      messagesApi.addMessage('conv-1', sampleMessage('socket', 3000));
      resolveRequest({ data: [sampleMessage('older', 1000)], meta: { count: 1 } });
      await load;
    });

    expect(messagesApi.getMessages('conv-1').map(message => message.id)).toEqual(['older', 'socket']);
  });

  it('does not restore a cleared conversation from an older in-flight GET', async () => {
    let resolveRequest!: (value: any) => void;
    vi.mocked(chatService.getMessages).mockImplementationOnce(
      () => new Promise(resolve => { resolveRequest = resolve; }),
    );
    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }
    render(<MessagesProvider><TestConsumer /></MessagesProvider>);

    await act(async () => {
      const load = messagesApi.loadMessages('conv-1');
      messagesApi.clearConversationMessages('conv-1');
      resolveRequest({ data: [sampleMessage('stale', 1000)], meta: { count: 1 } });
      await load;
    });

    expect(messagesApi.getMessages('conv-1')).toHaveLength(0);
  });

  it('evicts least recent cached conversations while preserving the active one', async () => {
    vi.mocked(chatService.getMessages).mockImplementation(async (id: string) => ({
      data: [sampleMessage(`message-${id}`, 1000, id)], meta: { count: 1 },
    } as any));
    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }
    render(<MessagesProvider><TestConsumer /></MessagesProvider>);
    messagesApi.setActiveConversationId('conv-0');

    for (let i = 0; i < 18; i++) {
      await act(async () => { await messagesApi.prefetchMessages(`conv-${i}`); });
    }

    expect(messagesApi.getMessages('conv-0')).toHaveLength(1);
    expect(messagesApi.getMessages('conv-1')).toHaveLength(0);
    expect(messagesApi.getMessages('conv-17')).toHaveLength(1);
    await act(async () => { await messagesApi.loadMessages('conv-1'); });
    expect(chatService.getMessages).toHaveBeenCalledTimes(19);
  });

  it('sends a text message with the JSON API contract and replaces the pending item', async () => {
    const sentMessage: Message = {
      ...sampleMessage('m-out-1', 3000),
      content: 'Olá, como posso ajudar?',
      message_type: 'outgoing',
      sender: { id: 'user-1', name: 'Agent Test', type: 'agent' },
    };
    vi.mocked(chatService.sendMessage).mockResolvedValue(sentMessage);

    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }

    render(
      <MessagesProvider>
        <TestConsumer />
      </MessagesProvider>,
    );

    await act(async () => {
      await messagesApi.sendMessage('conv-1', 'Olá, como posso ajudar?');
    });

    expect(chatService.sendMessage).toHaveBeenCalledWith('conv-1', {
      content: 'Olá, como posso ajudar?',
      message_type: 'outgoing',
      private: false,
      canned_response_id: undefined,
      content_attributes: undefined,
      template_params: undefined,
      echo_id: expect.any(String),
    });
    expect(messagesApi.getMessages('conv-1')).toEqual([sentMessage]);
    expect(messagesApi.getMessages('conv-1')[0].status).toBe('sent');
  });

  it('marks the optimistic text message failed when the API rejects the send', async () => {
    vi.mocked(chatService.sendMessage).mockRejectedValue(new Error('offline'));

    let messagesApi!: ReturnType<typeof useMessages>;
    function TestConsumer() {
      messagesApi = useMessages();
      return null;
    }

    render(
      <MessagesProvider>
        <TestConsumer />
      </MessagesProvider>,
    );

    await act(async () => {
      await expect(messagesApi.sendMessage('conv-1', 'Mensagem de teste')).rejects.toThrow('offline');
    });

    const [failedMessage] = messagesApi.getMessages('conv-1');
    expect(failedMessage.content).toBe('Mensagem de teste');
    expect(failedMessage.status).toBe('failed');
  });
});
