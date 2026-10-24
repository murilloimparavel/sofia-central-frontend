import type { BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import i18n from './instance';
import english from './bundles/en';

export const locales = ['en', 'pt-BR', 'pt', 'fr', 'it', 'es'] as const;
export const defaultLocale = 'en' as const;
export type Locale = (typeof locales)[number];

type LocaleBundle = Record<string, Record<string, unknown>>;
const namespaces = Object.keys(english);
const localeLoaders: Record<Locale, () => Promise<LocaleBundle>> = {
  en: async () => english,
  'pt-BR': () => import('./bundles/pt-BR').then(module => module.default),
  pt: () => import('./bundles/pt').then(module => module.default),
  fr: () => import('./bundles/fr').then(module => module.default),
  it: () => import('./bundles/it').then(module => module.default),
  es: () => import('./bundles/es').then(module => module.default),
};

const loadedBundles = new Map<Locale, Promise<LocaleBundle>>([['en', Promise.resolve(english)]]);

function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

function loadBundle(locale: Locale): Promise<LocaleBundle> {
  const cached = loadedBundles.get(locale);
  if (cached) return cached;

  // One import serves all namespace reads. Allow a retry after a failed fetch.
  const pending = localeLoaders[locale]().catch(error => {
    loadedBundles.delete(locale);
    throw error;
  });
  loadedBundles.set(locale, pending);
  return pending;
}

export function detectLanguage(): Locale {
  try {
    const saved = localStorage.getItem('i18nextLng');
    if (saved && isLocale(saved)) return saved;
  } catch {
    // Private browsing can deny storage access.
  }

  const browser = typeof navigator === 'undefined' ? '' : navigator.language;
  if (browser === 'pt_BR' || browser.toLowerCase() === 'pt-br') return 'pt-BR';
  const prefix = browser.split('-')[0].toLowerCase();
  return isLocale(prefix) ? prefix : defaultLocale;
}

const localeBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read(language, namespace, callback) {
    if (!isLocale(language)) {
      callback(null, {});
      return;
    }
    loadBundle(language).then(
      bundle => callback(null, bundle[namespace] ?? {}),
      error => callback(error, false),
    );
  },
};

// English remains in the entry as an offline fallback. Each other locale has
// one lazy chunk; i18next loads it for any direct changeLanguage caller.
i18n.use(initReactI18next).use(localeBackend).init({
  resources: { en: english },
  partialBundledLanguages: true,
  ns: namespaces,
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: locales,
  load: 'currentOnly',
  debug: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  initImmediate: false,
  keySeparator: '.',
  nsSeparator: ':',
});

let startup: Promise<void> | undefined;

/** Resolve the saved/browser locale before importing and rendering the app. */
export function initializeI18n(): Promise<void> {
  if (startup) return startup;
  const initial = detectLanguage();
  if (initial === defaultLocale) {
    startup = Promise.resolve();
    return startup;
  }

  startup = loadBundle(initial)
    .then(async bundle => {
      for (const [namespace, translations] of Object.entries(bundle)) {
        i18n.addResourceBundle(initial, namespace, translations);
      }
      await i18n.changeLanguage(initial);
    })
    .catch(error => {
      // Keep English rendered when the requested chunk cannot be fetched.
      console.error('[i18n] Initial locale unavailable:', error);
    });
  return startup;
}

export default i18n;
