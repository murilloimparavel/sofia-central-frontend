/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssignmentHandlers } from '../useAssignmentHandlers';

const mockConversations = vi.hoisted(() => ({
  assignAgent: vi.fn(),
  assignTeam: vi.fn(),
  assignLabels: vi.fn(),
  addHiddenConversation: vi.fn(),
  removeConversation: vi.fn(),
}));

const mockFilters = vi.hoisted(() => ({ state: { activeFilters: [] as any[] } }));
const mockAuth = vi.hoisted(() => ({ user: { id: 'me-1' } as any }));
const mockAppData = vi.hoisted(() => ({
  agents: [
    { id: 'agent-2', name: 'Outro Agente' },
    { id: 'me-1', name: 'Eu' },
  ],
  teams: [{ id: 'team-1', name: 'Comercial' }],
  labels: [],
  fetchAgents: vi.fn(),
  fetchTeams: vi.fn(),
  fetchLabels: vi.fn(),
  isLoadingAgents: false,
  isLoadingTeams: false,
  isLoadingLabels: false,
}));

vi.mock('@/contexts/chat/ChatContext', () => ({
  useChatContext: () => ({ conversations: mockConversations, filters: mockFilters }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/store/appDataStore', () => ({
  useAppDataStore: () => mockAppData,
}));

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const unassignedFilter = {
  attribute_key: 'assignee_type',
  filter_operator: 'equal_to',
  values: ['unassigned'],
  query_operator: 'and',
};

const meFilter = {
  attribute_key: 'assignee_type',
  filter_operator: 'equal_to',
  values: ['me'],
  query_operator: 'and',
};

const baseConversation = { id: 'conv-1', uuid: 'uuid-conv-1', status: 'open', assignee_id: null } as any;

describe('useAssignmentHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilters.state.activeFilters = [];
  });

  describe('handleAssignmentConfirm - agent', () => {
    it('calls assignAgent with conversationId and selected agent', async () => {
      mockConversations.assignAgent.mockResolvedValueOnce({ ...baseConversation, assignee_id: 'agent-2' });

      const { result } = renderHook(() => useAssignmentHandlers());
      await result.current.handleAssignmentConfirm(baseConversation, 'agent', ['agent-2']);

      expect(mockConversations.assignAgent).toHaveBeenCalledWith('conv-1', 'agent-2');
    });

    it('evicts conversation from Fila (unassigned view) immediately upon assignment', async () => {
      mockFilters.state.activeFilters = [unassignedFilter];
      mockConversations.assignAgent.mockResolvedValueOnce({ ...baseConversation, assignee_id: 'agent-2' });

      const { result } = renderHook(() => useAssignmentHandlers());
      await result.current.handleAssignmentConfirm(baseConversation, 'agent', ['agent-2']);

      expect(mockConversations.removeConversation).toHaveBeenCalledWith('conv-1');
      expect(mockConversations.addHiddenConversation).toHaveBeenCalledTimes(1);
    });

    it('evicts conversation from Chats (me view) when re-assigned to another agent', async () => {
      mockFilters.state.activeFilters = [meFilter];
      const myConversation = { ...baseConversation, assignee_id: 'me-1' };
      mockConversations.assignAgent.mockResolvedValueOnce({ ...myConversation, assignee_id: 'agent-2' });

      const { result } = renderHook(() => useAssignmentHandlers());
      await result.current.handleAssignmentConfirm(myConversation, 'agent', ['agent-2']);

      expect(mockConversations.removeConversation).toHaveBeenCalledWith('conv-1');
      expect(mockConversations.addHiddenConversation).toHaveBeenCalledTimes(1);
    });

    it('keeps conversation in Chats (me view) when assigned to me', async () => {
      mockFilters.state.activeFilters = [meFilter];
      mockConversations.assignAgent.mockResolvedValueOnce({ ...baseConversation, assignee_id: 'me-1' });

      const { result } = renderHook(() => useAssignmentHandlers());
      await result.current.handleAssignmentConfirm(baseConversation, 'agent', ['me-1']);

      expect(mockConversations.removeConversation).not.toHaveBeenCalled();
      expect(mockConversations.addHiddenConversation).not.toHaveBeenCalled();
    });

    it('does not evict when viewing Todas (match-all view)', async () => {
      mockFilters.state.activeFilters = [];
      mockConversations.assignAgent.mockResolvedValueOnce({ ...baseConversation, assignee_id: 'agent-2' });

      const { result } = renderHook(() => useAssignmentHandlers());
      await result.current.handleAssignmentConfirm(baseConversation, 'agent', ['agent-2']);

      expect(mockConversations.removeConversation).not.toHaveBeenCalled();
    });
  });
});
