import { describe, expect, it } from 'vitest';
import i18n, { locales } from './chrome109';

describe('Chrome 109 translation catalog', () => {
  it('keeps login, chat, common, and chat-tour namespaces for every supported language', () => {
    for (const locale of locales) {
      expect(i18n.hasResourceBundle(locale, 'auth')).toBe(true);
      expect(i18n.hasResourceBundle(locale, 'chat')).toBe(true);
      expect(i18n.hasResourceBundle(locale, 'common')).toBe(true);
      expect(i18n.hasResourceBundle(locale, 'tours')).toBe(true);
      expect(i18n.getResource(locale, 'common', 'base.setupRequired.title')).toBeTruthy();
      expect(i18n.getResource(locale, 'common', 'base.apiNotConfigured.title')).toBeTruthy();
    }
  });
});
