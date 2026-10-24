/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import Chat from '../Chat';
import { CONVERSATION_SEGMENTS } from '@/components/chat/chat-sidebar/conversationSegmentsHelpers';
import type { Conversation } from '@/types/chat/api';

// ─── Mutable test state ───────────────────────────────────────────────────────
const mockState = vi.hoisted(() => ({
  selectedConversationId: null as string | null,
}));

const mockHookResolve = vi.hoisted(() => ({
  fn: vi.fn<[Conversation, (() => Promise<void>)?], Promise<void>>(),
}));

const capturedProps = vi.hoisted(() => ({
  onMarkAsResolved: null as ((conv: Conversation) => Promise<void>) | null,
}));

const capturedHeaderProps = vi.hoisted(() => ({
  onBackClick: null as (() => Promise<void>) | null,
  onMarkAsResolved: null as ((conv: Conversation) => Promise<void>) | null,
  conversation: null as Conversation | null,
  onAssignAgent: null as ((conv: Conversation) => Promise<void>) | null,
  onAssignTeam: null as ((conv: Conversation) => Promise<void>) | null,
  onAssignTag: null as ((conv: Conversation) => Promise<void>) | null,
}));

const capturedAssignmentProps = vi.hoisted(() => ({
  description: null as string | null,
}));

const mockSelectedConversation = vi.hoisted(() => ({
  value: null as Conversation | null,
}));

// ─── react-router-dom ─────────────────────────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockRoute = vi.hoisted(() => ({ conversationId: undefined as string | undefined }));
const mockLoadSpecificConversation = vi.hoisted(() => vi.fn());
const mockGetConversation = vi.hoisted(() => vi.fn().mockReturnValue(null));
const capturedSidebarProps = vi.hoisted(() => ({
  mobileView: 'list' as 'list' | 'chat',
  onConversationSelect: null as ((conv: Conversation) => void) | null,
}));

// Mutable: the badge effect must react to the param, not to mount.
const mockSearch = vi.hoisted(() => ({
  params: new URLSearchParams(),
  setParams: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ conversationId: mockRoute.conversationId }),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearch.params, mockSearch.setParams],
}));

// ─── i18n ─────────────────────────────────────────────────────────────────────
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    // Echoes the {{name}} argument so a test can assert what was interpolated.
    t: (k: string, opts?: { name?: string }) => (opts?.name ? `${k}|${opts.name}` : k),
  }),
}));

// ─── Permissions ──────────────────────────────────────────────────────────────
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: vi.fn().mockReturnValue(true), isReady: true }),
}));

// ─── Chat context ─────────────────────────────────────────────────────────────
const mockSelectConversation = vi.fn().mockResolvedValue(undefined);
const mockSetActiveConversationId = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/chat/ChatContext', () => ({
  useChatContext: () => ({
    conversations: {
      state: {
        selectedConversationId: mockState.selectedConversationId,
        conversationsLoading: false,
        conversationsError: null,
        conversations: [],
      },
      selectConversation: mockSelectConversation,
      getConversation: mockGetConversation,
      loadSpecificConversation: mockLoadSpecificConversation,
      getUnreadCount: vi.fn().mockReturnValue(0),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      // Chat.tsx:170 auto-marca a conversa selecionada como lida (silencioso) ao
      // abri-la — o mock precisa expor markAsRead (retorna Promise p/ o .catch).
      markAsRead: vi.fn().mockResolvedValue(undefined),
    },
    messages: {
      loadMessages: vi.fn(),
      loadMoreMessages: vi.fn(),
      setActiveConversationId: mockSetActiveConversationId,
      state: { messages: [], messagesLoading: false },
    },
    selectedConversation: mockSelectedConversation.value,
    selectedMessages: [],
  }),
}));

