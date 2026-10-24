import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { chatService } from '@/services/chat/chatService';
import { extractConversationsData } from '@/utils/chat/responseHelpers';
import { ConversationFilter, QuickFilterTab, Conversation, ConversationsQuery } from '@/types/chat/api';
import { PaginationMeta } from '@/types/core';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuthStore } from '@/store/authStore';
import { useAppDataStore } from '@/store/appDataStore';
import {
  getConversationQueryCache,
  getConversationQueryCacheRevision,
  replayConversationQueryEvents,
  setConversationQueryCache,
} from '@/utils/chat/conversationQueryCache';
import {
  convertFiltersToApiFormat,
  convertFiltersToUrlParams,
  shouldUseAdvancedFilters,
  createSearchFilter,
  combineSearchWithFilters,
} from '@/utils/chat/filterConverters';

interface FiltersState {
  // Filters
  activeFilters: ConversationFilter[];
  quickFilterTab: QuickFilterTab;
  searchTerm: string;
  isApplyingFilters: boolean;
}

type FiltersAction =
  | { type: 'SET_ACTIVE_FILTERS'; payload: ConversationFilter[] }
  | { type: 'SET_QUICK_FILTER_TAB'; payload: QuickFilterTab }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_APPLYING_FILTERS'; payload: boolean };

// 🎯 FILTRO PADRÃO = "All": todos os status (status=all). EXPLÍCITO (nunca [])
// para o matcher de realtime fazer match-all sem vazar; status é navegação
// (chips), não filtro. Baseline do realtime + alvo do "Limpar filtros".
export const DEFAULT_FILTER: ConversationFilter = {
  attribute_key: 'status',
  filter_operator: 'equal_to',
  values: ['all'],
  query_operator: 'and',
};

const initialState: FiltersState = {
  activeFilters: [DEFAULT_FILTER],
  quickFilterTab: 'all',
  searchTerm: '',
  isApplyingFilters: false,
};

function filtersReducer(state: FiltersState, action: FiltersAction): FiltersState {
  switch (action.type) {
    case 'SET_ACTIVE_FILTERS':
      return {
        ...state,
        activeFilters: action.payload,
      };

    case 'SET_QUICK_FILTER_TAB':
      return {
        ...state,
        quickFilterTab: action.payload,
      };

    case 'SET_SEARCH_TERM':
      return {
        ...state,
        searchTerm: action.payload,
      };

    case 'SET_APPLYING_FILTERS':
      return {
        ...state,
        isApplyingFilters: action.payload,
      };

    default:
      return state;
  }
}

interface FiltersContextValue {
  state: FiltersState;

  // Filter actions
  setFilters: (filters: ConversationFilter[]) => void;
  applyFilters: (
    filters: ConversationFilter[],
    onSuccess: (conversations: Conversation[], pagination: PaginationMeta, query?: ConversationsQuery) => void,
    onError: (error: string) => void,
  ) => Promise<void>;
  applySearch: (
    searchTerm: string,
    onSuccess: (conversations: Conversation[], pagination: PaginationMeta, query?: ConversationsQuery) => void,
    onError: (error: string) => void,
  ) => Promise<void>;
  setQuickFilter: (tab: QuickFilterTab) => void;
  setSearchTerm: (term: string) => void;

  // Computed values
  hasActiveFilters: boolean;
  hasSearch: boolean;
}

