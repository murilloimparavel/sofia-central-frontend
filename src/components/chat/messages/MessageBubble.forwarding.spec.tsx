import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble';
import { MESSAGE_TYPE, Message } from '@/types/chat/api';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

const message: Message = {
  id: 'message-1',
  content: 'Forwardable message',
  content_attributes: {},
  content_type: 'text',
  conversation_id: 'conversation-1',
  created_at: 1_756_330_000,
  external_source_ids: {},
  message_type: MESSAGE_TYPE.INCOMING,
  private: false,
  sender: { id: 'contact-1', name: 'Contact', type: 'contact' },
  source_id: null,
  status: 'delivered',
  attachments: [],
};

describe('MessageBubble forwarding action', () => {
  it('shows the action only when the conversation permits forwarding', () => {
    const view = render(<MessageBubble message={message} isOwn={false} canForward={false} />);
    fireEvent.contextMenu(screen.getByText('Forwardable message'));
    expect(screen.queryByRole('menuitem', { name: 'messages.messageBubble.contextMenu.forward' })).not.toBeInTheDocument();

    view.rerender(<MessageBubble message={message} isOwn={false} canForward />);
    fireEvent.contextMenu(screen.getByText('Forwardable message'));
    expect(screen.getByRole('menuitem', { name: 'messages.messageBubble.contextMenu.forward' })).toBeInTheDocument();
  });

  it('labels WhatsApp Business App echo messages as sent from WhatsApp', () => {
    const echo = {
      ...message,
      message_type: MESSAGE_TYPE.OUTGOING,
      content_attributes: { whatsapp_echo_message: true },
      sender: { id: '', name: '', type: 'user' as const },
    };

    render(<MessageBubble message={echo} isOwn />);

    expect(screen.getByText('messages.messageBubble.whatsappEcho')).toBeInTheDocument();
  });
});
