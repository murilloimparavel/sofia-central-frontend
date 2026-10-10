import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppInitializer from './AppInitializer';

const store = vi.hoisted(() => ({
  account: null as null | { locale?: string },
  initializeAppDataDeferred: vi.fn().mockResolvedValue(undefined),
  setTours: vi.fn(),
  resetUnanswered: vi.fn(),
  authLoading: true,
}));

vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, isLoading: store.authLoading }) }));
vi.mock('@/store/appDataStore', () => ({ useAppDataStore: () => store }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (selector: (state: typeof store) => unknown) => selector(store) }));
vi.mock('@/services/tours/tourService', () => ({ tourService: { getTours: vi.fn() } }));
vi.mock('@/store/unansweredConversationsStore', () => ({
  useUnansweredConversationsStore: { getState: () => ({ reset: store.resetUnanswered }) },
}));
vi.mock('@/components/LoadingScreen', () => ({
  default: ({ showLogo }: { showLogo?: boolean }) => (
    <div data-testid={showLogo ? 'modern-loading' : 'loading'} />
  ),
}));
vi.mock('@/utils/themeUtils', () => ({ applyUISettings: vi.fn() }));

describe('AppInitializer loading profile', () => {
  beforeEach(() => {
    store.authLoading = true;
    store.account = null;
    store.initializeAppDataDeferred.mockClear();
    store.setTours.mockClear();
    store.resetUnanswered.mockClear();
  });

  it('uses the supplied lightweight fallback until initialization completes', async () => {
    const view = render(
      <AppInitializer initializingFallback={<div data-testid="chrome109-loading">Carregando</div>}>
        <div data-testid="app-content">Conversa</div>
      </AppInitializer>,
    );

    expect(screen.getByTestId('chrome109-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('modern-loading')).not.toBeInTheDocument();
    store.authLoading = false;
    view.rerender(
      <AppInitializer initializingFallback={<div data-testid="chrome109-loading">Carregando</div>}>
        <div data-testid="app-content">Conversa</div>
      </AppInitializer>,
    );
    await waitFor(() => expect(screen.getByTestId('app-content')).toBeInTheDocument());
  });

  it('keeps the existing logo loading screen as the default for the modern app', () => {
    render(
      <AppInitializer>
        <div data-testid="app-content">Conversa</div>
      </AppInitializer>,
    );

    expect(screen.getByTestId('modern-loading')).toBeInTheDocument();
  });
});
