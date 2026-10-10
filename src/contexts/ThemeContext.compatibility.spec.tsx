import React, { useContext } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DarkModeContext, DarkModeProvider } from './ThemeContext';

function ThemeProbe() {
  const context = useContext(DarkModeContext);
  if (!context) throw new Error('ThemeProbe must be rendered inside DarkModeProvider');

  return (
    <div>
      <span data-testid="theme">{context.theme}</span>
      <button onClick={context.toggleTheme}>Toggle</button>
    </div>
  );
}

describe('DarkModeProvider browser compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light', 'theme-switching');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('supports legacy MediaQueryList listeners and follows system changes until the user chooses a theme', async () => {
    let listener: (() => void) | undefined;
    let matches = false;
    // Simulate the modern shell's existing key. The compatibility profile has
    // a separate key so inherited system values cannot pin its OS theme.
    localStorage.setItem('theme', 'dark');
    const mediaQuery = {
      get matches() { return matches; },
      addListener: vi.fn((callback: () => void) => { listener = callback; }),
      removeListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

    const { unmount } = render(
      <DarkModeProvider storageKey="theme.chrome109" persistSystemTheme={false}>
        <ThemeProbe />
      </DarkModeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('theme.chrome109')).toBeNull();
    expect(mediaQuery.addListener).toHaveBeenCalledTimes(1);

    matches = true;
    await act(async () => listener?.());
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(localStorage.getItem('theme.chrome109')).toBe('light');

    matches = false;
    await act(async () => listener?.());
    expect(screen.getByTestId('theme')).toHaveTextContent('light');

    unmount();
    expect(mediaQuery.removeListener).toHaveBeenCalledTimes(1);
  });

  it('uses MediaQueryList EventTarget listeners when supported', () => {
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

    const { unmount } = render(
      <DarkModeProvider><ThemeProbe /></DarkModeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
