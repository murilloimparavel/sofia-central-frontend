import { Conversation } from '@/types/chat/api';
import { Button } from '@evoapi/design-system/button';
import { ConversationCard } from './ConversationCard';
import { ConversationSkeleton } from '../loading-states';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  selectedConversationIds: Set<string>;
  selectionMode: boolean;
  isLoadingMore: boolean;
  hasNextPage: boolean;
  unreadCount: (conversationId: string) => number;
  onSelect: (conversation: Conversation) => void;
  onToggleSelect: (displayId: string) => void;
  onStartSelection: (conversation: Conversation) => void;
  onPin: (conversation: Conversation) => void;
  onUnpin: (conversation: Conversation) => void;
  onArchive: (conversation: Conversation) => void;
  onUnarchive: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
  onLoadMore: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  selectedConversationIds,
  selectionMode,
  isLoadingMore,
  hasNextPage,
  unreadCount,
  onSelect,
  onToggleSelect,
  onStartSelection,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onDelete,
  onLoadMore,
  t,
}: ConversationListProps) {
  return (
    <>
      {conversations.map(conversation => {
        const canonicalId = String(conversation.uuid || conversation.id);
        const isSelected =
          String(selectedConversationId) === String(conversation.id) ||
          String(selectedConversationId) === canonicalId;
        const isBulkSelected =
          selectionMode && selectedConversationIds.has(String(conversation.display_id));

        return (
          <ConversationCard
            key={conversation.id}
            conversation={conversation}
            isSelected={isSelected}
            isBulkSelected={isBulkSelected}
            selectionMode={selectionMode}
            unreadCount={unreadCount(conversation.id) || 0}
            onSelect={onSelect}
            onToggleSelect={onToggleSelect}
            onStartSelection={onStartSelection}
            onPin={onPin}
            onUnpin={onUnpin}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
            t={t}
          />
        );
      })}

      {isLoadingMore && (
        <div className="border-t border-border/40">
          <ConversationSkeleton count={5} />
        </div>
      )}

      {!isLoadingMore && hasNextPage && (
        <div className="p-3 border-t border-border/40">
          <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore}>
            Carregar mais
          </Button>
        </div>
      )}
    </>
  );
}
