import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const focusEditor = vi.fn();
vi.mock('../rich-text-editor', () => ({
  RichTextEditor: React.forwardRef((_, ref) => {
    React.useImperativeHandle(ref, () => ({ focus: focusEditor, getContent: () => '' }));
    return <div data-testid="editor" />;
  }),
}));
vi.mock('../ai-assistance', () => ({ AIAssistanceButton: () => null }));
vi.mock('./ComposerPlusMenu', () => ({ default: () => null }));
vi.mock('./FileUpload', () => ({ default: () => null }));
vi.mock('./MacrosButton', () => ({ default: () => null }));

describe('MessageInput render isolation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    focusEditor.mockClear();
  });

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

  it('does not focus the editor when changing conversations on a narrow screen', () => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    const { rerender } = render(<MessageInput conversationId="chat-a" inboxId="inbox-1" onSendMessage={vi.fn()} />);
    rerender(<MessageInput conversationId="chat-b" inboxId="inbox-1" onSendMessage={vi.fn()} />);

    act(() => vi.advanceTimersByTime(500));
    expect(focusEditor).not.toHaveBeenCalled();
  });

  it('does not focus on a wide touch screen without hover and a fine pointer', () => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    render(<MessageInput conversationId="chat-a" inboxId="inbox-1" onSendMessage={vi.fn()} />);
    act(() => vi.advanceTimersByTime(300));

    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px) and (hover: hover) and (pointer: fine)');
    expect(focusEditor).not.toHaveBeenCalled();
  });

  it('cancels reply focus on a chat switch but still focuses an explicit new reply', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const reply = { id: 'reply-a', conversation_id: 'chat-a' } as unknown as Message;
    const nextReply = { id: 'reply-b', conversation_id: 'chat-b' } as unknown as Message;
    const onSendMessage = vi.fn();

    const { rerender } = render(<MessageInput conversationId="chat-a" inboxId="inbox-1" replyToMessage={reply} onSendMessage={onSendMessage} />);
    act(() => vi.advanceTimersByTime(50));
    rerender(<MessageInput conversationId="chat-b" inboxId="inbox-1" replyToMessage={reply} onSendMessage={onSendMessage} />);
    act(() => vi.advanceTimersByTime(150));
    expect(focusEditor).not.toHaveBeenCalled();

    rerender(<MessageInput conversationId="chat-b" inboxId="inbox-1" replyToMessage={nextReply} onSendMessage={onSendMessage} />);
    act(() => vi.advanceTimersByTime(100));
    expect(focusEditor).toHaveBeenCalledTimes(1);
  });

  it('keeps desktop focus and cancels focus scheduled for a previous conversation', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));

    const { rerender } = render(<MessageInput conversationId="chat-a" inboxId="inbox-1" onSendMessage={vi.fn()} />);
    act(() => vi.advanceTimersByTime(100));
    rerender(<MessageInput conversationId="chat-b" inboxId="inbox-1" onSendMessage={vi.fn()} />);
    act(() => vi.advanceTimersByTime(100));
    expect(focusEditor).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(focusEditor).toHaveBeenCalledTimes(1);
  });
});
