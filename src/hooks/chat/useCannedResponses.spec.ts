import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCannedResponses } from './useCannedResponses';
import { cannedResponsesService } from '@/services/cannedResponses/cannedResponsesService';
import type { CannedResponse } from '@/types/knowledge';

vi.mock('@/services/cannedResponses/cannedResponsesService', () => ({
  cannedResponsesService: {
    getCannedResponses: vi.fn(),
  },
}));

const mockData: CannedResponse[] = [
  { id: '1', short_code: 'assinatura_gov', content: 'Segue o vídeo passo a passo', created_at: '2026-01-01' },
  { id: '2', short_code: 'pré_contrato', content: 'Acabei de gerar o contrato pré-reserva', created_at: '2026-01-01' },
  { id: '3', short_code: 'orçamento', content: 'NOME DO CONDOMÍNIO / APARTAMENTO', created_at: '2026-01-01' },
  { id: '4', short_code: 'chave_pix_wg', content: '45.142.803/0001-19 Banco Bradesco', created_at: '2026-01-01' },
  { id: '5', short_code: undefined as any, content: null as any, created_at: '2026-01-01' },
];

describe('useCannedResponses hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cannedResponsesService.getCannedResponses).mockResolvedValue({
      data: mockData,
    });
  });

  it('loads canned responses when enabled', async () => {
    const { result } = renderHook(() => useCannedResponses({ enabled: true }));
    await act(async () => {});
    expect(result.current.cannedResponses).toHaveLength(5);
  });

  it('performs diacritic-insensitive search (matches pre with pré_contrato)', async () => {
    const { result } = renderHook(() => useCannedResponses({ enabled: true }));
    await act(async () => {});

    // Busca sem acento
    const foundWithoutAccent = result.current.searchCannedResponses('pre');
    expect(foundWithoutAccent.some(r => r.short_code === 'pré_contrato')).toBe(true);

    // Busca com acento
    const foundWithAccent = result.current.searchCannedResponses('pré');
    expect(foundWithAccent.some(r => r.short_code === 'pré_contrato')).toBe(true);
  });

  it('performs diacritic-insensitive search for orcamento -> orçamento', async () => {
    const { result } = renderHook(() => useCannedResponses({ enabled: true }));
    await act(async () => {});

    const found = result.current.searchCannedResponses('orcamento');
    expect(found.some(r => r.short_code === 'orçamento')).toBe(true);
  });

  it('handles null and undefined fields safely without throwing', async () => {
    const { result } = renderHook(() => useCannedResponses({ enabled: true }));
    await act(async () => {});

    expect(() => {
      result.current.searchCannedResponses('qualquer_coisa');
    }).not.toThrow();
  });
});
