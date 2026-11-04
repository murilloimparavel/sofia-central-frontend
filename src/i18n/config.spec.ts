import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  vi.doUnmock('./bundles/it');
  vi.restoreAllMocks();
});

describe('lazy locale bundles', () => {
  it('keeps the same 60 namespaces in every locale bundle', async () => {
    const bundles = await Promise.all([
      import('./bundles/en'),
      import('./bundles/pt-BR'),
      import('./bundles/pt'),
      import('./bundles/fr'),
      import('./bundles/it'),
      import('./bundles/es'),
    ]);
    const englishNames = Object.keys(bundles[0].default).sort();

    expect(englishNames).toHaveLength(60);
    expect(englishNames).toEqual(expect.arrayContaining(['chat', 'events', 'journey', 'tours']));
    for (const bundle of bundles) {
      expect(Object.keys(bundle.default).sort()).toEqual(englishNames);
    }
  });

  it('loads a saved non-English locale before startup completes', async () => {
    localStorage.setItem('i18nextLng', 'pt-BR');
    const { default: i18n, initializeI18n } = await import('./config');

    await initializeI18n();

    expect(i18n.language).toBe('pt-BR');
    expect(i18n.t('layout:profile.logout')).toBe('Sair');
    expect(i18n.hasResourceBundle('pt-BR', 'chat')).toBe(true);
    expect(i18n.hasResourceBundle('fr', 'chat')).toBe(false);
  });

  it('loads a complete new locale on a direct changeLanguage call', async () => {
    const { default: i18n } = await import('./config');

    await i18n.changeLanguage('fr');

    expect(i18n.t('layout:profile.logout')).toBe('Déconnexion');
    expect(i18n.hasResourceBundle('fr', 'chat')).toBe(true);
  });

  it('keeps English as the fallback for missing translated keys', async () => {
    const { default: i18n } = await import('./config');
    await i18n.changeLanguage('es');

    expect(i18n.t('layout:profile.logout')).toBe('Salir');
    expect(i18n.t('layout:profile.logout', { lng: 'unknown' })).toBe('Sign Out');
  });

  it('renders English when an optional locale chunk cannot be fetched', async () => {
    vi.doMock('./bundles/it', () => { throw new Error('offline'); });
    const { default: i18n, initializeI18n } = await import('./config');
    localStorage.setItem('i18nextLng', 'it');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await initializeI18n();

    expect(i18n.language).toBe('en');
    expect(i18n.t('layout:profile.logout')).toBe('Sign Out');
  });
});
