/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useReducer, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { chatService } from '@/services/chat/chatService';
import { useAuthStore } from '@/store/authStore';
import { useUnansweredConversationsStore } from '@/store/unansweredConversationsStore';
import { extractMessagesData } from '@/utils/chat/responseHelpers';
import { Attachment, Message, MessageSender, MessageTypeValue } from '@/types/chat/api';
import { useLanguage } from '@/hooks/useLanguage';

import {
  MessagesState,
  MessagesAction,
  initialMessagesState,
  messagesReducer,
} from './MessagesContextReducer';
import { chatLogger } from '@/utils/logger/chatLogger';

interface MessagesContextValue {
  state: MessagesState;

  // Message actions
  loadMessages: (conversationId: string) => Promise<void>;
  syncConversationMessages: (conversationId: string) => Promise<void>;
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

  // Busca somente as mensagens posteriores à última mensagem conhecida.
  // Requisições idênticas são compartilhadas para evitar duplicação em voo.
  const syncRequestsRef = useRef<Map<string, Promise<void>>>(new Map());
  const syncConversationMessages = useCallback(
    async (conversationId: string) => {
      const currentMessages = state.messages[conversationId] || [];
      // Encontrar a última mensagem com ID persistido (ignora mensagens locais em progresso de envio)
      const lastPersistedMessage = [...currentMessages]
        .reverse()
        .find(m => m.status !== 'progress' && m.id && !/^\d{13,}$/.test(m.id));

      if (!lastPersistedMessage) return;

      const requestKey = `${conversationId}:${lastPersistedMessage.id}`;
      const existingRequest = syncRequestsRef.current.get(requestKey);
      if (existingRequest) return existingRequest;

      const request = (async () => {
        try {
          const response = await chatService.getMessages(conversationId, {
            after: lastPersistedMessage.id,
          });
          if (!response) return;

          const newMessages = extractMessagesData(response);
          if (newMessages.length > 0) {
            dispatch({
              type: 'MERGE_NEW_MESSAGES',
              payload: { conversationId, messages: newMessages },
            });
          }
          lastSyncedAtRef.current.set(conversationId, Date.now());
        } catch (error) {
          console.warn('Falha ao sincronizar mensagens da conversa:', error);
        } finally {
          syncRequestsRef.current.delete(requestKey);
        }
      })();

      syncRequestsRef.current.set(requestKey, request);
      return request;
    },
    [state.messages],
  );

  // Message actions
  const loadMessages = useCallback(
    async (conversationId: string) => {
      // ⚡ CACHE INSTANTÂNEO (0ms): Reutilizar cache local ao abrir uma conversa.
      // A UI renderiza imediatamente sem spinner. Se o cache for mais antigo que 10s,
      // reconcilia silenciosamente em segundo plano via `syncConversationMessages`.
      const cachedMessages = state.messages[conversationId];
      if (cachedMessages && cachedMessages.length > 0) {
        const lastSynced = lastSyncedAtRef.current.get(conversationId) || 0;
        const now = Date.now();
        if (now - lastSynced > 10_000) {
          lastSyncedAtRef.current.set(conversationId, now);
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
        const response = await chatService.getMessages(conversationId);

        // Verificar se a resposta existe
        if (!response) {
          console.warn('API response is empty or malformed');
          dispatch({
            type: 'SET_MESSAGES',
            payload: {
              conversationId,
              messages: [],
            },
          });
          return;
        }

        const messages = extractMessagesData(response);

        dispatch({
          type: 'SET_MESSAGES',
          payload: {
            conversationId,
            messages,
          },
        });
        lastSyncedAtRef.current.set(conversationId, Date.now());
      } catch (error) {
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
    [state.messages, state.messagesLoading, syncConversationMessages, t],
  );

  // ⚡ PREFETCH: Carregar mensagens silenciosamente em background para que o clique seguinte seja 0ms
  const prefetchMessages = useCallback(
    async (conversationId: string) => {
      const cached = state.messages[conversationId];
      if ((cached && cached.length > 0) || state.messagesLoading[conversationId]) {
        return;
      }

      try {
        const response = await chatService.getMessages(conversationId);
        if (response) {
          const messages = extractMessagesData(response);
          dispatch({
            type: 'SET_MESSAGES',
            payload: { conversationId, messages },
          });
          lastSyncedAtRef.current.set(conversationId, Date.now());
        }
      } catch (err) {
        console.debug('[prefetchMessages] Silently caught:', err);
      }
    },
    [state.messages, state.messagesLoading],
  );

  const loadMoreMessages = useCallback(
    async (conversationId: string) => {
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
    dispatch({
      type: 'SET_MESSAGES',
      payload: { conversationId, messages },
    });
  }, []);

  const addMessage = useCallback(
    (conversationId: string, message: Message) => {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { conversationId, message },
      });
    },
    [],
  );

  const updateMessage = useCallback((conversationId: string, message: Message) => {
    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: { conversationId, message },
    });
  }, []);

  const replaceMessage = useCallback((conversationId: string, tempId: string, message: Message) => {
    dispatch({
      type: 'REPLACE_MESSAGE',
      payload: { conversationId, tempId, message },
    });
  }, []);

  const addPreviousMessages = useCallback(
    (conversationId: string, previousMessages: Message[]) => {
      const currentMessages = state.messages[conversationId] || [];
      const allMessages = [...previousMessages, ...currentMessages];

      dispatch({
        type: 'SET_MESSAGES',
        payload: { conversationId, messages: allMessages },
      });
    },
    [state.messages],
  );

  const clearConversationMessages = useCallback((conversationId: string) => {
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