// ─── Conversation handlers hook ───────────────────────────────────────────────
vi.mock('@/hooks/chat/useConversationHandlers', () => ({
  useConversationHandlers: () => ({
    handleMarkAsResolved: mockHookResolve.fn,
    handleMarkAsRead: vi.fn().mockResolvedValue(undefined),
    handleMarkAsUnread: vi.fn().mockResolvedValue(undefined),
    handlePostpone: vi.fn().mockResolvedValue(undefined),
    handleMarkAsOpen: vi.fn().mockResolvedValue(undefined),
    handleMarkAsSnoozed: vi.fn().mockResolvedValue(undefined),
    handleSetPriority: vi.fn().mockResolvedValue(undefined),
    handlePinConversation: vi.fn().mockResolvedValue(undefined),
    handleUnpinConversation: vi.fn().mockResolvedValue(undefined),
    handleArchiveConversation: vi.fn().mockResolvedValue(undefined),
    handleUnarchiveConversation: vi.fn().mockResolvedValue(undefined),
    handleDeleteConversation: vi.fn(),
  }),
}));

// ─── Assignment handlers hook ─────────────────────────────────────────────────
vi.mock('@/hooks/chat/useAssignmentHandlers', () => ({
  useAssignmentHandlers: () => ({
    handleAssignAgent: (conversation: Conversation) => ({ conversation, type: 'agent' }),
    handleAssignTeam: (conversation: Conversation) => ({ conversation, type: 'team' }),
    handleAssignTag: (conversation: Conversation) => ({ conversation, type: 'label' }),
    handleAssignmentConfirm: vi.fn(),
    users: [],
    teams: [],
    labels: [],
    isLoadingAssignmentData: false,
  }),
}));

