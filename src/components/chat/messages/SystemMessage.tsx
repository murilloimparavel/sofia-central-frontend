import React from 'react';
import {
  User,
  Users,
  Tag,
  Clock,
  CheckCircle,
  AlertCircle,
  Settings,
  Star,
  ArrowUp,
  ArrowDown,
  Mail,
  MessageCircle,
  Shield,
  Zap,
  Calendar,
  FileText,
  Activity,
} from 'lucide-react';
import { Message } from '@/types/chat/api';
import { formatMessageTime } from '@/utils/time/timeHelpers';

interface SystemMessageProps {
  message: Message;
  labels?: Array<{ id: string; title: string; color: string }>;
}

// Mapeamento de ações do sistema para ícones
const getSystemMessageIcon = (content: string) => {
  const lowerContent = content.toLowerCase();

  // Prioridade
  if (lowerContent.includes('priority')) {
    if (lowerContent.includes('high') || lowerContent.includes('urgent')) {
      return ArrowUp;
    } else if (lowerContent.includes('low')) {
      return ArrowDown;
    }
    return AlertCircle;
  }

  // Status da conversa
  if (
    lowerContent.includes('resolved') ||
    lowerContent.includes('resolvida') ||
    lowerContent.includes('pending') ||
    lowerContent.includes('pendente') ||
    lowerContent.includes('reopened') ||
    lowerContent.includes('reaberta') ||
    lowerContent.includes('status')
  ) {
    if (lowerContent.includes('resolved') || lowerContent.includes('resolvida')) {
      return CheckCircle;
    } else if (lowerContent.includes('pending') || lowerContent.includes('pendente')) {
      return Clock;
    } else if (lowerContent.includes('reopened') || lowerContent.includes('reaberta')) {
      return MessageCircle;
    }
    return Activity;
  }

  // Atribuições
  if (
    lowerContent.includes('assigned') ||
    lowerContent.includes('atribuída') ||
    lowerContent.includes('assignee') ||
    lowerContent.includes('agent') ||
    lowerContent.includes('team') ||
    lowerContent.includes('time')
  ) {
    if (lowerContent.includes('team') || lowerContent.includes('time')) {
      return Users;
    }
    return User;
  }

  // Etiquetas
  if (
    lowerContent.includes('label') ||
    lowerContent.includes('etiqueta') ||
    lowerContent.includes('tag')
  ) {
    return Tag;
  }

  // Avaliação/Rating
  if (lowerContent.includes('rating') || lowerContent.includes('avaliação')) {
    return Star;
  }

  // Configurações/Settings
  if (lowerContent.includes('settings') || lowerContent.includes('configuração')) {
    return Settings;
  }

  // Email/Mensagem
  if (lowerContent.includes('email') || lowerContent.includes('message')) {
    return Mail;
  }

  // Automação/Bot
  if (
    lowerContent.includes('bot') ||
    lowerContent.includes('automation') ||
    lowerContent.includes('automação')
  ) {
    return Zap;
  }

  // Agendamento
  if (lowerContent.includes('scheduled') || lowerContent.includes('agendada')) {
    return Calendar;
  }

  // Nota/Anotação
  if (lowerContent.includes('note') || lowerContent.includes('nota')) {
    return FileText;
  }

  // Segurança/Permissão
  if (
    lowerContent.includes('permission') ||
    lowerContent.includes('security') ||
    lowerContent.includes('permissão')
  ) {
    return Shield;
  }

  // Padrão para mensagens de sistema genéricas
  return Activity;
};

const getActivityIcon = (action: string) => {
  if (action.startsWith('label')) return Tag;
  if (action.startsWith('team')) return Users;
  if (action.startsWith('assignee')) return User;
  if (action.startsWith('status')) return Activity;
  if (action.startsWith('priority')) return AlertCircle;
  return Activity;
};

const SystemMessage: React.FC<SystemMessageProps> = ({ message, labels = [] }) => {
  const activityEvent = message.content_attributes?.activity_event;
  const IconComponent = activityEvent?.action
    ? getActivityIcon(activityEvent.action)
    : getSystemMessageIcon(message.content);
  const actorCaption = activityEvent?.actor?.type === 'automation'
    ? `Regra: ${activityEvent.actor.name}`
    : undefined;

  // Formatação do timestamp - usando a mesma função das mensagens normais
  const timestamp = formatMessageTime(message.created_at);

  // Extrair IDs de labels do conteúdo (padrão UUID ou número)
  const extractLabelIds = (content: string): string[] => {
    // Regex para UUIDs
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    // Regex para números simples quando aparecem sozinhos (ex: "added 39")
    const numberRegex = /\b(\d+)\b/g;

    const uuids = content.match(uuidRegex) || [];
    const numbers = content.match(numberRegex) || [];

    return [...uuids, ...numbers];
  };

  // Structured activity metadata is authoritative. Keep UUID parsing only for
  // legacy activity messages that predate this metadata.
  const eventLabelNames = activityEvent?.target?.type === 'labels' ? activityEvent.target.names || [] : [];
  const isLegacyLabelActivity = /label|etiqueta|tag|marcador/i.test(message.content);
  const mentionedLabelIds = eventLabelNames.length || !isLegacyLabelActivity ? [] : extractLabelIds(message.content);
  const mentionedLabels = eventLabelNames.length
    ? eventLabelNames.map((name, index) => {
        const knownLabel = labels.find(label => label.title === name);
        return knownLabel || { id: `${activityEvent?.event_id}-${index}`, title: name, color: '#64748b' };
      })
    : mentionedLabelIds
        .map(id => labels.find(l => String(l.id) === id))
        .filter((label): label is { id: string; title: string; color: string } => Boolean(label));

  // Se tem labels, renderizar com badges
  if (mentionedLabels.length > 0) {
    // Remover IDs do texto para melhor legibilidade
    let cleanContent = message.content;
    mentionedLabelIds.forEach(id => {
      cleanContent = cleanContent.replace(id, '').replace(/\s+/g, ' ').trim();
    });

    return (
      <div className="text-center py-4">
        <div className="inline-flex flex-col items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <IconComponent
              className="w-3 h-3 text-muted-foreground/70 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="font-medium">{cleanContent}</span>
            <span className="text-muted-foreground/60 text-xs ml-1 hidden sm:inline">{timestamp}</span>
          </div>
          {actorCaption && <span className="text-muted-foreground/70 text-[11px]">{actorCaption}</span>}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {mentionedLabels.map(label => (
              <div
                key={label.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full text-white"
                style={{ backgroundColor: label.color }}
              >
                <Tag className="w-2.5 h-2.5" />
                <span>{label.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
        <IconComponent
          className="w-3 h-3 text-muted-foreground/70 flex-shrink-0"
          aria-hidden="true"
        />
        <span className="font-medium">{message.content}</span>
        <span className="text-muted-foreground/60 text-xs ml-1 hidden sm:inline">{timestamp}</span>
        {actorCaption && <span className="text-muted-foreground/70 text-[11px]">{actorCaption}</span>}
      </div>
    </div>
  );
};

export default SystemMessage;
