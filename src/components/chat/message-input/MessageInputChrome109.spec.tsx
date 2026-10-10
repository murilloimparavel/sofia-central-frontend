import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MessageInputChrome109 from './MessageInputChrome109';
import type { Message } from '@/types/chat/api';
import enChat from '@/i18n/locales/en/chat.json';
import ptBRChat from '@/i18n/locales/pt-BR/chat.json';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string, options?: { name?: string }) =>
    options?.name ? `${key}:${options.name}` : key }),
}));

describe('MessageInputChrome109', () => {
  it('sends trimmed public text and clears the field after success', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    render(<MessageInputChrome109 onSendMessage={onSendMessage} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  Teste de texto  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'messageInput.filePreview.send' }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith({
      content: 'Teste de texto',
      isPrivate: false,
    }));
    expect(input).toHaveValue('');
  });

  it('uses the existing chat composer translation key for the placeholder', () => {
    render(<MessageInputChrome109 onSendMessage={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'messageInput.defaultPlaceholder',
    );
  });

  it('resolves the shared composer placeholder in English and Brazilian Portuguese resources', () => {
    expect(enChat.messageInput.defaultPlaceholder).toBe('Type your message...');
    expect(ptBRChat.messageInput.defaultPlaceholder).toBe('Digite sua mensagem...');
  });

  it('sends on Enter and preserves a newline on Shift+Enter', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    render(<MessageInputChrome109 onSendMessage={onSendMessage} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'linha 1' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue('linha 1');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
  });

  it('keeps the send control disabled for restricted and pending conversations', () => {
    const onSendMessage = vi.fn();
    render(
      <MessageInputChrome109
        onSendMessage={onSendMessage}
        isPendingConversation
        isDisabled
      />,
    );

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'messageInput.filePreview.send' })).toBeDisabled();
  });

  it('allows the operator to cancel a reply', () => {
    const onCancelReply = vi.fn();
    render(
      <MessageInputChrome109
        onSendMessage={vi.fn()}
        replyToMessage={{
          id: 'message-synthetic',
          content: 'Mensagem anterior',
          sender: { name: 'Contato sintético' },
          attachments: [],
        } as unknown as Message}
        onCancelReply={onCancelReply}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'messageInput.replyPreview.cancel' }));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });
});
