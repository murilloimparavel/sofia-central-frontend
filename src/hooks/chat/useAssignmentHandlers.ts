import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useChatContext } from '@/contexts/chat/ChatContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppDataStore } from '@/store/appDataStore';
import { Conversation } from '@/types/chat/api';
import type { AssignmentType } from '@/components/chat/assignment';
import { doesConversationMatchFilters } from '@/utils/chat/conversationMatch';
import { evictFromScopeCache, addOrUpdateInScopeCache } from '@/utils/chat/conversationScopeCache';

export const useAssignmentHandlers = () => {
  const { can } = usePermissions();
  const { conversations, filters } = useChatContext();
  const { user: currentUser } = useAuth();
  const {
    agents,
    teams,
    labels,
    fetchAgents,
    fetchTeams,
    fetchLabels,
    isLoadingAgents,
    isLoadingTeams,
    isLoadingLabels,
  } = useAppDataStore();

  const [isLoadingAssignmentData, setIsLoadingAssignmentData] = useState(false);

  // Reconcilia a conversa com o escopo/filtro ativo no client:
  // Se após a atribuição ela não casa mais com a view ativa (ex: estava na "Fila"
  // e foi atribuída a um atendente), sai imediatamente da lista sem refetch.
  const reconcileWithActiveView = useCallback(
    (updated: Conversation) => {
      if (!doesConversationMatchFilters(updated, filters.state.activeFilters, currentUser?.id)) {
        conversations.addHiddenConversation(updated);
        conversations.removeConversation(String(updated.id));
      }
    },
    [conversations, filters.state.activeFilters, currentUser?.id],
  );

  // Load assignment data
  const loadAssignmentData = useCallback(
    async (type: AssignmentType) => {
      setIsLoadingAssignmentData(true);
      try {
        switch (type) {
          case 'agent':
            await fetchAgents();
            break;
          case 'team':
            await fetchTeams();
            break;
          case 'label':
            await fetchLabels(true);
            break;
        }
      } catch (error) {
        console.error('Error loading assignment data:', error);
      } finally {
        setIsLoadingAssignmentData(false);
      }
    },
    [fetchAgents, fetchTeams, fetchLabels],
  );

  const handleAssignAgent = useCallback(
    async (conversation: Conversation) => {
      if (!can('conversations', 'update')) {
        toast.error('Você não tem permissão para atribuir conversas');
        return;
      }

      await loadAssignmentData('agent');
      return { conversation, type: 'agent' as AssignmentType };
    },
    [can, loadAssignmentData],
  );

  const handleAssignTeam = useCallback(
    async (conversation: Conversation) => {
      if (!can('conversations', 'update')) {
        toast.error('Você não tem permissão para atribuir conversas');
        return;
      }

      await loadAssignmentData('team');
      return { conversation, type: 'team' as AssignmentType };
    },
    [can, loadAssignmentData],
  );

  const handleAssignTag = useCallback(
    async (conversation: Conversation) => {
      if (!can('conversations', 'update')) {
        toast.error('Você não tem permissão para adicionar etiquetas');
        return;
      }

      await loadAssignmentData('label');
      return { conversation, type: 'label' as AssignmentType };
    },
    [can, loadAssignmentData],
  );

  const handleAssignmentConfirm = useCallback(
    async (conversation: Conversation, type: AssignmentType, selectedIds: string[]) => {
      const conversationId = String(conversation.id);

      try {
        switch (type) {
          case 'agent': {
            const targetAgentId = selectedIds[0] || null;
            const result = await conversations.assignAgent(conversationId, targetAgentId);
            const updatedConv: Conversation = (result as Conversation) || {
              ...conversation,
              assignee_id: targetAgentId,
              assignee: targetAgentId
                ? (agents.find(a => String(a.id) === String(targetAgentId)) as any) || null
                : null,
            };
            reconcileWithActiveView(updatedConv);

            // Sincronização cruzada entre os caches das abas
            evictFromScopeCache('unassigned', conversationId);
            const isAssignedToMe =
              targetAgentId != null &&
              currentUser?.id != null &&
              String(targetAgentId) === String(currentUser.id);
            if (isAssignedToMe) {
              addOrUpdateInScopeCache('mine', updatedConv);
            } else {
              evictFromScopeCache('mine', conversationId);
            }
            addOrUpdateInScopeCache('all', updatedConv);
            break;
          }
          case 'team': {
            const targetTeamId = selectedIds[0] || null;
            const result = await conversations.assignTeam(conversationId, targetTeamId);
            const updatedConv: Conversation = (result as Conversation) || {
              ...conversation,
              team_id: targetTeamId,
              team: targetTeamId
                ? (teams.find(t => String(t.id) === String(targetTeamId)) as any) || null
                : null,
            };
            reconcileWithActiveView(updatedConv);
            break;
          }
          case 'label':
            await conversations.assignLabels(conversationId, selectedIds);
            break;
        }
      } catch (error) {
        console.error('Error in assignment:', error);
        throw error; // Re-throw to let modal handle it
      }
    },
    [conversations, agents, teams, reconcileWithActiveView],
  );

  return {
    users: agents,
    teams,
    labels,
    isLoadingAssignmentData:
      isLoadingAssignmentData || isLoadingAgents || isLoadingTeams || isLoadingLabels,
    loadAssignmentData,
    handleAssignAgent,
    handleAssignTeam,
    handleAssignTag,
    handleAssignmentConfirm,
  };
};
