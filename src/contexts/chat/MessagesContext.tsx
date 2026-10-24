/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useReducer, useCallback, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { chatService } from '@/services/chat/chatService';
import { useAuthStore } from '@/store/authStore';
import { useUnansweredConversationsStore } from '@/store/unansweredConversationsStore';
import { extractMessagesData } from '@/utils/chat/responseHelpers';
import { Attachment, Message, MessageSender } from '@/types/chat/api';
import { useLanguage } from '@/hooks/useLanguage';

import {
  MessagesState,
  initialMessagesState,
  messagesReducer,
} from './MessagesContextReducer';

const EMPTY_MESSAGES: Message[] = [];
const MAX_CACHED_CONVERSATIONS = 16;
const EMPTY_HISTORY_REVALIDATION_MS = 10_000;

interface MessagesContextValue {
  state: MessagesState;

  // Message actions
  loadMessages: (conversationId: string) => Promise<void>;
  syncConversationMessages: (conversationId: string, options?: { force?: boolean }) => Promise<void>;
  prefetchMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: (conversationId: string) => Promise<void>;
  sendMessage: (
    conversationId: string,
    content: string,
    isPrivate?: boolean,
    cannedResponseId?: string | null,
  ) => Promise<Message | undefined>;
  sendMessageWithFiles: (
    conversationId: string,
    content: string,
    files: File[],
    isPrivate?: boolean,
    cannedResponseId?: string | null,
    onUploadProgress?: (progress: number, fileName: string) => void,
    isRecordedAudio?: boolean | string[],
    sendAsDocument?: boolean,
  ) => Promise<Message | undefined>;
  // Internal method for template support
  _sendMessageBase: (
    conversationId: string,
    options: {
      content: string;
      files?: File[];
      isPrivate?: boolean;
      templateParams?: any;
      cannedResponseId?: string | null;
      onUploadProgress?: (progress: number, fileName: string) => void;
      isRecordedAudio?: boolean | string[];
      sendAsDocument?: boolean;
    },
  ) => Promise<Message | undefined>;

  // Context menu actions
  onReplyToMessage: (message: Message) => void;
  onCancelReply: () => void;
  onCopyMessage: (message: Message) => void;
  onDeleteMessage: (conversationId: string, message: Message) => Promise<void>;
  retryMessage: (conversationId: string, messageId: string) => Promise<void>;

