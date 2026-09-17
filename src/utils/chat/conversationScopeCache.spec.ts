/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getScopeCache,
  setScopeCache,
  evictFromScopeCache,
  addOrUpdateInScopeCache,
  clearScopeCache,
} from './conversationScopeCache';

const fakeConv = (id: string, overrides = {}) =>
  ({
    id,
    uuid: `uuid-${id}`,
    status: 'open',
    assignee_id: null,
    ...overrides,
  } as any);

const fakePagination = {
  page: 1,
  total: 2,
  total_pages: 1,
  page_size: 25,
};

const fakeQuery = { kind: 'list' as const, params: { status: 'open' } };

describe('conversationScopeCache', () => {
  beforeEach(() => {
    clearScopeCache();
  });

  it('returns undefined when cache is empty', () => {
    expect(getScopeCache('mine')).toBeUndefined();
  });

  it('stores and retrieves cached entries for a scope', () => {
    const conversations = [fakeConv('1'), fakeConv('2')];
    setScopeCache('unassigned', {
      conversations,
      pagination: fakePagination,
      query: fakeQuery,
    });

    const cached = getScopeCache('unassigned');
    expect(cached).toBeDefined();
    expect(cached?.conversations.length).toBe(2);
    expect(cached?.pagination.total).toBe(2);
  });

  it('evicts conversation from scope cache when removed', () => {
    const conversations = [fakeConv('1'), fakeConv('2')];
    setScopeCache('unassigned', {
      conversations,
      pagination: fakePagination,
      query: fakeQuery,
    });

    evictFromScopeCache('unassigned', '1');

    const cached = getScopeCache('unassigned');
    expect(cached?.conversations.length).toBe(1);
    expect(cached?.conversations[0].id).toBe('2');
    expect(cached?.pagination.total).toBe(1);
  });

  it('adds or updates a conversation in scope cache', () => {
    setScopeCache('mine', {
      conversations: [fakeConv('1')],
      pagination: { ...fakePagination, total: 1 },
      query: fakeQuery,
    });

    // Add new
    addOrUpdateInScopeCache('mine', fakeConv('3'));
    let cached = getScopeCache('mine');
    expect(cached?.conversations.length).toBe(2);
    expect(cached?.conversations[0].id).toBe('3');

    // Update existing
    addOrUpdateInScopeCache('mine', fakeConv('1', { status: 'resolved' }));
    cached = getScopeCache('mine');
    expect(cached?.conversations.length).toBe(2);
    const updated = cached?.conversations.find(c => c.id === '1');
    expect(updated?.status).toBe('resolved');
  });
});