const FiltersContext = createContext<FiltersContextValue | undefined>(undefined);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage('chat');
  const userId = useAuthStore(store => store.currentUser?.id);
  const accountId = useAppDataStore(store => store.account?.id);
  const [state, dispatch] = useReducer(filtersReducer, initialState);
  const latestRequestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      latestRequestRef.current += 1;
    };
  }, []);

  // Um cache fresco substitui a lista uma única vez e não dispara REST. Quando
  // expira, a lista atual permanece visível até a resposta chegar, evitando o
  // ciclo cache→rede que causava flash e mudança brusca do scroll.
  const resolveQuery = useCallback(async (
    query: ConversationsQuery,
    requestId: number,
    onSuccess: (conversations: Conversation[], pagination: PaginationMeta, query: ConversationsQuery) => void,
  ): Promise<boolean> => {
    if (useAuthStore.getState().currentUser?.id !== userId) return false;
    // Na abertura, a conta pode chegar enquanto a lista já carrega. Adoção é
    // permitida apenas de conta ausente para definida; troca de conta/sessão
    // descarta a resposta antiga.
    let requestAccountId = accountId;
    const initialAccountId = useAppDataStore.getState().account?.id;
    if (requestAccountId !== initialAccountId) {
      if (requestAccountId == null && initialAccountId != null) requestAccountId = initialAccountId;
      else return false;
    }
    const cached = getConversationQueryCache(userId, requestAccountId, query);
    if (cached) {
      if (requestId !== latestRequestRef.current) return false;
      onSuccess(cached.conversations, cached.pagination, query);
      return true;
    }

    dispatch({ type: 'SET_APPLYING_FILTERS', payload: true });
    const canContinue = () => {
      const liveAccountId = useAppDataStore.getState().account?.id;
      return mountedRef.current && requestId === latestRequestRef.current &&
        useAuthStore.getState().currentUser?.id === userId &&
        (liveAccountId === requestAccountId ||
          (requestAccountId == null && liveAccountId != null));
    };
    const fetchQuery = () => query.kind === 'filter'
      ? chatService.filterConversations(query.request)
      : chatService.getConversations(query.params);
    // Uma consulta em voo recebe um journal limitado dos eventos posteriores.
    // Se não for possível reconciliar com segurança, repetimos no máximo duas
    // vezes; nenhuma resposta obsoleta é aplicada ou salva como cache fresco.
    const retryDeadline = Date.now() + 2_000;
    for (let attempt = 0; attempt < 3 && canContinue(); attempt += 1) {
      const liveAccountId = useAppDataStore.getState().account?.id;
      if (requestAccountId == null && liveAccountId != null) requestAccountId = liveAccountId;
      const cacheRevision = getConversationQueryCacheRevision();
      const response = await fetchQuery();
      if (!canContinue()) return false;
      const sameAccount = useAppDataStore.getState().account?.id === requestAccountId;
      const extracted = extractConversationsData(response);
      if (sameAccount) {
        const entry = { ...extracted, query };
        const safeEntry = cacheRevision === getConversationQueryCacheRevision()
          ? entry
          : replayConversationQueryEvents(userId, requestAccountId, cacheRevision, entry);
        if (safeEntry) {
          onSuccess(safeEntry.conversations, safeEntry.pagination, query);
          setConversationQueryCache(userId, requestAccountId, safeEntry);
          return true;
        }
      }
      if (attempt === 2 || Date.now() >= retryDeadline) break;
      await new Promise(resolve => setTimeout(resolve, 150));
      if (!canContinue()) return false;
    }
    if (!canContinue()) return false;
    throw new Error('A lista mudou durante o carregamento. Tente novamente.');
  }, [userId, accountId]);

  // Filter actions
  const setFilters = useCallback((filters: ConversationFilter[]) => {
    dispatch({ type: 'SET_ACTIVE_FILTERS', payload: filters });
  }, []);

  const applyFilters = useCallback(
    async (
      filters: ConversationFilter[],
      onSuccess: (conversations: Conversation[], pagination: PaginationMeta, query?: ConversationsQuery) => void,
      onError: (error: string) => void,
    ) => {
      const requestId = ++latestRequestRef.current;

      try {
        const query: ConversationsQuery = filters.length === 0
          ? { kind: 'list', params: {} }
          : shouldUseAdvancedFilters(filters)
            ? { kind: 'filter', request: convertFiltersToApiFormat(filters) }
            : { kind: 'list', params: convertFiltersToUrlParams(filters) };
        if (await resolveQuery(query, requestId, onSuccess)) {
          dispatch({ type: 'SET_ACTIVE_FILTERS', payload: filters });
        }
      } catch (error) {
        if (requestId !== latestRequestRef.current) return;
        const errorMessage =
          error instanceof Error ? error.message : t('contexts.filters.errors.applyFilters');
        onError(errorMessage);
        toast.error(t('contexts.filters.errors.applyFilters'), {
          description: errorMessage,
        });
      } finally {
        if (requestId === latestRequestRef.current) {
          dispatch({ type: 'SET_APPLYING_FILTERS', payload: false });
        }
      }
    },
    [t, resolveQuery],
  );

  const applySearch = useCallback(
    async (
      searchTerm: string,
      onSuccess: (conversations: Conversation[], pagination: PaginationMeta, query?: ConversationsQuery) => void,
      onError: (error: string) => void,
    ) => {
      const requestId = ++latestRequestRef.current;
      dispatch({ type: 'SET_SEARCH_TERM', payload: searchTerm });

      if (!searchTerm.trim()) {
        // Se busca vazia, recarregar com filtros ativos
        if (state.activeFilters.length > 0) {
          await applyFilters(state.activeFilters, onSuccess, onError);
        } else {
          // Carregar conversas normais
          try {
            await resolveQuery({ kind: 'list', params: {} }, requestId, onSuccess);
          } catch (error) {
            if (requestId !== latestRequestRef.current) return;
            const errorMessage =
              error instanceof Error
                ? error.message
                : t('contexts.filters.errors.loadConversations');
            onError(errorMessage);
          } finally {
            if (requestId === latestRequestRef.current) {
              dispatch({ type: 'SET_APPLYING_FILTERS', payload: false });
            }
          }
        }
        return;
      }

      try {
        const searchParams = createSearchFilter(searchTerm);
        let query: ConversationsQuery;

        // Combinar busca com filtros ativos se houver
        if (state.activeFilters.length > 0) {
          if (shouldUseAdvancedFilters(state.activeFilters)) {
            // Para filtros avançados, incluir busca no payload
            const filterRequest = {
              ...convertFiltersToApiFormat(state.activeFilters),
              q: searchTerm,
            };
            query = { kind: 'filter', request: filterRequest };
          } else {
            const filterParams = convertFiltersToUrlParams(state.activeFilters);
            query = { kind: 'list', params: combineSearchWithFilters(searchParams, filterParams) };
          }
        } else {
          query = { kind: 'list', params: searchParams };
        }

        await resolveQuery(query, requestId, onSuccess);
      } catch (error) {
        if (requestId !== latestRequestRef.current) return;
        const errorMessage =
          error instanceof Error ? error.message : t('contexts.filters.errors.search');
        onError(errorMessage);
        toast.error(t('contexts.filters.errors.search'), {
          description: errorMessage,
        });
      } finally {
        if (requestId === latestRequestRef.current) {
          dispatch({ type: 'SET_APPLYING_FILTERS', payload: false });
        }
      }
    },
    [state.activeFilters, applyFilters, t, resolveQuery],
  );

  const setQuickFilter = useCallback((tab: QuickFilterTab) => {
    dispatch({ type: 'SET_QUICK_FILTER_TAB', payload: tab });
  }, []);

  const setSearchTerm = useCallback((term: string) => {
    dispatch({ type: 'SET_SEARCH_TERM', payload: term });
  }, []);

  // Computed values
  const hasActiveFilters = state.activeFilters.length > 0;
  const hasSearch = state.searchTerm.trim().length > 0;

  const contextValue: FiltersContextValue = useMemo(
    () => ({
      state,
      setFilters,
      applyFilters,
      applySearch,
      setQuickFilter,
      setSearchTerm,
      hasActiveFilters,
      hasSearch,
    }),
    [
      state,
      setFilters,
      applyFilters,
      applySearch,
      setQuickFilter,
      setSearchTerm,
      hasActiveFilters,
      hasSearch,
    ],
  );

  return <FiltersContext.Provider value={contextValue}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (context === undefined) {
    throw new Error('useFilters must be used within a FiltersProvider');
  }
  return context;
}
