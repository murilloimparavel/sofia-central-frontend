import { createRoot } from 'react-dom/client';
import "@evoapi/design-system/styles";
// React Flow CSS imported here so it is processed BEFORE globals.css and
// our theming overrides in globals.css can win the cascade (EVO-1270).
import '@xyflow/react/dist/style.css';
import './styles/globals.css';
import './i18n/config'; // Importar configuração do i18n
import App from './App.tsx';
import { initTheme } from './utils/themeUtils';
import { initGA4 } from './utils/ga4Utils';
import { recoverFromVitePreloadError } from './utils/chunkLoadRecovery';

// A tab can remain open across a deployment while its lazy route chunks are
// replaced. Reload once when Vite reports that an old chunk can no longer be
// fetched; the session guard prevents an infinite reload loop if the new build
// has the same problem.
window.addEventListener('vite:preloadError', (event) => {
  try {
    recoverFromVitePreloadError(event, window.sessionStorage, () => window.location.reload());
  } catch {
    // Keep Vite's normal error handling if browser storage access is restricted.
  }
});

// Inicialização do tema antes do React montar
initTheme();

// Inicialização do Google Analytics 4
initGA4();

// ⚡ OTIMIZAÇÃO: StrictMode removido para evitar duplicação de requests
// Em desenvolvimento, StrictMode executa useEffect 2x para detectar problemas
createRoot(document.getElementById('root')!).render(
    <App />
);
