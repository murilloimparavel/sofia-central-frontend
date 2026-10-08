import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { CONVERSATION_SEGMENTS } from '@/components/chat/chat-sidebar/conversationSegmentsHelpers';
import { chatLogger } from '@/utils/logger/chatLogger';
import type { BaseFilter } from '@/types/core';
import type { Conversation } from '@/types/chat/api';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UseChatUrlSyncProps {
  permissionsReady: boolean;
  canViewConversations: boolean;
  selectedConversationId: string | number | null | undefined;
  conversationsCount: number;
  isConversationsLoaded: boolean;
  getConversation: (id: string) => Conversation | null | undefined;
  loadSpecificConversation: (id: string) => Promise<Conversation | null | undefined>;
  selectConversation: (id: string | null) => void;
  setMobileView: (view: 'list' | 'chat') => void;
  handleApplyFilters: (filters: BaseFilter[]) => Promise<void>;
  savedFilters: BaseFilter[] | null;
  defaultFilters: BaseFilter[];
}

export function useChatUrlSync({
  permissionsReady,
  canViewConversations,
  selectedConversationId,
  conversationsCount,
  isConversationsLoaded,
  getConversation,
  loadSpecificConversation,
  selectConversation,
  setMobileView,
  handleApplyFilters,
  savedFilters,
  defaultFilters,
}: UseChatUrlSyncProps) {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const segmentParam = searchParams.get('segment');
  const badgeSegment = segmentParam
    ? CONVERSATION_SEGMENTS.find(s => s.id === segmentParam) ?? null
    : null;

  const isManualNavigationRef = useRef<boolean>(false);
  const urlSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUrlSyncRef = useRef<string | null>(null);

  // 1. Initial Load: Apply filters or segment on mount
  useEffect(() => {
    if (!permissionsReady || !canViewConversations) {
      return;
    }

    if (badgeSegment) {
      return;
    }

    const filtersToApply = savedFilters || defaultFilters;
    handleApplyFilters(filtersToApply).catch(error => {
      chatLogger.uiWarn('Sem permissão ou erro ao aplicar filtros iniciais:', { error });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsReady, canViewConversations]);

  // 2. Segment in URL: Strip param and apply preset
  useEffect(() => {
    if (!permissionsReady || !segmentParam) {
      return;
    }

    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('segment');
        return next;
      },
      { replace: true },
    );

    if (!badgeSegment || !canViewConversations) {
      return;
    }

    handleApplyFilters(badgeSegment.preset).catch(error => {
      chatLogger.uiWarn('Erro ao aplicar filtro de segmento:', { error });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsReady, segmentParam, canViewConversations]);

  // 3. Sync URL with selected conversation with debounce
  useEffect(() => {
    if (isManualNavigationRef.current) {
      return;
    }

    if (urlSyncTimeoutRef.current) {
      clearTimeout(urlSyncTimeoutRef.current);
    }

    const syncKey = `${conversationId || 'null'}-${selectedConversationId || 'null'}`;
    const shouldSkip = lastUrlSyncRef.current === syncKey && conversationsCount === 0;
    if (shouldSkip) {
      return;
    }

    lastUrlSyncRef.current = syncKey;

    urlSyncTimeoutRef.current = setTimeout(async () => {
      if (conversationId) {
        const conversationIdStr = String(conversationId);

        if (!UUID_V4_REGEX.test(conversationIdStr)) {
          navigate('/conversations', { replace: true });
          return;
        }

        let targetConversation = getConversation(conversationIdStr);

        if (!targetConversation) {
          try {
            targetConversation = await loadSpecificConversation(conversationIdStr);
            if (!targetConversation) return;
          } catch (error) {
            chatLogger.uiError('Erro ao carregar conversa específica da URL:', { error });
            return;
          }
        }

        const canonicalConversationId = String(targetConversation.uuid || targetConversation.id);
        const currentSelectedStr = String(selectedConversationId);

        if (canonicalConversationId === currentSelectedStr) {
          return;
        }

        selectConversation(canonicalConversationId);
        setMobileView('chat');
      } else if (!conversationId && selectedConversationId) {
        selectConversation(null);
        setMobileView('list');
      }
    }, 100);

    return () => {
      if (urlSyncTimeoutRef.current) {
        clearTimeout(urlSyncTimeoutRef.current);
      }
    };
  }, [
    conversationId,
    selectedConversationId,
    isConversationsLoaded,
    conversationsCount,
    getConversation,
    loadSpecificConversation,
    selectConversation,
    setMobileView,
    navigate,
  ]);

  const setManualNavigation = (val: boolean) => {
    isManualNavigationRef.current = val;
  };

  return {
    conversationId,
    badgeSegment,
    isManualNavigationRef,
    setManualNavigation,
  };
}
