import { initReactI18next } from 'react-i18next';
import i18n from './instance';

import enAuth from './locales/en/auth.json';
import enChat from './locales/en/chat.json';
import enCommon from './locales/en/common.json';
import enTours from './locales/en/tours.json';
import esAuth from './locales/es/auth.json';
import esChat from './locales/es/chat.json';
import esCommon from './locales/es/common.json';
import esTours from './locales/es/tours.json';
import frAuth from './locales/fr/auth.json';
import frChat from './locales/fr/chat.json';
import frCommon from './locales/fr/common.json';
import frTours from './locales/fr/tours.json';
import itAuth from './locales/it/auth.json';
import itChat from './locales/it/chat.json';
import itCommon from './locales/it/common.json';
import itTours from './locales/it/tours.json';
import ptAuth from './locales/pt/auth.json';
import ptChat from './locales/pt/chat.json';
import ptCommon from './locales/pt/common.json';
import ptTours from './locales/pt/tours.json';
import ptBRAuth from './locales/pt-BR/auth.json';
import ptBRChat from './locales/pt-BR/chat.json';
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRTours from './locales/pt-BR/tours.json';

export const locales = ['en', 'pt-BR', 'pt', 'fr', 'it', 'es'] as const;
export const defaultLocale = 'en' as const;
export type Locale = (typeof locales)[number];

function detectLanguage(): Locale {
  try {
    const saved = localStorage.getItem('i18nextLng');
    if (saved && locales.includes(saved as Locale)) return saved as Locale;
  } catch {
    // Storage can be disabled by browser privacy settings; use navigator below.
  }

  const language = typeof navigator === 'undefined' ? 'en' : navigator.language;
  if (language === 'pt_BR' || language.toLowerCase() === 'pt-br') return 'pt-BR';
  const prefix = language.split('-')[0].toLowerCase();
  return locales.includes(prefix as Locale) ? prefix as Locale : defaultLocale;
}

const resources = {
  en: { auth: enAuth, chat: enChat, common: enCommon, tours: enTours },
  'pt-BR': { auth: ptBRAuth, chat: ptBRChat, common: ptBRCommon, tours: ptBRTours },
  pt: { auth: ptAuth, chat: ptChat, common: ptCommon, tours: ptTours },
  es: { auth: esAuth, chat: esChat, common: esCommon, tours: esTours },
  fr: { auth: frAuth, chat: frChat, common: frCommon, tours: frTours },
  it: { auth: itAuth, chat: itChat, common: itCommon, tours: itTours },
};

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: defaultLocale,
  debug: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  initImmediate: false,
  keySeparator: '.',
  nsSeparator: ':',
});

export default i18n;
