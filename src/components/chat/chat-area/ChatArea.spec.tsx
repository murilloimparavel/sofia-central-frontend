import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import ChatArea from './ChatArea';
import { Message, MESSAGE_TYPE } from '@/types/chat/api';

const { toggleTypingStatus } = vi.hoisted(() => ({
  toggleTypingStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/conversations/conversationService', () => ({
  conversationAPI: { toggleTypingStatus },
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}));

const mockMessagesContext = {
  isMessagesLoading: vi.fn(),
  getMessagesError: vi.fn(),
  canLoadMore: vi.fn().mockReturnValue(false),
  isLoadingMore: vi.fn().mockReturnValue(false),
  loadMessages: vi.fn(),
  onReplyToMessage: vi.fn(),
  onCopyMessage: vi.fn(),
  onDeleteMessage: vi.fn(),
  state: { replyToMessage: null },
};

vi.mock('@/contexts/chat/ChatContext', () => ({
  useChatContext: () => ({
    messages: mockMessagesContext,
    websocket: {
      getTypingUsers: vi.fn().mockReturnValue([]),
    },
  }),
}));

vi.mock('@/hooks/useConversationModerations', () => ({
  useConversationModerations: () => ({
    pendingResponseModerations: [],
    loadModerations: vi.fn(),
    messageModerationsMap: new Map(),
  }),
}));

vi.mock('@/components/chat/messages/MessageList', () => ({
  default: ({ messages }: { messages: Message[] }) => (
    <div data-testid="message-list" data-count={messages.length}>
      MessageList Rendered
    </div>
  ),
}));

vi.mock('../loading-states', () => ({
  MessageSkeleton: () => <div data-testid="message-skeleton">Skeleton Loading</div>,
}));

vi.mock('../empty-states', () => ({
  NoMessages: () => <div data-testid="no-messages">No Messages</div>,
}));

vi.mock('@/components/chat/message-input/MessageInput', () => ({
  default: ({ onTypingStart, onTypingStop }: { onTypingStart?: () => void; onTypingStop?: () => void }) => (
    <div data-testid="message-input">
      <button data-testid="typing-start" onClick={onTypingStart}>Start typing</button>
      <button data-testid="typing-stop" onClick={onTypingStop}>Stop typing</button>
    </div>
  ),
}));

vi.mock('@/components/chat/chat-area/TypingIndicator', () => ({
  default: () => null,
}));

const mockMessage: Message = {
  id: 1,
  content: 'Olá',
  inbox_id: 1,
  conversation_id: 42,
  message_type: MESSAGE_TYPE.INCOMING,
  created_at: 1700000000,
  account_id: 1,
};

describe('ChatArea non-destructive render', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends typing through the CRM API and clears the prior conversation when switching', async () => {
    const props = {
      selectedConversationId: '42',
      selectedConversation: null,
      selectedMessages: [mockMessage],
      onSendMessage: vi.fn(),
      onLoadMore: vi.fn(),
      onRetryMessage: vi.fn(),
    };
    const { rerender } = render(<ChatArea {...props} />);

    fireEvent.click(screen.getByTestId('typing-start'));
    expect(toggleTypingStatus).toHaveBeenCalledWith('42', 'on');

    rerender(<ChatArea {...props} selectedConversationId="43" />);
    await waitFor(() => expect(toggleTypingStatus).toHaveBeenCalledWith('42', 'off'));
  });

  it('clears the typing indicator when the chat area unmounts', () => {
    const props = {
      selectedConversationId: '42',
      selectedConversation: null,
      selectedMessages: [mockMessage],
      onSendMessage: vi.fn(),
      onLoadMore: vi.fn(),
      onRetryMessage: vi.fn(),
    };
    const { unmount } = render(<ChatArea {...props} />);

    fireEvent.click(screen.getByTestId('typing-start'));
    unmount();

    expect(toggleTypingStatus).toHaveBeenCalledWith('42', 'off');
  });

  it('renders MessageList immediately without skeleton when cached messages exist even if loading in background (SWR)', () => {
    mockMessagesContext.isMessagesLoading.mockReturnValue(true);
    mockMessagesContext.getMessagesError.mockReturnValue(null);

    render(
      <ChatArea
        selectedConversationId="42"
        selectedConversation={null}
        selectedMessages={[mockMessage]}
        onSendMessage={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.queryByTestId('message-skeleton')).not.toBeInTheDocument();
  });

  it('renders MessageSkeleton when there are no cached messages and messages are loading', () => {
    mockMessagesContext.isMessagesLoading.mockReturnValue(true);
    mockMessagesContext.getMessagesError.mockReturnValue(null);

    render(
      <ChatArea
        selectedConversationId="42"
        selectedConversation={null}
        selectedMessages={[]}
        onSendMessage={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('message-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
  });

  it('renders NoMessages when there are no messages and loading is finished', () => {
    mockMessagesContext.isMessagesLoading.mockReturnValue(false);
    mockMessagesContext.getMessagesError.mockReturnValue(null);

    render(
      <ChatArea
        selectedConversationId="42"
        selectedConversation={null}
        selectedMessages={[]}
        onSendMessage={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('no-messages')).toBeInTheDocument();
    expect(screen.queryByTestId('message-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
  });
});