// ─── Filter handlers hook ─────────────────────────────────────────────────────
const mockFilterHandlers = vi.hoisted(() => ({
  handleApplyFilters: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/chat/useFilterHandlers', () => ({
  useFilterHandlers: () => ({
    handleApplyFilters: mockFilterHandlers.handleApplyFilters,
    handleClearFilters: vi.fn().mockResolvedValue(undefined),
    reloadCurrentFilters: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ─── Storage utils ────────────────────────────────────────────────────────────
vi.mock('@/utils/storage/filtersStorage', () => ({
  loadConversationFilters: vi.fn().mockReturnValue([]),
  getDefaultFilter: vi.fn().mockReturnValue([]),
}));

// ─── App store ────────────────────────────────────────────────────────────────
vi.mock('@/store/appDataStore', () => ({
  useAppDataStore: (selector: (s: any) => any) => selector({ fetchLabels: vi.fn() }),
}));

// ─── Services ─────────────────────────────────────────────────────────────────
vi.mock('@/services/contacts/labelsService', () => ({
  labelsService: { createLabel: vi.fn() },
}));

// ─── Sub-components — capture onMarkAsResolved from ChatSidebar ───────────────
vi.mock('@/components/chat/chat-sidebar/ChatSidebar', () => ({
  default: (props: any) => {
    capturedProps.onMarkAsResolved = props.onMarkAsResolved;
    capturedSidebarProps.mobileView = props.mobileView;
    capturedSidebarProps.onConversationSelect = props.onConversationSelect;
    return <div data-testid="chat-sidebar" data-mobile-view={props.mobileView} />;
  },
}));

vi.mock('@/components/chat/chat-header/ChatHeader', () => ({
  default: (props: any) => {
    capturedHeaderProps.onBackClick = props.onBackClick;
    capturedHeaderProps.onMarkAsResolved = props.onMarkAsResolved;
    capturedHeaderProps.conversation = props.conversation;
    capturedHeaderProps.onAssignAgent = props.onAssignAgent;
    capturedHeaderProps.onAssignTeam = props.onAssignTeam;
    capturedHeaderProps.onAssignTag = props.onAssignTag;
    return <div data-testid="chat-header" />;
  },
}));

vi.mock('@/components/chat/assignment/AssignmentModal', () => ({
  default: (props: any) => {
    capturedAssignmentProps.description = props.description;
    return <div data-testid="assignment-modal" />;
  },
}));

vi.mock('@/components/chat/chat-area/ChatArea', () => ({
  default: () => <div data-testid="chat-area" />,
}));

vi.mock('@/components/chat/chat-tabs/ChatTabs', () => ({
  default: () => <div data-testid="chat-tabs" />,
}));

vi.mock('../../../components/ErrorBoundary', () => ({
  default: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/tours', () => ({
  ChatTour: () => null,
}));

vi.mock('@evoapi/design-system/alert-dialog', () => ({
  AlertDialog: ({ children }: any) => <>{children}</>,
  AlertDialogContent: ({ children }: any) => <>{children}</>,
  AlertDialogHeader: ({ children }: any) => <>{children}</>,
  AlertDialogTitle: ({ children }: any) => <>{children}</>,
  AlertDialogDescription: ({ children }: any) => <>{children}</>,
  AlertDialogFooter: ({ children }: any) => <>{children}</>,
  AlertDialogAction: ({ children, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const selectedConv: Conversation = {
  id: 'conv-selected',
  uuid: 'uuid-selected',
  status: 'open',
} as any;

const otherConv: Conversation = {
  id: 'conv-other',
  uuid: 'uuid-other',
  status: 'open',
} as any;

const conversationToAssign: Conversation = {
  id: 'conv-selected',
  uuid: 'uuid-selected',
  status: 'open',
  contact: { id: 'contact-1', name: 'Maria Compradora' },
  assignee: { id: 'user-1', name: 'Nickolas Atendente' },
  team: { id: 'team-1', name: 'Time Comercial' },
  labels: [
    { id: 'label-1', title: 'onboarding_ativo' },
    { id: 'label-2', title: 'atendimento_ia' },
  ],
} as any;

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Chat — handleMarkAsResolved navigation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.conversationId = undefined;
    mockGetConversation.mockReturnValue(null);
    capturedProps.onMarkAsResolved = null;
    capturedHeaderProps.onMarkAsResolved = null;
    capturedHeaderProps.conversation = null;
    mockState.selectedConversationId = null;
    mockSelectedConversation.value = null;
    mockHookResolve.fn.mockResolvedValue(undefined);
    mockSelectConversation.mockResolvedValue(undefined);
  });

  it('clears URL and selection when resolving the currently-selected conversation', async () => {
    mockState.selectedConversationId = 'uuid-selected';

    const { unmount } = render(<Chat />);

    await act(async () => {
      await capturedProps.onMarkAsResolved!(selectedConv);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/conversations', { replace: true });
    expect(mockSelectConversation).toHaveBeenCalledWith(null);

    unmount();
  });

  it('does not navigate when resolving a non-selected conversation', async () => {
    mockState.selectedConversationId = 'uuid-selected';

    const { unmount } = render(<Chat />);
    // The route sync may clear the stale test selection on /conversations.
    // Isolate the calls made by the resolve action itself.
    mockSelectConversation.mockClear();

    await act(async () => {
      await capturedProps.onMarkAsResolved!(otherConv);
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSelectConversation).not.toHaveBeenCalled();

    unmount();
  });

  it('does not navigate when no conversation is selected', async () => {
    mockState.selectedConversationId = null;

    const { unmount } = render(<Chat />);

    await act(async () => {
      await capturedProps.onMarkAsResolved!(selectedConv);
    });

    expect(mockNavigate).not.toHaveBeenCalled();

    unmount();
  });

  it('clears URL and selection when resolving via ChatHeader (primary resolve path)', async () => {
    const routedConversation = { ...selectedConv, id: ROUTE_A, uuid: ROUTE_A };
    mockRoute.conversationId = ROUTE_A;
    mockGetConversation.mockReturnValue(routedConversation);
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = routedConversation;

    const { unmount } = render(<Chat />);

    expect(capturedHeaderProps.conversation).toEqual(routedConversation);

    await act(async () => {
      await capturedHeaderProps.onMarkAsResolved!(routedConversation);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/conversations', { replace: true });
    expect(mockSelectConversation).toHaveBeenCalledWith(null);

    unmount();
  });

  it('does not navigate when resolve fails on the selected conversation', async () => {
    mockState.selectedConversationId = 'uuid-selected';
    mockHookResolve.fn.mockRejectedValueOnce(new Error('API error'));

    const { unmount } = render(<Chat />);
    mockSelectConversation.mockClear();

    await act(async () => {
      await capturedProps.onMarkAsResolved!(selectedConv);
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSelectConversation).not.toHaveBeenCalled();

    unmount();
  });
});

// The sidebar badge routes to /conversations?segment=unanswered.
describe('Chat — ?segment= preset (EVO-1963)', () => {
  const unansweredPreset = CONVERSATION_SEGMENTS.find(s => s.id === 'unanswered')!.preset;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.conversationId = undefined;
    mockState.selectedConversationId = null;
    mockSelectedConversation.value = null;
    mockSearch.params = new URLSearchParams();
  });

  it('applies the segment preset and strips the param from the URL', async () => {
    mockSearch.params = new URLSearchParams('segment=unanswered');

    const { unmount } = render(<Chat />);
    await act(async () => {});

    expect(mockFilterHandlers.handleApplyFilters).toHaveBeenCalledWith(unansweredPreset);
    expect(mockSearch.setParams).toHaveBeenCalled();

    unmount();
  });

  // No remount here — only a rerender with the new param, which is what clicking
  // the badge from the conversations screen does.
  it('applies the preset when the param appears without a remount', async () => {
    const { rerender, unmount } = render(<Chat />);
    await act(async () => {});

    expect(mockFilterHandlers.handleApplyFilters).not.toHaveBeenCalledWith(unansweredPreset);

    mockSearch.params = new URLSearchParams('segment=unanswered');
    await act(async () => {
      rerender(<Chat />);
    });

    expect(mockFilterHandlers.handleApplyFilters).toHaveBeenCalledWith(unansweredPreset);

    unmount();
  });

  it('falls back to the saved filters when the segment is unknown', async () => {
    mockSearch.params = new URLSearchParams('segment=nope');

    const { unmount } = render(<Chat />);
    await act(async () => {});

    // Both storage mocks return [] — what matters is that the list loads at all.
    expect(mockFilterHandlers.handleApplyFilters).toHaveBeenCalledWith([]);
    expect(mockFilterHandlers.handleApplyFilters).not.toHaveBeenCalledWith(unansweredPreset);

    unmount();
  });
});

// CRM-388: the three "conversation with {{name}}" phrases name the interlocutor,
// not what is being assigned (the label list, the assignee, the team).
describe('Chat — assignment modal subtitle names the contact (CRM-388)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.conversationId = ROUTE_A;
    mockGetConversation.mockReturnValue({ ...conversationToAssign, id: ROUTE_A, uuid: ROUTE_A });
    capturedAssignmentProps.description = null;
    capturedHeaderProps.onAssignAgent = null;
    capturedHeaderProps.onAssignTeam = null;
    capturedHeaderProps.onAssignTag = null;
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = { ...conversationToAssign, id: ROUTE_A, uuid: ROUTE_A };
  });

  const cases = [
    ['label', 'onAssignTag'],
    ['agent', 'onAssignAgent'],
    ['team', 'onAssignTeam'],
  ] as const;

  it.each(cases)('interpolates the contact into the %s subtitle', async (type, prop) => {
    const { unmount } = render(<Chat />);

    await act(async () => {
      await capturedHeaderProps[prop]!(conversationToAssign);
    });
    await act(async () => {});

    expect(capturedAssignmentProps.description).toBe(
      `assignment.${type}.description|Maria Compradora`,
    );

    unmount();
  });

  it('falls back to the contact placeholder when the contact has no name', async () => {
    mockSelectedConversation.value = {
      ...conversationToAssign,
      id: ROUTE_A,
      uuid: ROUTE_A,
      contact: {},
    } as any;

    const { unmount } = render(<Chat />);

    await act(async () => {
      await capturedHeaderProps.onAssignTag!(mockSelectedConversation.value!);
    });
    await act(async () => {});

    expect(capturedAssignmentProps.description).toBe(
      'assignment.label.description|assignment.label.contactFallback',
    );

    unmount();
  });
});

const ROUTE_A = '11111111-1111-4111-8111-111111111111';
const ROUTE_B = '22222222-2222-4222-8222-222222222222';
const ROUTE_C = '33333333-3333-4333-8333-333333333333';

function deferredConversation() {
  let resolve!: (conversation: Conversation | null) => void;
  const promise = new Promise<Conversation | null>(done => { resolve = done; });
  return { promise, resolve };
}

function deferredVoid() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('Chat — mobile deep links and navigation races', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.conversationId = undefined;
    mockState.selectedConversationId = null;
    mockSelectedConversation.value = null;
    mockSearch.params = new URLSearchParams();
    mockGetConversation.mockReturnValue(null);
    mockLoadSpecificConversation.mockResolvedValue(null);
    mockSelectConversation.mockResolvedValue(undefined);
  });

  it('opens the chat pane immediately for a cold valid deep link', async () => {
    const pending = deferredConversation();
    mockRoute.conversationId = ROUTE_A;
    mockLoadSpecificConversation.mockReturnValue(pending.promise);

    const { getByTestId, unmount } = render(<Chat />);

    expect(getByTestId('chat-sidebar').getAttribute('data-mobile-view')).toBe('chat');
    expect(mockLoadSpecificConversation).toHaveBeenCalledWith(ROUTE_A);
    expect(mockSelectConversation).not.toHaveBeenCalledWith(ROUTE_A);

    await act(async () => {
      pending.resolve({ id: ROUTE_A, uuid: ROUTE_A } as Conversation);
      await pending.promise;
    });
    expect(mockSelectConversation).toHaveBeenCalledWith(ROUTE_A);
    unmount();
  });

  it('ignores A when /A changes to /B and the older request finishes last', async () => {
    const pendingA = deferredConversation();
    const pendingB = deferredConversation();
    mockRoute.conversationId = ROUTE_A;
    mockLoadSpecificConversation.mockImplementation((id: string) =>
      id === ROUTE_A ? pendingA.promise : pendingB.promise,
    );

    const { rerender, unmount } = render(<Chat />);
    await act(async () => {
      mockRoute.conversationId = ROUTE_B;
      rerender(<Chat />);
    });

    await act(async () => {
      pendingB.resolve({ id: ROUTE_B, uuid: ROUTE_B } as Conversation);
      await pendingB.promise;
    });
    await act(async () => {
      pendingA.resolve({ id: ROUTE_A, uuid: ROUTE_A } as Conversation);
      await pendingA.promise;
    });

    expect(mockSelectConversation).toHaveBeenCalledTimes(1);
    expect(mockSelectConversation).toHaveBeenCalledWith(ROUTE_B);
    unmount();
  });

  it('does not show A under the /B URL while B loads', async () => {
    const pendingB = deferredConversation();
    mockRoute.conversationId = ROUTE_A;
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = { id: ROUTE_A, uuid: ROUTE_A } as Conversation;
    mockGetConversation.mockImplementation((id: string) =>
      id === ROUTE_A ? mockSelectedConversation.value : null,
    );
    mockLoadSpecificConversation.mockReturnValue(pendingB.promise);

    const { queryByTestId, rerender, unmount } = render(<Chat />);
    expect(queryByTestId('chat-header')).not.toBeNull();

    await act(async () => {
      mockRoute.conversationId = ROUTE_B;
      rerender(<Chat />);
    });
    expect(queryByTestId('chat-header')).toBeNull();

    await act(async () => {
      pendingB.resolve({ id: ROUTE_B, uuid: ROUTE_B } as Conversation);
      await pendingB.promise;
    });
    unmount();
  });

  it('does not let a pending deep link override a manual selection', async () => {
    const pendingA = deferredConversation();
    mockRoute.conversationId = ROUTE_A;
    mockLoadSpecificConversation.mockReturnValue(pendingA.promise);

    const { unmount } = render(<Chat />);
    act(() => {
      capturedSidebarProps.onConversationSelect!({ id: ROUTE_B, uuid: ROUTE_B } as Conversation);
    });
    expect(mockNavigate).toHaveBeenCalledWith(`/conversations/${ROUTE_B}`, { replace: true });

    await act(async () => {
      pendingA.resolve({ id: ROUTE_A, uuid: ROUTE_A } as Conversation);
      await pendingA.promise;
    });
    expect(mockSelectConversation).toHaveBeenCalledTimes(1);
    expect(mockSelectConversation).toHaveBeenCalledWith(ROUTE_B);
    unmount();
  });

  it('honors external /C immediately after manually selecting B', async () => {
    mockRoute.conversationId = ROUTE_A;
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = { id: ROUTE_A, uuid: ROUTE_A } as Conversation;
    mockGetConversation.mockImplementation((id: string) =>
      id === ROUTE_A ? mockSelectedConversation.value : null,
    );
    mockLoadSpecificConversation.mockResolvedValue({ id: ROUTE_C, uuid: ROUTE_C });

    const { rerender, unmount } = render(<Chat />);
    act(() => {
      capturedSidebarProps.onConversationSelect!({ id: ROUTE_B, uuid: ROUTE_B } as Conversation);
    });

    // The router first commits our own B navigation, then browser history or
    // another external control navigates to C before any 100 ms timer elapsed.
    await act(async () => {
      mockState.selectedConversationId = ROUTE_B;
      mockSelectedConversation.value = { id: ROUTE_B, uuid: ROUTE_B } as Conversation;
      mockRoute.conversationId = ROUTE_B;
      rerender(<Chat />);
    });
    await act(async () => {
      mockRoute.conversationId = ROUTE_C;
      rerender(<Chat />);
    });

    expect(mockLoadSpecificConversation).toHaveBeenCalledWith(ROUTE_C);
    expect(mockSelectConversation).toHaveBeenCalledWith(ROUTE_C);
    unmount();
  });

  it('completes back-to-list after selection clears before navigation commits', async () => {
    const pendingClear = deferredVoid();
    mockRoute.conversationId = ROUTE_A;
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = { id: ROUTE_A, uuid: ROUTE_A } as Conversation;
    mockGetConversation.mockReturnValue(mockSelectedConversation.value);
    mockSelectConversation.mockImplementation((id: string | null) =>
      id === null ? pendingClear.promise : Promise.resolve(),
    );

    const { rerender, unmount } = render(<Chat />);
    let backPromise!: Promise<void>;
    act(() => {
      backPromise = capturedHeaderProps.onBackClick!();
    });

    await act(async () => {
      mockState.selectedConversationId = null;
      rerender(<Chat />);
    });
    await act(async () => {
      pendingClear.resolve();
      await backPromise;
    });

    expect(mockNavigate).toHaveBeenCalledWith('/conversations', { replace: true });
    unmount();
  });

  it('uses the list for /conversations and redirects malformed IDs', () => {
    const list = render(<Chat />);
    expect(list.getByTestId('chat-sidebar').getAttribute('data-mobile-view')).toBe('list');
    list.unmount();

    mockRoute.conversationId = 'not-a-uuid';
    const malformed = render(<Chat />);
    expect(malformed.getByTestId('chat-sidebar').getAttribute('data-mobile-view')).toBe('list');
    expect(mockNavigate).toHaveBeenCalledWith('/conversations', { replace: true });
    malformed.unmount();
  });

  it('hides a stale selected conversation on the list and malformed URL', () => {
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = { id: ROUTE_A, uuid: ROUTE_A } as Conversation;

    const { queryByTestId, rerender, unmount } = render(<Chat />);
    expect(queryByTestId('chat-header')).toBeNull();

    act(() => {
      mockRoute.conversationId = 'invalid-uuid';
      rerender(<Chat />);
    });
    expect(queryByTestId('chat-header')).toBeNull();
    unmount();
  });

  it('shows the selected conversation for an uppercase UUID deep link', () => {
    mockRoute.conversationId = ROUTE_A.toUpperCase();
    mockState.selectedConversationId = ROUTE_A;
    mockSelectedConversation.value = { id: ROUTE_A, uuid: ROUTE_A } as Conversation;
    mockGetConversation.mockReturnValue(mockSelectedConversation.value);

    const { queryByTestId, unmount } = render(<Chat />);
    expect(queryByTestId('chat-header')).not.toBeNull();
    unmount();
  });

  it('returns to the list when a valid UUID does not exist', async () => {
    mockRoute.conversationId = ROUTE_A;
    mockLoadSpecificConversation.mockResolvedValue(null);

    const { getByTestId, unmount } = render(<Chat />);
    await act(async () => {});

    expect(getByTestId('chat-sidebar').getAttribute('data-mobile-view')).toBe('list');
    expect(mockNavigate).toHaveBeenCalledWith('/conversations', { replace: true });
    unmount();
  });
});
