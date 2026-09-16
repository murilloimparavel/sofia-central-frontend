import { toast } from 'sonner';
import { ConversationFilter, ConversationListParams } from '@/types/chat/api';
import { useAuthStore } from '@/store/authStore';
import i18n from '@/i18n/config';

const ADDITIONAL_ATTRIBUTE_KEYS = [
  'browser_language',
  'conversation_language',
  'country_code',
  'referer',
  'mail_subject',
];

// Rewrites assignee_type / assignee_id filter rows so they target the real
// column assignee_id on the backend. The attribute assignee_type exists only
// on the frontend catalog; it needs semantic translation when heading into
// the POST /conversations/filter payload.
const rewriteAssigneeRow = (filter: ConversationFilter): ConversationFilter | null => {
  const { attribute_key, values } = filter;
  if (attribute_key !== 'assignee_type' && attribute_key !== 'assignee_id') {
    return filter;
  }
  const value = Array.isArray(values) ? values[0] : values;

  if (attribute_key === 'assignee_id' && typeof value === 'string' && !['me', 'unassigned', 'assigned', 'all'].includes(value)) {
    return filter;
  }

  switch (value) {
    case 'me': {
      const currentUserId = useAuthStore.getState().currentUser?.id;
      if (!currentUserId) {
        console.warn(
          '[filterConverters] assignee "me" filter dropped: no current user in auth store (session expired?)',
        );
        toast.error(i18n.t('chat:conversationsFilter.errors.assigneeMeNoSession.title'), {
          description: i18n.t('chat:conversationsFilter.errors.assigneeMeNoSession.description'),
        });
        return null;
      }
      return { ...filter, attribute_key: 'assignee_id', filter_operator: 'equal_to', values: [currentUserId] };
    }
    case 'unassigned':
      return { ...filter, attribute_key: 'assignee_id', filter_operator: 'is_not_present', values: [] };
    case 'assigned':
      return { ...filter, attribute_key: 'assignee_id', filter_operator: 'is_present', values: [] };
    case 'all':
      return null;
    default:
      return { ...filter, attribute_key: 'assignee_id' };
  }
};

interface FilterApiItem {
  attribute_key: string;
  filter_operator: string;
  values: unknown[];
  query_operator: string | null;
  custom_attribute_type?: string;
}

/**
 * Converte filtros do modal para o formato da API do CRM Chat (POST /conversations/filter)
 */
export const convertFiltersToApiFormat = (
  filters: ConversationFilter[],
): { filters: FilterApiItem[] } => {
  const rewritten = filters
    .map(rewriteAssigneeRow)
    .filter((f): f is ConversationFilter => f !== null);

  const filterArray: FilterApiItem[] = rewritten.map((filter, index) => {
    const { attribute_key, filter_operator, values } = filter;
    const query_operator =
      index === 0 ? null : (filter.query_operator || 'and').toUpperCase();

    const filterItem: FilterApiItem = {
      attribute_key,
      filter_operator,
      values,
      query_operator,
    };

    if (ADDITIONAL_ATTRIBUTE_KEYS.includes(attribute_key)) {
      filterItem.custom_attribute_type = '';
    }

    return filterItem;
  });

  return { filters: filterArray };
};

/**
 * Converte filtros simples para parâmetros da URL (GET /conversations)
 */
