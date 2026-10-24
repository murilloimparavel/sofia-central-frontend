import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble';
import { MESSAGE_TYPE, type Message } from '@/types/chat/api';

const textRender = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock('./MessageText', () => ({
  default: ({ content }: { content: string }) => {
    textRender(content);
    return <span>{content}</span>;
  },
}));

const makeMessage = (id: string, content: string): Message => ({
  id,
  content,
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
});

describe('MessageBubble render isolation', () => {
  it('skips unrelated timeline changes but updates when the replied message changes', () => {
    const parent = makeMessage('parent', 'Original');
    const reply = {
      ...makeMessage('reply', 'Resposta'),
      content_attributes: { in_reply_to: parent.id },
    };
    const stableAction = vi.fn();
    const props = {
      message: reply,
      isOwn: false,
      onRetryMessage: stableAction,
      onReply: stableAction,
      onCopy: stableAction,
      onDelete: stableAction,
    };
    const firstLookup = new Map([[parent.id, parent]]);
    const view = render(<MessageBubble {...props} replyMessageById={firstLookup} replyMessageBySourceId={new Map()} />);
    const initialRenders = textRender.mock.calls.length;

    const unrelated = makeMessage('unrelated', 'Outra');
    view.rerender(<MessageBubble {...props} replyMessageById={new Map([[parent.id, parent], [unrelated.id, unrelated]])} replyMessageBySourceId={new Map()} />);
    expect(textRender).toHaveBeenCalledTimes(initialRenders);

    const changedParent = { ...parent, content: 'Atualizada' };
    view.rerender(<MessageBubble {...props} replyMessageById={new Map([[parent.id, changedParent]])} replyMessageBySourceId={new Map()} />);
    expect(textRender.mock.calls.length).toBeGreaterThan(initialRenders);
  });
});
