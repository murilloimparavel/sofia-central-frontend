import { describe, it, expect } from 'vitest';
import { messagesReducer, initialMessagesState } from './MessagesContextReducer';
import { normalizeMessageTimestamp, compareMessagesByTimestamp } from './messageTimestampUtils';
import { Message } from '@/types/chat/api';

describe('MessagesContextReducer & timestampUtils', () => {
  it('normalizes various timestamp formats correctly', () => {
    const numericMsg = { created_at: 1700000000 } as Message;
    expect(normalizeMessageTimestamp(numericMsg)).toBe(1700000000);

    const stringNumMsg = { created_at: '1700000000' } as Message;
    expect(normalizeMessageTimestamp(stringNumMsg)).toBe(1700000000);

    const isoMsg = { created_at: '2026-10-05T12:00:00Z' } as Message;
    expect(normalizeMessageTimestamp(isoMsg)).toBe(new Date('2026-10-05T12:00:00Z').getTime() / 1000);
  });

  it('keeps sending (progress) messages at the end when sorting', () => {
    const regular = { id: '1', status: 'sent', created_at: 100 } as Message;
    const progress = { id: '2', status: 'progress', created_at: 50 } as Message;

    expect(compareMessagesByTimestamp(regular, progress)).toBe(-1);
    expect(compareMessagesByTimestamp(progress, regular)).toBe(1);
  });

  it('SET_MESSAGES sets sorted messages and history indicators', () => {
    const msg1 = { id: '1', status: 'sent', created_at: 200 } as Message;
    const msg2 = { id: '2', status: 'sent', created_at: 100 } as Message;

    const nextState = messagesReducer(initialMessagesState, {
      type: 'SET_MESSAGES',
      payload: { conversationId: 'c1', messages: [msg1, msg2] },
    });

    expect(nextState.messages['c1']).toHaveLength(2);
    expect(nextState.messages['c1'][0].id).toBe('2'); // older first
    expect(nextState.messages['c1'][1].id).toBe('1');
    expect(nextState.messagesLoading['c1']).toBe(false);
    expect(nextState.messagesError['c1']).toBeNull();
  });

  it('ADD_MESSAGE replaces matching optimistic pending message when real message arrives', () => {
    const pending = { id: '1234567890', content: 'Olá', status: 'progress', created_at: 1000 } as Message;
    const stateWithPending = messagesReducer(initialMessagesState, {
      type: 'SET_MESSAGES',
      payload: { conversationId: 'c1', messages: [pending] },
    });

    const real = { id: 'real-uuid-1', content: 'Olá', status: 'sent', created_at: 1002 } as Message;
    const finalState = messagesReducer(stateWithPending, {
      type: 'ADD_MESSAGE',
      payload: { conversationId: 'c1', message: real },
    });

    expect(finalState.messages['c1']).toHaveLength(1);
    expect(finalState.messages['c1'][0].id).toBe('real-uuid-1');
  });

  it('REPLACE_MESSAGE removes tempId and merges attachments cleanly', () => {
    const pending = { id: 'temp-1', content: 'Upload', status: 'progress', created_at: 1000 } as Message;
    const stateWithPending = messagesReducer(initialMessagesState, {
      type: 'SET_MESSAGES',
      payload: { conversationId: 'c1', messages: [pending] },
    });

    const real = {
      id: 'real-1',
      content: 'Upload',
      status: 'sent',
      created_at: 1000,
      attachments: [{ id: 'att-1' } as Message['attachments'][number]],
    } as Message;

    const replacedState = messagesReducer(stateWithPending, {
      type: 'REPLACE_MESSAGE',
      payload: { conversationId: 'c1', tempId: 'temp-1', message: real },
    });

    expect(replacedState.messages['c1']).toHaveLength(1);
    expect(replacedState.messages['c1'][0].id).toBe('real-1');
    expect(replacedState.messages['c1'][0].attachments).toHaveLength(1);
  });

  it('merges a delayed initial response without losing WebSocket or optimistic messages', () => {
    const fromSocket = { id: 'socket', status: 'sent', created_at: 300 } as Message;
    const optimistic = { id: '1234567890123', status: 'progress', created_at: 400 } as Message;
    const current = messagesReducer(messagesReducer(initialMessagesState, {
      type: 'ADD_MESSAGE', payload: { conversationId: 'c1', message: fromSocket },
    }), {
      type: 'ADD_MESSAGE', payload: { conversationId: 'c1', message: optimistic },
    });

    const afterHttp = messagesReducer(current, {
      type: 'MERGE_INITIAL_MESSAGES',
      payload: { conversationId: 'c1', messages: [
        { id: 'older', status: 'sent', created_at: 100 } as Message,
        { ...fromSocket, content: 'stale snapshot' },
      ] },
    });

    expect(afterHttp.messages.c1.map(message => message.id)).toEqual(['older', 'socket', '1234567890123']);
    expect(afterHttp.messages.c1[1]).toBe(fromSocket);
    expect(afterHttp.messageHistory.c1.oldestMessageId).toBe('older');
  });

  it('refreshes pagination after an empty history receives a full page while preserving socket data', () => {
    const empty = messagesReducer(initialMessagesState, {
      type: 'MERGE_INITIAL_MESSAGES', payload: { conversationId: 'c1', messages: [] },
    });
    const fromSocket = { id: 'socket', status: 'sent', created_at: 300 } as Message;
    const withSocket = messagesReducer(empty, {
      type: 'ADD_MESSAGE', payload: { conversationId: 'c1', message: fromSocket },
    });
    const page = Array.from({ length: 20 }, (_, index) => ({
      id: `message-${index}`, status: 'sent', created_at: index + 100,
    } as Message));
    const refreshed = messagesReducer(withSocket, {
      type: 'MERGE_INITIAL_MESSAGES', payload: { conversationId: 'c1', messages: page },
    });

    expect(refreshed.messages.c1).toHaveLength(21);
    expect(refreshed.messages.c1.at(-1)).toBe(fromSocket);
    expect(refreshed.messageHistory.c1).toMatchObject({
      hasMore: true, oldestMessageId: 'message-0', isLoadingMore: false,
    });
  });

  it('uses the HTTP page cursor even when an older WebSocket message is already present', () => {
    const empty = messagesReducer(initialMessagesState, {
      type: 'MERGE_INITIAL_MESSAGES', payload: { conversationId: 'c1', messages: [] },
    });
    const withSocket = messagesReducer(empty, {
      type: 'ADD_MESSAGE', payload: {
        conversationId: 'c1', message: { id: 'socket', status: 'sent', created_at: 50 } as Message,
      },
    });
    const page = Array.from({ length: 20 }, (_, index) => ({
      id: `message-${index}`, status: 'sent', created_at: index + 100,
    } as Message));
    const refreshed = messagesReducer(withSocket, {
      type: 'MERGE_INITIAL_MESSAGES', payload: { conversationId: 'c1', messages: page },
    });

    expect(refreshed.messages.c1[0].id).toBe('socket');
    expect(refreshed.messageHistory.c1.oldestMessageId).toBe('message-0');
    expect(refreshed.messageHistory.c1.hasMore).toBe(true);
  });

  it('deduplicates overlapping historical pages and uses their true oldest item as cursor', () => {
    const initial = messagesReducer(initialMessagesState, {
      type: 'SET_MESSAGES',
      payload: { conversationId: 'c1', messages: [
        { id: 'middle', status: 'sent', created_at: 200 } as Message,
        { id: 'latest', status: 'sent', created_at: 300 } as Message,
      ] },
    });
    const next = messagesReducer(initial, {
      type: 'ADD_PREVIOUS_MESSAGES',
      payload: { conversationId: 'c1', messages: [
        { id: 'middle', status: 'sent', created_at: 200 } as Message,
        { id: 'oldest', status: 'sent', created_at: 100 } as Message,
      ], hasMore: true },
    });

    expect(next.messages.c1.map(message => message.id)).toEqual(['oldest', 'middle', 'latest']);
    expect(next.messageHistory.c1.oldestMessageId).toBe('oldest');
    expect(next.messageHistory.c1.hasMore).toBe(true);

    const repeated = messagesReducer(next, {
      type: 'ADD_PREVIOUS_MESSAGES',
      payload: { conversationId: 'c1', messages: [
        { id: 'middle', status: 'sent', created_at: 200 } as Message,
        { id: 'oldest', status: 'sent', created_at: 100 } as Message,
      ], hasMore: true },
    });
    expect(repeated.messages.c1).toHaveLength(3);
    expect(repeated.messageHistory.c1.hasMore).toBe(false);
    expect(repeated.messageHistory.c1.oldestMessageId).toBe('oldest');
  });

  it('removes every cache index when evicting inactive conversations', () => {
    const loaded = messagesReducer(initialMessagesState, {
      type: 'SET_MESSAGES', payload: { conversationId: 'old', messages: [] },
    });
    const evicted = messagesReducer(loaded, { type: 'EVICT_CONVERSATIONS', payload: ['old'] });
    expect(evicted.messages.old).toBeUndefined();
    expect(evicted.messageHistory.old).toBeUndefined();
    expect(evicted.messagesLoading.old).toBeUndefined();
  });
});
