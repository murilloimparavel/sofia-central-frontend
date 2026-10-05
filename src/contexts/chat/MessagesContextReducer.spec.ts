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
      attachments: [{ id: 'att-1' } as any],
    } as Message;

    const replacedState = messagesReducer(stateWithPending, {
      type: 'REPLACE_MESSAGE',
      payload: { conversationId: 'c1', tempId: 'temp-1', message: real },
    });

    expect(replacedState.messages['c1']).toHaveLength(1);
    expect(replacedState.messages['c1'][0].id).toBe('real-1');
    expect(replacedState.messages['c1'][0].attachments).toHaveLength(1);
  });
});
