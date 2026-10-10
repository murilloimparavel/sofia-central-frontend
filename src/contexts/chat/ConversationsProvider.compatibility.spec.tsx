import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/types/chat/api';
import { ConversationsProvider } from './ConversationsContext';
import { useConversations } from '@/hooks/chat/useConversations';
import { chatService } from '@/services/chat/chatService';

vi.mock('@/services/chat/chatService', () => ({
  chatService: {
    getConversations: vi.fn(),
    markConversationAsRead: vi.fn(),
  },
}));

vi.mock('@/services/conversations/conversationService', () => ({ conversationAPI: {} }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useOptionalAuth: () => ({ user: null }) }));
vi.mock('@/store/unansweredConversationsStore', () => ({
  useUnansweredConversationsStore: { getState: () => ({ fetch: vi.fn() }) },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('ConversationsProvider basic operator flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('loads the open list and marks a selected unread conversation as read', async () => {
    const conversation = {
      id: 'conv-1',
      uuid: 'conv-uuid-1',
      status: 'open',
      unread_count: 3,
    } as Conversation;
    vi.mocked(chatService.getConversations).mockResolvedValue({
      data: [conversation],
      meta: { page: 1, page_size: 20, total: 1, total_pages: 1 },
    } as never);
    vi.mocked(chatService.markConversationAsRead).mockResolvedValue(undefined);

    let conversations!: ReturnType<typeof useConversations>;
    function Probe() {
      conversations = useConversations();
      return null;
    }

    render(
      <ConversationsProvider>
        <Probe />
      </ConversationsProvider>,
    );

    await act(async () => {
      await conversations.loadConversations({ status: 'open' });
    });

    expect(chatService.getConversations).toHaveBeenCalledWith({ status: 'open' });
    expect(conversations.state.conversations).toHaveLength(1);
    expect(conversations.state.conversations[0].id).toBe('conv-1');

    await act(async () => {
      conversations.selectConversation('conv-1');
    });

    await waitFor(() => {
      expect(chatService.markConversationAsRead).toHaveBeenCalledWith('conv-uuid-1');
      expect(conversations.getUnreadCount('conv-uuid-1')).toBe(0);
    });
    expect(JSON.parse(localStorage.getItem('crm-chat-state') || '{}').readConversations[
      'conv-uuid-1'
    ]).toBe(true);
  });
});
