import { Message, MessageSender, MessageTypeValue } from '@/types/chat/api';
import { compareMessagesByTimestamp, normalizeMessageTimestamp } from './messageTimestampUtils';

export interface MessagesState {
  // Messages per conversation
  messages: Record<string, Message[]>;
  messagesLoading: Record<string, boolean>;
  messagesError: Record<string, string | null>;
  messageHistory: Record<
    string,
    {
      hasMore: boolean;
      oldestMessageId: string | null;
      isLoadingMore: boolean;
    }
  >;

  // Reply functionality
  replyToMessage: Message | null;
}

export type MessagesAction =
  | { type: 'SET_MESSAGES'; payload: { conversationId: string; messages: Message[] } }
  | { type: 'MERGE_INITIAL_MESSAGES'; payload: { conversationId: string; messages: Message[] } }
  | { type: 'SET_MESSAGES_LOADING'; payload: { conversationId: string; loading: boolean } }
  | { type: 'SET_MESSAGES_ERROR'; payload: { conversationId: string; error: string | null } }
  | { type: 'ADD_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { conversationId: string; message: Message } }
  | {
      type: 'REPLACE_MESSAGE';
      payload: { conversationId: string; tempId: string; message: Message };
    }
  | {
      type: 'SET_LOAD_MORE_LOADING';
      payload: { conversationId: string; loading: boolean };
    }
  | {
      type: 'ADD_PREVIOUS_MESSAGES';
      payload: { conversationId: string; messages: Message[]; hasMore: boolean };
    }
  | { type: 'MERGE_NEW_MESSAGES'; payload: { conversationId: string; messages: Message[] } }
  | { type: 'SET_REPLY_TO_MESSAGE'; payload: Message | null }
  | { type: 'CLEAR_CONVERSATION_MESSAGES'; payload: string }
  | { type: 'EVICT_CONVERSATIONS'; payload: string[] };

const mergeMessages = (current: Message[], incoming: Message[]): Message[] => {
  // A resposta HTTP pode ter sido produzida antes de um evento WebSocket ou envio local.
  // Preservar a versão já presente impede que uma resposta atrasada reverta esses eventos.
  const byId = new Map<string, Message>();
  incoming.forEach(message => byId.set(String(message.id), message));
  current.forEach(message => byId.set(String(message.id), message));
  incoming.forEach(message => {
    if (!message.echo_id || message.status === 'progress') return;
    for (const [id, candidate] of byId) {
      if (candidate.status === 'progress' &&
        (String(candidate.id) === String(message.echo_id) ||
          String(candidate.echo_id) === String(message.echo_id))) {
        byId.delete(id);
      }
    }
  });
  return [...byId.values()].sort(compareMessagesByTimestamp);
};

const oldestPersistedMessage = (messages: Message[]): Message | undefined =>
  messages.filter(message => message.status !== 'progress').sort(compareMessagesByTimestamp)[0];

export const initialMessagesState: MessagesState = {
  messages: {},
  messagesLoading: {},
  messagesError: {},
  messageHistory: {},
  replyToMessage: null,
};

export function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case 'SET_MESSAGES': {
      const { conversationId, messages } = action.payload;
      // Garantir que mensagens estão ordenadas por timestamp ao definir
      const sortedMessages = [...messages].sort(compareMessagesByTimestamp);

      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: sortedMessages,
        },
        messagesLoading: {
          ...state.messagesLoading,
          [conversationId]: false,
        },
        messagesError: {
          ...state.messagesError,
          [conversationId]: null,
        },
        messageHistory: {
          ...state.messageHistory,
          [conversationId]: {
            hasMore: sortedMessages.length >= 20, // Evolution carrega 20 por vez
            oldestMessageId: sortedMessages.length > 0 ? sortedMessages[0].id : null,
            isLoadingMore: false,
          },
        },
      };
    }

    case 'MERGE_INITIAL_MESSAGES': {
      const { conversationId, messages } = action.payload;
      const current = state.messages[conversationId] || [];
      const page = mergeMessages([], messages);
      const previousHistory = state.messageHistory[conversationId];
      const merged = mergeMessages(current, page);
      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: merged,
        },
        messagesLoading: {
          ...state.messagesLoading,
          [conversationId]: false,
        },
        messagesError: {
          ...state.messagesError,
          [conversationId]: null,
        },
        messageHistory: {
          ...state.messageHistory,
          [conversationId]: previousHistory?.oldestMessageId ? previousHistory : {
            hasMore: messages.length >= 20,
            oldestMessageId: oldestPersistedMessage(page)?.id ??
              oldestPersistedMessage(merged)?.id ?? null,
            isLoadingMore: false,
          },
        },
      };
    }

    case 'SET_MESSAGES_LOADING':
      return {
        ...state,
        messagesLoading: {
          ...state.messagesLoading,
          [action.payload.conversationId]: action.payload.loading,
        },
      };

    case 'SET_MESSAGES_ERROR':
      return {
        ...state,
        messagesError: {
          ...state.messagesError,
          [action.payload.conversationId]: action.payload.error,
        },
        messagesLoading: {
          ...state.messagesLoading,
          [action.payload.conversationId]: false,
        },
      };

    case 'SET_LOAD_MORE_LOADING':
      return {
        ...state,
        messageHistory: {
          ...state.messageHistory,
          [action.payload.conversationId]: {
            ...state.messageHistory[action.payload.conversationId],
            isLoadingMore: action.payload.loading,
          },
        },
      };

    case 'ADD_PREVIOUS_MESSAGES': {
      const { conversationId, messages: newMessages, hasMore } = action.payload;
      const currentMessages = state.messages[conversationId] || [];
      const previousOldestId = state.messageHistory[conversationId]?.oldestMessageId;
      const pageOldest = oldestPersistedMessage(newMessages);
      const updatedMessages = mergeMessages(currentMessages, newMessages);
      const oldestMessageId = pageOldest?.id ?? previousOldestId ?? null;
      // Uma página inteiramente sobreposta não avança o cursor; não repetir a mesma busca.
      const advanced = oldestMessageId !== previousOldestId;

      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: updatedMessages,
        },
        messageHistory: {
          ...state.messageHistory,
          [conversationId]: {
            hasMore: hasMore && advanced,
            oldestMessageId,
            isLoadingMore: false,
          },
        },
      };
    }

    case 'MERGE_NEW_MESSAGES': {
      const { conversationId, messages: incomingMessages } = action.payload;
      const currentMessages = state.messages[conversationId] || [];
      if (incomingMessages.length === 0) {
        return state;
      }

      const byId = new Map<string, Message>();
      currentMessages.forEach(m => byId.set(String(m.id), m));

      incomingMessages.forEach(incoming => {
        // Se uma mensagem pendente local tiver echo_id correspondente, removemos a temporária
        if (incoming.echo_id) {
          for (const [id, current] of byId.entries()) {
            if (
              current.status === 'progress' &&
              (String(current.id) === String(incoming.echo_id) ||
                String(current.echo_id) === String(incoming.echo_id))
            ) {
              byId.delete(id);
            }
          }
        }
        byId.set(String(incoming.id), incoming);
      });

      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [...byId.values()].sort(compareMessagesByTimestamp),
        },
      };
    }

    case 'ADD_MESSAGE': {
      const currentMessages = state.messages[action.payload.conversationId] || [];
      const newMessage = action.payload.message;

      // Proteção: evitar duplicação se ID já existe
      const messageExists = currentMessages.some(msg => msg.id === newMessage.id);
      if (messageExists) {
        return state;
      }

      // Reconciliação se a mensagem real chegou via WebSocket substituindo a temporária (progress)
      const isRealMessage = newMessage.status !== 'progress' && !/^\d+$/.test(newMessage.id);

      if (isRealMessage) {
        const newMessageTimestamp = normalizeMessageTimestamp(newMessage);
        const pendingMessage = currentMessages.find(msg => {
          const isPending = msg.status === 'progress' && /^\d+$/.test(msg.id);
          if (!isPending) return false;

          const contentMatches =
            msg.content === newMessage.content ||
            (msg.content === '' && newMessage.content === '') ||
            (msg.content?.includes('arquivo') && newMessage.content === '');

          const msgTimestamp = normalizeMessageTimestamp(msg);
          const timeDiff = Math.abs(newMessageTimestamp - msgTimestamp);

          return contentMatches && timeDiff <= 10;
        });

        if (pendingMessage) {
          const updatedMessages = currentMessages.map(msg =>
            msg.id === pendingMessage.id ? newMessage : msg,
          );

          updatedMessages.sort(compareMessagesByTimestamp);

          return {
            ...state,
            messages: {
              ...state.messages,
              [action.payload.conversationId]: updatedMessages,
            },
          };
        }
      }

      const updatedMessages = [...currentMessages, newMessage].sort(compareMessagesByTimestamp);

      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: updatedMessages,
        },
      };
    }

    case 'UPDATE_MESSAGE': {
      const conversationMessages = state.messages[action.payload.conversationId] || [];
      const newMessage = action.payload.message;
      const existingMessage = conversationMessages.find(msg => msg.id === newMessage.id);

      const mergedMessage: Message =
        existingMessage?.message_type === 'outgoing' && existingMessage.sender?.type === 'user'
          ? {
              ...newMessage,
              message_type: 'outgoing' as MessageTypeValue,
              sender: {
                ...existingMessage.sender,
                ...newMessage.sender,
                type: 'user' as MessageSender['type'],
              },
            }
          : newMessage;

      const updatedMessages = conversationMessages
        .map(msg => (msg.id === mergedMessage.id ? mergedMessage : msg))
        .sort(compareMessagesByTimestamp);

      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: updatedMessages,
        },
      };
    }

    case 'REPLACE_MESSAGE': {
      const conversationMessages = state.messages[action.payload.conversationId] || [];
      const realMessage = action.payload.message;
      const tempId = action.payload.tempId;

      const existingRealMessage = conversationMessages.find(msg => msg.id === realMessage.id);
      let updatedMessages: Message[];

      if (existingRealMessage) {
        const mergedMessage = {
          ...existingRealMessage,
          ...realMessage,
          attachments:
            realMessage.attachments?.length > 0
              ? realMessage.attachments
              : existingRealMessage.attachments,
        };

        updatedMessages = conversationMessages
          .filter(msg => msg.id !== tempId)
          .map(msg => (msg.id === realMessage.id ? mergedMessage : msg));
      } else {
        updatedMessages = conversationMessages.map(msg => (msg.id === tempId ? realMessage : msg));
      }

      const seenIds = new Set<string>();
      updatedMessages = updatedMessages.filter(msg => {
        if (seenIds.has(msg.id)) {
          return false;
        }
        seenIds.add(msg.id);
        return true;
      });

      updatedMessages.sort(compareMessagesByTimestamp);

      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: updatedMessages,
        },
      };
    }

    case 'SET_REPLY_TO_MESSAGE':
      return {
        ...state,
        replyToMessage: action.payload,
      };

    case 'CLEAR_CONVERSATION_MESSAGES':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload]: [],
        },
        messagesLoading: {
          ...state.messagesLoading,
          [action.payload]: false,
        },
        messagesError: {
          ...state.messagesError,
          [action.payload]: null,
        },
        messageHistory: Object.fromEntries(
          Object.entries(state.messageHistory).filter(([id]) => id !== action.payload),
        ),
      };

    case 'EVICT_CONVERSATIONS': {
      if (action.payload.length === 0) return state;
      const evicted = new Set(action.payload);
      const retain = <T,>(entries: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.entries(entries).filter(([id]) => !evicted.has(id)));
      return {
        ...state,
        messages: retain(state.messages),
        messagesLoading: retain(state.messagesLoading),
        messagesError: retain(state.messagesError),
        messageHistory: retain(state.messageHistory),
      };
    }

    default:
      return state;
  }
}
