import type { Conversation, ConversationsQuery } from '@/types/chat/api';
import type { PaginationMeta } from '@/types/core';
import { matchesConversationId } from './conversationMatcher';
import { doesConversationMatchQuery } from './conversationMatch';

export interface ConversationQueryCacheEntry {
  conversations: Conversation[];
  pagination: PaginationMeta;
  query: ConversationsQuery;
}

const QUERY_CACHE_TTL_MS = 10_000;
const MAX_QUERY_CACHE_ENTRIES = 32;
const MAX_JOURNAL_EVENTS = 100;
const entries = new Map<string, ConversationQueryCacheEntry & { cachedAt: number }>();
let activeIdentity: string | null = null;
let revision = 0;
let journalFloor = 0;
type JournalEvent =
  | { revision: number; kind: 'upsert'; conversation: Conversation }
  | { revision: number; kind: 'scopeRemove'; conversationId: string; query: string }
  | { revision: number; kind: 'unread'; conversationId: string; count: number }
  | { revision: number; kind: 'unknown' };
type JournalInput =
  | { kind: 'upsert'; conversation: Conversation }
  | { kind: 'scopeRemove'; conversationId: string; query: string }
  | { kind: 'unread'; conversationId: string; count: number }
  | { kind: 'unknown' };
const journal: JournalEvent[] = [];

const recordEvent = (event: JournalInput) => {
  revision += 1;
  journal.push({ ...event, revision } as JournalEvent);
  if (journal.length > MAX_JOURNAL_EVENTS) {
    journalFloor = journal.shift()!.revision;
  }
};

// Ordena apenas as chaves de objetos. A ordem dos filtros e dos valores em
// arrays faz parte da consulta enviada ao backend e deve ser preservada.
const serializeQuery = (query: ConversationsQuery): string => JSON.stringify(query, (_key, value) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
});

const queryKey = (userId: string, accountId: string, query: ConversationsQuery): string =>
  JSON.stringify([userId, accountId, serializeQuery(query)]);

const ensureIdentity = (userId: string | null | undefined, accountId: string | null | undefined) => {
  if (!userId || !accountId) {
    if (activeIdentity) {
      entries.clear();
      journal.length = 0;
      activeIdentity = null;
      revision += 1;
      journalFloor = revision;
    }
    return null;
  }
  const nextIdentity = JSON.stringify([String(userId), String(accountId)]);
  if (activeIdentity !== nextIdentity) {
    entries.clear();
    journal.length = 0;
    activeIdentity = nextIdentity;
    revision += 1;
    journalFloor = revision;
  }
  return nextIdentity;
};

export function getConversationQueryCache(
  userId: string | null | undefined,
  accountId: string | null | undefined,
  query: ConversationsQuery,
): ConversationQueryCacheEntry | undefined {
  if (!ensureIdentity(userId, accountId)) return undefined;
  const key = queryKey(String(userId), String(accountId), query);
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt >= QUERY_CACHE_TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  return entry;
}

export function setConversationQueryCache(
  userId: string | null | undefined,
  accountId: string | null | undefined,
  entry: ConversationQueryCacheEntry,
): void {
  if (!ensureIdentity(userId, accountId)) return;
  const key = queryKey(String(userId), String(accountId), entry.query);
  entries.delete(key);
  entries.set(key, {
    ...entry,
    conversations: [...entry.conversations],
    pagination: { ...entry.pagination },
    cachedAt: Date.now(),
  });
  if (entries.size > MAX_QUERY_CACHE_ENTRIES) {
    entries.delete(entries.keys().next().value!);
  }
}

export function getConversationQueryCacheRevision(): number {
  return revision;
}

// Replay é propositalmente restrito: página 1, sem busca, filtros conhecidos e
// ordenação que o cliente consegue reproduzir. Fora disso o GET deve ser
// repetido em vez de substituir um evento local por uma resposta antiga.
const canReplayQuery = (query: ConversationsQuery): boolean => {
  if (isSearchQuery(query) || hasUnverifiableFilters(query)) return false;
  // POST /filter e sort_by não padronizado podem ordenar de modo diferente.
  if (query.kind === 'filter') return false;
  return Number(query.params.page ?? 1) === 1 &&
    (query.params.sort_by === undefined || query.params.sort_by === 'last_activity_at');
};

const hasCompleteMembership = (conversation: Conversation, query: ConversationsQuery): boolean => {
  const row = conversation as unknown as Record<string, unknown>;
  if (!row.id || !row.status || !row.created_at || !row.last_activity_at ||
    !('inbox_id' in row) || !('unread_count' in row)) return false;
  const attributes = query.kind === 'filter'
    ? query.request.filters.map(filter => filter.attribute_key)
    : Object.keys(query.params);
  if (attributes.some(attribute => ['assignee_type', 'assignee_id'].includes(attribute)) &&
    !('assignee_id' in row)) return false;
  if (attributes.includes('team_id') && !('team_id' in row)) return false;
  if (attributes.includes('labels') && !('labels' in row)) return false;
  if (attributes.includes('is_group') && !('is_group' in row)) return false;
  if (attributes.includes('channel_type') && !('channel' in row)) return false;
  if (attributes.includes('priority') && !('priority' in row)) return false;
  return true;
};

