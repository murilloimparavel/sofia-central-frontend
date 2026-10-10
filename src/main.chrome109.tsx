import { createRoot } from 'react-dom/client';
import '@evoapi/design-system/styles';
import './styles/globals.css';
import './styles/chrome109.css';
import './i18n/chrome109';
import AppChrome109 from './AppChrome109';
import { initTheme } from './utils/themeUtils';

document.documentElement.classList.add('chrome109-profile');
initTheme('theme.chrome109');

createRoot(document.getElementById('root')!).render(<AppChrome109 />);
