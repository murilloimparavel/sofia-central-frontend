import { useLanguage } from '@/hooks/useLanguage';

export default function LegacyClassificationReference({ description }: { description?: string | null }) {
  const { t } = useLanguage('pipelines');
  if (!description?.trim()) return null;
  return <details className="rounded-lg border border-border bg-muted/30 p-3">
    <summary className="cursor-pointer text-sm font-medium">{t('classification.legacyDescription')}</summary>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{description}</p>
    <p className="mt-3 text-xs text-muted-foreground">{t('classification.legacyDescriptionHint')}</p>
  </details>;
}
