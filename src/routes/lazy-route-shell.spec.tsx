import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import AppRouter from './index';

vi.mock('./PrivateRoute', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('./CustomerRoute', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('./PermissionRoute', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/guards/RouterGuard', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/plugin-host', () => ({ PluginRoutes: () => null }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));
vi.mock('@/pages/Customer/Chat/ChatPage', () => ({
  default: () => <div>Inbox carregado</div>,
}));
vi.mock('@/pages/Customer/Contacts', async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return { default: () => <div>Contatos carregados</div> };
});

describe('lazy route shell', () => {
  it('preserves the authenticated layout while loading another page', async () => {
    window.history.replaceState({}, '', '/conversations');
    render(<AppRouter />);
    await screen.findByText('Inbox carregado');

    act(() => {
      window.history.pushState({}, '', '/contacts');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    await screen.findByText('Contatos carregados');
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });
});
