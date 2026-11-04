import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationsQuery } from '@/types/chat/api';
import {
  clearConversationQueryCache,
  evictConversationFromQueryCache,
  getConversationQueryCache,
  getConversationQueryCacheRevision,
  invalidateConversationQueryCache,
  patchUnreadInConversationQueryCache,
  reconcileConversationQueryCache,
  replayConversationQueryEvents,
  setConversationQueryCache,
} from './conversationQueryCache';

const pagination = { page: 1, page_size: 20, total: 1, total_pages: 1 };
const entry = (query: ConversationsQuery, id: string) => ({
  query,
  pagination,
  conversations: [{ id }] as Parameters<typeof setConversationQueryCache>[2]['conversations'],
});

describe('conversationQueryCache', () => {
  beforeEach(() => clearConversationQueryCache());

  it('separates exact filter payloads and preserves filter order', () => {
    const open: ConversationsQuery = { kind: 'filter', request: { filters: [
      { attribute_key: 'status', filter_operator: 'equal_to', values: ['open'], query_operator: null },
      { attribute_key: 'priority', filter_operator: 'equal_to', values: ['high'], query_operator: 'AND' },
    ] } };
    const resolved: ConversationsQuery = { kind: 'filter', request: { filters: [
      { attribute_key: 'status', filter_operator: 'equal_to', values: ['resolved'], query_operator: null },
      { attribute_key: 'priority', filter_operator: 'equal_to', values: ['high'], query_operator: 'AND' },
    ] } };
    const reordered: ConversationsQuery = { kind: 'filter', request: {
      filters: [...open.request.filters].reverse(),
    } };
    setConversationQueryCache('user-1', 'account-1', entry(open, 'open-1'));

    expect(getConversationQueryCache('user-1', 'account-1', open)?.conversations[0].id).toBe('open-1');
    expect(getConversationQueryCache('user-1', 'account-1', resolved)).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', reordered)).toBeUndefined();
  });

  it('separates search, sort and page while ignoring object key order', () => {
    const first: ConversationsQuery = {
      kind: 'list', params: { q: 'Ana', sort_by: 'priority', page: 1 },
    };
    setConversationQueryCache('user-1', 'account-1', entry(first, 'page-1'));

    expect(getConversationQueryCache('user-1', 'account-1', {
      kind: 'list', params: { page: 1, sort_by: 'priority', q: 'Ana' },
    })?.conversations[0].id).toBe('page-1');
    expect(getConversationQueryCache('user-1', 'account-1', {
      kind: 'list', params: { q: 'Anne', sort_by: 'priority', page: 1 },
    })).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', {
      kind: 'list', params: { q: 'Ana', sort_by: 'last_activity_at', page: 1 },
    })).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', {
      kind: 'list', params: { q: 'Ana', sort_by: 'priority', page: 2 },
    })).toBeUndefined();
  });

  it('clears entries across users, accounts and logout, and honors invalidation', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    setConversationQueryCache('user-1', 'account-1', entry(query, 'one'));
    expect(getConversationQueryCache('user-2', 'account-1', query)).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', query)).toBeUndefined();

    setConversationQueryCache('user-1', 'account-1', entry(query, 'one'));
    expect(getConversationQueryCache('user-1', 'account-2', query)).toBeUndefined();
    setConversationQueryCache('user-1', 'account-2', entry(query, 'two'));
    const revision = getConversationQueryCacheRevision();
    invalidateConversationQueryCache();
    expect(getConversationQueryCacheRevision()).toBeGreaterThan(revision);
    expect(getConversationQueryCache('user-1', 'account-2', query)).toBeUndefined();

    setConversationQueryCache('user-1', 'account-2', entry(query, 'two'));
    expect(getConversationQueryCache(null, 'account-2', query)).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-2', query)).toBeUndefined();
  });

  it('expires a fresh entry after the short TTL', () => {
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
      setConversationQueryCache('user-1', 'account-1', entry(query, 'one'));
      now += 9_999;
      expect(getConversationQueryCache('user-1', 'account-1', query)).toBeDefined();
      now += 1;
      expect(getConversationQueryCache('user-1', 'account-1', query)).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });

  it('invalidates activity changes and filters whose earlier membership is unknown', () => {
    const open: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    const resolved: ConversationsQuery = { kind: 'list', params: { status: 'resolved' } };
    setConversationQueryCache('user-1', 'account-1', {
      ...entry(open, 'conv-1'),
      conversations: [{ id: 'conv-1', status: 'open', last_activity_at: '2026-10-24T11:00:00Z' }] as never,
    });
    setConversationQueryCache('user-1', 'account-1', entry(resolved, 'resolved-1'));

    reconcileConversationQueryCache({ id: 'conv-1', status: 'open', inbox_id: 'inbox',
      unread_count: 0, created_at: '2026-10-24T10:00:00Z',
      last_activity_at: '2026-10-24T12:00:00Z' } as never);

    expect(getConversationQueryCache('user-1', 'account-1', open)).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', resolved)).toBeUndefined();
  });

  it('invalidates unread membership while retaining ordinary list cache', () => {
    const all: ConversationsQuery = { kind: 'list', params: { status: 'all' } };
    const unread: ConversationsQuery = { kind: 'list', params: { unread: true } };
    setConversationQueryCache('user-1', 'account-1', entry(all, 'conv-1'));
    setConversationQueryCache('user-1', 'account-1', entry(unread, 'conv-1'));

    patchUnreadInConversationQueryCache('conv-1', 0);

    expect(getConversationQueryCache('user-1', 'account-1', all)?.conversations[0]
      .unread_count).toBe(0);
    expect(getConversationQueryCache('user-1', 'account-1', unread)).toBeUndefined();
  });

  it('invalidates snapshots with membership that local events cannot verify', () => {
    const queries: ConversationsQuery[] = [
      { kind: 'list', params: { unanswered: true } },
      { kind: 'list', params: { archived: false } },
      { kind: 'list', params: { conversation_type: 'participating' } },
      { kind: 'filter', request: { filters: [{ attribute_key: 'waiting_since',
        filter_operator: 'is_present', values: [], query_operator: null }] } },
    ];
    for (const query of queries) {
      setConversationQueryCache('user-1', 'account-1', entry(query, 'conv-1'));
    }

    reconcileConversationQueryCache({ id: 'conv-1', status: 'open' } as never);

    for (const query of queries) {
      expect(getConversationQueryCache('user-1', 'account-1', query)).toBeUndefined();
    }

    for (const query of queries) {
      setConversationQueryCache('user-1', 'account-1', entry(query, 'conv-1'));
    }
    patchUnreadInConversationQueryCache('conv-1', 2);
    for (const query of queries) {
      expect(getConversationQueryCache('user-1', 'account-1', query)).toBeUndefined();
    }
  });

  it('invalidates activity changes across pages and changed priority order', () => {
    const first: ConversationsQuery = { kind: 'list', params: { status: 'open', page: 1 } };
    const second: ConversationsQuery = { kind: 'list', params: { status: 'open', page: 2 } };
    const priority: ConversationsQuery = { kind: 'list', params: { status: 'open', sort_by: 'priority' } };
    const row = { id: 'conv-1', status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z',
      last_activity_at: '2026-10-24T11:00:00Z', priority: 'low' };
    for (const query of [first, second, priority]) {
      setConversationQueryCache('user-1', 'account-1', {
        ...entry(query, 'conv-1'), conversations: [row] as never,
      });
    }

    reconcileConversationQueryCache({ ...row, last_activity_at: '2026-10-24T12:00:00Z' } as never);

    expect(getConversationQueryCache('user-1', 'account-1', first)).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', second)).toBeUndefined();
    expect(getConversationQueryCache('user-1', 'account-1', priority)).toBeUndefined();

    reconcileConversationQueryCache({ ...row, priority: 'high',
      last_activity_at: '2026-10-24T10:00:00Z' } as never);
    expect(getConversationQueryCache('user-1', 'account-1', first)).toBeUndefined();
  });

  it('invalidates a warm first page when the second row gets newer activity', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open', page: 1 } };
    const row = { status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z' };
    setConversationQueryCache('user-1', 'account-1', {
      query,
      conversations: [
        { ...row, id: 'a', last_activity_at: '2026-10-24T12:00:00Z' },
        { ...row, id: 'b', last_activity_at: '2026-10-24T11:00:00Z' },
      ] as never,
      pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 },
    });

    reconcileConversationQueryCache({ ...row, id: 'b',
      last_activity_at: '2026-10-24T13:00:00Z' } as never);
    expect(getConversationQueryCache('user-1', 'account-1', query)).toBeUndefined();
  });

  it('invalidates a warm page when activity creates a timestamp tie', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    const row = { status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z' };
    setConversationQueryCache('user-1', 'account-1', {
      query,
      conversations: [
        { ...row, id: 'a', last_activity_at: '2026-10-24T12:00:00Z' },
        { ...row, id: 'b', last_activity_at: '2026-10-24T11:00:00Z' },
      ] as never,
      pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 },
    });

    reconcileConversationQueryCache({ ...row, id: 'b',
      last_activity_at: '2026-10-24T12:00:00Z' } as never);
    expect(getConversationQueryCache('user-1', 'account-1', query)).toBeUndefined();
  });

  it('replays a complete upsert and removal over an in-flight page', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    const oldRow = { id: 'old', status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', last_activity_at: '2026-10-24T10:00:00Z',
      display_id: 'old', contact: { id: 'contact' }, inbox: { id: 'inbox' } };
    const newRow = { ...oldRow, id: 'new', last_activity_at: '2026-10-24T11:00:00Z' };
    reconcileConversationQueryCache(newRow as never);
    evictConversationFromQueryCache('old', { query, userId: 'user-1', accountId: 'account-1' });

    const result = replayConversationQueryEvents('user-1', 'account-1', before, {
      query, conversations: [oldRow] as never, pagination,
    });

    expect(result?.conversations.map(row => row.id)).toEqual(['new']);
    expect(result?.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('does not remove a conversation from another query when one view evicts it', () => {
    const open: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    const all: ConversationsQuery = { kind: 'list', params: { status: 'all' } };
    getConversationQueryCache('user-1', 'account-1', all);
    const before = getConversationQueryCacheRevision();
    const row = { id: 'conv-1', status: 'resolved', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', last_activity_at: '2026-10-24T10:00:00Z' };
    evictConversationFromQueryCache('conv-1', {
      query: open, userId: 'user-1', accountId: 'account-1',
    });

    const allResult = replayConversationQueryEvents('user-1', 'account-1', before, {
      query: all, conversations: [row] as never, pagination,
    });
    expect(allResult?.conversations.map(conversation => conversation.id)).toEqual(['conv-1']);
  });

  it('refuses to cache a page-one removal when the next page must fill its slot', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    const row = { status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', last_activity_at: '2026-10-24T10:00:00Z' };
    evictConversationFromQueryCache('first', {
      query, userId: 'user-1', accountId: 'account-1',
    });

    expect(replayConversationQueryEvents('user-1', 'account-1', before, {
      query, conversations: [{ ...row, id: 'first' }, { ...row, id: 'second' }] as never,
      pagination: { page: 1, page_size: 2, total: 3, total_pages: 2, has_next_page: true },
    })).toBeNull();
  });

  it('refuses replay when a scoped removal is absent from page one but may be on page two', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    evictConversationFromQueryCache('second-page', {
      query, userId: 'user-1', accountId: 'account-1',
    });

    expect(replayConversationQueryEvents('user-1', 'account-1', before, {
      query,
      conversations: [{ id: 'first' }, { id: 'last-on-first-page' }] as never,
      pagination: { page: 1, page_size: 2, total: 3, total_pages: 2, has_next_page: true },
    })).toBeNull();
  });

  it('keeps the page limit and opens the next page when a newer row displaces the last one', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    const row = { status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', display_id: 'display',
      contact: { id: 'contact' }, inbox: { id: 'inbox' } };
    reconcileConversationQueryCache({ ...row, id: 'new',
      last_activity_at: '2026-10-24T12:00:00Z' } as never);

    const result = replayConversationQueryEvents('user-1', 'account-1', before, {
      query,
      conversations: [
        { ...row, id: 'first', last_activity_at: '2026-10-24T11:00:00Z' },
        { ...row, id: 'second', last_activity_at: '2026-10-24T10:00:00Z' },
      ] as never,
      pagination: { page: 1, page_size: 2, total: 2, total_pages: 1, has_next_page: false },
    });

    expect(result?.conversations.map(conversation => conversation.id)).toEqual(['new', 'first']);
    expect(result?.pagination.total).toBe(3);
    expect(result?.pagination.total_pages).toBe(2);
    expect(result?.pagination.has_next_page).toBe(true);
  });

  it('retries when an upsert outside page one may have come from page two', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    const row = { status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', display_id: 'display',
      contact: { id: 'contact' }, inbox: { id: 'inbox' } };
    reconcileConversationQueryCache({ ...row, id: 'from-second-page',
      last_activity_at: '2026-10-24T12:00:00Z' } as never);

    expect(replayConversationQueryEvents('user-1', 'account-1', before, {
      query,
      conversations: [
        { ...row, id: 'first', last_activity_at: '2026-10-24T11:00:00Z' },
        { ...row, id: 'second', last_activity_at: '2026-10-24T10:00:00Z' },
      ] as never,
      pagination: { page: 1, page_size: 2, total: 3, total_pages: 2, has_next_page: true },
    })).toBeNull();
  });

  it('decrements total when the entire result fits on page one and a row leaves the view', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    evictConversationFromQueryCache('first', {
      query, userId: 'user-1', accountId: 'account-1',
    });

    const result = replayConversationQueryEvents('user-1', 'account-1', before, {
      query, conversations: [{ id: 'first' }, { id: 'second' }] as never,
      pagination: { page: 1, page_size: 2, total: 2, total_pages: 1, has_next_page: false },
    });
    expect(result?.conversations.map(conversation => conversation.id)).toEqual(['second']);
    expect(result?.pagination).toMatchObject({ total: 1, total_pages: 1, has_next_page: false });
  });

  it('refuses replay without a complete cache identity after an event', () => {
    const query: ConversationsQuery = { kind: 'list', params: {} };
    getConversationQueryCache('user-1', 'account-1', query);
    const before = getConversationQueryCacheRevision();
    invalidateConversationQueryCache();
    expect(replayConversationQueryEvents('user-1', null, before, entry(query, 'one'))).toBeNull();
    expect(getConversationQueryCache('user-1', null, query)).toBeUndefined();
  });

  it('refuses replay for unknown events, incomplete upserts and a full journal', () => {
    const query: ConversationsQuery = { kind: 'list', params: { status: 'open' } };
    const existing = { id: 'partial', status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', last_activity_at: '2026-10-24T10:00:00Z' };
    const snapshot = { query, conversations: [existing] as never[], pagination };
    getConversationQueryCache('user-1', 'account-1', query);
    let before = getConversationQueryCacheRevision();
    reconcileConversationQueryCache({ id: 'partial', status: 'open' } as never);
    expect(replayConversationQueryEvents('user-1', 'account-1', before, snapshot)).toBeNull();

    before = getConversationQueryCacheRevision();
    invalidateConversationQueryCache();
    expect(replayConversationQueryEvents('user-1', 'account-1', before, snapshot)).toBeNull();

    before = getConversationQueryCacheRevision();
    for (let i = 0; i < 101; i += 1) evictConversationFromQueryCache(`id-${i}`);
    expect(replayConversationQueryEvents('user-1', 'account-1', before, snapshot)).toBeNull();
    expect(replayConversationQueryEvents('user-2', 'account-1', before, snapshot)).toBeNull();
  });
});
