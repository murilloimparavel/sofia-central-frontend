import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Message } from '@/types/chat/api';
import MessageInput from './MessageInput';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { ui_settings: { editor_message_key: 'enter' } } }),
}));
vi.mock('@/hooks/useMessageSignature', () => ({
  useMessageSignature: () => ({
    isSignatureEnabled: false,
    toggleSignature: vi.fn(),
    hasSignature: false,
    appendSignatureIfEnabled: (text: string) => text,
  }),
}));
vi.mock('@/hooks/chat/useCannedResponses', () => ({
  useCannedResponses: () => ({ searchCannedResponses: () => [], isLoading: false }),
}));
vi.mock('../rich-text-editor', () => ({
  RichTextEditor: React.forwardRef(() => <div data-testid="editor" />),
}));
vi.mock('../ai-assistance', () => ({ AIAssistanceButton: () => null }));
vi.mock('./ComposerPlusMenu', () => ({ default: () => null }));
vi.mock('./FileUpload', () => ({ default: () => null }));
vi.mock('./MacrosButton', () => ({ default: () => null }));

describe('MessageInput render isolation', () => {
  it('keeps the reply preview mounted while the composer receives new props', () => {
    const reply = {
      id: 'reply-1',
      content: 'Mensagem anterior',
      sender: { name: 'Contato' },
      attachments: [],
    } as unknown as Message;
    const sendFirst = vi.fn().mockResolvedValue(undefined);
    const sendNext = vi.fn().mockResolvedValue(undefined);
    const onCancelReply = vi.fn();

    const { rerender } = render(
      <MessageInput
        inboxId="inbox-1"
        replyToMessage={reply}
        onCancelReply={onCancelReply}
        onSendMessage={sendFirst}
      />,
    );
    const preview = screen.getByText('Mensagem anterior');

    rerender(
      <MessageInput
        inboxId="inbox-1"
        replyToMessage={reply}
        onCancelReply={onCancelReply}
        onSendMessage={sendNext}
      />,
    );

    expect(screen.getByText('Mensagem anterior')).toBe(preview);
  });
});
