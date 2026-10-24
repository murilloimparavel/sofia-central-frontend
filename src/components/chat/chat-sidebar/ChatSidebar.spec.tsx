import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ChatSidebar from './ChatSidebar';
import type { ConversationFilter } from '@/types/chat/api';

vi.mock('@/services/pipelines/pipelinesService', () => ({
  pipelinesService: {
    getPipelines: vi.fn(),
    getPipelinesByConversation: vi.fn(),
    addItemToPipeline: vi.fn(),
    moveItem: vi.fn(),
    removeItemFromPipeline: vi.fn(),
  },
}));

vi.mock('@/services/chat/chatService', () => ({
  default: { getConversation: vi.fn() },
}));

const mockUpdateConversation = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (v: unknown) => v,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/utils/channelUtils', () => ({
  isPhoneBearingChannel: () => false,
}));

vi.mock('@/utils/contact/formatContactPhone', () => ({
  formatContactPhone: (p: string) => p,
}));

vi.mock('@/utils/time/timeHelpers', () => ({
  formatConversationTime: () => '10:00',
  formatDetailedTime: () => '2026-05-13 10:00',
  normalizeToUnixSeconds: (v: number) => v,
}));

vi.mock('@/utils/chat/mediaLabels', () => ({
  attachmentLabel: () => '',
  mediaTypeFromAttributes: () => null,
  senderNameFromAttributes: () => null,
}));

vi.mock('../loading-states', () => ({
  ConversationSkeleton: ({ count }: { count?: number }) => (
    <div data-testid="skeleton" data-count={count} />
  ),
}));

vi.mock('../empty-states', () => ({
  NoConversations: () => <div data-testid="no-conversations" />,
}));

vi.mock('../contact/ContactAvatar', () => ({
  default: () => <div data-testid="contact-avatar" />,
}));

vi.mock('../conversation/ConversationBadges', () => ({
  default: () => <div data-testid="conversation-badges" />,
}));

vi.mock('../conversation/ConversationsFilter', () => ({
  default: () => <div data-testid="conversations-filter" />,
}));

vi.mock('../search/GlobalSearchPanel', () => ({
  default: () => <div data-testid="global-search-panel" />,
}));

const makeConversation = (id = '42') =>
  ({
    id,
    status: 'open' as const,
    inbox: { id: '1', name: 'WhatsApp', channel_type: 'Channel::Whatsapp' },
    contact: { id: '1', name: 'Test Contact' },
    custom_attributes: {},
    timestamp: Date.now(),
    unread_count: 0,
  }) as never;

const mockConversation = makeConversation();

const makeMockContext = () => ({
  conversations: {
    state: {
      conversations: [mockConversation],
      conversationsLoading: false,
      conversationsError: null,
      selectedConversationId: null,
      conversationsPagination: null,
    },
    getUnreadCount: () => 0,
    loadConversations: vi.fn().mockResolvedValue(undefined),
    loadMoreConversations: vi.fn().mockResolvedValue(undefined),
    updateConversation: mockUpdateConversation,
  },
  filters: {
    state: { activeFilters: [], isApplyingFilters: false },
    applyFilters: vi.fn(),
    clearFilters: vi.fn(),
  },
});

let overrideContext: ReturnType<typeof makeMockContext> | null = null;

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('@/contexts/chat/ChatContext', () => ({
  useChatContext: () => overrideContext ?? makeMockContext(),
  useChatConversations: () => (overrideContext ?? makeMockContext()).conversations,
  useChatFilters: () => (overrideContext ?? makeMockContext()).filters,
}));

const defaultProps = {
  mobileView: 'list' as const,
  searchInput: '',
  onSearchChange: vi.fn(),
  onConversationSelect: vi.fn(),
  onFilterApply: vi.fn(),
  onFilterClear: vi.fn(),
  onMarkAsRead: vi.fn(),
  onMarkAsUnread: vi.fn(),
  onMarkAsOpen: vi.fn(),
  onMarkAsResolved: vi.fn(),
  onPostpone: vi.fn(),
  onMarkAsSnoozed: vi.fn(),
  onSetPriority: vi.fn(),
  onPinConversation: vi.fn(),
  onUnpinConversation: vi.fn(),
  onArchiveConversation: vi.fn(),
  onUnarchiveConversation: vi.fn(),
  onAssignAgent: vi.fn(),
  onAssignTeam: vi.fn(),
  onAssignTag: vi.fn(),
  onDeleteConversation: vi.fn(),
  selectedConversationIds: new Set<string>(),
  onToggleSelect: vi.fn(),
  onClearSelection: vi.fn(),
  onBulkSetStatus: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  overrideContext = null;
});

