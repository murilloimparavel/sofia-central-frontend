import { Button, Input, Label, Textarea } from '@evoapi/design-system';
import { Plus, X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { StageClassificationProfile } from '@/types/pipelines/classificationCatalog';
import LegacyClassificationReference from './LegacyClassificationReference';

const criterionKeys = [
  'entry_criteria', 'stay_criteria', 'exit_criteria', 'incompatible_conditions',
  'sufficient_examples', 'insufficient_examples',
] as const;

interface Props {
  stageId: string;
  value: StageClassificationProfile;
  onChange: (value: StageClassificationProfile) => void;
  disabled: boolean;
  maxCriteria: number;
  maxLength: number;
  legacyDescription?: string | null;
}

export default function StageClassificationCriteria({ stageId, value, onChange, disabled, maxCriteria, maxLength, legacyDescription }: Props) {
  const { t } = useLanguage('pipelines');
  const prefix = `classification-stage-${stageId}`;
  return <div className="space-y-4 p-4">
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={value.classification_enabled} disabled={disabled}
        onChange={event => onChange({ ...value, classification_enabled: event.target.checked })} />
      {t('classification.participating')}
    </label>
    <div className={legacyDescription?.trim() ? 'grid gap-4 sm:grid-cols-2' : ''}>
      <LegacyClassificationReference description={legacyDescription} />
      <div className="space-y-2">
      <Label htmlFor={`${prefix}-definition`}>{t('classification.definition')}</Label>
      <Textarea id={`${prefix}-definition`} value={value.definition} rows={3} maxLength={maxLength}
        disabled={disabled} onChange={event => onChange({ ...value, definition: event.target.value })} />
      </div>
    </div>
    {criterionKeys.map(key => <fieldset key={key} className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{t(`classification.${key}`)}</legend>
      {value[key].map((criterion, index) => <div className="flex gap-2" key={`${key}-${index}`}>
        <Input aria-label={`${t(`classification.${key}`)} ${index + 1}`} value={criterion}
          maxLength={maxLength} disabled={disabled}
          onChange={event => onChange({ ...value, [key]: value[key].map((entry, i) => i === index ? event.target.value : entry) })} />
        <Button type="button" variant="ghost" size="icon" disabled={disabled}
          aria-label={t('classification.removeCriterion', { number: index + 1 })}
          onClick={() => onChange({ ...value, [key]: value[key].filter((_, i) => i !== index) })}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" disabled={disabled || value[key].length >= maxCriteria}
        onClick={() => onChange({ ...value, [key]: [...value[key], ''] })}>
        <Plus className="mr-2 size-3" aria-hidden="true" />{t('classification.addCriterion')}
      </Button>
    </fieldset>)}
    <p className="text-xs text-muted-foreground">{t('classification.examplesHint')}</p>
  </div>;
}