export const convertFiltersToUrlParams = (
  filters: ConversationFilter[],
): ConversationListParams => {
  const params: ConversationListParams = {};

  filters.forEach(filter => {
    const { attribute_key, values } = filter;

    switch (attribute_key) {
      case 'status':
        if (values.length === 1) {
          params.status = values[0] as ConversationListParams['status'];
        }
        break;

      case 'assignee_id':
        if (values.length === 1) {
          const value = values[0];
          if (value === 'me') {
            params.assignee_type = 'me';
          } else if (value === 'unassigned') {
            params.assignee_type = 'unassigned';
          } else {
            params.assignee_id = value as string;
          }
        }
        break;

      // O modal usa attribute_key 'assignee_type' (me/unassigned/assigned/all).
      // Sem este case ele era DROPADO no GET → "Assigned" mostrava tudo. O finder
      // (apply_assignee_type_filter) trata me/unassigned/assigned/all direto.
      case 'assignee_type':
        if (values.length === 1) {
          params.assignee_type = values[0] as ConversationListParams['assignee_type'];
        }
        break;

      case 'inbox_id':
        if (values.length === 1) {
          params.inbox_id = values[0] as string;
        }
        break;

      case 'team_id':
        if (values.length === 1) {
          params.team_id = values[0] as string;
        }
        break;

      case 'labels':
        if (values.length > 0) {
          params.labels = values as string[];
        }
        break;

      // Chips "Não lidas" / "Grupos" (eixo de navegação, não status) → GET barato.
      case 'unread':
        if (values.length === 1) {
          params.unread = String(values[0]) === 'true';
        }
        break;

      // EVO-1963: "Não respondidas" — abertas aguardando resposta do agente.
      case 'unanswered':
        if (values.length === 1) {
          params.unanswered = String(values[0]) === 'true';
        }
        break;

      case 'is_group':
        if (values.length === 1) {
          params.is_group = String(values[0]) === 'true';
        }
        break;

      // case 'priority': // Não suportado pela API GET
      //   if (values.length === 1) {
      //     params.priority = values[0] as string;
      //   }
      //   break;
    }
  });

  // Sem linha de status nos filtros, NÃO deixar o backend cair no default
  // implícito status=open (footgun: filtrar por inbox/atendente/label sem status
  // trazia só abertas). status ausente = All, coerente com a visão padrão.
  if (!params.status) {
    params.status = 'all';
  }

  return params;
};

const GET_SUPPORTED_ATTRIBUTES = new Set([
  'status',
  'assignee_type',
  'assignee_id',
  'inbox_id',
  'team_id',
  'labels',
  'unread',
  'unanswered',
  'is_group',
]);

/**
 * Determina se deve usar filtros avançados (POST /conversations/filter)
 * ou filtros simples via query params (GET /conversations).
 *
 * Filtros simples que utilizam atributos nativos indexados e operador equal_to
 * com conjunção AND são roteados para GET direto, garantindo tempo de resposta sub-200ms.
 */
export const shouldUseAdvancedFilters = (filters: ConversationFilter[]): boolean => {
  // Sem filtros, GET simples vazio é suficiente.
  if (filters.length === 0) return false;

  // Operadores OR requerem POST (GET expressa apenas AND na URL)
  const hasOrOperator = filters.some(f => f.query_operator?.toLowerCase() === 'or');
  if (hasOrOperator) return true;

  // Evitar chaves duplicadas no GET que sobrescreveriam o parâmetro (exceto se for labels)
  const seenKeys = new Set<string>();
  for (const filter of filters) {
    if (filter.attribute_key !== 'labels' && seenKeys.has(filter.attribute_key)) {
      return true;
    }
    seenKeys.add(filter.attribute_key);
  }

  // Verificar se cada filtro é compatível com o endpoint GET
  return filters.some(filter => {
    const { attribute_key, filter_operator, values } = filter;

    // Atributos não mapeados no GET (ex: prioridade, datas, atributos customizados, contato)
    if (!GET_SUPPORTED_ATTRIBUTES.has(attribute_key)) {
      return true;
    }

    // Apenas equal_to é suportado no GET
    if (filter_operator !== 'equal_to') {
      return true;
    }

    // Valores múltiplos: apenas 'labels' suporta array no GET.
    // Campos como status, inbox, assignee aceitam apenas 1 valor escalar.
    if (Array.isArray(values) && values.length > 1 && attribute_key !== 'labels') {
      return true;
    }

    return false;
  });
};

/**
 * Cria filtro de busca por texto
 */
export const createSearchFilter = (searchTerm: string): ConversationListParams => {
  return {
    q: searchTerm.trim(),
  };
};

/**
 * Combina parâmetros de busca com filtros
 */
export const combineSearchWithFilters = (
  searchParams: ConversationListParams,
  filterParams: ConversationListParams,
): ConversationListParams => {
  return {
    ...filterParams,
    ...searchParams,
  };
};
