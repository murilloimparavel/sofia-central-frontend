import { Bot, Inbox, MessageCircle, Users } from 'lucide-react';
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
  { id: 'bot', icon: Bot, label: 'Robô' },
  { id: 'all', icon: Users, label: 'Todas' },
];

export default function ConversationScopeTabs({ activeFilters, onSelectScope, disabled = false }: Props) {
  const { t } = useLanguage('chat');
  const active = getActiveConversationScope(activeFilters);

  return (
    <div className="grid grid-cols-4 gap-1 border-b bg-background px-1.5 py-2" role="tablist" aria-label="Escopo das conversas">
      {TABS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          disabled={disabled}
          onClick={() => onSelectScope(CONVERSATION_SCOPE_PRESETS[id])}
          className={`flex min-h-10 items-center justify-center gap-1 rounded-lg px-1.5 text-xs sm:text-sm font-medium transition-colors ${
            active === id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{t(`chatSidebar.scopeTabs.${id}`, label)}</span>
        </button>
      ))}
    </div>
  );
}
