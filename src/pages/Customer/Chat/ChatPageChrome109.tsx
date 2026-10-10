import AppInitializer from '@/components/AppInitializer';
import { Suspense } from 'react';
import { ChatProvider } from '@/contexts/chat/ChatContext';
import Chat from './Chat';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';

/** Avoid importing both high-resolution theme logos from the shared loader. */
function Chrome109LoadingScreen() {
  const { t } = useTranslation('common');

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
      <strong className="mb-4 text-sm">SOFIA Central</strong>
      <span className="text-sm">{t('base.appInitializer.initializing')}</span>
    </div>
  );
}

/** Keep post-login app data initialization inside the lazy conversation route. */
export default function ChatPageChrome109() {
  return (
    <AppInitializer initializingFallback={<Chrome109LoadingScreen />}>
      <ErrorBoundary>
        <ChatProvider>
          <Suspense fallback={<Chrome109LoadingScreen />}>
            <Chat />
          </Suspense>
        </ChatProvider>
      </ErrorBoundary>
    </AppInitializer>
  );
}
