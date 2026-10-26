/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, useEffect, useState, useCallback, useRef, useMemo } from 'react';

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { useChatContext } from '@/contexts/chat/ChatContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useAuthStore } from '@/store/authStore';

import { useLanguage } from '@/hooks/useLanguage';

// Hooks customizados
import { useConversationHandlers } from '@/hooks/chat/useConversationHandlers';
import { useAssignmentHandlers } from '@/hooks/chat/useAssignmentHandlers';
import { useFilterHandlers } from '@/hooks/chat/useFilterHandlers';
import { useEventCallback } from '@/hooks/chat/useEventCallback';

import { loadConversationFilters, getDefaultFilter } from '@/utils/storage/filtersStorage';
import { CONVERSATION_SEGMENTS } from '@/components/chat/chat-sidebar/conversationSegmentsHelpers';

import { toast } from 'sonner';
import { AxiosError } from 'axios';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@evoapi/design-system/alert-dialog';

import ErrorBoundary from '../../../components/ErrorBoundary';
import { ChatTour } from '@/tours/ChatTour';

// Novos componentes refatorados
import ChatSidebar from '@/components/chat/chat-sidebar/ChatSidebar';
import ChatHeader from '@/components/chat/chat-header/ChatHeader';
import ChatArea from '@/components/chat/chat-area/ChatArea';
import ChatTabs from '@/components/chat/chat-tabs/ChatTabs';

import { AlertTriangle, Trash2 } from 'lucide-react';

import { Conversation } from '@/types/chat/api';
import { BaseFilter } from '@/types/core';
import type { DashboardApp } from '../../../types/integrations';
import type { AssignmentOption, AssignmentType } from '@/components/chat/assignment';
import { labelsService } from '@/services/contacts/labelsService';
import { useAppDataStore } from '@/store/appDataStore';
import chatService from '@/services/chat/chatService';

const ContactSidebar = React.lazy(() => import('@/components/chat/contact-sidebar/ContactSidebar'));

const AssignmentModal = React.lazy(() => import('@/components/chat/assignment/AssignmentModal'));

