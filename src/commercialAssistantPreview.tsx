import { createRoot } from 'react-dom/client';
import './commercialAssistantPreview.css';
import CommercialAssistantPopup from './components/commercial-assistant/CommercialAssistantPopup';

function showPreviewError(message: string) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<main style="padding:24px;font:14px system-ui;color:#7f1d1d"><h1>Falha ao carregar a prévia</h1><pre style="white-space:pre-wrap">${message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)}</pre></main>`;
}

window.addEventListener('error', (event) => showPreviewError(event.message || 'Erro JavaScript desconhecido.'));
window.addEventListener('unhandledrejection', (event) => showPreviewError(String(event.reason)));

function CommercialAssistantPreview() {
  return (
    <main className="assistant-preview-page">
      <section className="assistant-preview-card">
        <p className="assistant-preview-eyebrow">Prévia local</p>
        <h1>Assistente comercial integrado</h1>
        <p className="assistant-preview-description">
          Use o botão no canto inferior direito para abrir o popup dentro do clone do CRM.
        </p>
      </section>
      <CommercialAssistantPopup initiallyOpen />
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz da prévia não encontrado.');
createRoot(root).render(<CommercialAssistantPreview />);