  // Direct state manipulation (for WebSocket integration)
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, message: Message) => void;
  replaceMessage: (conversationId: string, tempId: string, message: Message) => void;
  addPreviousMessages: (conversationId: string, previousMessages: Message[]) => void;
  clearConversationMessages: (conversationId: string) => void;
  setActiveConversationId: (conversationId: string | null) => void;

  // Computed values
  getMessages: (conversationId: string) => Message[];
  isMessagesLoading: (conversationId: string) => boolean;
  getMessagesError: (conversationId: string) => string | null;
  canLoadMore: (conversationId: string) => boolean;
  isLoadingMore: (conversationId: string) => boolean;
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage('chat');
  const [state, dispatch] = useReducer(messagesReducer, initialMessagesState);

  // 🔒 Cache & Sincronização: registro de timestamps de sincronização
  const lastSyncedAtRef = useRef<Map<string, number>>(new Map());
  const initialRequestsRef = useRef<Map<string, Promise<Message[] | null>>>(new Map());
  const committedInitialRequestsRef = useRef<WeakSet<Promise<Message[] | null>>>(new WeakSet());
  const syncRequestsRef = useRef<Map<string, Promise<void>>>(new Map());
  const cacheGenerationRef = useRef<Map<string, number>>(new Map());
  const activeConversationIdRef = useRef<string | null>(null);
  const recentConversationIdsRef = useRef<Map<string, number>>(new Map());
  const recencyCounterRef = useRef(0);
  const touchConversation = useCallback((conversationId: string) => {
    recentConversationIdsRef.current.set(conversationId, ++recencyCounterRef.current);
  }, []);
  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    if (conversationId) touchConversation(conversationId);
  }, [touchConversation]);

  useEffect(() => {
    const ids = Object.keys(state.messages);
    if (ids.length <= MAX_CACHED_CONVERSATIONS) return;
    const candidates = ids
      .filter(id => id !== activeConversationIdRef.current &&
        !state.messagesLoading[id] &&
        !state.messageHistory[id]?.isLoadingMore &&
        !initialRequestsRef.current.has(id) &&
        ![...syncRequestsRef.current.keys()].some(key => key.startsWith(`${id}:`)) &&
        !state.messages[id].some(message => message.status === 'progress' || message.status === 'failed'))
      .sort((a, b) => (recentConversationIdsRef.current.get(a) ?? 0) -
        (recentConversationIdsRef.current.get(b) ?? 0));
    const evicted = candidates.slice(0, ids.length - MAX_CACHED_CONVERSATIONS);
    if (evicted.length === 0) return;
    evicted.forEach(id => {
      lastSyncedAtRef.current.delete(id);
      recentConversationIdsRef.current.delete(id);
    });
    dispatch({ type: 'EVICT_CONVERSATIONS', payload: evicted });
  }, [state.messages, state.messagesLoading, state.messageHistory]);

  // Prefetch e abertura da mesma conversa compartilham a requisição inicial.
  // O state de loading só muda após render, então sozinho não impede o duplo GET.
  const fetchInitialMessages = useCallback((conversationId: string) => {
    const pending = initialRequestsRef.current.get(conversationId);
    if (pending) return pending;

    const request = chatService.getMessages(conversationId)
      .then(response => response ? extractMessagesData(response) : null)
      .finally(() => {
        if (initialRequestsRef.current.get(conversationId) === request) {
          initialRequestsRef.current.delete(conversationId);
        }
      });
    initialRequestsRef.current.set(conversationId, request);
    return request;
  }, []);

  // Busca mensagens posteriores ao último id persistido. Um histórico vazio já
  // carregado precisa de um GET completo para recuperar a primeira mensagem
  // caso o evento WebSocket tenha sido perdido.
  const syncConversationMessages = useCallback(
    async (conversationId: string, options?: { force?: boolean }) => {
      const generation = cacheGenerationRef.current.get(conversationId) ?? 0;
      const currentMessages = state.messages[conversationId] || [];
      // Encontrar a última mensagem com ID persistido (ignora mensagens locais em progresso de envio)
      const lastPersistedMessage = [...currentMessages]
        .reverse()
        .find(m => m.status !== 'progress' && m.id && !/^\d{13,}$/.test(m.id));

      const hasEmptyCachedHistory = Boolean(state.messageHistory[conversationId]) &&
        !lastPersistedMessage;
      if (!lastPersistedMessage && !hasEmptyCachedHistory) return;
      if (hasEmptyCachedHistory && !options?.force &&
        Date.now() - (lastSyncedAtRef.current.get(conversationId) ?? 0) < EMPTY_HISTORY_REVALIDATION_MS) {
        return;
      }

      const requestKey = `${conversationId}:${lastPersistedMessage?.id ?? '__empty__'}`;
      const existingRequest = syncRequestsRef.current.get(requestKey);
      if (existingRequest) return existingRequest;

      const request = (async () => {
        try {
          let fetchedMessages: Message[] | null;
          if (lastPersistedMessage) {
            const response = await chatService.getMessages(conversationId, {
              after: lastPersistedMessage.id,
            });
            fetchedMessages = response ? extractMessagesData(response) : null;
          } else {
            fetchedMessages = await fetchInitialMessages(conversationId);
          }
          if ((cacheGenerationRef.current.get(conversationId) ?? 0) !== generation) return;
          if (!fetchedMessages) return;

          if (hasEmptyCachedHistory && fetchedMessages.length > 0) {
            dispatch({
              type: 'MERGE_INITIAL_MESSAGES',
              payload: { conversationId, messages: fetchedMessages },
            });
          } else if (fetchedMessages.length > 0) {
            dispatch({
              type: 'MERGE_NEW_MESSAGES',
              payload: { conversationId, messages: fetchedMessages },
            });
          }
          lastSyncedAtRef.current.set(conversationId, Date.now());
        } catch (error) {
          console.warn('Falha ao sincronizar mensagens da conversa:', error);
        }
      })().finally(() => {
        if (syncRequestsRef.current.get(requestKey) === request) {
          syncRequestsRef.current.delete(requestKey);
        }
      });

      syncRequestsRef.current.set(requestKey, request);
      touchConversation(conversationId);
      return request;
    },
    [state.messages, state.messageHistory, fetchInitialMessages, touchConversation],
  );

  // Message actions
  const loadMessages = useCallback(
    async (conversationId: string) => {
      touchConversation(conversationId);
      const generation = cacheGenerationRef.current.get(conversationId) ?? 0;
      // ⚡ CACHE INSTANTÂNEO (0ms): Reutilizar cache local ao abrir uma conversa.
      // A UI renderiza imediatamente sem spinner. Se o cache for mais antigo que 10s,
      // reconcilia silenciosamente em segundo plano via `syncConversationMessages`.
      if (state.messageHistory[conversationId]) {
        const lastSynced = lastSyncedAtRef.current.get(conversationId) || 0;
        const now = Date.now();
        if (now - lastSynced > 10_000) {
          void syncConversationMessages(conversationId);
        }
        return;
      }

      // 🔒 PROTEÇÃO: Verificar se já está carregando para esta conversa
      if (state.messagesLoading[conversationId]) {
        return;
      }

      dispatch({ type: 'SET_MESSAGES_LOADING', payload: { conversationId, loading: true } });

      try {
        const request = fetchInitialMessages(conversationId);
        const fetchedMessages = await request;
        if ((cacheGenerationRef.current.get(conversationId) ?? 0) !== generation) return;

        // Verificar se a resposta existe
        if (!fetchedMessages) {
          console.warn('API response is empty or malformed');
          dispatch({ type: 'SET_MESSAGES_LOADING', payload: { conversationId, loading: false } });
          return;
        }

        // Prefetch e abertura podem aguardar o mesmo GET; só o primeiro reconcilia.
        if (committedInitialRequestsRef.current.has(request)) return;
        committedInitialRequestsRef.current.add(request);

        dispatch({
          type: 'MERGE_INITIAL_MESSAGES',
          payload: {
            conversationId,
            messages: fetchedMessages,
          },
        });
        lastSyncedAtRef.current.set(conversationId, Date.now());
      } catch (error) {
        if ((cacheGenerationRef.current.get(conversationId) ?? 0) !== generation) return;
        const errorMessage =
          error instanceof Error ? error.message : t('contexts.messages.errors.loadMessages');
        dispatch({
          type: 'SET_MESSAGES_ERROR',
          payload: {
            conversationId,
            error: errorMessage,
          },
        });
        toast.error(t('contexts.messages.errors.loadMessages'), {
          description: errorMessage,
          action: {
            label: t('contexts.messages.tryAgain'),
            onClick: () => loadMessages(conversationId),
          },
        });
      }
    },
    [state.messagesLoading, state.messageHistory, syncConversationMessages, fetchInitialMessages, touchConversation, t],
  );

  // ⚡ PREFETCH: Carregar mensagens silenciosamente em background para que o clique seguinte seja 0ms
  const prefetchMessages = useCallback(
    async (conversationId: string) => {
      touchConversation(conversationId);
      const generation = cacheGenerationRef.current.get(conversationId) ?? 0;
      if (state.messageHistory[conversationId] || state.messagesLoading[conversationId]) {
        return;
      }

      try {
        const request = fetchInitialMessages(conversationId);
        const fetchedMessages = await request;
        if ((cacheGenerationRef.current.get(conversationId) ?? 0) !== generation) return;
        if (fetchedMessages && !committedInitialRequestsRef.current.has(request)) {
          committedInitialRequestsRef.current.add(request);
          dispatch({
            type: 'MERGE_INITIAL_MESSAGES',
            payload: { conversationId, messages: fetchedMessages },
          });
          lastSyncedAtRef.current.set(conversationId, Date.now());
        }
      } catch (err) {
        console.debug('[prefetchMessages] Silently caught:', err);
      }
    },
    [state.messageHistory, state.messagesLoading, fetchInitialMessages, touchConversation],
  );

  const loadMoreMessages = useCallback(
    async (conversationId: string) => {
      const generation = cacheGenerationRef.current.get(conversationId) ?? 0;
      const history = state.messageHistory[conversationId];

      // 🔒 PROTEÇÕES: Verificar se pode carregar mais
      if (!history?.hasMore || history?.isLoadingMore) {
        return;
      }

      // 🔄 INICIAR LOADING
      dispatch({
        type: 'SET_LOAD_MORE_LOADING',
        payload: { conversationId, loading: true },
      });

      try {
        // 📡 BUSCAR MENSAGENS ANTIGAS (before: oldestMessageId)
        const response = await chatService.getMessages(conversationId, {
          before: history.oldestMessageId!,
        });
        if ((cacheGenerationRef.current.get(conversationId) ?? 0) !== generation) return;

        if (!response) {
          console.warn('Load More: API response is empty');
          dispatch({
            type: 'SET_LOAD_MORE_LOADING',
            payload: { conversationId, loading: false },
          });
          return;
        }

        const messages = extractMessagesData(response);

        // 📥 ADICIONAR MENSAGENS ANTIGAS
        dispatch({
          type: 'ADD_PREVIOUS_MESSAGES',
          payload: {
            conversationId,
            messages,
            hasMore: messages.length >= 20, // Se trouxe 20, provavelmente tem mais
          },
        });
      } catch (error) {
        if ((cacheGenerationRef.current.get(conversationId) ?? 0) !== generation) return;
        dispatch({
          type: 'SET_LOAD_MORE_LOADING',
          payload: { conversationId, loading: false },
        });
        toast.error(t('contexts.messages.errors.loadMoreMessages'), {
          description: error instanceof Error ? error.message : t('contexts.messages.tryAgain'),
        });
      }
    },
    [state.messageHistory, t],
  );

  const _sendMessageBase = useCallback(
    async (
      conversationId: string,
      options: {
        content: string;
        files?: File[];
        isPrivate?: boolean;
        templateParams?: any;
        cannedResponseId?: string | null;
        onUploadProgress?: (progress: number, fileName: string) => void;
        isRecordedAudio?: boolean | string[];
        sendAsDocument?: boolean;
      },
    ) => {
      const {
        content,
        files = [],
        isPrivate = false,
        cannedResponseId,
        onUploadProgress,
        isRecordedAudio,
        sendAsDocument,
      } = options;

      const currentUser = useAuthStore.getState().currentUser;

      // 1. 🔧 REPLY TO: Preparar content_attributes com in_reply_to se houver reply
      const contentAttributes: Record<string, unknown> = {};
      if (state.replyToMessage?.id && !isPrivate) {
        contentAttributes.in_reply_to = state.replyToMessage.id;
      }

      // 2. Criar mensagem PENDING
      const firstFile = files[0];
      const isAudioFile = firstFile?.type.startsWith('audio/');
      const isImageFile = firstFile?.type.startsWith('image/');

      // Criar attachments temporários se houver arquivos
      const tempAttachments =
        files.length > 0
          ? files.map((file, index) => ({
              id: (Date.now() + index).toString(),
              message_id: Date.now().toString(),
              file_type: sendAsDocument
                ? ('file' as const)
                : file.type.startsWith('audio/')
                ? ('audio' as const)
                : file.type.startsWith('image/')
                ? ('image' as const)
                : file.type.startsWith('video/')
                ? ('video' as const)
                : ('file' as const),
              extension: file.name.split('.').pop() || null,
              data_url: URL.createObjectURL(file), // URL temporária para preview
              thumb_url: null,
              file_size: file.size,
              fallback_title: file.name,
              coordinates_lat: 0,
              coordinates_long: 0,
            }))
          : [];

      const pendingMessage: Message = {
        id: Date.now().toString(), // ID temporário
        content:
          content || (files.length > 0 ? (isAudioFile ? '' : `📎 ${files.length} arquivo(s)`) : ''),
        message_type: 'outgoing',
        content_type:
          files.length > 0
            ? sendAsDocument
              ? 'file'
              : isAudioFile
                ? 'audio'
                : isImageFile
                  ? 'image'
                  : 'file'
            : 'text',
        status: 'progress', // Status temporário para mensagem em envio
        created_at: Math.floor(Date.now() / 1000).toString(),
        conversation_id: conversationId,
        sender: {
          id: currentUser?.id ?? '0',
          name:
            currentUser?.available_name ||
            currentUser?.display_name ||
            currentUser?.name ||
            t('messages.messageBubble.userFallback'),
          type: 'agent',
        } as MessageSender,
        content_attributes: contentAttributes,
        private: isPrivate,
        source_id: null,
        external_source_ids: {},
        attachments: tempAttachments as Attachment[],
      };

      try {
        // 3. Adicionar mensagem PENDING ao store IMEDIATAMENTE
        dispatch({
          type: 'ADD_MESSAGE',
          payload: { conversationId, message: pendingMessage },
        });

        // 4. Chamar API (com ou sem arquivos)
        // If using template, let backend process it (send empty content for email, processed content for WhatsApp preview)
        const templateParams = options.templateParams;
        const messageContent = templateParams ? '' : content; // Backend will populate from template

        const response =
          files.length > 0
            ? await chatService.sendMessageWithAttachments(
                conversationId,
                messageContent,
                files,
                isPrivate,
                cannedResponseId,
                onUploadProgress,
                contentAttributes.in_reply_to as string | number | undefined,
                pendingMessage.id,
                isRecordedAudio,
                sendAsDocument,
              )
            : await chatService.sendMessage(conversationId, {
                content: messageContent,
                message_type: 'outgoing',
                private: isPrivate,
                canned_response_id: cannedResponseId ?? undefined,
                content_attributes:
                  Object.keys(contentAttributes).length > 0 ? contentAttributes : undefined,
                template_params: templateParams,
                echo_id: pendingMessage.id,
              });

        // 5. 🔧 REPLY TO: Limpar reply após envio bem-sucedido
        if (state.replyToMessage) {
          dispatch({ type: 'SET_REPLY_TO_MESSAGE', payload: null });
        }

        // 6. SUBSTITUIR mensagem PENDING pela mensagem SENT da API
        const finalMessage = isPrivate ? { ...response, status: 'sent' as const } : response;

        // Limpar URLs temporárias antes de substituir
        tempAttachments.forEach(attachment => {
          if (attachment.data_url) {
            URL.revokeObjectURL(attachment.data_url);
          }
        });

        dispatch({
          type: 'REPLACE_MESSAGE',
          payload: {
            conversationId,
            tempId: pendingMessage.id,
            message: finalMessage,
          },
        });

        // EVO-1963: a public agent reply clears waiting_since on the backend, so the
        // "awaiting my reply" sidebar badge must refetch (this is the decisive trigger
        // for the count — viewing no longer decrements it). Private notes don't reply.
        if (!isPrivate) {
          useUnansweredConversationsStore.getState().fetch();
        }

        return response;
      } catch (error) {
        // Limpar URLs temporárias em caso de erro também
        tempAttachments.forEach(attachment => {
          if (attachment.data_url) {
            URL.revokeObjectURL(attachment.data_url);
          }
        });

        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            conversationId,
            message: {
              ...pendingMessage,
              status: 'failed',
            },
          },
        });

        toast.error(t('contexts.messages.errors.sendMessage'), {
          description: error instanceof Error ? error.message : t('contexts.messages.tryAgain'),
          action: {
            label: t('contexts.messages.tryAgain'),
            onClick: () => {
              // TODO: Implementar retry na próxima etapa
            },
          },
        });
        throw error;
      }
    },
    [state.replyToMessage, t],
  );

  // Funções públicas (exporta via Context)
  const sendMessage = useCallback(
    (
      conversationId: string,
      content: string,
      isPrivate?: boolean,
      cannedResponseId?: string | null,
    ) => {
      return _sendMessageBase(conversationId, {
        content,
        isPrivate,
        cannedResponseId,
      });
    },
    [_sendMessageBase],
  );

  const sendMessageWithFiles = useCallback(
    (
      conversationId: string,
      content: string,
      files: File[],
      isPrivate?: boolean,
      cannedResponseId?: string | null,
      onUploadProgress?: (progress: number, fileName: string) => void,
      isRecordedAudio?: boolean | string[],
      sendAsDocument?: boolean,
    ) => {
      return _sendMessageBase(conversationId, {
        content,
        files,
        isPrivate,
        cannedResponseId,
        onUploadProgress,
        isRecordedAudio,
        sendAsDocument,
      });
    },
    [_sendMessageBase],
  );

  // Context menu actions
  const onReplyToMessage = useCallback(
    (message: Message) => {
      // REGRA EVOLUTION: Mensagens privadas não podem ser respondidas
      if (message.private) {
        toast.error(t('contexts.messages.errors.replyToPrivateNote'));
        return;
      }

      dispatch({ type: 'SET_REPLY_TO_MESSAGE', payload: message });
    },
    [t],
  );

  const onCancelReply = useCallback(() => {
    dispatch({ type: 'SET_REPLY_TO_MESSAGE', payload: null });
  }, []);

  const onCopyMessage = useCallback(
    (message: Message) => {
      navigator.clipboard.writeText(message.content);
      toast.success(t('contexts.messages.success.messageCopied'));
    },
    [t],
  );

  const onDeleteMessage = useCallback(
    async (conversationId: string, message: Message) => {
      try {
        // Chamar API para deletar mensagem
        const deletedMessage = await chatService.deleteMessage(conversationId, message.id);

        // A API retorna a mensagem marcada como deletada
        // Atualizar o estado local
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            conversationId,
            message: deletedMessage,
          },
        });

        toast.success(t('contexts.messages.success.messageDeleted'));
      } catch {
        toast.error(t('contexts.messages.errors.deleteMessage'));
      }
    },
    [t],
  );

  const retryMessage = useCallback(
    async (conversationId: string, messageId: string) => {
      try {
        const retriedMessage = await chatService.retryMessage(conversationId, messageId);
        dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId, message: retriedMessage } });
        toast.success(t('messages.messageStatus.retrySubmitted'));
      } catch (error) {
        toast.error(t('messages.messageStatus.retryFailed'), {
          description: error instanceof Error ? error.message : undefined,
        });
        throw error;
      }
    },
    [t],
  );

  // Direct state manipulation (for WebSocket integration)
  const setMessages = useCallback((conversationId: string, messages: Message[]) => {
    touchConversation(conversationId);
    dispatch({
      type: 'SET_MESSAGES',
      payload: { conversationId, messages },
    });
  }, [touchConversation]);

  const addMessage = useCallback(
    (conversationId: string, message: Message) => {
      touchConversation(conversationId);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { conversationId, message },
      });
    },
    [touchConversation],
  );

  const updateMessage = useCallback((conversationId: string, message: Message) => {
    touchConversation(conversationId);
    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: { conversationId, message },
    });
  }, [touchConversation]);

  const replaceMessage = useCallback((conversationId: string, tempId: string, message: Message) => {
    touchConversation(conversationId);
    dispatch({
      type: 'REPLACE_MESSAGE',
      payload: { conversationId, tempId, message },
    });
  }, [touchConversation]);

  const addPreviousMessages = useCallback(
    (conversationId: string, previousMessages: Message[]) => {
      touchConversation(conversationId);
      const currentMessages = state.messages[conversationId] || [];
      const allMessages = [...previousMessages, ...currentMessages];

      dispatch({
        type: 'SET_MESSAGES',
        payload: { conversationId, messages: allMessages },
      });
    },
    [state.messages, touchConversation],
  );

  const clearConversationMessages = useCallback((conversationId: string) => {
    lastSyncedAtRef.current.delete(conversationId);
    recentConversationIdsRef.current.delete(conversationId);
    cacheGenerationRef.current.set(conversationId, (cacheGenerationRef.current.get(conversationId) ?? 0) + 1);
    initialRequestsRef.current.delete(conversationId);
    for (const key of syncRequestsRef.current.keys()) {
      if (key.startsWith(`${conversationId}:`)) syncRequestsRef.current.delete(key);
    }
    dispatch({ type: 'CLEAR_CONVERSATION_MESSAGES', payload: conversationId });
  }, []);

  // Computed values
  // ⚡ PERFORMANCE O(1) & REFERÊNCIA ESTÁVEL:
  // As mensagens já são ordenadas pelo reducer ao serem inseridas/atualizadas.
  // Retornar a mesma referência estável evita re-renderizações desnecessárias em cascata.
  const getMessages = useCallback(
    (conversationId: string | number) => {
      const key = String(conversationId);
      return state.messages[key] || EMPTY_MESSAGES;
    },
    [state.messages],
  );

  const isMessagesLoading = useCallback(
    (conversationId: string) => {
      return state.messagesLoading[conversationId] || false;
    },
    [state.messagesLoading],
  );

  const getMessagesError = useCallback(
    (conversationId: string) => {
      return state.messagesError[conversationId] || null;
    },
    [state.messagesError],
  );

  const canLoadMore = useCallback(
    (conversationId: string) => {
      return state.messageHistory[conversationId]?.hasMore || false;
    },
    [state.messageHistory],
  );

  const isLoadingMore = useCallback(
    (conversationId: string) => {
      return state.messageHistory[conversationId]?.isLoadingMore || false;
    },
    [state.messageHistory],
  );

  const contextValue: MessagesContextValue = useMemo(
    () => ({
      state,
      loadMessages,
      syncConversationMessages,
      prefetchMessages,
      loadMoreMessages,
      sendMessage,
      sendMessageWithFiles,
      _sendMessageBase,
      onReplyToMessage,
      onCancelReply,
      onCopyMessage,
      onDeleteMessage,
      retryMessage,
      setMessages,
      addMessage,
      updateMessage,
      replaceMessage,
      addPreviousMessages,
      clearConversationMessages,
      setActiveConversationId,
      getMessages,
      isMessagesLoading,
      getMessagesError,
      canLoadMore,
      isLoadingMore,
    }),
    [
      state,
      loadMessages,
      syncConversationMessages,
      prefetchMessages,
      loadMoreMessages,
      sendMessage,
      sendMessageWithFiles,
      _sendMessageBase,
      onReplyToMessage,
      onCancelReply,
      onCopyMessage,
      onDeleteMessage,
      retryMessage,
      setMessages,
      addMessage,
      updateMessage,
      replaceMessage,
      addPreviousMessages,
      clearConversationMessages,
      setActiveConversationId,
      getMessages,
      isMessagesLoading,
      getMessagesError,
      canLoadMore,
      isLoadingMore,
    ],
  );

  return <MessagesContext.Provider value={contextValue}>{children}</MessagesContext.Provider>;
}

export function useMessages() {
  const context = useContext(MessagesContext);
  if (context === undefined) {
    throw new Error('useMessages must be used within a MessagesProvider');
  }
  return context;
}