interface SendMessageOptions {
  content: string;
  files?: File[];
  sendAsDocument?: boolean;
  isPrivate?: boolean;
  templateParams?: any;
  cannedResponseId?: string | null;
  isRecordedAudio?: boolean | string[];
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PREFETCH_DELAY_MS = 600;
const INTENT_PREFETCH_DELAY_MS = 140;
const PREFETCH_COOLDOWN_MS = 10_000;
const PREFETCH_MIN_START_INTERVAL_MS = 500;

// Network Information is unavailable in Safari; in that case the normal
// delayed prefetch remains available to desktop and touch users.
function canPrefetchOnCurrentNetwork(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData &&
    connection?.effectiveType !== '2g' &&
    connection?.effectiveType !== 'slow-2g';
}

// Coluna de conversas redimensionável (§3.1) — largura persiste entre sessões
// (mesmo espírito de collapsed/pinned de outras UIs do produto). Limites
// evitam extremos inúteis: muito estreito corta nome/prévia, muito largo
// esmaga a área de chat em telas médias.
import { useSidebarResize } from './hooks/useSidebarResize';

const Chat = () => {
  const { t } = useLanguage('chat');
  const { can, isReady: permissionsReady } = usePermissions();
  const fetchLabels = useAppDataStore(state => state.fetchLabels);
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Resolved once so both effects below agree: an unknown segment has to fall back
  // to the saved view, not to no list at all.
  const segmentParam = searchParams.get('segment');
  const badgeSegment = useMemo(
    () => (segmentParam ? CONVERSATION_SEGMENTS.find(s => s.id === segmentParam) ?? null : null),
    [segmentParam],
  );
  const chatContext = useChatContext();
  // Explicitly type conversations to ensure TypeScript recognizes it has 'state'
  const conversations = chatContext.conversations;
  const { messages, selectedConversation, selectedMessages, filters } = chatContext;
  const currentUser = useAuthStore(state => state.currentUser);

  // 🔒 RACE CONDITION FIX: Ref para rastrear última conversa carregada
  const lastLoadedConversationRef = useRef<string | null>(null);

  // Ignore only the URL echo of a manual navigation. An unrelated browser
  // navigation must still be synchronized, even if it happens immediately.
  const manualNavigationRef = useRef<{
    fromRouteId: string | undefined;
    targetRouteId: string | undefined;
  } | null>(null);

  // Invalidates an in-flight deep-link request as soon as the URL or a manual
  // selection changes. A slow response must never reopen an old conversation.
  const urlSyncVersionRef = useRef(0);
  const currentRouteIdRef = useRef(conversationId);
  currentRouteIdRef.current = conversationId;

  const selectedConvIdRef = useRef<string | null>(conversations.state.selectedConversationId ?? null);
  const setActiveConversationId = messages.setActiveConversationId;
  useEffect(() => {
    selectedConvIdRef.current = conversations.state.selectedConversationId ?? null;
  }, [conversations.state.selectedConversationId]);

  // Keep the open conversation protected from the bounded message cache.
  // This runs only when selection changes, not on every message state update.
  useEffect(() => {
    setActiveConversationId(conversations.state.selectedConversationId ?? null);
    return () => setActiveConversationId(null);
  }, [conversations.state.selectedConversationId, setActiveConversationId]);

  // 🔄 CARREGAR MAIS MENSAGENS: Função simples via Context
  const handleLoadMore = useCallback(() => {
    if (!conversations.state.selectedConversationId) return;

    messages.loadMoreMessages(conversations.state.selectedConversationId);
  }, [conversations.state.selectedConversationId, messages]);

  // Estados locais simplificados
  const [searchInput, setSearchInput] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(
    () => (conversationId && UUID_V4_REGEX.test(conversationId) ? 'chat' : 'list'),
  );
  const [isContactSidebarOpen, setIsContactSidebarOpen] = useState(false);

  // Coluna de conversas redimensionável via hook atomizado
  const { sidebarWidth, isResizingSidebar, handleResizeMouseDown } = useSidebarResize();

  // Modal states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('agent');
  const [conversationToAssign, setConversationToAssign] = useState<Conversation | null>(null);

  // Bulk selection state
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [isBulkUpdatingStatus, setIsBulkUpdatingStatus] = useState(false);

  // Dashboard Apps state (lazy loaded, not auto-fetched)
  const [dashboardApps] = useState<DashboardApp[]>([]);
  const [activeTab, setActiveTab] = useState<string>('chat');

  // Hooks customizados para lógica de negócio
  const conversationHandlers = useConversationHandlers();
  const assignmentHandlers = useAssignmentHandlers();
  const filterHandlers = useFilterHandlers();

  // 🚀 MEMOIZAÇÃO: Computar valores derivados apenas quando necessário
  const selectedConversationIdStr = useMemo(
    () =>
      conversations.state.selectedConversationId
        ? String(conversations.state.selectedConversationId)
        : null,
    [conversations.state.selectedConversationId],
  );

  const prefetchTargetId = useMemo(() => {
    // Wait for route and selection to agree before spending bandwidth. This
    // avoids prefetching a stale neighbor during a deep-link transition.
    if (!selectedConversationIdStr || !conversationId) return null;
    const list = conversations.state.conversations;
    const currentIndex = list.findIndex(
      c => String(c.uuid || c.id) === selectedConversationIdStr ||
        String(c.id) === selectedConversationIdStr,
    );
    const selectedInList = list[currentIndex];
    if (!selectedInList ||
        String(selectedInList.uuid || selectedInList.id).toLowerCase() !== conversationId.toLowerCase()) {
      return null;
    }
    const nextConversation = list[currentIndex + 1];
    return !nextConversation
      ? null
      : String(nextConversation.uuid || nextConversation.id);
  }, [conversationId, selectedConversationIdStr, conversations.state.conversations]);
  const prefetchMessages = useEventCallback((id: string) => messages.prefetchMessages(id));
  const recentPrefetchesRef = useRef(new Map<string, number>());
  const intentPrefetchTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const prefetchInFlightRef = useRef(false);
  const lastPrefetchStartedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const requestMessagePrefetch = useCallback((id: string) => {
    if (!id || !canPrefetchOnCurrentNetwork()) return;
    const recent = recentPrefetchesRef.current;
    const now = Date.now();
    if (now - (recent.get(id) ?? -Infinity) < PREFETCH_COOLDOWN_MS) return;
    if (prefetchInFlightRef.current || now - lastPrefetchStartedAtRef.current < PREFETCH_MIN_START_INTERVAL_MS) return;
    recent.set(id, now);
    prefetchInFlightRef.current = true;
    lastPrefetchStartedAtRef.current = now;
    if (recent.size > 16) recent.delete(recent.keys().next().value!);
    void prefetchMessages(id).catch(() => undefined).finally(() => {
      prefetchInFlightRef.current = false;
    });
  }, [prefetchMessages]);
  const handlePrefetchIntent = useCallback((id: string) => {
    if (!id || id === selectedConversationIdStr || !canPrefetchOnCurrentNetwork()) return;
    if (intentPrefetchTimersRef.current.has(id) ||
      Date.now() - (recentPrefetchesRef.current.get(id) ?? -Infinity) < PREFETCH_COOLDOWN_MS) return;
    const timer = setTimeout(() => {
      intentPrefetchTimersRef.current.delete(id);
      requestMessagePrefetch(id);
    }, INTENT_PREFETCH_DELAY_MS);
    intentPrefetchTimersRef.current.set(id, timer);
  }, [requestMessagePrefetch, selectedConversationIdStr]);
  const cancelPrefetchIntent = useCallback((id: string) => {
    const timer = intentPrefetchTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    intentPrefetchTimersRef.current.delete(id);
  }, []);

  // 🎯 FILTROS: Usar handlers dos hooks customizados (DEFINIR ANTES DOS useEffect)
  const handleApplyFilters = useCallback(
    async (newFilters: BaseFilter[]) => {
      setSelectedConversationIds(new Set());
      try {
        await filterHandlers.handleApplyFilters(newFilters);
      } catch (error) {
        // Se erro 403 ou 404, marcar como erro
        const axiosError = error as AxiosError;
        if (axiosError?.response?.status === 403 || axiosError?.response?.status === 404) {
          throw error; // Re-throw para que seja tratado no useEffect
        }
        throw error;
      }
    },
    [filterHandlers],
  );

  // 🔒 FECHAR SIDEBAR: Quando navega para /conversations (sem ID específico)
  useEffect(() => {
    if (!conversationId && isContactSidebarOpen) {
      setIsContactSidebarOpen(false);
    }
  }, [conversationId, isContactSidebarOpen]);


  // Load conversations on mount
  useEffect(() => {
    if (!permissionsReady) {
      return;
    }

    if (!can('conversations', 'read')) {
      toast.error(t('messages.noPermissionView'));
      return;
    }

    // A recognized ?segment= is applied by the effect below.
    if (badgeSegment) {
      return;
    }

    // 💾 PERSISTÊNCIA: Carregar filtros salvos ou usar padrão
    const savedFilters = loadConversationFilters();
    const filtersToApply = savedFilters || getDefaultFilter();

    // Aplicar filtros (erros serão tratados no filterHandlers)
    handleApplyFilters(filtersToApply).catch(error => {
      // Se erro 403 ou 404, marcar como erro e não tentar novamente
      const axiosError = error as AxiosError;
      if (axiosError?.response?.status === 403 || axiosError?.response?.status === 404) {
        console.error(`Sem permissão. Parando tentativas.`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsReady]);

  // Keyed on the param, not on mount: /conversations and /conversations/:id are the
  // same route element, so arriving from the sidebar badge does not remount Chat.
  useEffect(() => {
    if (!permissionsReady || !segmentParam) {
      return;
    }

    // Only `segment` is stripped, recognized or not; other params survive.
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('segment');
        return next;
      },
      { replace: true },
    );

    if (!badgeSegment || !can('conversations', 'read')) {
      return;
    }

    handleApplyFilters(badgeSegment.preset).catch(error => {
      const axiosError = error as AxiosError;
      if (axiosError?.response?.status === 403 || axiosError?.response?.status === 404) {
        console.error(`Sem permissão. Parando tentativas.`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsReady, segmentParam]);

  const handleClearFilters = useCallback(async () => {
    setSelectedConversationIds(new Set());
    await filterHandlers.handleClearFilters();
  }, [filterHandlers]);

  const reloadCurrentFilters = useCallback(async () => {
    await filterHandlers.reloadCurrentFilters();
  }, [filterHandlers]);

  const MAX_BULK_SELECTION = 200;

  const handleToggleConversationSelection = useCallback((displayId: string) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (next.has(displayId)) {
        next.delete(displayId);
      } else if (next.size < MAX_BULK_SELECTION) {
        next.add(displayId);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedConversationIds(previous => previous.size === 0 ? previous : new Set());
  }, []);

  const handleBulkSetStatus = useCallback(
    async (status: 'open' | 'pending' | 'resolved') => {
      if (selectedConversationIds.size === 0) return;
      if (!can('conversations', 'update')) {
        toast.error(t('chatHeader.actions.bulkStatusNoPermission'));
        return;
      }
      const displayIds = Array.from(selectedConversationIds);
      setIsBulkUpdatingStatus(true);
      try {
        const result = await chatService.bulkUpdateStatus(displayIds, status);
        setSelectedConversationIds(new Set());
        if (result.failed_ids.length === 0) {
          toast.success(t('chatHeader.actions.bulkStatusSuccess', { count: result.success_ids.length }));
        } else if (result.success_ids.length > 0) {
          toast.warning(t('chatHeader.actions.bulkStatusPartialSuccess', {
            success: result.success_ids.length,
            failed: result.failed_ids.length,
          }));
        } else {
          toast.error(t('chatHeader.actions.bulkStatusError'));
        }
        await reloadCurrentFilters();
      } catch (error) {
        console.error('Bulk status update error:', error);
        toast.error(t('chatHeader.actions.bulkStatusError'));
      } finally {
        setIsBulkUpdatingStatus(false);
      }
    },
    [selectedConversationIds, can, reloadCurrentFilters, t],
  );

  // 🔄 CARREGAMENTO SIMPLES: Apenas carregar mensagens quando conversa muda
  useEffect(() => {
    if (conversations.state.selectedConversationId) {
      // 🔒 PROTEÇÃO: Verificar se já carregamos esta conversa
      if (lastLoadedConversationRef.current === conversations.state.selectedConversationId) {
        return;
      }

      // Atualizar ref ANTES de chamar loadMessages
      lastLoadedConversationRef.current = conversations.state.selectedConversationId;

      // Carregar mensagens diretamente via Context
      messages.loadMessages(conversations.state.selectedConversationId);
    } else {
      // Reset ref quando não há conversa selecionada
      lastLoadedConversationRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.state.selectedConversationId]); // Removido 'messages' para evitar loop

  // Delay the adjacent conversation's prefetch without resetting the timer
  // when message state or list objects change but the target stays the same.
  useEffect(() => {
    if (!prefetchTargetId) return;
    const timer = setTimeout(() => {
      requestMessagePrefetch(prefetchTargetId);
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [prefetchTargetId, requestMessagePrefetch]);

  useEffect(() => () => {
    intentPrefetchTimersRef.current.forEach(timer => clearTimeout(timer));
    intentPrefetchTimersRef.current.clear();
  }, []);

  // A route change switches the mobile pane before any network request settles.
  useEffect(() => {
    setMobileView(conversationId && UUID_V4_REGEX.test(conversationId) ? 'chat' : 'list');
  }, [conversationId]);

  // Synchronize only when the URL or selection changes. List refreshes must not
  // restart a specific-conversation request while it is still in flight.
  useEffect(() => {
    let cancelled = false;
    const manualNavigation = manualNavigationRef.current;
    if (manualNavigation?.targetRouteId === conversationId) {
      // The router caught up with our own selection; it needs no second select.
      manualNavigationRef.current = null;
      return () => {
        cancelled = true;
      };
    }
    if (manualNavigation?.fromRouteId === conversationId) {
      // Selection changed before the router committed our navigation.
      return () => {
        cancelled = true;
      };
    }
    // A different URL came from browser history or another external action.
    manualNavigationRef.current = null;

    const syncVersion = ++urlSyncVersionRef.current;
    const selectionAtStart = selectedConvIdRef.current;
    const isCurrent = () =>
      !cancelled &&
      urlSyncVersionRef.current === syncVersion &&
      currentRouteIdRef.current === conversationId &&
      selectedConvIdRef.current === selectionAtStart;

    const syncUrlWithConversation = async () => {
      if (conversationId) {
        const conversationIdStr = String(conversationId);

        // Accept only canonical UUIDs in deep links.
        if (!UUID_V4_REGEX.test(conversationIdStr)) {
          navigate('/conversations', { replace: true });
          return;
        }

        // Do not block a deep link while the whole conversation list loads.
        let targetConversation = conversations.getConversation(conversationIdStr);

        if (!targetConversation) {
          try {
            targetConversation = await conversations.loadSpecificConversation(conversationIdStr);
            if (!isCurrent()) return;
            if (!targetConversation) {
              setMobileView('list');
              navigate('/conversations', { replace: true });
              return;
            }
          } catch (error) {
            if (isCurrent()) {
              console.error('❌ Erro ao carregar conversa específica:', error);
              setMobileView('list');
              navigate('/conversations', { replace: true });
            }
            return;
          }
        }

        if (!isCurrent()) return;
        const canonicalConversationId = String(targetConversation.uuid || targetConversation.id);
        const currentSelectedStr = String(conversations.state.selectedConversationId);

        if (canonicalConversationId === currentSelectedStr) return;

        conversations.selectConversation(canonicalConversationId);
        setMobileView('chat');
      } else if (conversations.state.selectedConversationId && isCurrent()) {
        conversations.selectConversation(null);
        setMobileView('list');
      }
    };

    void syncUrlWithConversation();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, selectedConversationIdStr]);

  const handleSendMessage = async ({
    content,
    files,
    isPrivate,
    cannedResponseId,
    templateParams,
    isRecordedAudio,
    sendAsDocument,
  }: SendMessageOptions) => {
    if (!can('conversations', 'update')) {
      toast.error(t('messages.noPermissionSend'));
      return;
    }
    if (!conversations.state.selectedConversationId) return;

    // Se não há templateParams, validar conteúdo normal
    if (!templateParams && !content.trim() && (!files || files.length === 0)) return;

    try {
      // Use _sendMessageBase directly when templateParams is present
      if (templateParams) {
        await messages._sendMessageBase(conversations.state.selectedConversationId, {
          content: content || '', // Empty for templates, backend will populate
          files: files || [],
          isPrivate: isPrivate || false,
          cannedResponseId: cannedResponseId || null,
          sendAsDocument,
          templateParams,
        });
      } else if (files && files.length > 0) {
        await messages.sendMessageWithFiles(
          conversations.state.selectedConversationId,
          content,
          files,
          isPrivate,
          cannedResponseId,
          undefined,
          isRecordedAudio,
          sendAsDocument,
        );
      } else {
        await messages.sendMessage(
          conversations.state.selectedConversationId,
          content,
          isPrivate,
          cannedResponseId,
        );
      }

      // A mensagem é automaticamente adicionada ao Context via ADD_MESSAGE
    } catch (error) {
      console.error('Error sending message:', error);
      // O toast já é mostrado no CrmChatContext
      throw error; // Re-throw para que o MessageInput possa tratar
    }
  };

  const handleRetryMessage = (messageId: string) => {
    if (!conversations.state.selectedConversationId) return;
    void messages.retryMessage(String(conversations.state.selectedConversationId), messageId).catch(() => undefined);
  };

  // Keep the composer handlers stable while the message timeline changes.
  const sendMessageAction = useEventCallback(handleSendMessage);
  const retryMessageAction = useEventCallback(handleRetryMessage);

  // UX decision: after resolve/delete, drop to the unselected list rather than
  // auto-advancing to the next conversation. Intentional — mirrors the delete flow.
  const clearSelectionAndGoToList = useCallback(async () => {
    manualNavigationRef.current = {
      fromRouteId: currentRouteIdRef.current,
      targetRouteId: undefined,
    };
    const navigationVersion = ++urlSyncVersionRef.current;
    await conversations.selectConversation(null);
    if (urlSyncVersionRef.current !== navigationVersion) return;
    setMobileView('list');
    setIsContactSidebarOpen(false);
    navigate('/conversations', { replace: true });
  }, [conversations, navigate]);

  const handleMarkAsResolved = useCallback(
    async (conversation: Conversation) => {
      const resolvedId = String(conversation.uuid || conversation.id);
      try {
        await conversationHandlers.handleMarkAsResolved(conversation);
        const liveSelected = selectedConvIdRef.current;
        if (liveSelected != null && String(liveSelected) === resolvedId) {
          await clearSelectionAndGoToList();
        }
      } catch (err) {
        console.error('[handleMarkAsResolved] failed:', err);
      }
    },
    [conversationHandlers, clearSelectionAndGoToList],
  );

  const handlePostpone = useCallback(
    async (conversation: Conversation) => {
      const targetId = String(conversation.uuid || conversation.id);
      try {
        await conversationHandlers.handlePostpone(conversation);
        const liveSelected = selectedConvIdRef.current;
        if (liveSelected != null && String(liveSelected) === targetId) {
          await clearSelectionAndGoToList();
        }
      } catch (err) {
        console.error('[handlePostpone] failed:', err);
      }
    },
    [conversationHandlers, clearSelectionAndGoToList],
  );

  const handleMarkAsOpen = useCallback(
    async (conversation: Conversation) => {
      await conversationHandlers.handleMarkAsOpen(conversation);
    },
    [conversationHandlers],
  );

  const handleMarkAsSnoozed = useCallback(
    async (conversation: Conversation) => {
      const targetId = String(conversation.uuid || conversation.id);
      try {
        await conversationHandlers.handleMarkAsSnoozed(conversation);
        const liveSelected = selectedConvIdRef.current;
        if (liveSelected != null && String(liveSelected) === targetId) {
          await clearSelectionAndGoToList();
        }
      } catch (err) {
        console.error('[handleMarkAsSnoozed] failed:', err);
      }
    },
    [conversationHandlers, clearSelectionAndGoToList],
  );

  const handleSetPriority = useCallback(
    async (conversation: Conversation, priority: 'low' | 'medium' | 'high' | 'urgent' | null) => {
      await conversationHandlers.handleSetPriority(conversation, priority);
    },
    [conversationHandlers],
  );

  const handlePinConversation = useCallback(
    async (conversation: Conversation) => {
      await conversationHandlers.handlePinConversation(conversation);
    },
    [conversationHandlers],
  );

  const handleUnpinConversation = useCallback(
    async (conversation: Conversation) => {
      await conversationHandlers.handleUnpinConversation(conversation);
    },
    [conversationHandlers],
  );

  const handleArchiveConversation = useCallback(
    async (conversation: Conversation) => {
      await conversationHandlers.handleArchiveConversation(conversation);
    },
    [conversationHandlers],
  );

  const handleUnarchiveConversation = useCallback(
    async (conversation: Conversation) => {
      await conversationHandlers.handleUnarchiveConversation(conversation);
    },
    [conversationHandlers],
  );

  // 🎯 ASSIGNMENT HANDLERS: Usar handlers dos hooks customizados
  const handleAssignAgent = useCallback(
    async (conversation: Conversation) => {
      const result = await assignmentHandlers.handleAssignAgent(conversation);
      if (result) {
        setConversationToAssign(result.conversation);
        setAssignmentType(result.type);
        setShowAssignmentModal(true);
      }
    },
    [assignmentHandlers],
  );

  const handleAssignTeam = useCallback(
    async (conversation: Conversation) => {
      const result = await assignmentHandlers.handleAssignTeam(conversation);
      if (result) {
        setConversationToAssign(result.conversation);
        setAssignmentType(result.type);
        setShowAssignmentModal(true);
      }
    },
    [assignmentHandlers],
  );

  const handleAssignTag = useCallback(
    async (conversation: Conversation) => {
      const result = await assignmentHandlers.handleAssignTag(conversation);
      if (result) {
        setConversationToAssign(result.conversation);
        setAssignmentType(result.type);
        setShowAssignmentModal(true);
      }
    },
    [assignmentHandlers],
  );

  const handleDeleteConversation = useCallback(
    (conversation: Conversation) => {
      const result = conversationHandlers.handleDeleteConversation(conversation);
      if (result) {
        setConversationToDelete(result);
        setShowDeleteDialog(true);
      }
    },
    [conversationHandlers],
  );


  const confirmDeleteConversation = async () => {
    if (!conversationToDelete) return;

    try {
      await conversations.deleteConversation(String(conversationToDelete.id));
      setShowDeleteDialog(false);
      setConversationToDelete(null);
      await clearSelectionAndGoToList();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      // Error is already handled in the context with toast
    }
  };

  const handleCreateLabelInline = async (data: {
    title: string;
    description?: string;
    color: string;
    show_on_sidebar?: boolean;
  }): Promise<AssignmentOption> => {
    try {
      const label = await labelsService.createLabel(data);
      if (!label?.id || !label?.title) {
        throw new Error('Invalid label payload returned from API');
      }
      void fetchLabels(true);
      return { id: label.id, name: label.title, color: label.color };
    } catch (error) {
      console.error('Error creating label inline:', error);
      const message =
        error instanceof AxiosError
          ? error.response?.data?.error?.message || error.response?.data?.message
          : undefined;
      toast.error(message || t('assignmentModal.createLabelError'));
      throw error;
    }
  };

  // Assignment modal handlers
  const handleAssignmentConfirm = async (selectedIds: string[]) => {
    if (!conversationToAssign) return;

    try {
      await assignmentHandlers.handleAssignmentConfirm(
        conversationToAssign,
        assignmentType,
        selectedIds,
      );

      const targetId = String(conversationToAssign.uuid || conversationToAssign.id);
      const liveSelected = selectedConvIdRef.current;
      if (liveSelected != null && String(liveSelected) === targetId) {
        const assignedToMe = selectedIds[0] != null && String(selectedIds[0]) === String(currentUser?.id);
        const isViewingMine = filters.state.activeFilters.some(
          (f: any) => (f.attribute_key === 'assignee_type' || f.attribute_key === 'assignee_id') &&
               (Array.isArray(f.values) ? f.values[0] === 'me' : f.values === 'me'),
        );
        const isViewingUnassigned = filters.state.activeFilters.some(
          (f: any) => (f.attribute_key === 'assignee_type' || f.attribute_key === 'assignee_id') &&
               (Array.isArray(f.values) ? f.values[0] === 'unassigned' : f.values === 'unassigned'),
        );

        if ((isViewingMine && !assignedToMe) || (isViewingUnassigned && !assignedToMe)) {
          await clearSelectionAndGoToList();
        }
      }
    } catch (error) {
      console.error('Error in assignment:', error);
      throw error; // Re-throw to let modal handle it
    }
  };

  const closeAssignmentModal = () => {
    setShowAssignmentModal(false);
    setConversationToAssign(null);
  };

  // Handle tab change
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  // Reset active tab when conversation changes
  useEffect(() => {
    if (conversations.state.selectedConversationId) {
      setActiveTab('chat');
    }
  }, [conversations.state.selectedConversationId]);

  // Prepare assignment modal data
  // The three `description` phrases read "conversation with {{name}}", so {{name}}
  // is always the interlocutor — the contact, never what is being assigned.
  const getAssignmentModalData = () => {
    if (!conversationToAssign) return null;

    const contactName = conversationToAssign.contact?.name;

    switch (assignmentType) {
      case 'agent':
        return {
          title: t('assignment.agent.title'),
          description: t('assignment.agent.description', {
            name: contactName || t('assignment.agent.contactFallback'),
          }),
          options: assignmentHandlers.users.map(
            (user): AssignmentOption => ({
              id: user.id,
              name: user.name,
              description: user.email,
              avatar: user.avatar_url || user.thumbnail,
            }),
          ),
          currentSelection: conversationToAssign.assignee_id
            ? [conversationToAssign.assignee_id]
            : [],
          multiSelect: false,
          searchPlaceholder: t('assignment.agent.searchPlaceholder'),
        };

      case 'team':
        return {
          title: t('assignment.team.title'),
          description: t('assignment.team.description', {
            name: contactName || t('assignment.team.contactFallback'),
          }),
          options: assignmentHandlers.teams.map(
            (team): AssignmentOption => ({
              id: team.id,
              name: team.name,
              description: team.description,
            }),
          ),
          currentSelection: conversationToAssign.team_id ? [conversationToAssign.team_id] : [],
          multiSelect: false,
          searchPlaceholder: t('assignment.team.searchPlaceholder'),
        };

      case 'label':
        return {
          title: t('assignment.label.title'),
          description: t('assignment.label.description', {
            name: contactName || t('assignment.label.contactFallback'),
          }),
          options: assignmentHandlers.labels.map(
            (label): AssignmentOption => ({
              id: label.id,
              name: label.title,
              description: label.description,
              color: label.color,
            }),
          ),
          currentSelection: (conversationToAssign.labels || []).map(label => label.id),
          multiSelect: true,
          searchPlaceholder: t('assignment.label.searchPlaceholder'),
        };

      default:
        return null;
    }
  };

  const assignmentModalData = getAssignmentModalData();

  // 🎯 HANDLERS SIMPLIFICADOS: Usar handlers dos hooks customizados
  const handleConversationSelect = (conversation: Conversation) => {
    // 🔧 FIX CRÍTICO: Normalizar IDs para string SEMPRE
    const conversationIdStr = String(conversation.uuid || conversation.id);
    const currentSelectedStr = String(conversations.state.selectedConversationId);

    // 🔒 PROTEÇÃO: Evitar seleção dupla (comparação normalizada)
    if (currentSelectedStr === conversationIdStr) {
      return;
    }

    setSelectedConversationIds(previous => previous.size === 0 ? previous : new Set());

    manualNavigationRef.current = {
      fromRouteId: currentRouteIdRef.current,
      targetRouteId: conversationIdStr,
    };
    urlSyncVersionRef.current += 1;

    // 🔧 SEMPRE PASSAR STRING para evitar type mismatch
    conversations.selectConversation(conversationIdStr);
    // Switch to chat view on mobile when conversation is selected
    setMobileView('chat');
    // Atualizar URL para incluir o ID da conversa
    navigate(`/conversations/${conversationIdStr}`, { replace: true });

  };

  // Message events can render Chat while the sidebar's inputs have not changed.
  // Keep action identities stable so only affected conversation cards render.
  const sidebarSelect = useEventCallback(handleConversationSelect);
  const sidebarApplyFilters = useEventCallback(handleApplyFilters);
  const sidebarClearFilters = useEventCallback(handleClearFilters);
  const sidebarPin = useEventCallback(handlePinConversation);
  const sidebarUnpin = useEventCallback(handleUnpinConversation);
  const sidebarArchive = useEventCallback(handleArchiveConversation);
  const sidebarUnarchive = useEventCallback(handleUnarchiveConversation);
  const sidebarDelete = useEventCallback(handleDeleteConversation);
  const sidebarMarkResolved = useEventCallback(handleMarkAsResolved);
  const sidebarBulkSetStatus = useEventCallback(handleBulkSetStatus);

  const handleCloseConversation = useCallback(async () => {
    await clearSelectionAndGoToList();
  }, [clearSelectionAndGoToList]);

  const openContactSidebar = useCallback(() => setIsContactSidebarOpen(true), []);
  const headerClose = useEventCallback(handleCloseConversation);
  const headerConversationUpdated = useEventCallback(conversations.updateConversation);
  const headerMarkOpen = useEventCallback(handleMarkAsOpen);
  const headerMarkResolved = useEventCallback(handleMarkAsResolved);
  const headerPostpone = useEventCallback(handlePostpone);
  const headerMarkSnoozed = useEventCallback(handleMarkAsSnoozed);
  const headerSetPriority = useEventCallback(handleSetPriority);
  const headerAssignAgent = useEventCallback(handleAssignAgent);
  const headerAssignTeam = useEventCallback(handleAssignTeam);
  const headerAssignTag = useEventCallback(handleAssignTag);

  // While a different deep link loads, do not display the previous contact's
  // messages under the new URL. The existing empty pane remains in place.
  const selectedConversationMatchesRoute =
    Boolean(conversationId && UUID_V4_REGEX.test(conversationId) && selectedConversation) &&
    String(selectedConversation?.uuid || selectedConversation?.id).toLowerCase() === conversationId?.toLowerCase();

  return (
    <ErrorBoundary>
      <ChatTour />
      <div className="h-full w-full min-w-0 flex flex-col md:flex-row overflow-hidden">
        {/* Chat List Sidebar */}
        <ChatSidebar
          mobileView={mobileView}
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          onConversationSelect={sidebarSelect}
          onPrefetchIntent={handlePrefetchIntent}
          onCancelPrefetchIntent={cancelPrefetchIntent}
          onFilterApply={sidebarApplyFilters}
          onFilterClear={sidebarClearFilters}
          onPinConversation={sidebarPin}
          onUnpinConversation={sidebarUnpin}
          onArchiveConversation={sidebarArchive}
          onUnarchiveConversation={sidebarUnarchive}
          onDeleteConversation={sidebarDelete}
          onMarkAsResolved={sidebarMarkResolved}
          selectedConversationIds={selectedConversationIds}
          onToggleSelect={handleToggleConversationSelection}
          onClearSelection={handleClearSelection}
          onBulkSetStatus={sidebarBulkSetStatus}
          isBulkUpdatingStatus={isBulkUpdatingStatus}
          canBulkUpdateStatus={can('conversations', 'update')}
          width={sidebarWidth}
        />

        {/* Divisória arrastável entre a lista e o chat (§3.1). Só desktop —
            no mobile a sidebar ocupa a tela toda, não há o que redimensionar.
            Faixa de acerto de 5px (bem maior que a linha visual de 1px) para
            o cursor col-resize não exigir precisão de pixel; o grip só
            aparece no hover/drag, mantendo a UI limpa em repouso. */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="hidden md:flex relative w-[5px] -mx-[2px] z-10 shrink-0 cursor-col-resize group items-center justify-center"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('chatSidebar.resizeHandle', 'Redimensionar lista de conversas')}
        >
          <div
            className={`w-px h-full transition-colors ${
              isResizingSidebar ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/40'
            }`}
          />
          <div
            className={`absolute h-10 w-1 rounded-full bg-border transition-opacity ${
              isResizingSidebar ? 'opacity-100 bg-primary' : 'opacity-0 group-hover:opacity-100'
            }`}
          />
        </div>

        {/* Chat Area */}
        <div
          data-tour="chat-main-area"
          className={`
          ${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex
          flex-1 min-w-0 flex-col h-full min-h-0 max-h-full overflow-hidden
        `}
        >
          {selectedConversation && selectedConversationMatchesRoute ? (
            <>
              {/* Chat Header */}
              <ChatHeader
                conversation={selectedConversation}
                onBackClick={headerClose}
                onCloseConversation={headerClose}
                onContactSidebarOpen={openContactSidebar}
                onConversationUpdated={headerConversationUpdated}
                onMarkAsOpen={headerMarkOpen}
                onMarkAsResolved={headerMarkResolved}
                onPostpone={headerPostpone}
                onMarkAsSnoozed={headerMarkSnoozed}
                onSetPriority={headerSetPriority}
                onAssignAgent={headerAssignAgent}
                onAssignTeam={headerAssignTeam}
                onAssignTag={headerAssignTag}
                unreadCount={conversations.getUnreadCount(selectedConversation.id) || 0}
              />

              {/* Chat Tabs - Show tabs for conversation type dashboard apps */}
              <ChatTabs
                dashboardApps={dashboardApps}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                conversationSelected={!!selectedConversation}
              />

              {/* Conditional rendering: Chat Area or Dashboard App iframe */}
              {activeTab === 'chat' ? (
                // Show Chat Area when Chat tab is active
                <ChatArea
                  selectedConversationId={conversations.state.selectedConversationId}
                  selectedConversation={selectedConversation}
                  selectedMessages={selectedMessages}
                  onSendMessage={sendMessageAction}
                  onLoadMore={handleLoadMore}
                  onRetryMessage={retryMessageAction}
                  isPendingConversation={selectedConversation?.status === 'pending'}
                  onOpenConversation={() =>
                    selectedConversation && handleMarkAsOpen(selectedConversation)
                  }
                />
              ) : (
                // Show Dashboard App iframe when an app tab is active
                <div className="flex-1 w-full h-full overflow-hidden">
                  {(() => {
                    const activeApp = dashboardApps.find(app => app.id === activeTab);
                    if (!activeApp || !activeApp.content || activeApp.content.length === 0) {
                      return (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-muted-foreground">{t('dashboardApp.notFound')}</p>
                        </div>
                      );
                    }
                    const appUrl = activeApp.content[0]?.url;
                    if (!appUrl) {
                      return (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-muted-foreground">
                            {t('dashboardApp.urlNotConfigured')}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <iframe
                        src={appUrl}
                        className="w-full h-full border-0"
                        title={activeApp.title}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                      />
                    );
                  })()}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
                <p className="text-muted-foreground">{t('empty.description')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Contact Sidebar - Integrado no layout */}
        <Suspense fallback={null}>
          <ContactSidebar
            isOpen={isContactSidebarOpen}
            onClose={() => setIsContactSidebarOpen(false)}
            contact={selectedConversation?.contact || null}
            conversation={selectedConversation}
            onFilterReload={reloadCurrentFilters}
          />
        </Suspense>

        {/* Assignment Modal */}
        <Suspense fallback={null}>
          {assignmentModalData && (
            <AssignmentModal
              isOpen={showAssignmentModal}
              onClose={closeAssignmentModal}
              onConfirm={handleAssignmentConfirm}
              type={assignmentType}
              title={assignmentModalData.title}
              description={assignmentModalData.description}
              options={assignmentModalData.options}
              currentSelection={assignmentModalData.currentSelection as string[]}
              multiSelect={assignmentModalData.multiSelect}
              searchPlaceholder={assignmentModalData.searchPlaceholder}
              isLoading={assignmentHandlers.isLoadingAssignmentData}
              canCreateInline={assignmentType === 'label' && can('labels', 'create')}
              onCreateInline={
                assignmentType === 'label' && can('labels', 'create')
                  ? handleCreateLabelInline
                  : undefined
              }
            />
          )}
        </Suspense>

        {/* Delete Conversation Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader className="text-left space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div className="flex-1 space-y-2">
                  <AlertDialogTitle className="text-lg font-semibold">
                    {t('deleteDialog.title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                    {(() => {
                      const contactName =
                        conversationToDelete?.assignee?.name || t('deleteDialog.contactFallback');
                      const description = t('deleteDialog.description', { name: contactName });
                      const parts = description.split(contactName);
                      return (
                        <>
                          {parts[0]}
                          <strong>{contactName}</strong>
                          {parts[1]}
                        </>
                      );
                    })()}
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="w-full sm:w-auto">
                {t('deleteDialog.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteConversation}
                className="w-full sm:w-auto bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('deleteDialog.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ErrorBoundary>
  );
};

export default Chat;
