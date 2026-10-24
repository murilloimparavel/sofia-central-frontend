import React from 'react';

import { useLanguage } from '@/hooks/useLanguage';
import type { Message } from '@/types/chat/api';

interface ConversationNoteBannerProps {
  note: Message;
  onHide: () => void;
}

/**
 * Faixa fixa acima do composer com a nota mais recente do atendimento —
 * estilo/cores exatos do protótipo de referência (Melhorias CRM Chat §3.4):
 * fundo bege, borda superior grossa âmbar. A "nota" é a última mensagem
 * privada da conversa (ver spec-extraida.md) — sem entidade própria.
 */
const ConversationNoteBanner: React.FC<ConversationNoteBannerProps> = ({ note, onHide }) => {
  const { t } = useLanguage('chat');

  return (
    <div
      style={{
        alignSelf: 'stretch',
        background: 'var(--inbox-note-banner-surface)',
        borderBottom: '1px solid var(--inbox-note-banner-border)',
        borderTop: '3px solid var(--inbox-note-banner-accent)',
        padding: '12px 26px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--inbox-note-banner-icon)"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginTop: 1, flex: '0 0 17px' }}
        >
          <path d="M4 4h16v11H9l-5 5z" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--inbox-note-banner-heading)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              {t('chatArea.noteBanner.title', 'Nota do atendimento')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
              <span style={{ fontSize: 11.5, color: 'var(--inbox-note-banner-author)' }}>{note.sender?.name}</span>
              <div
                onClick={onHide}
                title={t('chatArea.noteBanner.hide', 'Ocultar')}
                style={{ cursor: 'pointer', color: 'var(--inbox-note-banner-control)', display: 'flex' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--inbox-note-banner-text)', lineHeight: 1.45, marginTop: 4 }}>{note.content}</div>
        </div>
      </div>
    </div>
  );
};

export default ConversationNoteBanner;
