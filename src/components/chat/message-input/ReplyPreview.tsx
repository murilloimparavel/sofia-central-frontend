import React from 'react';
import { Button } from '@evoapi/design-system/button';
import { Reply, X } from 'lucide-react';

import { useLanguage } from '@/hooks/useLanguage';
import type { Message } from '@/types/chat/api';

interface ReplyPreviewProps {
  message: Message;
  onCancel?: () => void;
}

// Keep the component identity stable while the composer updates on every keystroke.
const ReplyPreview: React.FC<ReplyPreviewProps> = ({ message, onCancel }) => {
  const { t } = useLanguage('chat');

  return (
    <div className="w-full border-t-0 border-x-0 border-b border-border bg-muted/50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Reply className="h-4 w-4" />
          <span className="font-medium">
            {t('messageInput.replyPreview.replyingTo', {
              name: message.sender?.name || t('messageInput.replyPreview.userFallback'),
            })}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto hover:bg-destructive/20 hover:text-destructive"
          onClick={onCancel}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-2 pl-6">
        <div className="text-sm text-muted-foreground bg-background border-l-2 border-primary/30 pl-3 py-1 rounded-r max-w-md">
          {message.content ? (
            <span className="line-clamp-2">{message.content}</span>
          ) : message.attachments && message.attachments.length > 0 ? (
            <span className="italic">
              {t('messageInput.replyPreview.fileAttachment', {
                fileType:
                  message.attachments[0].file_type || t('messageInput.replyPreview.fileFallback'),
              })}
            </span>
          ) : (
            <span className="italic">{t('messageInput.replyPreview.noContent')}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReplyPreview);
