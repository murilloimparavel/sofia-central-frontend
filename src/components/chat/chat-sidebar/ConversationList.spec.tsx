import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationList } from './ConversationList';
import type { Conversation } from '@/types/chat/api';

const avatarRender = vi.hoisted(() => vi.fn());

vi.mock('../contact/ContactAvatar', () => ({
  default: ({ contact }: { contact?: { id: string } }) => {
    avatarRender(contact?.id);
    return <span />;
  },
}));

vi.mock('../conversation/ConversationBadges', () => ({
  default: () => null,
}));

const makeConversation = (id: number): Conversation => ({
  id,
  uuid: `uuid-${id}`,
  display_id: id,
  status: 'open',
  inbox_id: 1,
  contact: { id: String(id), name: `Contact ${id}` },
  timestamp: 1700000000,
  unread_count: 0,
}) as Conversation;

describe('ConversationList render isolation', () => {
  it('rerenders only the previously and newly selected cards', () => {
    const conversations = [makeConversation(1), makeConversation(2), makeConversation(3)];
    const noop = vi.fn();
    const props = {
      conversations,
      selectedConversationIds: new Set<string>(),
      selectionMode: false,
      isLoadingMore: false,
      hasNextPage: false,
      unreadCount: () => 0,
      onSelect: noop,
      onToggleSelect: noop,
      onStartSelection: noop,
      onPin: noop,
      onUnpin: noop,
      onArchive: noop,
      onUnarchive: noop,
      onDelete: noop,
      onLoadMore: noop,
      t: (key: string) => key,
    };

    const view = render(<ConversationList {...props} selectedConversationId="uuid-1" />);
    expect(avatarRender.mock.calls.map(call => call[0])).toEqual(['1', '2', '3']);

    avatarRender.mockClear();
    view.rerender(<ConversationList {...props} selectedConversationId="uuid-2" />);
    expect(avatarRender.mock.calls.map(call => call[0])).toEqual(['1', '2']);

    avatarRender.mockClear();
    const updated = { ...conversations[2], contact: { ...conversations[2].contact, name: 'Updated' } };
    view.rerender(<ConversationList {...props} conversations={[conversations[0], conversations[1], updated]} selectedConversationId="uuid-2" />);
    expect(avatarRender.mock.calls.map(call => call[0])).toEqual(['3']);
  });
});
