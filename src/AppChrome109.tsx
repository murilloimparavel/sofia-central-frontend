import { Suspense, lazy, useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DarkModeContext, DarkModeProvider } from '@/contexts/ThemeContext';
import { GlobalConfigProvider } from '@/contexts/GlobalConfigContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { useIsDarkClass } from '@/hooks/chat/useIsDarkClass';
import {
  hasIsolatedCompatibilityApiConfig,
  isOptionalEndpointAllowed,
  isOptionalWebSocketEndpointAllowed,
  parseCompatibilityAllowedHosts,
} from '@/utils/compatibilityApiConfig';
import PrivateRoute from '@/routes/PrivateRoute';
import CustomerRoute from '@/routes/CustomerRoute';
import PermissionRoute from '@/routes/PermissionRoute';
import RouterGuard from '@/guards/RouterGuard';

const ChatPage = lazy(() => import('@/pages/Customer/Chat/ChatPageChrome109'));
const Auth = lazy(() => import('@/pages/Auth'));

function AtendimentoHeader() {
  const { user, logout } = useAuth();
  const theme = useContext(DarkModeContext);
  const { t } = useTranslation('common');

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4 text-foreground">
      <strong className="text-sm">SOFIA Central</strong>
      <div className="flex items-center gap-3 text-xs">
        <span>{user?.name || user?.email}</span>
        <button
          type="button"
          className="rounded border border-border px-2 py-1"
          onClick={theme?.toggleTheme}
          aria-label={t('base.theme.toggle')}
        >
          {t('base.theme.toggle')}
        </button>
        <button
          type="button"
          className="rounded border border-border px-2 py-1"
          onClick={() => { void logout(); }}
        >
          {t('permissions.loadFailed.signOut')}
        </button>
      </div>
    </header>
  );
}

function MissingApiConfiguration() {
  const { t } = useTranslation('common');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="max-w-lg rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">{t('base.apiNotConfigured.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('base.apiNotConfigured.description')}
        </p>
      </section>
    </main>
  );
}

function LegacyRoutes() {
  const isDark = useIsDarkClass();
  const { t } = useTranslation('common');

  return (
    <>
      <RouterGuard>
        <Routes>
          <Route
            path="/login"
            element={(
              <Suspense fallback={<div className="p-4 text-sm">{t('base.appInitializer.initializing')}</div>}>
                <Auth />
              </Suspense>
            )}
          />
          <Route path="/" element={<Navigate to="/conversations" replace />} />
          <Route
            path="/setup"
            element={(
              <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
                <section className="max-w-lg rounded-lg border border-border bg-card p-6">
                  <h1 className="text-lg font-semibold">{t('base.setupRequired.title')}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('base.setupRequired.description')}
                  </p>
                </section>
              </main>
            )}
          />
          <Route
            path="/conversations"
            element={(
              <PrivateRoute>
                <CustomerRoute>
                  <PermissionRoute resource="conversations" action="read">
                    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
                      <AtendimentoHeader />
                      <main className="min-h-0 flex-1">
                        <Suspense fallback={<div className="p-4 text-sm">{t('base.appInitializer.initializing')}</div>}>
                          <ChatPage />
                        </Suspense>
                      </main>
                    </div>
                  </PermissionRoute>
                </CustomerRoute>
              </PrivateRoute>
            )}
          />
          <Route
            path="/conversations/:conversationId"
            element={(
              <PrivateRoute>
                <CustomerRoute>
                  <PermissionRoute resource="conversations" action="read">
                    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
                      <AtendimentoHeader />
                      <main className="min-h-0 flex-1">
                        <Suspense fallback={<div className="p-4 text-sm">{t('base.appInitializer.initializing')}</div>}>
                          <ChatPage />
                        </Suspense>
                      </main>
                    </div>
                  </PermissionRoute>
                </CustomerRoute>
              </PrivateRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/conversations" replace />} />
        </Routes>
      </RouterGuard>
      <Toaster position="top-right" richColors closeButton theme={isDark ? 'dark' : 'light'} />
    </>
  );
}

export default function AppChrome109() {
  const apiUrl = import.meta.env.VITE_API_URL;
  const authApiUrl = import.meta.env.VITE_AUTH_API_URL;
  const allowedApiHosts = parseCompatibilityAllowedHosts(
    import.meta.env.VITE_COMPAT_ALLOWED_API_HOSTS,
  );

  // The standard application defaults the auth service to localhost:3030.
  // Never let an unconfigured compatibility artifact contact that implicit
  // destination: require a concrete API origin before mounting any providers.
  if (
    !hasIsolatedCompatibilityApiConfig(apiUrl, authApiUrl, allowedApiHosts) ||
    !isOptionalEndpointAllowed(import.meta.env.VITE_EVOAI_API_URL, allowedApiHosts) ||
    !isOptionalEndpointAllowed(import.meta.env.VITE_EVOFLOW_API_URL, allowedApiHosts) ||
    !isOptionalEndpointAllowed(import.meta.env.VITE_AGENT_PROCESSOR_URL, allowedApiHosts) ||
    !isOptionalWebSocketEndpointAllowed(import.meta.env.VITE_WS_URL, allowedApiHosts)
  ) {
    return <MissingApiConfiguration />;
  }

  return (
    <AuthProvider>
      <DarkModeProvider storageKey="theme.chrome109" persistSystemTheme={false}>
        <GlobalConfigProvider enableClarity={false}>
          <PermissionsProvider blockOnLoadFailure={false}>
            <BrowserRouter>
              <LegacyRoutes />
            </BrowserRouter>
          </PermissionsProvider>
        </GlobalConfigProvider>
      </DarkModeProvider>
    </AuthProvider>
  );
}
