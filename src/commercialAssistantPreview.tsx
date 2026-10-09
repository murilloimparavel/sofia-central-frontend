import { createRoot } from 'react-dom/client';
import './commercialAssistantPreview.css';
import CommercialAssistantPreview from './components/commercial-assistant/CommercialAssistantPreview';

function showPreviewError(message: string) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<main style="padding:24px;font:14px system-ui;color:#7f1d1d"><h1>Falha ao carregar a prévia</h1><pre style="white-space:pre-wrap">${message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)}</pre></main>`;
}

window.addEventListener('error', (event) => showPreviewError(event.message || 'Erro JavaScript desconhecido.'));
window.addEventListener('unhandledrejection', (event) => showPreviewError(String(event.reason)));

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz da prévia não encontrado.');
createRoot(root).render(<CommercialAssistantPreview />);