describe('ChatSidebar scope navigation', () => {
  it('renders all four scope tabs: Chats, Fila, Robô, and Todas', () => {
    render(<ChatSidebar {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /mine/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /unassigned/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /bot/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument();
  });

  it('triggers onFilterApply with the correct preset when clicking a scope tab', async () => {
    const onFilterApply = vi.fn();
    render(<ChatSidebar {...defaultProps} onFilterApply={onFilterApply} />);

    const user = userEvent.setup();
    const filaTab = screen.getByRole('tab', { name: /unassigned/i });
    await user.click(filaTab);

    expect(onFilterApply).toHaveBeenCalledWith([
      expect.objectContaining({ attributeKey: 'assignee_type', values: 'unassigned' }),
      expect.objectContaining({ attributeKey: 'status', values: 'open' }),
    ]);

    const botTab = screen.getByRole('tab', { name: /bot/i });
    await user.click(botTab);

    expect(onFilterApply).toHaveBeenCalledWith([
      expect.objectContaining({ attributeKey: 'assignee_type', values: 'all' }),
      expect.objectContaining({ attributeKey: 'status', values: 'pending' }),
    ]);
  });
});

const makePaginatedContext = (hasNextPage: boolean, loadMoreFn = vi.fn().mockResolvedValue(undefined)) => {
  const ctx = makeMockContext();
  ctx.conversations.state.conversationsPagination = {
    page: 1,
    page_size: 11,
    total: 35,
    total_pages: 3,
    has_next_page: hasNextPage,
  } as never;
  ctx.conversations.loadMoreConversations = loadMoreFn;
  return ctx;
};

const setScrollDimensions = (el: Element, scrollHeight: number, clientHeight: number, scrollTop: number) => {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
};

describe('ChatSidebar scroll pagination (EVO-1407)', () => {
  it('preserves the last user position when the conversation collection is reconciled', async () => {
    const selected = makeConversation('99');
    selected.contact = { id: '99', name: 'Selected Contact' } as never;
    overrideContext = makePaginatedContext(false);
    overrideContext.conversations.state.conversations = [mockConversation, selected];
    const { rerender } = render(<ChatSidebar {...defaultProps} />);

    const scrollEl = document.querySelector('[data-tour="chat-conversations-list"]')!;
    setScrollDimensions(scrollEl, 5000, 600, 3200);
    await act(async () => { fireEvent.scroll(scrollEl); });

    await userEvent.click(screen.getByText('Selected Contact'));

    // Simula SET_CONVERSATIONS/UPDATE_UNREAD_COUNT trocando a referência da
    // coleção depois da seleção, que era o ponto em que a lista resetava.
    overrideContext.conversations.state.conversations = [
      { ...selected, unread_count: 0 } as never,
      { ...mockConversation } as never,
    ];
    rerender(<ChatSidebar {...defaultProps} />);

    expect(scrollEl.scrollTop).toBe(3200);
  });

  it('renders "Carregar mais" button when has_next_page is true', async () => {
    overrideContext = makePaginatedContext(true);
    render(<ChatSidebar {...defaultProps} />);
    expect(await screen.findByText('Carregar mais')).toBeInTheDocument();
  });

  it('does not render "Carregar mais" button when has_next_page is false', async () => {
    overrideContext = makePaginatedContext(false);
    render(<ChatSidebar {...defaultProps} />);
    await screen.findByText('Test Contact');
    expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument();
  });

  it('button click triggers loadMoreConversations (CB-1)', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    overrideContext = makePaginatedContext(true, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    const btn = await screen.findByText('Carregar mais');
    await act(async () => { fireEvent.click(btn); });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows skeleton during load and hides button (CB-2)', async () => {
    let resolveFn!: () => void;
    const loadMore = vi.fn().mockReturnValue(new Promise<void>(res => { resolveFn = res; }));
    overrideContext = makePaginatedContext(true, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    const btn = await screen.findByText('Carregar mais');

    act(() => { fireEvent.click(btn); });

    await waitFor(() => expect(screen.getByTestId('skeleton')).toBeInTheDocument());
    expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument();

    await act(async () => { resolveFn(); });
  });

  it('scroll near bottom triggers loadMoreConversations (CA-1)', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    overrideContext = makePaginatedContext(true, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    await screen.findByText('Test Contact');

    const scrollEl = document.querySelector('[data-tour="chat-conversations-list"]')!;
    setScrollDimensions(scrollEl, 5000, 600, 4700);

    await act(async () => { fireEvent.scroll(scrollEl); });

    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));
  });

  it('prefetches well before reaching the bottom (CA-1b anticipated threshold)', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    overrideContext = makePaginatedContext(true, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    await screen.findByText('Test Contact');

    const scrollEl = document.querySelector('[data-tour="chat-conversations-list"]')!;
    // EVO-1672: clientHeight 600 → threshold = max(1000, 1500) = 1500px.
    // distanceToBottom = 1400px — beyond the previous 900px threshold, yet
    // still triggers, pinning the widened lookahead.
    setScrollDimensions(scrollEl, 5000, 600, 3000);

    await act(async () => { fireEvent.scroll(scrollEl); });

    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));
  });

  it('scroll far from bottom does not trigger load (CA-2 negative)', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    overrideContext = makePaginatedContext(true, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    await screen.findByText('Test Contact');

    const scrollEl = document.querySelector('[data-tour="chat-conversations-list"]')!;
    // distanceToBottom = 5000 - 0 - 600 = 4400px, well past the 1500px threshold.
    setScrollDimensions(scrollEl, 5000, 600, 0);

    await act(async () => { fireEvent.scroll(scrollEl); });

    expect(loadMore).not.toHaveBeenCalled();
  });

  it('keeps the loaded list visible when conversationsLoading flips with items on screen (EVO-1672)', async () => {
    // loadMore flips the shared conversationsLoading flag; the full-list
    // skeleton (count=8) must NOT replace an already-populated list — that
    // loses the scroll position and reads as the whole list vanishing.
    overrideContext = makePaginatedContext(true);
    overrideContext.conversations.state.conversationsLoading = true as never;
    render(<ChatSidebar {...defaultProps} />);

    expect(await screen.findByText('Test Contact')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('renders a multi-row loading cushion during load-more (EVO-1672)', async () => {
    let resolveFn!: () => void;
    const loadMore = vi.fn().mockReturnValue(new Promise<void>(res => { resolveFn = res; }));
    overrideContext = makePaginatedContext(true, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    const btn = await screen.findByText('Carregar mais');

    act(() => { fireEvent.click(btn); });

    await waitFor(() => expect(screen.getByTestId('skeleton')).toBeInTheDocument());
    expect(screen.getByTestId('skeleton').dataset.count).toBe('5');

    await act(async () => { resolveFn(); });
  });

  it('does not load more after last page (CA-3)', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    overrideContext = makePaginatedContext(false, loadMore);
    render(<ChatSidebar {...defaultProps} />);
    await screen.findByText('Test Contact');

    const scrollEl = document.querySelector('[data-tour="chat-conversations-list"]')!;
    setScrollDimensions(scrollEl, 800, 600, 680);

    await act(async () => { fireEvent.scroll(scrollEl); });

    expect(loadMore).not.toHaveBeenCalled();
  });
});

// jsdom does not evaluate media queries, so this locks the mechanism instead:
// the resize width must never reach the element as a raw inline width, which is
// what overrode w-full and left the list desktop-sized on mobile (EVO-2234).
describe('ChatSidebar responsive width (EVO-2234)', () => {
  it('keeps the resize width desktop-only, as a CSS var instead of an inline width', () => {
    render(<ChatSidebar {...defaultProps} width={420} />);

    const root = document.querySelector<HTMLElement>('[data-tour="chat-sidebar"]')!;
    expect(root.style.width).toBe('');
    expect(root.style.getPropertyValue('--chat-sidebar-width')).toBe('420px');
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('md:w-[var(--chat-sidebar-width)]');
  });

  it('falls back to the fixed desktop width when no resize width is set', () => {
    render(<ChatSidebar {...defaultProps} />);

    const root = document.querySelector<HTMLElement>('[data-tour="chat-sidebar"]')!;
    expect(root.style.width).toBe('');
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('md:w-96');
  });
});

describe('ChatSidebar defensive scope filtering', () => {
  it('does not render assigned conversation when Fila tab (unassigned) is active', () => {
    const unassignedConv = { ...makeConversation('1'), contact: { id: '1', name: 'Unassigned Contact' }, assignee_id: null };
    const assignedConv = { ...makeConversation('2'), contact: { id: '2', name: 'Assigned Contact' }, assignee_id: '99', assignee: { id: '99', name: 'Nathália' } };

    overrideContext = {
      conversations: {
        state: {
          conversations: [unassignedConv, assignedConv],
          conversationsLoading: false,
          conversationsError: null,
          selectedConversationId: null,
          conversationsPagination: null,
        },
        getUnreadCount: () => 0,
        loadConversations: vi.fn().mockResolvedValue(undefined),
        loadMoreConversations: vi.fn().mockResolvedValue(undefined),
        updateConversation: mockUpdateConversation,
      },
      filters: {
        state: {
          activeFilters: [
            { attribute_key: 'assignee_type', filter_operator: 'equal_to', values: ['unassigned'], query_operator: 'and' },
            { attribute_key: 'status', filter_operator: 'equal_to', values: ['open'], query_operator: 'and' },
          ] as ConversationFilter[],
          isApplyingFilters: false,
        },
        applyFilters: vi.fn(),
        clearFilters: vi.fn(),
      },
    };

    render(<ChatSidebar {...defaultProps} />);

    expect(screen.getByText('Unassigned Contact')).toBeInTheDocument();
    expect(screen.queryByText('Assigned Contact')).not.toBeInTheDocument();
  });
});
