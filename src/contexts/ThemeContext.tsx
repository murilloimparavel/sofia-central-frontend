import React, { createContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';

export interface DarkModeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- contexts are shared with consumers by design.
export const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

interface DarkModeProviderProps {
  children: React.ReactNode;
  storageKey?: string;
  persistSystemTheme?: boolean;
}

export function DarkModeProvider({
  children,
  storageKey = 'theme',
  persistSystemTheme = true,
}: DarkModeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';

    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;

    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });

  useLayoutEffect(() => {
    // Symmetric toggle: garante que só uma das classes ('light' | 'dark') fique no
    // <html> por vez. Um toggle assimétrico (só mexendo em 'dark') pode deixar as duas
    // classes coexistindo se algo mais no documento já tiver aplicado 'light' antes
    // (ex.: este provider embutido dentro de um host que já gerencia sua própria
    // classList) — a classe 'dark' nunca seria removida nesse cenário.
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    // Keep the modern CRM's existing persistence behavior. The compatibility
    // profile opts out and stores only an explicit choice in its own key.
    if (persistSystemTheme) localStorage.setItem(storageKey, theme);
  }, [persistSystemTheme, storageKey, theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery) return;

    const handleChange = () => {
      const saved = localStorage.getItem(storageKey);
      if (saved !== 'light' && saved !== 'dark') {
        setTheme(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    // Safari/Chromium releases before MediaQueryList EventTarget support expose
    // addListener/removeListener instead. Keep OS theme changes working there.
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [storageKey]);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-switching');

    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    root.classList.toggle('dark', newTheme === 'dark');
    root.classList.toggle('light', newTheme === 'light');
    localStorage.setItem(storageKey, newTheme);
    setTheme(newTheme);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });
  };

  const contextValue = useMemo(() => ({ theme, toggleTheme }), [theme]);

  return <DarkModeContext.Provider value={contextValue}>{children}</DarkModeContext.Provider>;
}
