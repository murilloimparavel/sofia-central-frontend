import { lazy, Suspense } from 'react';
import type { EmojiPickerProps } from './EmojiPicker';
import { useLanguage } from '@/hooks/useLanguage';

const EmojiPicker = lazy(() => import('./EmojiPicker'));

/** Keep the emoji dataset and picker UI out of the initial conversation chunk. */
export default function EmojiPickerChrome109(props: EmojiPickerProps) {
  const { t } = useLanguage('chat');
  if (!props.isOpen) return null;

  return (
    <Suspense
      fallback={(
        <div className="absolute bottom-full left-0 mb-2 flex h-12 w-[350px] items-center justify-center rounded-lg border border-border bg-background text-sm text-muted-foreground">
          <span role="status" aria-live="polite">{t('messageInput.emojiPicker.loading')}</span>
        </div>
      )}
    >
      <EmojiPicker {...props} />
    </Suspense>
  );
}
