import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConversationCard } from './ConversationCard';
import { Conversation } from '@/types/chat/api';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}));

vi.mock('@/utils/channelUtils', () => ({
  isPhoneBearingChannel: () => false,
}));

vi.mock('@/utils/contact/formatContactPhone', () => ({
  formatContactPhone: (p: string) => p,
}));

vi.mock('@/utils/time/timeHelpers', () => ({
  formatConversationTime: () => '14:30',
  formatDetailedTime: () => '14:30:00',
}));

vi.mock('@/utils/chat/mediaLabels', () => ({
  attachmentLabel: () => '',
  mediaTypeFromAttributes: () => null,
  senderNameFromAttributes: () => null,
}));

const mockConversation: Conversation = {
  id: 123,
  uuid: 'uuid-123',
  display_id: 123,
  status: 'open',
  inbox_id: 1,
  contact: {
    id: 99,
    name: 'Cliente Teste',
  },
  last_non_activity_message: {
    id: 1,
    content: 'Última mensagem enviada',
    message_type: 'incoming',
    created_at: 1700000000,
  } as unknown as Conversation['last_non_activity_message'],
  messages: [
    {
      id: 1,
      content: 'Última mensagem enviada',
      message_type: 0,
      created_at: 1700000000,
      account_id: 1,
      inbox_id: 1,
      conversation_id: 123,
    },
  ],
  timestamp: 1700000000,
  unread_count: 2,
};

describe('ConversationCard component', () => {
  it('updates the preview when message content changes without a new message id', () => {
    const props = {
      isSelected: false,
      isBulkSelected: false,
      selectionMode: false,
      unreadCount: 0,
      onSelect: vi.fn(),
      onToggleSelect: vi.fn(),
      onStartSelection: vi.fn(),
      onPin: vi.fn(),
      onUnpin: vi.fn(),
      onArchive: vi.fn(),
      onUnarchive: vi.fn(),
      onDelete: vi.fn(),
      t: (key: string) => key,
    };
    const view = render(<ConversationCard {...props} conversation={mockConversation} />);
    const updatedConversation = {
      ...mockConversation,
      last_non_activity_message: {
        ...mockConversation.last_non_activity_message,
        content: 'Prévia editada',
      },
    } as Conversation;

    view.rerender(<ConversationCard {...props} conversation={updatedConversation} />);

    expect(screen.getByText('Prévia editada')).toBeInTheDocument();
  });

  it('renders conversation details correctly', () => {
    render(
      <ConversationCard
        conversation={mockConversation}
        isSelected={false}
        isBulkSelected={false}
        selectionMode={false}
        unreadCount={2}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
        onStartSelection={vi.fn()}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
        t={(k: string) => k}
      />,
    );

    expect(screen.getByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Última mensagem enviada')).toBeInTheDocument();
  });

  it('calls onSelect when clicked in standard mode', () => {
    const onSelect = vi.fn();
    render(
      <ConversationCard
        conversation={mockConversation}
        isSelected={false}
        isBulkSelected={false}
        selectionMode={false}
        unreadCount={0}
        onSelect={onSelect}
        onToggleSelect={vi.fn()}
        onStartSelection={vi.fn()}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
        t={(k: string) => k}
      />,
    );

    fireEvent.click(screen.getByText('Cliente Teste'));
    expect(onSelect).toHaveBeenCalledWith(mockConversation);
  });

  it('calls onToggleSelect when clicked in selection mode', () => {
    const onToggleSelect = vi.fn();
    render(
      <ConversationCard
        conversation={mockConversation}
        isSelected={false}
        isBulkSelected={false}
        selectionMode={true}
        unreadCount={0}
        onSelect={vi.fn()}
        onToggleSelect={onToggleSelect}
        onStartSelection={vi.fn()}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
        t={(k: string) => k}
      />,
    );

    fireEvent.click(screen.getByText('Cliente Teste'));
    expect(onToggleSelect).toHaveBeenCalledWith('123');
  });
});
