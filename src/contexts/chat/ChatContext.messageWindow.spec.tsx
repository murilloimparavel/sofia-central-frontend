import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import type { Conversation } from '@/types/chat/api';

let capturedHandlers: Record<string, ((data: unknown) => void) | undefined> = {};

vi.mock('@/hooks/chat/useWebSocket', () => ({
  useWebSocket: (_userId: string, _token: string, opts: { handlers?: typeof capturedHandlers }) => {
    capturedHandlers = opts?.handlers ?? {};
    return { isConnected: false, sendTypingOn: vi.fn(), sendTypingOff: vi.fn() };
  },
}));

const auth = vi.hoisted(() => ({ user: { id: 'user-1', pubsub_token: 'token-1' } }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
  useOptionalAuth: () => auth,
}));

vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/contacts/contactsService', () => ({ contactsService: { getContact: vi.fn() } }));

import { ChatProvider, useChatContext } from './ChatContext';
import { useAppDataStore } from '@/store/appDataStore';

const expiredConversation = {
  id: 'conv-1',
  uuid: 'conv-1',
  status: 'open',
  can_reply: false,
  reply_window_expires_at: '2026-11-15T10:00:00Z',
  contact: { id: 'contact-1', name: 'Contact' },
  unread_count: 0,
} as unknown as Conversation;

function Probe() {
  const { conversations } = useChatContext();
  const setConversations = conversations.setConversations;
  const conversation = conversations.state.conversations[0];
  React.useEffect(() => setConversations([expiredConversation]), [setConversations]);
  return (
    <>
      <span data-testid="can-reply">{String(conversation?.can_reply)}</span>
      <span data-testid="expires-at">{conversation?.reply_window_expires_at ?? 'null'}</span>
    </>
  );
}

describe('ChatContext inbound message.created messaging window', () => {
  beforeEach(() => {
    capturedHandlers = {};
    localStorage.clear();
    auth.user = { id: 'user-1', pubsub_token: 'token-1' };
    useAppDataStore.setState({ account: null });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reopens an expired window from the authoritative inbound event snapshot', async () => {
    render(<ChatProvider><Probe /></ChatProvider>);

    expect(screen.getByTestId('can-reply').textContent).toBe('false');
    expect(screen.getByTestId('expires-at').textContent).toBe('2026-11-15T10:00:00Z');

    await act(async () => {
      capturedHandlers.onMessageCreated?.({
        id: 'message-2',
        content: 'Hi',
        message_type: 'incoming',
        created_at: 1794830400,
        updated_at: 1794830400,
        private: false,
        status: 'sent',
        source_id: 'source-2',
        content_type: 'text',
        content_attributes: {},
        sender_type: 'contact',
        sender_id: 'contact-1',
        conversation_id: 'conv-1',
        conversation: {
          id: 'conv-1',
          last_activity_at: '1794830400',
          can_reply: true,
          reply_window_expires_at: '2026-11-16T22:00:00Z',
        },
        account_id: 'account-1',
      });
    });

    expect(screen.getByTestId('can-reply').textContent).toBe('true');
    expect(screen.getByTestId('expires-at').textContent).toBe('2026-11-16T22:00:00Z');
  });
});
