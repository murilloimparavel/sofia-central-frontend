import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiltersProvider, useFilters } from './FiltersContext';
import { chatService } from '@/services/chat/chatService';
import type { ConversationFilter } from '@/types/chat/api';
import { useAuthStore } from '@/store/authStore';
import { useAppDataStore } from '@/store/appDataStore';
import {
  clearConversationQueryCache,
  evictConversationFromQueryCache,
  invalidateConversationQueryCache,
  reconcileConversationQueryCache,
} from '@/utils/chat/conversationQueryCache';
import { clearScopeCache, getScopeCache, setScopeCache } from '@/utils/chat/conversationScopeCache';
import { conversationsReducer } from './ConversationsContextReducer';
import { initialState } from '@/types/chat/conversations';

vi.mock('@/services/chat/chatService', () => ({
  chatService: { getConversations: vi.fn(), filterConversations: vi.fn() },
}));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const statusFilter = (status: string): ConversationFilter => ({
  attribute_key: 'status',
  filter_operator: 'equal_to',
  values: [status],
  query_operator: 'and',
});

describe('FiltersProvider request ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConversationQueryCache();
    clearScopeCache();
    useAuthStore.setState({ currentUser: { id: 'user-1' } as never });
    useAppDataStore.setState({ account: { id: 'account-1' } as never });
  });

  afterEach(() => {
    clearConversationQueryCache();
    clearScopeCache();
    act(() => {
      useAuthStore.setState({ currentUser: null });
      useAppDataStore.setState({ account: null });
    });
  });

  it('keeps the latest scope when responses finish out of order', async () => {
    let resolveOpen!: (value: unknown) => void;
    let resolveResolved!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOpen = resolve; }) as never)
      .mockImplementationOnce(() => new Promise(resolve => { resolveResolved = resolve; }) as never);

    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);

    const onOpen = vi.fn();
    const onResolved = vi.fn();
    let openRequest!: Promise<void>;
    let resolvedRequest!: Promise<void>;
    await act(async () => {
      openRequest = filters.applyFilters([statusFilter('open')], onOpen, vi.fn());
      resolvedRequest = filters.applyFilters([statusFilter('resolved')], onResolved, vi.fn());
    });

    await act(async () => {
      resolveResolved({ data: [{ id: 'resolved-1' }], meta: { page: 1, page_size: 20, total: 1 } });
      await resolvedRequest;
    });
    await act(async () => {
      resolveOpen({ data: [{ id: 'open-1' }], meta: { page: 1, page_size: 20, total: 1 } });
      await openRequest;
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledOnce();
    expect(filters.state.activeFilters).toEqual([statusFilter('resolved')]);
    expect(filters.state.isApplyingFilters).toBe(false);
  });

  it('uses a fresh exact-filter snapshot with one reconciliation and no second GET', async () => {
    vi.mocked(chatService.getConversations).mockImplementation(async params => ({
      data: [{ id: params?.status === 'open' ? 'open-1' : 'resolved-1' }],
      meta: { page: 1, page_size: 20, total: 1 },
    } as never));
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    const onSuccess = vi.fn();

    await act(async () => { await filters.applyFilters([statusFilter('open')], onSuccess, vi.fn()); });
    await act(async () => { await filters.applyFilters([statusFilter('resolved')], onSuccess, vi.fn()); });
    await act(async () => { await filters.applyFilters([statusFilter('open')], onSuccess, vi.fn()); });

    expect(chatService.getConversations).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(3);
    expect(onSuccess.mock.calls.map(([rows]) => rows[0].id)).toEqual(['open-1', 'resolved-1', 'open-1']);
    expect(filters.state.activeFilters).toEqual([statusFilter('open')]);
    expect(filters.state.isApplyingFilters).toBe(false);
  });

  it('keys search separately and does not reuse a filter-only result', async () => {
    vi.mocked(chatService.getConversations).mockImplementation(async params => ({
      data: [{ id: params?.q || 'no-search' }],
      meta: { page: 1, page_size: 20, total: 1 },
    } as never));
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);

    await act(async () => { filters.setFilters([statusFilter('open')]); });
    const onSuccess = vi.fn();
    await act(async () => { await filters.applyFilters([statusFilter('open')], onSuccess, vi.fn()); });
    await act(async () => { await filters.applySearch('Ana', onSuccess, vi.fn()); });
    await act(async () => { await filters.applySearch('Bea', onSuccess, vi.fn()); });
    await act(async () => { await filters.applySearch('Ana', onSuccess, vi.fn()); });

    expect(chatService.getConversations).toHaveBeenCalledTimes(3);
    expect(onSuccess.mock.calls.map(([rows]) => rows[0].id)).toEqual([
      'no-search', 'Ana', 'Bea', 'Ana',
    ]);
  });

  it('does not reuse a snapshot after user or account changes', async () => {
    vi.mocked(chatService.getConversations).mockResolvedValue({
      data: [{ id: 'one' }], meta: { page: 1, page_size: 20, total: 1 },
    } as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);

    await act(async () => { await filters.applyFilters([statusFilter('open')], vi.fn(), vi.fn()); });
    await act(async () => {
      useAuthStore.setState({ currentUser: { id: 'user-2' } as never });
    });
    await act(async () => { await filters.applyFilters([statusFilter('open')], vi.fn(), vi.fn()); });
    await act(async () => {
      useAppDataStore.setState({ account: { id: 'account-2' } as never });
    });
    await act(async () => { await filters.applyFilters([statusFilter('open')], vi.fn(), vi.fn()); });

    expect(chatService.getConversations).toHaveBeenCalledTimes(3);
  });

  it('refetches after a mutation during REST and applies only the newer response', async () => {
    let resolveStale!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve; }) as never)
      .mockResolvedValueOnce({
        data: [{ id: 'fresh' }], meta: { page: 1, page_size: 20, total: 1 },
      } as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);

    const onSuccess = vi.fn();
    await act(async () => {
      const request = filters.applyFilters([statusFilter('open')], onSuccess, vi.fn());
      invalidateConversationQueryCache();
      resolveStale({ data: [{ id: 'stale' }], meta: { page: 1, page_size: 20, total: 1 } });
      await request;
    });

    expect(chatService.getConversations).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0][0][0].id).toBe('fresh');
  });

  it('coalesces two in-flight revisions and applies the third stable response', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as never)
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }) as never)
      .mockResolvedValueOnce({
        data: [{ id: 'stable' }], meta: { page: 1, page_size: 20, total: 1 },
      } as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    let request!: Promise<void>;

    await act(async () => { request = filters.applyFilters([statusFilter('open')], onSuccess, onError); });
    await act(async () => {
      invalidateConversationQueryCache();
      resolveFirst({ data: [{ id: 'stale-1' }], meta: { page: 1, page_size: 20, total: 1 } });
    });
    await waitFor(() => expect(chatService.getConversations).toHaveBeenCalledTimes(2));
    await act(async () => {
      invalidateConversationQueryCache();
      resolveSecond({ data: [{ id: 'stale-2' }], meta: { page: 1, page_size: 20, total: 1 } });
      await request;
    });

    expect(chatService.getConversations).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0][0][0].id).toBe('stable');
    expect(onError).not.toHaveBeenCalled();
    expect(filters.state.activeFilters).toEqual([statusFilter('open')]);
  });

  it('cancels retry after a newer filter request wins', async () => {
    let resolveFirst!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as never)
      .mockResolvedValueOnce({
        data: [{ id: 'resolved' }], meta: { page: 1, page_size: 20, total: 1 },
      } as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    const onOpen = vi.fn();
    const onResolved = vi.fn();
    let openRequest!: Promise<void>;

    await act(async () => { openRequest = filters.applyFilters([statusFilter('open')], onOpen, vi.fn()); });
    await act(async () => {
      invalidateConversationQueryCache();
      resolveFirst({ data: [{ id: 'stale' }], meta: { page: 1, page_size: 20, total: 1 } });
    });
    await act(async () => {
      await filters.applyFilters([statusFilter('resolved')], onResolved, vi.fn());
      await openRequest;
    });

    expect(chatService.getConversations).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledOnce();
    expect(filters.state.activeFilters).toEqual([statusFilter('resolved')]);
  });

  it('replays WS upsert/remove into the same list and scope snapshot', async () => {
    let resolveFirst!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    let listState = initialState;
    const onSuccess = vi.fn((rows, page, query) => {
      listState = conversationsReducer(listState, {
        type: 'SET_CONVERSATIONS', payload: { conversations: rows, pagination: page },
      });
      setScopeCache('open', { conversations: rows, pagination: page, query });
    });
    const onError = vi.fn();
    let request!: Promise<void>;
    const oldRow = { id: 'old', status: 'open', inbox_id: 'inbox', unread_count: 0,
      created_at: '2026-10-24T10:00:00Z', last_activity_at: '2026-10-24T10:00:00Z',
      display_id: 'display', contact: { id: 'contact' }, inbox: { id: 'inbox' } };
    const keepRow = { ...oldRow, id: 'keep', last_activity_at: '2026-10-24T09:00:00Z' };
    const newRow = { ...oldRow, id: 'new', last_activity_at: '2026-10-24T11:00:00Z' };

    await act(async () => { request = filters.applyFilters([statusFilter('open')], onSuccess, onError); });
    await act(async () => {
      reconcileConversationQueryCache(newRow as never);
      evictConversationFromQueryCache('old', {
        query: { kind: 'list', params: { status: 'open' } },
        userId: 'user-1', accountId: 'account-1',
      });
      resolveFirst({ data: [oldRow, keepRow], meta: { page: 1, page_size: 20, total: 2 } });
      await request;
    });

    expect(chatService.getConversations).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledOnce();
    const listIds = onSuccess.mock.calls[0][0].map(row => row.id);
    expect(listIds).toEqual(['new', 'keep']);
    expect(listState.conversations.map(row => row.id)).toEqual(listIds);
    expect(getScopeCache('open')?.conversations.map(row => row.id)).toEqual(listIds);
    expect(onError).not.toHaveBeenCalled();
  });

  it('bounds retries and reports a clear error under continuous unknown events', async () => {
    vi.mocked(chatService.getConversations).mockImplementation(async () => {
      invalidateConversationQueryCache();
      return { data: [{ id: 'stale' }], meta: { page: 1, page_size: 20, total: 1 } } as never;
    });
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const startedAt = Date.now();
    const events = setInterval(invalidateConversationQueryCache, 60);
    try {
      await act(async () => { await filters.applyFilters([statusFilter('open')], onSuccess, onError); });
      await new Promise(resolve => setTimeout(resolve, 1_050));
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      expect(chatService.getConversations).toHaveBeenCalledTimes(3);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toContain('A lista mudou');
      expect(filters.state.isApplyingFilters).toBe(false);
    } finally {
      clearInterval(events);
    }
  });

  it('does not replay an unknown advanced filter after a WS event', async () => {
    vi.mocked(chatService.filterConversations).mockImplementation(async () => {
      reconcileConversationQueryCache({ id: 'changed', status: 'open',
        inbox_id: 'inbox', unread_count: 0, created_at: '2026-10-24T10:00:00Z',
        last_activity_at: '2026-10-24T11:00:00Z' } as never);
      return { data: [{ id: 'stale' }], meta: { page: 1, page_size: 20, total: 1 } } as never;
    });
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const unknownFilter: ConversationFilter = {
      attribute_key: 'custom_unknown', filter_operator: 'equal_to', values: ['x'], query_operator: 'and',
    };

    await act(async () => { await filters.applyFilters([unknownFilter], onSuccess, onError); });

    expect(chatService.filterConversations).toHaveBeenCalledTimes(3);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(filters.state.isApplyingFilters).toBe(false);
  });

  it('cancels a pending quiet-window retry after account switch', async () => {
    let resolveFirst!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    let request!: Promise<void>;

    await act(async () => { request = filters.applyFilters([statusFilter('open')], onSuccess, onError); });
    await act(async () => {
      invalidateConversationQueryCache();
      resolveFirst({ data: [{ id: 'old-account' }], meta: { page: 1, page_size: 20, total: 1 } });
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    await act(async () => {
      useAppDataStore.setState({ account: { id: 'account-2' } as never });
      await request;
    });

    expect(chatService.getConversations).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('retries under an account that arrives while REST is in flight', async () => {
    useAppDataStore.setState({ account: null });
    let resolveFirst!: (value: unknown) => void;
    vi.mocked(chatService.getConversations)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as never)
      .mockResolvedValueOnce({
        data: [{ id: 'current-account' }], meta: { page: 1, page_size: 20, total: 1 },
      } as never);
    let filters!: ReturnType<typeof useFilters>;
    function Probe() {
      filters = useFilters();
      return null;
    }
    render(<FiltersProvider><Probe /></FiltersProvider>);

    const onSuccess = vi.fn();
    await act(async () => {
      const request = filters.applyFilters([statusFilter('open')], onSuccess, vi.fn());
      useAppDataStore.setState({ account: { id: 'account-1' } as never });
      resolveFirst({ data: [{ id: 'without-account' }], meta: { page: 1, page_size: 20, total: 1 } });
      await request;
    });

    expect(chatService.getConversations).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0][0][0].id).toBe('current-account');
  });
});
