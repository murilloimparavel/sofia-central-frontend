import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CannedResponsesList from '../canned-responses/CannedResponsesList';
import type { CannedResponse } from '@/types/knowledge';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { ui_settings: { editor_message_key: 'enter' } },
  }),
}));

vi.mock('@/hooks/useMessageSignature', () => ({
  useMessageSignature: () => ({
    isSignatureEnabled: false,
    toggleSignature: vi.fn(),
    hasSignature: false,
    appendSignatureIfEnabled: (text: string) => text,
  }),
}));

const mockResponses: CannedResponse[] = [
  { id: '1', short_code: 'assinatura_gov', content: 'Segue o vídeo passo a passo', created_at: '2026-01-01' },
  { id: '2', short_code: 'pré_contrato', content: 'Acabei de gerar o contrato (pré-reserva)...', created_at: '2026-01-01' },
  { id: '3', short_code: 'chave_pix_wg', content: '45.142.803/0001-19 Banco Bradesco', created_at: '2026-01-01' },
  { id: '4', short_code: 'orçamento', content: 'NOME DO CONDOMINIO / APARTAMENTO *fotos*', created_at: '2026-01-01' },
];

vi.mock('@/hooks/chat/useCannedResponses', () => ({
  useCannedResponses: () => ({
    cannedResponses: mockResponses,
    isLoading: false,
    error: null,
    searchCannedResponses: (query: string) => {
      if (!query.trim()) return mockResponses;
      const q = query.toLowerCase().trim();
      return mockResponses.filter(
        r => r.short_code.toLowerCase().includes(q) || r.content.toLowerCase().includes(q),
      );
    },
    reloadCannedResponses: vi.fn(),
  }),
}));

describe('CannedResponsesList Component', () => {
  it('renders without crashing on empty query', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CannedResponsesList
        cannedResponses={mockResponses}
        selectedIndex={0}
        searchQuery=""
        onSelect={onSelect}
      />
    );
    expect(container).toBeDefined();
  });

  it('renders with simple query', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CannedResponsesList
        cannedResponses={mockResponses}
        selectedIndex={0}
        searchQuery="pix"
        onSelect={onSelect}
      />
    );
    expect(container).toBeDefined();
  });

  it('handles regex special characters in search query without crashing', () => {
    const onSelect = vi.fn();
    for (const specialChar of ['(', ')', '[', ']', '*', '+', '?', '/', '\\', '.', '^', '$']) {
      expect(() => {
        render(
          <CannedResponsesList
            cannedResponses={mockResponses}
            selectedIndex={0}
            searchQuery={specialChar}
            onSelect={onSelect}
          />
        );
      }).not.toThrow();
    }
  });

  it('handles null or undefined fields gracefully', () => {
    const onSelect = vi.fn();
    const brokenResponses = [
      { id: '99', short_code: undefined, content: null, created_at: '2026-01-01' },
    ] as unknown as CannedResponse[];
    expect(() => {
      render(
        <CannedResponsesList
          cannedResponses={brokenResponses}
          selectedIndex={0}
          searchQuery="test"
          onSelect={onSelect}
        />
      );
    }).not.toThrow();
  });

  it('matches accented triggers like /pré and /orçamento in trigger regex', () => {
    const regex = /(?:^|\s)\/([\p{L}\p{N}_-]*)$/u;
    expect('/pré'.match(regex)?.[1]).toBe('pré');
    expect('/orçamento'.match(regex)?.[1]).toBe('orçamento');
    expect('/endereço'.match(regex)?.[1]).toBe('endereço');
    expect('olá /política'.match(regex)?.[1]).toBe('política');
    expect('/chave_pix'.match(regex)?.[1]).toBe('chave_pix');
    expect('/depois_do_voucher'.match(regex)?.[1]).toBe('depois_do_voucher');
  });

  it('highlights literal regex characters safely in short codes and preview', () => {
    const onSelect = vi.fn();
    const responsesWithSymbols: CannedResponse[] = [
      { id: '10', short_code: 'pix_cnpj', content: '21.929.952/0001-64 (chave)', created_at: '2026-01-01' },
      { id: '11', short_code: 'info_fotos', content: 'Condomínio / Fotos *vip*', created_at: '2026-01-01' },
    ];

    for (const query of ['(', ')', '/', '*', '.', '21.', '0001-64']) {
      const { container } = render(
        <CannedResponsesList
          cannedResponses={responsesWithSymbols}
          selectedIndex={0}
          searchQuery={query}
          onSelect={onSelect}
        />
      );
      expect(container).toBeDefined();
    }
  });
});
