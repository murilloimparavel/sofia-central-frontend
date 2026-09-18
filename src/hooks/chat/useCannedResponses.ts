import { useState, useEffect, useCallback } from 'react';
import { cannedResponsesService } from '@/services/cannedResponses/cannedResponsesService';
import type { CannedResponse } from '@/types/knowledge';

interface UseCannedResponsesOptions {
  enabled?: boolean;
}

interface UseCannedResponsesReturn {
  cannedResponses: CannedResponse[];
  isLoading: boolean;
  error: string | null;
  searchCannedResponses: (query: string) => CannedResponse[];
  reloadCannedResponses: () => Promise<void>;
}

/**
 * Hook customizado para gerenciar canned responses
 *
 * Features:
 * - Cache local das respostas prontas
 * - Busca/filtro em tempo real
 * - Reload manual quando necessário
 */
export const useCannedResponses = ({
  enabled = true,
}: UseCannedResponsesOptions): UseCannedResponsesReturn => {
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar canned responses ao montar o componente
  const loadCannedResponses = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await cannedResponsesService.getCannedResponses();
      setCannedResponses(response.data);
    } catch (err) {
      console.error('Error loading canned responses:', err);
      setError('Erro ao carregar respostas prontas');
      setCannedResponses([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    loadCannedResponses();
  }, [loadCannedResponses]);

  // Remove acentos e normaliza para busca insensível a diacríticos
  const stripDiacritics = (str?: string | null): string => {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // Função de busca/filtro otimizada com suporte a acentos e segurança contra nulos
  const searchCannedResponses = useCallback(
    (query: string): CannedResponse[] => {
      if (!Array.isArray(cannedResponses) || cannedResponses.length === 0) {
        return [];
      }

      if (!query || !query.trim()) {
        return cannedResponses;
      }

      const rawQuery = query.toLowerCase().trim();
      const normalizedQuery = stripDiacritics(query);

      return cannedResponses.filter(cannedResponse => {
        if (!cannedResponse) return false;

        const rawShortCode = (cannedResponse.short_code || '').toLowerCase();
        const rawContent = (cannedResponse.content || '').toLowerCase();

        // Verifica correspondência exata ou normalizada (sem acentos)
        const normShortCode = stripDiacritics(cannedResponse.short_code);
        const normContent = stripDiacritics(cannedResponse.content);

        const matchesShortCode =
          rawShortCode.includes(rawQuery) || (normShortCode.length > 0 && normShortCode.includes(normalizedQuery));
        const matchesContent =
          rawContent.includes(rawQuery) || (normContent.length > 0 && normContent.includes(normalizedQuery));

        return matchesShortCode || matchesContent;
      });
    },
    [cannedResponses],
  );

  // Função para recarregar manualmente
  const reloadCannedResponses = useCallback(async () => {
    await loadCannedResponses();
  }, [loadCannedResponses]);

  return {
    cannedResponses,
    isLoading,
    error,
    searchCannedResponses,
    reloadCannedResponses,
  };
};
