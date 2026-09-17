import type { Conversation, ConversationsQuery } from '@/types/chat/api';
import type { PaginationMeta } from '@/types/core';
import type { ConversationScopeId } from '@/components/chat/chat-sidebar/conversationSegmentsHelpers';
import { matchesConversationId } from './conversationMatcher';

export interface ScopeCacheEntry {
  conversations: Conversation[];
  pagination: PaginationMeta;
  query: ConversationsQuery;
  timestamp: number;
}

const SCOPE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const scopeCache = new Map<ConversationScopeId, ScopeCacheEntry>();

export function getScopeCache(scopeId: ConversationScopeId): ScopeCacheEntry | undefined {
  const entry = scopeCache.get(scopeId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > SCOPE_CACHE_TTL_MS) {
    scopeCache.delete(scopeId);
    return undefined;
  }
  return entry;
}

export function setScopeCache(
  scopeId: ConversationScopeId,
  entry: Omit<ScopeCacheEntry, 'timestamp'>,
): void {
  scopeCache.set(scopeId, {
    ...entry,
    timestamp: Date.now(),
  });
}

export function evictFromScopeCache(
  scopeId: ConversationScopeId,
  conversationId: string | number,
): void {
  const entry = scopeCache.get(scopeId);
  if (!entry) return;
  const idStr = String(conversationId);
  const filtered = entry.conversations.filter(c => !matchesConversationId(c, idStr));
  if (filtered.length !== entry.conversations.length) {
    scopeCache.set(scopeId, {
      ...entry,
      conversations: filtered,
      pagination: {
        ...entry.pagination,
        total: Math.max(0, (entry.pagination.total ?? entry.conversations.length) - 1),
      },
      timestamp: Date.now(),
    });
  }
}

export function addOrUpdateInScopeCache(
  scopeId: ConversationScopeId,
  conversation: Conversation,
): void {
  const entry = scopeCache.get(scopeId);
  if (!entry) return;
  const idStr = String(conversation.id);
  const exists = entry.conversations.some(c => matchesConversationId(c, idStr));
  const updatedConversations = exists
    ? entry.conversations.map(c => (matchesConversationId(c, idStr) ? { ...c, ...conversation } : c))
    : [conversation, ...entry.conversations];

  scopeCache.set(scopeId, {
    ...entry,
    conversations: updatedConversations,
    pagination: {
      ...entry.pagination,
      total: (entry.pagination.total ?? entry.conversations.length) + (exists ? 0 : 1),
    },
    timestamp: Date.now(),
  });
}

export function clearScopeCache(): void {
  scopeCache.clear();
}
