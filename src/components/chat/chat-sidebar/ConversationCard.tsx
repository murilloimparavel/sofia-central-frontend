import React, { useMemo } from 'react';
import { Checkbox } from '@evoapi/design-system/checkbox';
import { Badge } from '@evoapi/design-system/badge';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@evoapi/design-system/context-menu';
import { Check, Pin, Archive, Trash2, FileText, User as UserIcon } from 'lucide-react';
import ContactAvatar from '../contact/ContactAvatar';
import ConversationBadges from '../conversation/ConversationBadges';
import { UnreadBadge } from '@/components/shared';
import { formatConversationTime, formatDetailedTime } from '@/utils/time/timeHelpers';
import { isPhoneBearingChannel } from '@/utils/channelUtils';
import { formatContactPhone } from '@/utils/contact/formatContactPhone';
import {
  attachmentLabel,
  mediaTypeFromAttributes,
  senderNameFromAttributes,
} from '@/utils/chat/mediaLabels';
import type { Conversation } from '@/types/chat/api';

export interface ConversationCardProps {
  conversation: Conversation;
  isSelected: boolean;
  isBulkSelected: boolean;
  selectionMode: boolean;
  unreadCount: number;
  onSelect: (conversation: Conversation) => void;
  onToggleSelect: (displayId: string) => void;
  onStartSelection: (displayId: string) => void;
  onPin: (conversation: Conversation) => void;
  onUnpin: (conversation: Conversation) => void;
  onArchive: (conversation: Conversation) => void;
  onUnarchive: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
  t: (key: string, options?: any) => string;
}

const stripHtml = (html: string): string => {
  if (!html) return '';
  // Utilizar regex rápido para remover tags HTML sem instanciar DOM elements
  return html.replace(/<[^>]*>/g, '').trim();
};

const getLastMessage = (conversation: Conversation) => {
  const msg = conversation.last_non_activity_message;
  const rawText = stripHtml(msg?.processed_message_content || msg?.content || '');
  const firstAttachmentType = msg?.attachments?.[0]?.file_type;
  const fallbackMediaType = mediaTypeFromAttributes(msg?.content_attributes);
  const cleanContent =
    rawText ||
    (firstAttachmentType ? attachmentLabel(firstAttachmentType) : '') ||
    (fallbackMediaType ? attachmentLabel(fallbackMediaType) : '');

  const senderName =
    msg && msg.message_type === 'incoming'
      ? senderNameFromAttributes(msg.content_attributes)
      : undefined;
  const preview = senderName ? `${senderName}: ${cleanContent}` : cleanContent;
  return preview.length > 60 ? preview.substring(0, 60) + '...' : preview;
};

