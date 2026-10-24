import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FiltersProvider, useFilters } from './FiltersContext';
import { chatService } from '@/services/chat/chatService';
import type { ConversationFilter } from '@/types/chat/api';

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
  beforeEach(() => vi.clearAllMocks());

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
});