export function replayConversationQueryEvents(
  userId: string | null | undefined,
  accountId: string | null | undefined,
  fromRevision: number,
  entry: ConversationQueryCacheEntry,
): ConversationQueryCacheEntry | null {
  const identity = userId && accountId ? JSON.stringify([String(userId), String(accountId)]) : null;
  if (!identity || identity !== activeIdentity || fromRevision < journalFloor ||
    !canReplayQuery(entry.query)) return null;

  const events = journal.filter(event => event.revision > fromRevision);
  let rows = [...entry.conversations];
  let orderingChanged = false;
  let removedKnownRow = false;
  let totalDelta = 0;
  const pageSize = entry.pagination.page_size;
  if (!pageSize || pageSize < 1) return null;
  const hasUnknownNextPage = entry.pagination.has_next_page ??
    entry.pagination.page < entry.pagination.total_pages;
  if (hasUnknownNextPage && rows.length < pageSize) return null;
  for (const event of events) {
    if (event.kind === 'unknown') return null;
    if (event.kind === 'scopeRemove') {
      if (event.query === serializeQuery(entry.query)) {
        const presentOnPage = rows.some(row => matchesConversationId(row, event.conversationId));
        // Se há página seguinte, o ID ausente daqui ainda pode estar nela e
        // alterar total/paginação. Sem essa página, o replay não é demonstrável.
        if (!presentOnPage && hasUnknownNextPage) return null;
        if (presentOnPage) {
          removedKnownRow = true;
          totalDelta -= 1;
        }
        rows = rows.filter(row => !matchesConversationId(row, event.conversationId));
      }
      continue;
    }
    const index = rows.findIndex(row => matchesConversationId(row, event.kind === 'upsert'
      ? String(event.conversation.id) : event.conversationId));
    if (event.kind === 'unread') {
      const hasUnreadFilter = entry.query.kind === 'list'
        ? entry.query.params.unread !== undefined
        : entry.query.request.filters.some(filter => filter.attribute_key === 'unread');
      if (index < 0) {
        if (hasUnreadFilter) return null;
        continue;
      }
      const updated = { ...rows[index], unread_count: event.count };
      if (doesConversationMatchQuery(updated, entry.query, String(userId))) rows[index] = updated;
      else {
        rows.splice(index, 1);
        removedKnownRow = true;
        totalDelta -= 1;
      }
      continue;
    }
    // Um payload parcial não prova que campos de membership ausentes ficaram
    // iguais aos da resposta REST; nunca completá-lo com a linha potencialmente
    // antiga para decidir se a conversa pertence ao filtro.
    if (!hasCompleteMembership(event.conversation, entry.query)) return null;
    if (index < 0 && (!event.conversation.contact || !event.conversation.inbox ||
      !event.conversation.display_id)) return null;
    const updated = index >= 0 ? { ...rows[index], ...event.conversation } : event.conversation;
    const previous = index >= 0 ? rows[index] : null;
    if (index >= 0) rows.splice(index, 1);
    if (doesConversationMatchQuery(updated, entry.query, String(userId))) {
      // Com página seguinte, a linha ausente pode já existir nela. Não é
      // possível saber se o total aumentou ou se ela apenas mudou de página.
      if (index < 0 && hasUnknownNextPage) return null;
      if (index < 0) totalDelta += 1;
      rows.push(updated);
      orderingChanged = true;
      if (previous && Date.parse(updated.last_activity_at) < Date.parse(previous.last_activity_at)) {
        removedKnownRow = true;
      }
    } else if (previous) {
      removedKnownRow = true;
      totalDelta -= 1;
    }
  }

  if (removedKnownRow && hasUnknownNextPage) return null;

  if (orderingChanged) {
    const timestamps = rows.map(row => Date.parse(row.last_activity_at));
    if (timestamps.some(time => !Number.isFinite(time)) ||
      new Set(timestamps).size !== timestamps.length) return null;
    rows.sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at));
  }
  const overflow = rows.length > pageSize;
  rows = rows.slice(0, pageSize);
  const total = Math.max(rows.length + (overflow ? 1 : 0), (entry.pagination.total ?? 0) + totalDelta);
  const totalPages = Math.ceil(total / pageSize);
  return {
    ...entry,
    conversations: rows,
    pagination: { ...entry.pagination, total, total_pages: totalPages,
      has_next_page: totalPages > 1 },
  };
}

export function invalidateConversationQueryCache(): void {
  entries.clear();
  recordEvent({ kind: 'unknown' });
}

const isSearchQuery = (query: ConversationsQuery): boolean =>
  query.kind === 'list' ? Boolean(query.params.q) : Boolean((query.request as { q?: string }).q);

