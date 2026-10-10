import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppChrome109 from './AppChrome109';

const providerMounts = vi.hoisted(() => ({ auth: 0, globalConfig: 0, permissions: 0 }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => {
    providerMounts.auth += 1;
    return <>{children}</>;
  },
  useAuth: () => ({ user: { name: 'Operador sintético' }, logout: vi.fn() }),
}));

vi.mock('@/contexts/GlobalConfigContext', () => ({
  GlobalConfigProvider: ({ children }: { children: React.ReactNode }) => {
    providerMounts.globalConfig += 1;
    return <>{children}</>;
  },
}));

vi.mock('@/contexts/PermissionsContext', () => ({
  PermissionsProvider: ({ children }: { children: React.ReactNode }) => {
    providerMounts.permissions += 1;
    return <>{children}</>;
  },
}));

vi.mock('@/contexts/ThemeContext', () => ({
  DarkModeContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
  DarkModeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/chat/useIsDarkClass', () => ({ useIsDarkClass: () => false }));
vi.mock('@/routes/PrivateRoute', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/routes/CustomerRoute', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/routes/PermissionRoute', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/guards/RouterGuard', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe('AppChrome109 API isolation gate', () => {
  beforeEach(() => {
    providerMounts.auth = 0;
    providerMounts.globalConfig = 0;
    providerMounts.permissions = 0;
    vi.stubEnv('VITE_API_URL', 'https://unknown-crm.example.net');
    vi.stubEnv('VITE_AUTH_API_URL', 'https://unknown-auth.example.net');
    vi.stubEnv('VITE_COMPAT_ALLOWED_API_HOSTS', 'crm.staging.example.test,auth.staging.example.test');
    vi.stubEnv('VITE_EVOAI_API_URL', '');
    vi.stubEnv('VITE_EVOFLOW_API_URL', '');
    vi.stubEnv('VITE_AGENT_PROCESSOR_URL', '');
    vi.stubEnv('VITE_WS_URL', '');
  });

  it('does not mount providers when CRM/Auth origins are not allowlisted', () => {
    render(<AppChrome109 />);

    expect(screen.getByText('base.apiNotConfigured.title')).toBeInTheDocument();
    expect(providerMounts).toEqual({ auth: 0, globalConfig: 0, permissions: 0 });
  });

  it('does not mount providers when an optional API origin is not allowlisted', () => {
    vi.stubEnv('VITE_API_URL', 'https://crm.staging.example.test');
    vi.stubEnv('VITE_AUTH_API_URL', 'https://auth.staging.example.test');
    vi.stubEnv('VITE_EVOFLOW_API_URL', 'https://unknown-workflow.example.net');

    render(<AppChrome109 />);

    expect(screen.getByText('base.apiNotConfigured.title')).toBeInTheDocument();
    expect(providerMounts).toEqual({ auth: 0, globalConfig: 0, permissions: 0 });
  });

  it('mounts providers for the explicitly allowlisted staging origins', () => {
    vi.stubEnv('VITE_API_URL', 'https://crm.staging.example.test');
    vi.stubEnv('VITE_AUTH_API_URL', 'https://auth.staging.example.test');
    vi.stubEnv('VITE_WS_URL', 'wss://crm.staging.example.test/cable');

    render(<AppChrome109 />);

    expect(screen.queryByText('base.apiNotConfigured.title')).not.toBeInTheDocument();
    expect(providerMounts).toEqual({ auth: 1, globalConfig: 1, permissions: 1 });
  });
});
