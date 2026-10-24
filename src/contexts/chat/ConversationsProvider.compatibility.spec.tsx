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
    getConversation: vi.fn(),
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

  it('honors the last selection while an earlier conversation detail is loading', async () => {
    const selected = {
      id: 'conv-2',
      uuid: 'conv-uuid-2',
      status: 'open',
      unread_count: 0,
    } as Conversation;
    vi.mocked(chatService.getConversations).mockResolvedValue({
      data: [selected],
      meta: { page: 1, page_size: 20, total: 1, total_pages: 1 },
    } as never);
    let resolveOldDetail!: (value: unknown) => void;
    vi.mocked(chatService.getConversation).mockImplementationOnce(
      () => new Promise(resolve => { resolveOldDetail = resolve; }) as never,
    );

    let conversations!: ReturnType<typeof useConversations>;
    function Probe() {
      conversations = useConversations();
      return null;
    }
    render(<ConversationsProvider><Probe /></ConversationsProvider>);

    await act(async () => {
      await conversations.loadConversations({ status: 'open' });
    });

    let oldRequest!: Promise<void>;
    await act(async () => {
      oldRequest = conversations.selectConversation('conv-old');
      await conversations.selectConversation('conv-uuid-2');
    });
    expect(conversations.state.selectedConversationId).toBe('conv-uuid-2');

    await act(async () => {
      resolveOldDetail({ data: { id: 'conv-old', uuid: 'conv-old', status: 'open' } });
      await oldRequest;
    });

    expect(conversations.state.selectedConversationId).toBe('conv-uuid-2');
    expect(conversations.selectedConversation?.id).toBe('conv-2');
  });

  it('does not let an older list request replace the selected filter result', async () => {
    let resolveOldList!: (value: unknown) => void;
    vi.mocked(chatService.getConversations).mockImplementationOnce(
      () => new Promise(resolve => { resolveOldList = resolve; }) as never,
    );

    let conversations!: ReturnType<typeof useConversations>;
    function Probe() {
      conversations = useConversations();
      return null;
    }
    render(<ConversationsProvider><Probe /></ConversationsProvider>);

    let oldRequest!: Promise<void>;
    await act(async () => {
      oldRequest = conversations.loadConversations({ status: 'open' });
    });
    await act(async () => {
      conversations.setConversations(
        [{ id: 'filtered-1', status: 'resolved' } as Conversation],
        { page: 1, page_size: 20, total: 1, total_pages: 1 },
        { kind: 'list', params: { status: 'resolved' } },
      );
    });
    await act(async () => {
      resolveOldList({
        data: [{ id: 'old-open-1', status: 'open' }],
        meta: { page: 1, page_size: 20, total: 1, total_pages: 1 },
      });
      await oldRequest;
    });

    expect(conversations.state.conversations.map(item => item.id)).toEqual(['filtered-1']);
  });
});