const supportedAdvancedAttributes = new Set([
  'status', 'inbox_id', 'assignee_id', 'assignee_type', 'team_id',
  'channel_type', 'priority', 'unread', 'is_group', 'labels',
]);

const hasUnverifiableFilters = (query: ConversationsQuery): boolean =>
  query.kind === 'filter'
    ? query.request.filters.some(filter => !supportedAdvancedAttributes.has(filter.attribute_key))
    : query.params.unanswered !== undefined || query.params.archived !== undefined ||
      query.params.conversation_type !== undefined;

// Uma linha que muda de posição pode deslocar os limites da paginação.
// O cache aquecido é invalidado em toda mudança de atividade, inclusive na
// primeira página, para não manter uma ordem antiga.
const changesPageBoundary = (
  entry: ConversationQueryCacheEntry,
  previous: Conversation,
  next: Conversation,
): boolean => {
  const page = entry.query.kind === 'list' ? entry.query.params.page : entry.query.request.page;
  const sortBy = entry.query.kind === 'list' ? entry.query.params.sort_by : undefined;
  const activityChanged = previous.last_activity_at !== next.last_activity_at;
  const priorityChanged = previous.priority !== next.priority;
  if (sortBy === 'created_at' && previous.created_at !== next.created_at) return true;
  if (activityChanged) return true;
  if (Number(page ?? 1) > 1 && priorityChanged) return true;
  if (priorityChanged && sortBy === 'priority') return true;
  return false;
};

// Eventos com uma conversa completa podem preservar snapshots de filtros que
// ela não afeta e atualizar a linha já presente. Busca textual depende do
// backend; entradas nas quais ela poderia entrar/sair são descartadas.
export function reconcileConversationQueryCache(conversation: Conversation): void {
  recordEvent({ kind: 'upsert', conversation });
  const userId = activeIdentity ? JSON.parse(activeIdentity)[0] as string : undefined;
  for (const [key, entry] of entries) {
    const index = entry.conversations.findIndex(row => matchesConversationId(row, String(conversation.id)));
    // Um evento fora da página pode deslocar a fronteira ou alterar o total.
    // Payload parcial não basta para validar membership da entrada aquecida.
    if (index < 0 || !hasCompleteMembership(conversation, entry.query)) {
      entries.delete(key);
      continue;
    }
    const row = { ...entry.conversations[index], ...conversation };
    const matches = doesConversationMatchQuery(row, entry.query, userId);
    if (isSearchQuery(entry.query) || hasUnverifiableFilters(entry.query) ||
      changesPageBoundary(entry, entry.conversations[index], row) || !matches) {
      entries.delete(key);
      continue;
    }
    const conversations = [...entry.conversations];
    conversations[index] = row;
    entries.set(key, { ...entry, conversations });
  }
}

export function evictConversationFromQueryCache(
  conversationId: string | number,
  scope?: { query: ConversationsQuery; userId: string | null | undefined; accountId: string | null | undefined },
): void {
  // Remover da view ativa não significa exclusão da conversa em outras views.
  // Sem a query de origem não há como provar o efeito sobre uma REST em voo.
  const scopeIdentity = scope?.userId && scope?.accountId
    ? JSON.stringify([String(scope.userId), String(scope.accountId)]) : null;
  recordEvent(scope && scopeIdentity === activeIdentity
    ? { kind: 'scopeRemove', conversationId: String(conversationId), query: serializeQuery(scope.query) }
    : { kind: 'unknown' });
  // A saída de uma view pode deslocar conversas em páginas onde este ID não
  // aparece. Sem os limites de todas as páginas, nenhum snapshot é garantido.
  entries.clear();
}

export function patchUnreadInConversationQueryCache(conversationId: string, count: number): void {
  recordEvent({ kind: 'unread', conversationId, count });
  for (const [key, entry] of entries) {
    const index = entry.conversations.findIndex(row => matchesConversationId(row, conversationId));
    const unreadFilter = entry.query.kind === 'list' ? entry.query.params.unread : undefined;
    const advancedUnread = entry.query.kind === 'filter' &&
      entry.query.request.filters.some(filter => filter.attribute_key === 'unread');
    const matchesUnread = count > 0;
    if (hasUnverifiableFilters(entry.query) || advancedUnread || (unreadFilter !== undefined && index < 0) ||
      (unreadFilter !== undefined &&
      (index < 0 ? matchesUnread === unreadFilter : matchesUnread !== unreadFilter))) {
      entries.delete(key);
      continue;
    }
    if (index >= 0) {
      const conversations = [...entry.conversations];
      conversations[index] = { ...conversations[index], unread_count: count };
      entries.set(key, { ...entry, conversations });
    }
  }
}

export function clearConversationQueryCache(): void {
  entries.clear();
  journal.length = 0;
  activeIdentity = null;
  revision += 1;
  journalFloor = revision;
}
