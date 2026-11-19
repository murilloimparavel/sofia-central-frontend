import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemMessage from './SystemMessage';
import { Message, MESSAGE_TYPE } from '@/types/chat/api';

const makeActivity = (contentAttributes: Message['content_attributes'] = {}): Message => ({
  id: 'activity-1',
  content: 'Agent added labels: urgent',
  content_attributes: contentAttributes,
  content_type: 'text',
  conversation_id: 'conversation-1',
  created_at: '2026-11-19T10:00:00Z',
  external_source_ids: {},
  message_type: MESSAGE_TYPE.ACTIVITY,
  private: false,
  sender: null,
  source_id: null,
  status: 'sent',
  attachments: [],
} as Message);

describe('SystemMessage activity metadata', () => {
  it('renders structured label names once as badges and keeps the action text', () => {
    const message = makeActivity({
      activity_event: {
        event_id: 'event-1',
        action: 'labels_added',
        actor: { type: 'user', id: 'user-1', name: 'Agent' },
        target: { type: 'labels', ids: ['label-1'], names: ['urgent'] },
      },
    });

    render(<SystemMessage message={message} labels={[]} />);

    expect(screen.getByText('Agent added labels')).toBeTruthy();
    expect(screen.queryByText('Agent added labels: urgent')).toBeNull();
    expect(screen.getByText('urgent')).toBeTruthy();
  });

  it('continues to render legacy label activities using the supplied label list', () => {
    const message = makeActivity({});
    message.content = 'Agent added label 39';

    render(<SystemMessage message={message} labels={[{ id: '39', title: 'VIP', color: '#123456' }]} />);

    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('shows the originating automation rule when an activity is automated', () => {
    const message = makeActivity({
      activity_event: {
        event_id: 'event-automation',
        action: 'status_changed',
        actor: { type: 'automation', id: 'rule-1', name: 'Resolve stale conversations' },
        target: { type: 'conversation', id: 'conversation-1' },
      },
    });

    render(<SystemMessage message={message} />);

    expect(screen.getByText('Regra: Resolve stale conversations')).toBeTruthy();
  });

  it('shows a human actor when the activity text is generic', () => {
    const message = makeActivity({
      activity_event: {
        event_id: 'event-handoff',
        action: 'human_handoff',
        actor: { type: 'user', id: 'user-1', name: 'Agent Example' },
        target: { type: 'conversation', id: 'conversation-1' },
      },
    });
    message.content = 'O atendente devolveu a conversa ao bot';

    render(<SystemMessage message={message} />);

    expect(screen.getByText('Por: Agent Example')).toBeTruthy();
  });

  it('keeps the state specific status icon when metadata is present', () => {
    const message = makeActivity({
      activity_event: {
        event_id: 'event-status',
        action: 'status_changed',
        actor: { type: 'user', id: 'user-1', name: 'Agent' },
        target: { type: 'conversation', id: 'conversation-1' },
        changes: { from: 'open', to: 'resolved' },
      },
    });

    const { container } = render(<SystemMessage message={message} />);

    expect(container.querySelector('svg.lucide-circle-check-big')).toBeTruthy();
  });

  it('keeps priority direction icons when metadata is present', () => {
    const message = makeActivity({
      activity_event: {
        event_id: 'event-priority',
        action: 'priority_changed',
        actor: { type: 'user', id: 'user-1', name: 'Agent' },
        target: { type: 'conversation', id: 'conversation-1' },
        changes: { from: 1, to: 3 },
      },
    });

    const { container } = render(<SystemMessage message={message} />);

    expect(container.querySelector('svg.lucide-arrow-up')).toBeTruthy();
  });

  it('does not interpret numbers in a non-label activity as label identifiers', () => {
    const message = makeActivity({});
    message.content = 'Conversation resolved after 24 hours';

    render(<SystemMessage message={message} labels={[{ id: '24', title: 'numeric label', color: '#123456' }]} />);

    expect(screen.queryByText('numeric label')).toBeNull();
  });
});
