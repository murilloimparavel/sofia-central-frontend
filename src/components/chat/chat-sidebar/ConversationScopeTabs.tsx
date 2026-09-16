import { Inbox, MessageCircle, Users } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { BaseFilter } from '@/types/core/filters';
import type { ConversationFilter } from '@/types/chat/api';
import {
  CONVERSATION_SCOPE_PRESETS,
  getActiveConversationScope,
  type ConversationScopeId,
} from './conversationSegmentsHelpers';

interface Props {
  activeFilters: ConversationFilter[];
  onSelectScope: (filters: BaseFilter[]) => void;
  disabled?: boolean;
}

const TABS: Array<{ id: ConversationScopeId; icon: typeof MessageCircle; label: string }> = [
  { id: 'mine', icon: MessageCircle, label: 'Chats' },
  { id: 'unassigned', icon: Inbox, label: 'Fila' },
  { id: 'all', icon: Users, label: 'Todas' },
];

export default function ConversationScopeTabs({ activeFilters, onSelectScope, disabled = false }: Props) {
  const { t } = useLanguage('chat');
  const active = getActiveConversationScope(activeFilters) ?? 'all';

  return (
    <div className="grid grid-cols-3 gap-1 border-b bg-background px-2 py-2" role="tablist" aria-label="Escopo das conversas">
      {TABS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          disabled={disabled}
          onClick={() => onSelectScope(CONVERSATION_SCOPE_PRESETS[id])}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors ${
            active === id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
          <span>{id === 'all' ? t('chatSidebar.scopeTabs.all', label) : t(`chatSidebar.scopeTabs.${id}`, label)}</span>
        </button>
      ))}
    </div>
  );
}
