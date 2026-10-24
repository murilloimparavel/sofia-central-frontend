import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/types/chat/api';
import { chatService } from '@/services/chat/chatService';
import { useAppDataStore } from '@/store/appDataStore';
import { ChatProvider, useChatContext } from './ChatContext';

const ws = vi.hoisted(() => ({ connected: false }));

vi.mock('@/hooks/chat/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: ws.connected,
    sendTypingOn: vi.fn(),
    sendTypingOff: vi.fn(),
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'agent-1', pubsub_token: 'token-1' } }),
  useOptionalAuth: () => ({ user: { id: 'agent-1', pubsub_token: 'token-1' } }),
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('@/services/chat/chatService', () => ({
  chatService: { getMessages: vi.fn() },
}));

const conversation = {
  id: 'conv-1', uuid: 'conv-1', status: 'open', unread_count: 0,
} as Conversation;

let chat!: ReturnType<typeof useChatContext>;
function Probe() {
  chat = useChatContext();
  return null;
}

async function loadEmptyConversation() {
  await act(async () => {
    chat.conversations.setConversations([conversation], {
      page: 1, page_size: 20, total: 1, total_pages: 1,
    });
  });
  await act(async () => {
    await chat.conversations.selectConversation('conv-1');
    await chat.messages.loadMessages('conv-1');
  });
  expect(chat.messages.getMessages('conv-1')).toHaveLength(0);
  expect(chatService.getMessages).toHaveBeenCalledTimes(1);
}

describe('ChatContext empty history recovery', () => {
  beforeEach(() => {
    ws.connected = false;
    vi.clearAllMocks();
    localStorage.clear();
    useAppDataStore.setState({ account: null });
    vi.mocked(chatService.getMessages)
      .mockResolvedValueOnce({ data: [], meta: { count: 0 } } as never)
      .mockResolvedValueOnce({
        data: [{ id: 'first', conversation_id: 'conv-1', status: 'sent', created_at: '1000' }],
        meta: { count: 1 },
      } as never);
  });

  it('fetches the first missed message on focus before the empty-cache TTL expires', async () => {
    render(<ChatProvider><Probe /></ChatProvider>);
    await loadEmptyConversation();

    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(chat.messages.getMessages('conv-1')).toHaveLength(1));
    expect(chatService.getMessages).toHaveBeenCalledTimes(2);
  });

  it('fetches the first missed message on WebSocket reconnection before TTL expires', async () => {
    const view = render(<ChatProvider><Probe /></ChatProvider>);
    await loadEmptyConversation();

    ws.connected = true;
    view.rerender(<ChatProvider><Probe /></ChatProvider>);
    await waitFor(() => expect(chat.messages.getMessages('conv-1')).toHaveLength(1));
    expect(chatService.getMessages).toHaveBeenCalledTimes(2);
  });
});
