import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Reply, Send, X } from 'lucide-react';

import { useLanguage } from '@/hooks/useLanguage';
import type { Message } from '@/types/chat/api';

interface SendMessageOptions {
  content: string;
  isPrivate?: boolean;
}

interface MessageInputChrome109Props {
  onSendMessage: (options: SendMessageOptions) => Promise<void>;
  isDisabled?: boolean;
  isPendingConversation?: boolean;
  placeholder?: string;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  replyToMessage?: Message | null;
  onCancelReply?: () => void;
  conversationId?: string | number;
  inboxId?: string;
  channelType?: string;
  channelProvider?: string;
}

/**
 * Basic text-only composer for the constrained Chrome 109 profile.
 * The modern CRM keeps the rich editor and all composer tools.
 */
export default function MessageInputChrome109({
  onSendMessage,
  isDisabled = false,
  isPendingConversation = false,
  placeholder,
  onTypingStart,
  onTypingStop,
  replyToMessage,
  onCancelReply,
}: MessageInputChrome109Props) {
  const { t } = useLanguage('chat');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTypingStop?.();
    }
  }, [onTypingStop]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextContent = event.target.value;
    setContent(nextContent);

    if (nextContent.trim()) {
      if (!typingActiveRef.current) {
        typingActiveRef.current = true;
        onTypingStart?.();
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(stopTyping, 1200);
    } else {
      stopTyping();
    }
  };

  const handleSend = async () => {
    const message = content.trim();
    if (!message || isDisabled || isPendingConversation || isSending) return;

    stopTyping();
    setIsSending(true);
    try {
      await onSendMessage({ content: message, isPrivate: false });
      setContent('');
      if (replyToMessage) onCancelReply?.();
      textareaRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
    }
  };

  const inputDisabled = isDisabled || isPendingConversation || isSending;
  const replyName = replyToMessage?.sender?.name || t('messageInput.replyPreview.userFallback');

  return (
    <div className="w-full flex-shrink-0 border-t border-border bg-background">
      <div className="px-3 pt-2 text-xs text-muted-foreground" role="note">
        {t('messageInput.compatibilityTextOnly')}
      </div>

      {replyToMessage && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm text-muted-foreground">
          <Reply className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {t('messageInput.replyPreview.replyingTo', { name: replyName })}
            {replyToMessage.content ? `: ${replyToMessage.content}` : ''}
          </span>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent"
            aria-label={t('messageInput.replyPreview.cancel')}
            onClick={onCancelReply}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          disabled={inputDisabled}
          placeholder={placeholder || t('messageInput.defaultPlaceholder')}
          aria-label={placeholder || t('messageInput.defaultPlaceholder')}
          className="min-h-10 max-h-28 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('messageInput.filePreview.send')}
          title={t('messageInput.filePreview.send')}
          disabled={inputDisabled || !content.trim()}
          onClick={() => void handleSend()}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

export { MessageInputChrome109 as MessageInput };