const ConversationCardComponent: React.FC<ConversationCardProps> = ({
  conversation,
  isSelected,
  isBulkSelected,
  selectionMode,
  unreadCount,
  onSelect,
  onToggleSelect,
  onStartSelection,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onDelete,
  t,
}) => {
  const isPinned = Boolean(conversation.custom_attributes?.pinned);
  const isArchived = Boolean(conversation.custom_attributes?.archived);

  const channelType = conversation.inbox?.channel_type;
  const channelProvider = conversation.inbox?.provider;
  const phoneDisplay = useMemo(
    () =>
      isPhoneBearingChannel(channelType)
        ? formatContactPhone(conversation.contact?.phone_number)
        : null,
    [channelType, conversation.contact?.phone_number],
  );

  const lastMessageText = useMemo(() => getLastMessage(conversation), [conversation]);

  const cardContent = (
    <div
      key={conversation.id}
      className={`p-4 mx-0.5 mb-2.5 rounded-[14px] border cursor-pointer transition-colors ${
        isBulkSelected
          ? 'bg-primary/5 border-primary/20'
          : isSelected
            ? 'bg-primary/10 border-primary/30 shadow-[0_1px_3px_rgba(20,50,35,0.05)]'
            : 'border-transparent hover:bg-accent'
      }`}
      onClick={() =>
        selectionMode
          ? onToggleSelect(String(conversation.display_id))
          : onSelect(conversation)
      }
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {selectionMode && (
            <div
              className="mt-1 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <Checkbox
                checked={isBulkSelected}
                onCheckedChange={(checked: boolean | 'indeterminate') => {
                  if ((checked === true && !isBulkSelected) || (checked === false && isBulkSelected)) {
                    onToggleSelect(String(conversation.display_id));
                  }
                }}
                aria-label={t('chatSidebar.selectConversation')}
                className="border-muted-foreground/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </div>
          )}
          <ContactAvatar
            contact={conversation.contact}
            channelType={channelType}
            channelProvider={channelProvider}
            size="mdlg"
            showRing
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 mb-1">
              <p className="font-medium truncate">
                {conversation.contact?.name || t('chatSidebar.contactNoName')}
              </p>
              {isPinned && <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
              {conversation.additional_attributes?.conversation_type === 'post' && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700 flex-shrink-0"
                  title="Facebook Post"
                >
                  <FileText className="h-2.5 w-2.5 mr-0.5" />
                  Post
                </Badge>
              )}
            </div>

            {phoneDisplay && (
              <p
                className="text-xs text-muted-foreground truncate"
                title={t('chatSidebar.phoneNumber')}
                aria-label={`${t('chatSidebar.phoneNumber')}: ${phoneDisplay}`}
              >
                {phoneDisplay}
              </p>
            )}

            <p className="text-sm text-muted-foreground truncate">{lastMessageText}</p>

            {/* Badges da conversa */}
            <ConversationBadges conversation={conversation} maxLabels={2} />

            {/* Assignee indicator badge */}
            {conversation?.assignee && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex items-center space-x-1.5 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 dark:bg-primary/20">
                  <UserIcon className="h-3 w-3 flex-shrink-0 text-primary dark:text-primary" />
                  <span
                    className="truncate max-w-32 text-primary dark:text-primary/90"
                    title={conversation.assignee?.name}
                  >
                    {conversation.assignee?.name}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">
          <span
            className="text-xs text-muted-foreground leading-none"
            title={formatDetailedTime(conversation.timestamp)}
          >
            {formatConversationTime(conversation.timestamp)}
          </span>
          <UnreadBadge
            count={unreadCount}
            ariaLabel={t('unreadBadge.ariaLabel', { count: unreadCount })}
          />
        </div>
      </div>
    </div>
  );

  return (
    <ContextMenu key={conversation.id}>
      <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem
          onClick={e => {
            e.stopPropagation();
            onStartSelection(String(conversation.display_id));
          }}
          className="flex items-center gap-2"
        >
          <Check className="h-4 w-4" />
          {t('chatSidebar.select')}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={e => {
            e.stopPropagation();
            if (isPinned) {
              onUnpin(conversation);
            } else {
              onPin(conversation);
            }
          }}
          className="flex items-center gap-2"
        >
          <Pin className="h-4 w-4" />
          {isPinned
            ? t('chatHeader.actions.unpinConversation')
            : t('chatHeader.actions.pinConversation')}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={e => {
            e.stopPropagation();
            if (isArchived) {
              onUnarchive(conversation);
            } else {
              onArchive(conversation);
            }
          }}
          className="flex items-center gap-2"
        >
          <Archive className="h-4 w-4" />
          {isArchived
            ? t('chatHeader.actions.unarchiveConversation')
            : t('chatHeader.actions.archiveConversation')}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={e => {
            e.stopPropagation();
            onDelete(conversation);
          }}
          className="flex items-center gap-2"
          variant="destructive"
        >
          <Trash2 className="h-4 w-4" />
          {t('chatHeader.actions.deleteConversation')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const ConversationCard = React.memo(ConversationCardComponent, (prev, next) => {
  return (
    prev.isSelected === next.isSelected &&
    prev.isBulkSelected === next.isBulkSelected &&
    prev.selectionMode === next.selectionMode &&
    prev.unreadCount === next.unreadCount &&
    prev.conversation.updated_at === next.conversation.updated_at &&
    prev.conversation.last_activity_at === next.conversation.last_activity_at &&
    prev.conversation.status === next.conversation.status &&
    prev.conversation.assignee_id === next.conversation.assignee_id &&
    prev.conversation.contact?.name === next.conversation.contact?.name &&
    prev.conversation.contact?.phone_number === next.conversation.contact?.phone_number &&
    prev.conversation.custom_attributes?.pinned === next.conversation.custom_attributes?.pinned &&
    prev.conversation.custom_attributes?.archived === next.conversation.custom_attributes?.archived &&
    prev.conversation.last_non_activity_message?.id === next.conversation.last_non_activity_message?.id
  );
});
