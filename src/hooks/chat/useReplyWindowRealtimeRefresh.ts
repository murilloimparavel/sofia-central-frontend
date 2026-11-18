import { useCallback, useEffect, useRef } from 'react';
import { conversationAPI } from '@/services/conversations/conversationService';
import type { Conversation } from '@/types/chat/api';

export type ReplyWindowSnapshot = Pick<Conversation, 'can_reply'> &
  Partial<Pick<Conversation, 'reply_window_expires_at'>>;

/** Refreshes one conversation after inbound events with a stale or incomplete window snapshot. */
export function useReplyWindowRealtimeRefresh(
  onConfirmed: (conversationId: string, snapshot: ReplyWindowSnapshot) => void,
) {
  const onConfirmedRef = useRef(onConfirmed);
  const sequenceRef = useRef(0);
  const versionsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, number>());
  onConfirmedRef.current = onConfirmed;

  useEffect(() => () => {
    timersRef.current.forEach(timer => window.clearTimeout(timer));
    timersRef.current.clear();
    versionsRef.current.clear();
  }, []);

  return useCallback((conversationId: string, shouldRefresh: boolean) => {
    const key = String(conversationId);
    const version = ++sequenceRef.current;
    versionsRef.current.set(key, version);

    const pendingTimer = timersRef.current.get(key);
    if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
    timersRef.current.delete(key);

    // Even an authoritative newer event invalidates a GET already in flight.
    if (!shouldRefresh) {
      versionsRef.current.delete(key);
      return;
    }

    const timer = window.setTimeout(() => {
      timersRef.current.delete(key);
      void conversationAPI.getConversation(key).then(refreshed => {
        if (versionsRef.current.get(key) !== version || !refreshed?.id ||
          typeof refreshed.can_reply !== 'boolean') {
          return;
        }

        const snapshot: ReplyWindowSnapshot = {
          can_reply: refreshed.can_reply,
          ...(refreshed.reply_window_expires_at !== undefined && {
            reply_window_expires_at: refreshed.reply_window_expires_at,
          }),
        };
        onConfirmedRef.current(key, snapshot);
      }).catch(error => {
        console.warn('Failed to refresh conversation reply window after inbound message:', error);
      }).finally(() => {
        if (versionsRef.current.get(key) === version) versionsRef.current.delete(key);
      });
    }, 180);

    timersRef.current.set(key, timer);
  }, []);
}
