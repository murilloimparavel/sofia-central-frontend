import React, { createContext, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { usePersistence } from '@/hooks/chat/usePersistence';
import { useContactUpdatedReconciler } from '@/hooks/chat/useContactUpdatedReconciler';
import { MessagesProvider, useMessages as useMessagesOriginal } from '@/contexts/chat/MessagesContext';
import { ConversationsProvider } from '@/contexts/chat/ConversationsContext';
import { useConversations as useConversationsOriginal } from '@/hooks/chat/useConversations';
import { FiltersProvider, useFilters as useFiltersOriginal } from '@/contexts/chat/FiltersContext';
import {
  WebSocketProvider,
  useWebSocketContext as useWebSocketContextOriginal,
} from '@/contexts/chat/WebSocketContext';
import { UIProvider, useUI as useUIOriginal } from '@/contexts/chat/UIContext';
import {
  Conversation,
  Message,
  ConversationFilter,
  ConversationListParams,
  MESSAGE_TYPE,
} from '@/types/chat/api';
import { ConversationsContextValue } from '@/types/chat/conversations';
import { useAppDataStore } from '@/store/appDataStore';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/constants/roles';
import { playNotificationSound, getAudioSettings } from '@/utils/audioNotificationUtils';
import { normalizeToUnixSeconds } from '@/utils/time/timeHelpers';
import { doesConversationMatchFilters } from '@/utils/chat/conversationMatch';
import { evictFromScopeCache, addOrUpdateInScopeCache } from '@/utils/chat/conversationScopeCache';
import { useUnansweredConversationsStore } from '@/store/unansweredConversationsStore';
const EMPTY_MESSAGES: Message[] = [];

interface ChatContextValue {
  // All sub-contexts
  messages: ReturnType<typeof useMessagesOriginal>;
  conversations: ConversationsContextValue;
  filters: ReturnType<typeof useFiltersOriginal>;
  websocket: ReturnType<typeof useWebSocketContextOriginal>;
  ui: ReturnType<typeof useUIOriginal>;

  // Computed values (combined from sub-contexts)
  selectedConversation: Conversation | null;
  selectedMessages: Message[];
  filteredConversations: Conversation[];

  // Integrated actions (combining multiple contexts)
  loadConversationsWithFilters: (params?: ConversationListParams) => Promise<void>;
  selectConversationAndLoadMessages: (conversationId: string | null) => Promise<void>;
  applyFiltersAndReload: (filters: ConversationFilter[]) => Promise<void>;
  applySearchAndReload: (searchTerm: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// Hook para integrar todas as funcionalidades
function useChatIntegration() {
  const messages = useMessagesOriginal();
  const conversations = useConversationsOriginal();
  const filters = useFiltersOriginal();
  const websocket = useWebSocketContextOriginal();
  const ui = useUIOriginal();
  const { saveState, loadState } = usePersistence();
  const { user: currentUser } = useAuth();
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  const previousWebSocketConnectedRef = useRef(false);
  const activeFiltersRef = useRef<ConversationFilter[]>(filters.state.activeFilters);
  const attachmentReloadTimersRef = useRef<Record<string, number>>({});
  const account = useAppDataStore(state => state.account);
  // A session the server masks too reads the same values from REST as from the
  // frame. Unknown role refetches: the cost is a request, the risk is the bug.
  const roleKey = currentUser?.role?.key;
  const sessionIsMasked = !!roleKey && !isAdminRole(roleKey);
  const reconcileContactUpdated = useContactUpdatedReconciler({
    conversations: conversations.state.conversations,
    selectedConversationData: conversations.state.selectedConversationData,
    refetchEnabled: account?.settings?.mask_contact_pii === true && !sessionIsMasked,
    apply: conversations.updateContactInConversations,
  });

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const reconcileContactUpdatedRef = useRef(reconcileContactUpdated);
  reconcileContactUpdatedRef.current = reconcileContactUpdated;

  useEffect(() => {
    activeFiltersRef.current = filters.state.activeFilters;
  }, [filters.state.activeFilters]);

  // Recuperar mensagens que chegaram durante uma queda do WebSocket sem
  // recarregar o histórico inteiro da conversa aberta.
  useEffect(() => {
    const isConnected = websocket.state.isWebSocketConnected;
    const wasDisconnected = !previousWebSocketConnectedRef.current;
    const conversationId = conversations.state.selectedConversationId;

    if (isConnected && wasDisconnected && conversationId) {
      void messages.syncConversationMessages(String(conversationId));
    }

    previousWebSocketConnectedRef.current = isConnected;
  }, [
    websocket.state.isWebSocketConnected,
    conversations.state.selectedConversationId,
    messages,
  ]);

  // Fallback leve para a conversa aberta. O WebSocket continua sendo o caminho
  // principal; esta reconciliação incremental só consulta mensagens depois do
  // último id local, evitando recarregar o histórico inteiro ou sobrecarregar a
  // API. Também cobre eventos perdidos durante reconexões silenciosas.
  useEffect(() => {
    const conversationId = conversations.state.selectedConversationId;
    if (!conversationId) return;

    let disposed = false;
    let timer: number | undefined;

    const syncIfVisible = () => {
      if (!disposed && document.visibilityState === 'visible') {
        void messagesRef.current.syncConversationMessages(String(conversationId));
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') syncIfVisible();
    };

    // Reconcilição imediata ao voltar para a conversa/aba; depois, apenas uma
    // consulta incremental a cada 7s enquanto ela permanece aberta.
    syncIfVisible();
    timer = window.setTimeout(function pollOpenConversation() {
      syncIfVisible();
      if (!disposed) timer = window.setTimeout(pollOpenConversation, 7000);
    }, 7000);

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleVisibilityOrFocus);

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleVisibilityOrFocus);
    };
  }, [conversations.state.selectedConversationId]);
  useEffect(() => {
    return () => {
      Object.values(attachmentReloadTimersRef.current).forEach(timerId => {
        window.clearTimeout(timerId);
      });
      attachmentReloadTimersRef.current = {};
    };
  }, []);
  const MAX_PROCESSED_IDS = 500;

  const shouldReloadMessageForMissingImageData = useCallback((message: Message): boolean => {
    const isImageByContentType = String(message.content_type || '').toLowerCase() === 'image';
    const attachments = message.attachments || [];
    const hasImageAttachment = attachments.some(
      attachment => String(attachment.file_type || '').toLowerCase() === 'image',
    );
    const hasRenderableImageAttachment = attachments.some(attachment => {
      const isImage = String(attachment.file_type || '').toLowerCase() === 'image';
      if (!isImage) return false;
      const hasDataUrl = !!(attachment.data_url && attachment.data_url.trim() !== '');
      const hasThumbUrl = !!(attachment.thumb_url && attachment.thumb_url.trim() !== '');
      return hasDataUrl || hasThumbUrl;
    });

    if (isImageByContentType && attachments.length === 0) {
      return true;
    }

    if (isImageByContentType && hasImageAttachment && !hasRenderableImageAttachment) {
      return true;
    }

    if (hasImageAttachment && !hasRenderableImageAttachment) {
      return true;
    }

    return false;
  }, []);

  // Computed values
  const selectedConversation = conversations.selectedConversation;
  const canonicalSelectedId = useMemo(() => {
    if (!selectedConversation) return null;
    return String(selectedConversation.uuid || selectedConversation.id);
  }, [selectedConversation]);

  const selectedMessages = useMemo(() => {
    if (!canonicalSelectedId) return EMPTY_MESSAGES;
    const msgs = messages.getMessages(canonicalSelectedId);
    if (msgs.length > 0) return msgs;
    if (selectedConversation && String(selectedConversation.id) !== canonicalSelectedId) {
      const fallbackMsgs = messages.getMessages(String(selectedConversation.id));
      if (fallbackMsgs.length > 0) return fallbackMsgs;
    }
    return EMPTY_MESSAGES;
  }, [canonicalSelectedId, selectedConversation, messages]);
  // 🔧 FIX: Ordenar conversas por last_activity_at para garantir ordem correta em tempo real
  const filteredConversations = useMemo(() => {
    return [...conversations.state.conversations].sort((a, b) => {
      const aTime = new Date(a.last_activity_at || a.created_at).getTime();
      const bTime = new Date(b.last_activity_at || b.created_at).getTime();
      return bTime - aTime; // Mais recente primeiro
    });
  }, [conversations.state.conversations]);

  // Integrar WebSocket com outros contextos
  useEffect(() => {
    websocket.registerHandlers({
      onMessageCreated: (message: Message) => {
        if (!message || !message.id || !message.conversation_id) {
          console.warn('⚠️ WEBSOCKET: Mensagem inválida recebida, ignorando:', message);
          return;
        }

        const conversationId = String(message.conversation_id);
        const findConversationByAnyId = (id: string): Conversation | null => {
          const idStr = String(id);
          return (
            conversationsRef.current.state.conversations.find(
              conv =>
                String(conv.id) === idStr ||
                String(conv.uuid || '') === idStr,
            ) || null
          );
        };
        const conversation = findConversationByAnyId(conversationId);

        const selectedConversationId = String(
          conversationsRef.current.state.selectedConversationId || '',
        );
        const isSelectedConversation =
          selectedConversationId === conversationId ||
          (conversation && selectedConversationId === String(conversation.id));

        // Nunca descartar um evento da conversa que o operador está vendo só
        // porque a lista atual está filtrada ou atrasada.
        if (!conversation && activeFiltersRef.current.length > 0 && !isSelectedConversation) {
          return;
        }

        if (processedMessageIdsRef.current.has(message.id)) {
          return;
        }
        processedMessageIdsRef.current.add(message.id);
        if (processedMessageIdsRef.current.size > MAX_PROCESSED_IDS) {
          processedMessageIdsRef.current.clear();
          processedMessageIdsRef.current.add(message.id);
        }

        if (message.content === null || message.content === undefined) {
          message.content = '';
        }

        if (!Array.isArray(message.attachments)) {
          message.attachments = [];
        }

        message.attachments = message.attachments.map(att => ({
          ...att,
          data_url: att.data_url && att.data_url.trim() !== '' ? att.data_url : '',
          thumb_url: att.thumb_url || null,
          external_url: att.external_url || undefined,
        }));

        const targetConversationId = conversation ? String(conversation.id) : conversationId;
        const existingMessages = messagesRef.current.getMessages(targetConversationId);
        const messageExistsById = existingMessages.some(msg => msg.id === message.id);

        if (messageExistsById) {
          return;
        }

        if (message.echo_id && message.message_type === MESSAGE_TYPE.OUTGOING) {
          messagesRef.current.replaceMessage(targetConversationId, message.echo_id, message);
          if (conversation) {
            const validTs = normalizeToUnixSeconds(message.created_at);
            conversationsRef.current.updateConversation({
              ...conversation,
              timestamp: validTs,
              last_activity_at: new Date(validTs * 1000).toISOString(),
              last_non_activity_message: {
                id: message.id,
                content: message.content ?? '',
                message_type: message.message_type,
                created_at:
                  typeof message.created_at === 'number'
                    ? String(message.created_at)
                    : (message.created_at ?? new Date(validTs * 1000).toISOString()),
                processed_message_content:
                  (message as { processed_message_content?: string }).processed_message_content ??
                  message.content ??
                  '',
                sender: message.sender ?? { id: '', name: '', type: 'contact' },
              },
            });
          }
          return;
        }

        messagesRef.current.addMessage(targetConversationId, message);

        if (!conversation) {
          if (message.message_type === MESSAGE_TYPE.INCOMING) {
            conversationsRef.current.incrementUnreadCount(targetConversationId);
          }
          return;
        }

        if (conversation && conversation.id) {
          // Verificar se a conversa está aberta (selecionada) - usar URL como fonte da verdade
          const urlPath = window.location.pathname;
          const urlMatch = urlPath.match(/\/conversations\/([^/]+)/);
          const urlConversationId = urlMatch ? urlMatch[1] : null;
          const urlConversation = urlConversationId ? findConversationByAnyId(urlConversationId) : null;
          const canonicalUrlConversationId = urlConversation
            ? String(urlConversation.uuid || urlConversation.id)
            : urlConversationId;
          const currentConversationId =
            canonicalUrlConversationId ||
            (conversationsRef.current.state.selectedConversationId
              ? String(conversationsRef.current.state.selectedConversationId)
              : null);
          const messageConversationId = targetConversationId;
          const isConversationOpen = currentConversationId === messageConversationId;
          const isIncomingMessage = message.message_type === MESSAGE_TYPE.INCOMING;

          // Se a conversa está aberta e é mensagem recebida, marcar como lida automaticamente
          if (isConversationOpen && isIncomingMessage) {
            // Marcar como lida no localStorage
            try {
              const saved = localStorage.getItem('crm-chat-state');
              const currentState = saved ? JSON.parse(saved) : {};
              const readConversations = currentState.readConversations || {};
              readConversations[targetConversationId] = true; // Marcar como lida
              localStorage.setItem(
                'crm-chat-state',
                JSON.stringify({
                  ...currentState,
                  readConversations,
                }),
              );
            } catch (error) {
              console.warn('Failed to update read conversation in localStorage:', error);
            }

            conversationsRef.current.markAsRead(targetConversationId, { silent: true }).catch(() => {
              conversationsRef.current.updateUnreadCount(targetConversationId, 0);
            });
          } else if (!isConversationOpen && isIncomingMessage) {
            try {
              const saved = localStorage.getItem('crm-chat-state');
              const currentState = saved ? JSON.parse(saved) : {};
              const readConversations = currentState.readConversations || {};
              delete readConversations[targetConversationId]; // Remover marcação de lida
              localStorage.setItem(
                'crm-chat-state',
                JSON.stringify({
                  ...currentState,
                  readConversations,
                }),
              );
            } catch (error) {
              console.warn('Failed to remove read mark from localStorage:', error);
            }

            // Incrementar contador de não lidas
            conversationsRef.current.incrementUnreadCount(targetConversationId);
          }

          const validTimestamp = normalizeToUnixSeconds(message.created_at);

          // Preservar unread_count atual do estado ao atualizar conversa via WebSocket
          const currentUnreadCount = conversationsRef.current.getUnreadCount(targetConversationId);

          const updatedConversation: Conversation = {
            ...conversation,
            timestamp: validTimestamp,
            last_activity_at: new Date(validTimestamp * 1000).toISOString(),
            unread_count: currentUnreadCount ?? conversation.unread_count ?? 0,
            last_non_activity_message: {
              id: message.id,
              content: message.content ?? '',
              message_type: message.message_type,
              created_at:
                typeof message.created_at === 'number'
                  ? String(message.created_at)
                  : (message.created_at ?? new Date(validTimestamp * 1000).toISOString()),
              processed_message_content:
                (message as { processed_message_content?: string }).processed_message_content ??
                message.content ??
                '',
              sender: message.sender ?? { id: '', name: '', type: 'contact' },
            },
          };

          conversationsRef.current.updateConversation(updatedConversation);

          if (shouldReloadMessageForMissingImageData(message)) {
            const existingTimer = attachmentReloadTimersRef.current[targetConversationId];
            if (existingTimer) {
              window.clearTimeout(existingTimer);
            }

            attachmentReloadTimersRef.current[targetConversationId] = window.setTimeout(() => {
              messagesRef.current.loadMessages(targetConversationId).catch(() => {
                return;
              });
              delete attachmentReloadTimersRef.current[targetConversationId];
            }, 1200);
          }

          // Toast e som apenas se a conversa NÃO está aberta e é mensagem recebida
          if (!isConversationOpen && isIncomingMessage) {
            // 🧹 LIMPAR HTML do content para toast
            const stripHtml = (html: string): string => {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html;
              return tempDiv.textContent || tempDiv.innerText || '';
            };

            const cleanContent = message.content
              ? stripHtml(message.content).substring(0, 100)
              : 'Mensagem recebida';

            toast.info(`Nova mensagem de ${message.sender?.name || 'Contato'}`, {
              description: cleanContent,
            });

            // Play notification sound if enabled and conversation is assigned to current user
            if (currentUserRef.current) {
              const isAssignedToMe = conversation.assignee_id === currentUserRef.current.id;

              if (isAssignedToMe) {
                const audioSettings = getAudioSettings();

                if (audioSettings.enable_audio_alerts) {
                  // Play sound for assigned conversations when conversation is closed
                  setTimeout(() => {
                    playNotificationSound(audioSettings, () => true).catch(error => {
                      console.error('❌ Error playing notification sound for new message:', error);
                    });
                  }, 100);
                }
              }
            }
          }
        } else {
          console.warn('onNewMessage: Invalid conversation data', conversation);
        }
      },

      onMessageUpdated: (message: Message) => {
        const conversationId = String(message.conversation_id);
        messagesRef.current.updateMessage(conversationId, message);

        const conversation = conversationsRef.current.getConversation(conversationId);
        if (!conversation) {
          return;
        }

        const validTimestamp = normalizeToUnixSeconds(message.created_at);
        const updatedConversationBase: Conversation = {
          ...conversation,
          timestamp: validTimestamp,
          last_activity_at: new Date(validTimestamp * 1000).toISOString(),
        };

        if (message.message_type === MESSAGE_TYPE.ACTIVITY) {
          conversationsRef.current.updateConversation(updatedConversationBase);
          return;
        }

        conversationsRef.current.updateConversation({
          ...updatedConversationBase,
          last_non_activity_message: {
            id: message.id,
            content: message.content ?? '',
            message_type: message.message_type,
            created_at:
              typeof message.created_at === 'number'
                ? String(message.created_at)
                : (message.created_at ?? new Date(validTimestamp * 1000).toISOString()),
            processed_message_content:
              (message as { processed_message_content?: string }).processed_message_content ??
              message.content ??
              '',
            sender: message.sender ?? { id: '', name: '', type: 'contact' },
          },
        });

        if (shouldReloadMessageForMissingImageData(message)) {
          const existingTimer = attachmentReloadTimersRef.current[conversationId];
          if (existingTimer) {
            window.clearTimeout(existingTimer);
          }

          attachmentReloadTimersRef.current[conversationId] = window.setTimeout(() => {
            messagesRef.current.loadMessages(conversationId).catch(() => {
              return;
            });
            delete attachmentReloadTimersRef.current[conversationId];
          }, 1200);
        }
      },

      onConversationCreated: (conversation: Conversation) => {
        if (!doesConversationMatchFilters(conversation, activeFiltersRef.current, currentUserRef.current?.id)) {
          conversationsRef.current.addHiddenConversation(conversation);
          return;
        }
        conversationsRef.current.addConversation(conversation);
      },

      onConversationUpdated: (conversation: Partial<Conversation> & { id: string }) => {
        if (!conversation || !conversation.id) {
          console.warn('⚠️ WebSocket: Dados inválidos recebidos', conversation);
          return;
        }

        const conversationId = String(conversation.id);
        const existingConversation = conversationsRef.current.getConversation(conversationId);

        // Merge WS partial data with existing conversation.
        // When existing data is present, spread produces a complete Conversation.
        // For unknown conversations (no existing), cast the partial — filter checks
        // gracefully handle missing fields via optional chaining.
        const mergedConversation: Conversation = existingConversation
          ? { ...existingConversation, ...conversation }
          : conversation as Conversation;

        const matchesFilters = doesConversationMatchFilters(mergedConversation, activeFiltersRef.current, currentUserRef.current?.id);
        const existsInList = !!existingConversation;

        if (!matchesFilters) {
          conversationsRef.current.addHiddenConversation(mergedConversation);
          if (existsInList) {
            conversationsRef.current.removeConversation(conversationId);
          }

          // Sincronizar cache de escopos entre abas
          if (mergedConversation.assignee_id != null) {
            evictFromScopeCache('unassigned', conversationId);
            const isAssignedToMe =
              currentUserRef.current?.id != null && String(mergedConversation.assignee_id) === String(currentUserRef.current.id);
            if (isAssignedToMe) {
              addOrUpdateInScopeCache('mine', mergedConversation);
            } else {
              evictFromScopeCache('mine', conversationId);
            }
          }
          if (mergedConversation.status === 'resolved') {
            evictFromScopeCache('mine', conversationId);
            evictFromScopeCache('unassigned', conversationId);
          }
          addOrUpdateInScopeCache('all', mergedConversation);
          return;
        }

        // Conversation now matches filters but wasn't in the list (e.g. just
        // assigned to me while viewing "Mine" tab) — add it so the list updates
        // without requiring a manual refresh. Fall through to updateConversation
        // which handles both add-if-missing and update-if-exists.

        // 🔒 PROTEÇÃO: Se esta conversa está selecionada (foi marcada como lida),
        // preservar o unread_count do estado local em vez de usar o valor do WebSocket
        const isSelected = String(conversationsRef.current.state.selectedConversationId) === conversationId;
        const localUnreadCount = conversationsRef.current.getUnreadCount(conversationId);

        // Se está selecionada e foi marcada como lida (unreadCount = 0), preservar isso
        const updatedConversation =
          isSelected && localUnreadCount === 0
            ? { ...mergedConversation, unread_count: 0 }
            : mergedConversation;

        // Preservar preview atual quando o payload WS vier sem preview
        // ou com preview mais antigo (evita "piscar" conteúdo antigo na sidebar).
        const existingPreview = existingConversation?.last_non_activity_message;
        const incomingPreview = conversation.last_non_activity_message;

        const toUnix = (value?: string | number): number => {
          if (value == null || value === '') return 0;
          if (typeof value === 'number') return value;
          const asNumber = Number(value);
          if (!Number.isNaN(asNumber)) return asNumber;
          const asDate = Date.parse(value);
          return Number.isNaN(asDate) ? 0 : Math.floor(asDate / 1000);
        };

        let resolvedPreview = existingPreview;
        if (incomingPreview) {
          const incomingTs = toUnix(incomingPreview.created_at);
          const existingTs = toUnix(existingPreview?.created_at);
          if (!existingPreview || incomingTs >= existingTs) {
            resolvedPreview = incomingPreview;
          }
        }

        // Keep the labels on screen when the WS payload is incomplete (no title or colour).
        // With labels_data the colour always arrives, so this now only guards against a
        // backend older than CRM-155. An empty list still passes: a removal has to reflect.
        const existingLabels = existingConversation?.labels || [];
        const incomingLabels = conversation.labels || [];
        const incomingLabelsComplete =
          incomingLabels.length === 0 ||
          incomingLabels.every((l: { title?: string; color?: string }) => l.title && l.color);
        const resolvedLabels = incomingLabelsComplete ? incomingLabels : existingLabels;

        // Deep-merge custom_attributes to preserve nested keys (e.g. pinned)
        const incomingCustomAttrs = conversation.custom_attributes;
        const resolvedCustomAttributes = incomingCustomAttrs
          ? { ...(existingConversation?.custom_attributes || {}), ...incomingCustomAttrs }
          : undefined;

        conversationsRef.current.updateConversation({
          ...updatedConversation,
          ...(incomingLabels.length > 0 || existingLabels.length > 0 ? { labels: resolvedLabels } : {}),
          ...(resolvedCustomAttributes ? { custom_attributes: resolvedCustomAttributes } : {}),
          ...(resolvedPreview ? { last_non_activity_message: resolvedPreview } : {}),
        });

        // Recarregar inboxes se for uma conversa Z-API para obter provider_connection atualizado
        const channelType = conversation.inbox?.channel_type || '';
        const isWhatsAppChannel = channelType === 'Channel::Whatsapp';
        const channelProvider = conversation.inbox?.provider;
        const isZapiChannel = isWhatsAppChannel && channelProvider?.toLowerCase() === 'zapi';

        if (isZapiChannel) {
          // Recarregar inboxes para obter provider_connection atualizado
          const { fetchInboxes } = useAppDataStore.getState();
          fetchInboxes(true).catch(console.error);
        }
      },

      onConversationStatusChanged: (conversationId: string, status: Conversation['status'], updatedAt?: string) => {
        const existingConversation = conversationsRef.current.getConversation(conversationId);
        if (!existingConversation) {
          return;
        }

        const updatedConversation: Conversation = {
          ...existingConversation,
          status,
          ...(updatedAt ? { updated_at: updatedAt } : {}),
        };

        // EVO-1960: uma mudança de status via realtime pode tirar a conversa da
        // view ativa (ex.: reaberta enquanto vejo "Resolvidas"). Reconcilia como
        // o onConversationUpdated faz — senão a conversa fica pendurada e, se for
        // fixada, o sort de pinned a joga pro topo da lista errada.
        if (!doesConversationMatchFilters(updatedConversation, activeFiltersRef.current, currentUserRef.current?.id)) {
          conversationsRef.current.addHiddenConversation(updatedConversation);
          conversationsRef.current.removeConversation(conversationId);
          if (status === 'resolved') {
            evictFromScopeCache('mine', conversationId);
            evictFromScopeCache('unassigned', conversationId);
            evictFromScopeCache('bot', conversationId);
          } else if (status === 'pending') {
            evictFromScopeCache('mine', conversationId);
            evictFromScopeCache('unassigned', conversationId);
            addOrUpdateInScopeCache('bot', updatedConversation);
          } else if (status === 'open') {
            evictFromScopeCache('bot', conversationId);
          }
          addOrUpdateInScopeCache('all', updatedConversation);
          useUnansweredConversationsStore.getState().fetch();
          return;
        }

        conversationsRef.current.updateConversation(updatedConversation);
        if (status === 'pending') {
          addOrUpdateInScopeCache('bot', updatedConversation);
        } else {
          evictFromScopeCache('bot', conversationId);
        }
      },

      onAssigneeChanged: (
        conversationId: string,
        assigneeId: string | null,
        assignee?: Conversation['assignee'],
      ) => {
        const existingConversation = conversationsRef.current.getConversation(conversationId);

        const updatedConversation: Conversation = existingConversation
          ? {
              ...existingConversation,
              assignee_id: assigneeId,
              assignee: assignee ?? null,
            }
          : ({
              id: conversationId,
              assignee_id: assigneeId,
              assignee: assignee ?? null,
            } as Conversation);

        const matchesFilters = doesConversationMatchFilters(
          updatedConversation,
          activeFiltersRef.current,
          currentUserRef.current?.id,
        );
        const existsInList = !!existingConversation;

        // Atualizar lista da view ativa
        if (!matchesFilters) {
          conversationsRef.current.addHiddenConversation(updatedConversation);
          if (existsInList) {
            conversationsRef.current.removeConversation(conversationId);
          }
        } else {
          conversationsRef.current.updateConversation(updatedConversation);
        }

        // Sincronizar cache de escopos entre abas (Fila, Chats, Robô, Todas)
        if (assigneeId != null) {
          // Atribuída a alguém: sai da Fila imediatamente
          evictFromScopeCache('unassigned', conversationId);
          const isAssignedToMe =
            currentUserRef.current?.id != null && String(assigneeId) === String(currentUserRef.current.id);
          if (isAssignedToMe) {
            addOrUpdateInScopeCache('mine', updatedConversation);
          } else {
            evictFromScopeCache('mine', conversationId);
          }
        } else {
          // Desatribuída: se estiver aberta, volta para a Fila
          if (updatedConversation.status === 'open') {
            addOrUpdateInScopeCache('unassigned', updatedConversation);
          }
          evictFromScopeCache('mine', conversationId);
        }

        if (updatedConversation.status === 'pending') {
          addOrUpdateInScopeCache('bot', updatedConversation);
        } else {
          evictFromScopeCache('bot', conversationId);
        }
        addOrUpdateInScopeCache('all', updatedConversation);

        // Se a conversa atualmente aberta na tela foi atribuída a outro atendente, notificar
        const isCurrentSelected =
          String(conversationsRef.current.state.selectedConversationId) === conversationId;
        if (
          isCurrentSelected &&
          assignee?.name &&
          currentUserRef.current?.id != null &&
          String(assigneeId) !== String(currentUserRef.current.id)
        ) {
          toast.info(`Conversa assumida por ${assignee.name}`);
        }

        useUnansweredConversationsStore.getState().fetch();
      },

      onConversationRead: (conversationId: string, unreadCount: number) => {
        conversationsRef.current.updateUnreadCount(conversationId, unreadCount);

        const conversation = conversationsRef.current.getConversation(conversationId);
        if (!conversation) {
          return;
        }

        const updatedConversation: Conversation = {
          ...conversation,
          unread_count: unreadCount,
        };

        // EVO-1960: zerar não-lidas pode tirar a conversa da view "Não lidas".
        // Mesma reconciliação do status — evita o vazamento (inclusive de fixadas).
        if (!doesConversationMatchFilters(updatedConversation, activeFiltersRef.current, currentUserRef.current?.id)) {
          conversationsRef.current.addHiddenConversation(updatedConversation);
          conversationsRef.current.removeConversation(conversationId);
          return;
        }

        conversationsRef.current.updateConversation(updatedConversation);
      },

      onConversationLastActivity: (conversationId: string, lastActivityAt: string) => {
        conversationsRef.current.updateConversationLastActivity(conversationId, lastActivityAt);
      },

      onContactUpdated: (event: Parameters<typeof reconcileContactUpdated>[0]) => {
        reconcileContactUpdatedRef.current(event);
      },
    });
  }, [
    websocket.registerHandlers,
    shouldReloadMessageForMissingImageData,
  ]);

  // Integrated actions
  const loadConversationsWithFilters = useCallback(
    async (params?: ConversationListParams) => {
      await conversations.loadConversations(params);
    },
    [conversations],
  );

  const selectConversationAndLoadMessages = useCallback(
    async (conversationId: string | null) => {
      // Selecionar conversa (passa accountId para marcar como lida)
      await conversations.selectConversation(conversationId);

      // Carregar mensagens se há conversa selecionada
      if (conversationId) {
        await messages.loadMessages(conversationId);
      }
    },
    [conversations, messages],
  );

  const applyFiltersAndReload = useCallback(
    async (filtersToApply: ConversationFilter[]) => {
      await filters.applyFilters(
        filtersToApply,
        () => {
          conversations.revealHiddenConversations();
        },
        (error: string) => {
          console.error('Error loading conversations:', error);
        },
      );
    },
    [filters, conversations],
  );

  const applySearchAndReload = useCallback(
    async (searchTerm: string) => {
      await filters.applySearch(
        searchTerm,
        () => {
          // Note: Direct state mutation is not correct in this context
          // This would need to be handled differently with proper actions
        },
        (error: string) => {
          console.error('Error in search:', error);
        },
      );
    },
    [filters],
  );

  // Restore state from localStorage on mount
  useEffect(() => {
    const savedState = loadState();
    if (savedState.activeFilters) {
      filters.setFilters(savedState.activeFilters);
    }
    if (savedState.quickFilterTab) {
      filters.setQuickFilter(savedState.quickFilterTab);
    }
    if (savedState.searchTerm) {
      filters.setSearchTerm(savedState.searchTerm);
    }
    // Não restaurar conversa selecionada do localStorage automaticamente
    // Deixar que a URL ou seleção manual faça isso para garantir que seja marcada como lida
    // if (savedState.selectedConversationId !== undefined) {
    //   conversations.selectConversation(savedState.selectedConversationId);
    // }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Executar apenas uma vez no mount para restaurar estado
  // Incluir loadState, filters, conversations causaria loops infinitos

  // Save state changes to localStorage
  useEffect(() => {
    saveState({
      selectedConversationId: conversations.state.selectedConversationId,
      activeFilters: filters.state.activeFilters,
      quickFilterTab: filters.state.quickFilterTab,
      searchTerm: filters.state.searchTerm,
    });
  }, [
    conversations.state.selectedConversationId,
    filters.state.activeFilters,
    filters.state.quickFilterTab,
    filters.state.searchTerm,
    saveState,
  ]);

  return useMemo(
    () => ({
      messages,
      conversations,
      filters,
      websocket,
      ui,
      selectedConversation,
      selectedMessages,
      filteredConversations,
      loadConversationsWithFilters,
      selectConversationAndLoadMessages,
      applyFiltersAndReload,
      applySearchAndReload,
    }),
    [
      messages,
      conversations,
      filters,
      websocket,
      ui,
      selectedConversation,
      selectedMessages,
      filteredConversations,
      loadConversationsWithFilters,
      selectConversationAndLoadMessages,
      applyFiltersAndReload,
      applySearchAndReload,
    ],
  );
}

// Componente Provider interno que usa todos os hooks
function ChatProviderInternal({ children }: { children: React.ReactNode }) {
  const chatIntegration = useChatIntegration();

  return <ChatContext.Provider value={chatIntegration}>{children}</ChatContext.Provider>;
}

// Provider principal que encapsula todos os sub-providers
export function ChatProvider({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <UIProvider>
        <ConversationsProvider>
          <MessagesProvider>
            <FiltersProvider>
              <ChatProviderInternal>{children}</ChatProviderInternal>
            </FiltersProvider>
          </MessagesProvider>
        </ConversationsProvider>
      </UIProvider>
    </WebSocketProvider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    console.error(
      '❌ useChatContext: Context is undefined. This usually means:',
      '\n1. The component is not wrapped in ChatProvider',
      '\n2. The ChatProvider is still mounting',
      '\n3. There was an error during provider initialization',
      '\nCurrent location:',
      window.location.pathname,
      '\nComponent tree should be: ChatPage > ChatProvider > Chat',
    );
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

// ============================================================================
// Granular Selectors (Sprint 2 - Anti-flicker and fine-grained reactivity)
// Permitem consumir apenas a fatia necessária sem re-renderizar o componente
// quando outros contextos (ex: messages vs conversations) são atualizados.
// ============================================================================

export function useChatMessages() {
  return useChatContext().messages;
}

export function useChatConversations() {
  return useChatContext().conversations;
}

export function useChatFilters() {
  return useChatContext().filters;
}

export function useChatUI() {
  return useChatContext().ui;
}

export function useChatWebSocket() {
  return useChatContext().websocket;
}

export function useSelectedConversation(): Conversation | null {
  return useChatContext().selectedConversation;
}

export function useSelectedConversationId(): string | null {
  const { conversations } = useChatContext();
  return conversations.state.selectedConversationId ? String(conversations.state.selectedConversationId) : null;
}

export function useIsConversationSelected(conversationId: string | number): boolean {
  const selectedId = useSelectedConversationId();
  return selectedId != null && String(selectedId) === String(conversationId);
}

