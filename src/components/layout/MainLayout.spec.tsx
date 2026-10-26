import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';

vi.mock('../../hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Test', role: { key: 'admin' } },
    logout: vi.fn(),
  }),
}));

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: () => true, canAny: () => true, canAll: () => true }),
}));

vi.mock('@/hooks/useDashboardApps', () => ({
  useDashboardApps: () => ({ apps: [] }),
}));

vi.mock('@/utils/injectDashboardApps', () => ({
  injectDashboardAppsIntoMenu: (items: any[]) => items,
}));

vi.mock('./config/menuItems', () => ({
  getCustomerMenuItems: () => [],
  filterMenuItemsByPermissions: (items: any[]) => items,
}));

vi.mock('./components', () => ({
  Header: () => <div data-testid="header" />,
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('@/components/WelcomeTourModal', () => ({
  WelcomeTourModal: () => null,
}));

vi.mock('@/components/commercial-assistant/CommercialAssistantPopup', () => ({
  default: () => null,
}));

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@evoapi/design-system', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
  Dialog: ({ children }: any) => <>{children}</>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

const mockUseMenuState = vi.hoisted(() => vi.fn());
const mockSetActiveSubmenu = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useMenuState', () => ({
  useMenuState: mockUseMenuState,
}));

const settingsItem = {
  id: 'settings',
  name: 'Settings',
  href: '#',
  icon: Settings,
  subItems: [],
};

const defaultMenuState = () => ({
  activeSubmenu: settingsItem,
  activeMenu: null,
  setActiveSubmenu: mockSetActiveSubmenu,
  setActiveMenu: vi.fn(),
  isMenuItemActive: () => false,
  isMenuWithSubItemsActive: () => false,
  handleMenuClick: vi.fn(),
  resetManualFlag: vi.fn(),
});

import MainLayout from './MainLayout';

describe('MainLayout — backdrop dismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('sidebar-collapsed', 'true');
    mockUseMenuState.mockReturnValue(defaultMenuState());
  });

  function renderLayout() {
    return render(
      <MemoryRouter>
        <MainLayout>
          <div data-testid="content">Content</div>
        </MainLayout>
      </MemoryRouter>,
    );
  }

  it('renders accessible backdrop when activeSubmenu is set and sidebar is collapsed', () => {
    renderLayout();
    const backdrop = screen.getByRole('button', { name: 'sidebar.closeSubmenu' });
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('tabIndex', '0');
  });

  it('calls setActiveSubmenu(null) when backdrop is clicked', () => {
    renderLayout();
    const backdrop = screen.getByRole('button', { name: 'sidebar.closeSubmenu' });
    fireEvent.click(backdrop);
    expect(mockSetActiveSubmenu).toHaveBeenCalledWith(null);
  });

  it('calls setActiveSubmenu(null) when Enter is pressed on backdrop', () => {
    renderLayout();
    const backdrop = screen.getByRole('button', { name: 'sidebar.closeSubmenu' });
    fireEvent.keyDown(backdrop, { key: 'Enter' });
    expect(mockSetActiveSubmenu).toHaveBeenCalledWith(null);
  });

  it('calls setActiveSubmenu(null) when Space is pressed on backdrop', () => {
    renderLayout();
    const backdrop = screen.getByRole('button', { name: 'sidebar.closeSubmenu' });
    fireEvent.keyDown(backdrop, { key: ' ' });
    expect(mockSetActiveSubmenu).toHaveBeenCalledWith(null);
  });

  it('does not render backdrop when sidebar is expanded', () => {
    localStorage.setItem('sidebar-collapsed', 'false');
    renderLayout();
    expect(screen.queryByRole('button', { name: 'sidebar.closeSubmenu' })).not.toBeInTheDocument();
  });

  it('does not render backdrop when activeSubmenu is null', () => {
    mockUseMenuState.mockReturnValue({ ...defaultMenuState(), activeSubmenu: null });
    renderLayout();
    expect(screen.queryByRole('button', { name: 'sidebar.closeSubmenu' })).not.toBeInTheDocument();
  });
});

describe('MainLayout — inbox route boundary stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('sidebar-collapsed', 'false');
    mockUseMenuState.mockReturnValue(defaultMenuState());
  });

  function StatefulRouteContent() {
    const location = useLocation();
    const [count, setCount] = React.useState(0);
    const [crash, setCrash] = React.useState(false);
    if (crash) throw new Error('route crashed');
    return (
      <div>
        <span data-testid="route-state">{count}</span>
        <span data-testid="route-path">{location.pathname}</span>
        <button onClick={() => setCount(value => value + 1)}>increment</button>
        <button onClick={() => setCrash(true)}>crash</button>
      </div>
    );
  }

  function RouteControls() {
    const navigate = useNavigate();
    return <>
      <button onClick={() => navigate('/conversations/second')}>second conversation</button>
      <button onClick={() => navigate('/dashboard')}>leave inbox</button>
    </>;
  }

  it('preserves mounted child state between conversations and resets the boundary after leaving inbox', () => {
    render(
      <MemoryRouter initialEntries={['/conversations/first']}>
        <RouteControls />
        <MainLayout><StatefulRouteContent /></MainLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'increment' }));
    fireEvent.click(screen.getByRole('button', { name: 'second conversation' }));
    expect(screen.getByTestId('route-path')).toHaveTextContent('/conversations/second');
    expect(screen.getByTestId('route-state')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'crash' }));
    expect(screen.getByText('base.errorBoundary.title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'leave inbox' }));
    expect(screen.getByTestId('route-path')).toHaveTextContent('/dashboard');
  });
});
