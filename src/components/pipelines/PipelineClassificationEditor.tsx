import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@evoapi/design-system';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { usePermissions } from '@/contexts/PermissionsContext';
import { classificationCatalogService } from '@/services/pipelines/classificationCatalogService';
import { customAttributesService } from '@/services/customAttributes/customAttributesService';
import type { ClassificationCatalog, ClassificationCatalogPreview } from '@/types/pipelines/classificationCatalog';
import type { CustomAttributeDefinition } from '@/types/settings/customAttributes';
import StageClassificationCriteria from './StageClassificationCriteria';
import LegacyClassificationReference from './LegacyClassificationReference';
import { catalogWrite, contextFieldOptions } from './classificationCatalogForm';

interface Props { pipelineId: string; stageId?: string }

export default function PipelineClassificationEditor({ pipelineId, stageId }: Props) {
  const { t } = useLanguage('pipelines');
  const { can, isReady } = usePermissions();
  const canRead = isReady && can('pipelines', 'read');
  const canEdit = canRead && can('pipelines', 'update');
  const [catalog, setCatalog] = useState<ClassificationCatalog | null>(null);
  const [attributes, setAttributes] = useState<CustomAttributeDefinition[]>([]);
  const [sourcesUnavailable, setSourcesUnavailable] = useState(false);
  const [preview, setPreview] = useState<ClassificationCatalogPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  // This comparison note belongs only to the open editor; never add it to the catalog.
  const [localReference, setLocalReference] = useState('');

  const load = useCallback(async () => {
    if (!canRead) return;
    setPending(true);
    setError('');
    try {
      const next = await classificationCatalogService.get(pipelineId);
      setCatalog(next);
      setChanged(false);
      setPreview(null);
      setConflict(false);
      setMessage('');
    } catch {
      setError('classification.loadError');
    } finally { setPending(false); }
  }, [canRead, pipelineId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setLocalReference(''); }, [pipelineId, stageId]);
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    customAttributesService.getCustomAttributes().then(result => {
      if (!cancelled) { setAttributes(result.data); setSourcesUnavailable(false); }
    }).catch(() => { if (!cancelled) setSourcesUnavailable(true); });
    return () => { cancelled = true; };
  }, [canEdit, pipelineId]);

  const edit = (next: ClassificationCatalog) => {
    if (!canEdit || pending || conflict) return;
    setCatalog(next);
    setChanged(true);
    setPreview(null);
    setMessage('');
    setError('');
  };

  const act = async (operation: 'save' | 'preview' | 'publish') => {
    if (!catalog || pending || !canEdit || conflict) return;
    setPending(true); setError(''); setMessage('');
    try {
      if (operation === 'preview') {
        setPreview(await classificationCatalogService.preview(pipelineId, catalogWrite(catalog)));
      } else {
        const next = operation === 'save'
          ? await classificationCatalogService.update(pipelineId, catalogWrite(catalog))
          : await classificationCatalogService.publish(pipelineId, catalog.draft_hash);
        setCatalog(next);
        setChanged(false);
        setPreview(null);
        setMessage(operation === 'save' ? 'classification.saved' : 'classification.approved');
      }
    } catch (failure) {
      const collided = isAxiosError(failure) && failure.response?.status === 409;
      setConflict(collided);
      setError(collided ? 'classification.conflict' : isAxiosError(failure) && failure.response?.status === 422
        ? 'classification.validationError' : 'classification.operationError');
    } finally { setPending(false); }
  };

  if (!isReady) return <p role="status">{t('classification.loading')}</p>;
  if (!canRead) return <p>{t('classification.noReadPermission')}</p>;
  if (!catalog) return <div className="space-y-3">
    <p role={error ? 'alert' : 'status'}>{t(error || 'classification.loading')}</p>
    {error && <Button type="button" variant="outline" onClick={() => void load()} disabled={pending}>{t('classification.retry')}</Button>}
  </div>;

  const disabled = !canEdit || pending || conflict;
  const fieldOptions = contextFieldOptions(attributes);
  const selectedFields = catalog.classification.context_sources.fields;
  const publishable = !changed && preview?.valid && preview.draft_hash === catalog.draft_hash;
  const stageList = stageId ? catalog.stages.filter(stage => stage.id === stageId) : catalog.stages;

  return <section aria-label={t('classification.title')} className="space-y-5">
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />{t('classification.title')}</h3>
        <span className="rounded border border-border px-2 py-0.5 text-xs">{t('classification.off')}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t('classification.description')}</p>
      <p className="text-xs text-muted-foreground">{t('classification.version', { version: catalog.catalog_version })} · {t(catalog.published && !catalog.dirty ? 'classification.reviewed' : 'classification.draft')}</p>
      {!canEdit && <p className="text-xs">{t('classification.readOnly')}</p>}
    </div>

    {canEdit && <details className="rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">{t('classification.manualReview')}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">{t('classification.manualReviewHint')}</p>
        <Label htmlFor="classification-local-reference">{t('classification.localReference')}</Label>
        <Textarea id="classification-local-reference" rows={5} value={localReference} maxLength={12000}
          autoComplete="off" onChange={event => setLocalReference(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t('classification.localReferenceHint')}</p>
        <Button type="button" size="sm" variant="outline" disabled={!localReference} onClick={() => setLocalReference('')}>{t('classification.clearLocalReference')}</Button>
      </div>
    </details>}

    {!stageId && <>
      <div className={catalog.legacy_reference?.pipeline_description?.trim() ? 'grid gap-4 sm:grid-cols-2' : ''}>
        <LegacyClassificationReference description={catalog.legacy_reference?.pipeline_description} />
        <div className="space-y-2">
        <Label htmlFor="classification-purpose">{t('classification.purpose')}</Label>
        <Textarea id="classification-purpose" rows={3} maxLength={catalog.limits.max_text_length} value={catalog.classification.purpose}
          disabled={disabled} onChange={event => edit({ ...catalog, classification: { ...catalog.classification, purpose: event.target.value } })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="classification-model">{t('classification.model')}</Label>
          <Select value={catalog.classification.model} disabled={disabled}
            onValueChange={model => edit({ ...catalog, classification: { ...catalog.classification, model } })}>
            <SelectTrigger id="classification-model"><SelectValue /></SelectTrigger>
            <SelectContent>
              {catalog.model_options.map(model => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}
              {!catalog.model_options.some(model => model.id === catalog.classification.model) && <SelectItem value={catalog.classification.model}>{catalog.classification.model}</SelectItem>}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t(catalog.credential_status.configured ? 'classification.credentialReady' : 'classification.credentialMissing')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="classification-debounce">{t('classification.debounce')}</Label>
          <Input id="classification-debounce" type="number" min={0} step={100} value={catalog.classification.debounce_ms} disabled={disabled}
            onChange={event => edit({ ...catalog, classification: { ...catalog.classification, debounce_ms: Number(event.target.value) } })} />
          <p className="text-xs text-muted-foreground">{t('classification.debounceHint')}</p>
        </div>
      </div>
      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">{t('classification.sources')}</legend>
        <p className="text-xs text-muted-foreground">{t('classification.sourcesHint')}</p>
        {sourcesUnavailable && <p role="status" className="text-sm">{t('classification.sourcesUnavailable')}</p>}
        {!sourcesUnavailable && !fieldOptions.length && <p className="text-sm text-muted-foreground">{t('classification.noSources')}</p>}
        {fieldOptions.map(({ field, label }) => {
          const checked = selectedFields.some(selected => selected.source === field.source && selected.field === field.field);
          return <label key={field.key} className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={checked}
              disabled={disabled || (!checked && selectedFields.length >= catalog.limits.max_context_fields)}
              onChange={() => edit({ ...catalog, classification: { ...catalog.classification, context_sources: { ...catalog.classification.context_sources, fields: checked
                ? selectedFields.filter(selected => !(selected.source === field.source && selected.field === field.field))
                : [...selectedFields, field] } } })} />
            <span>{label}<span className="block text-xs text-muted-foreground">{t(field.source.startsWith('contact.') ? 'classification.contact' : 'classification.conversation')} · {t(`classification.${field.type}`)}</span></span>
          </label>;
        })}
        {selectedFields.filter(field => !fieldOptions.some(option => option.field.source === field.source && option.field.field === field.field)).map(field =>
          <div key={field.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{field.field} · {t('classification.retainedSource')}</span>
            {canEdit && <Button type="button" size="sm" variant="outline" disabled={disabled}
              onClick={() => edit({ ...catalog, classification: { ...catalog.classification, context_sources: { ...catalog.classification.context_sources, fields: selectedFields.filter(selected => selected.key !== field.key) } } })}>{t('classification.removeSource')}</Button>}
          </div>)}
      </fieldset>
    </>}

    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{t('classification.stages')}</h4>
      {stageList.map(stage => <details key={stage.id} className="rounded-lg border border-border" open={stageId ? true : undefined}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{stage.name}</summary>
        <StageClassificationCriteria stageId={stage.id} value={stage.classification_profile} disabled={disabled}
          legacyDescription={catalog.legacy_reference?.stages.find(reference => reference.id === stage.id)?.description}
          maxCriteria={catalog.limits.max_criteria} maxLength={catalog.limits.max_text_length}
          onChange={classification_profile => edit({ ...catalog, stages: catalog.stages.map(candidate => candidate.id === stage.id ? { ...candidate, classification_profile } : candidate) })} />
      </details>)}
      {!stageList.length && <p className="text-sm text-muted-foreground">{t('classification.noStages')}</p>}
    </div>

    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {message && <p role="status" className="text-sm text-primary">{t(message)}</p>}
    {preview && <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4" role="status">
      <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4" aria-hidden="true" />{t(preview.valid ? 'classification.previewValid' : 'classification.validationError')}</p>
      <p className="text-xs text-muted-foreground">{t('classification.previewHint')}</p>
      <ul className="list-inside list-disc text-sm">
        {Object.values(preview.compiled.aliases).map(id => <li key={id}>{catalog.stages.find(stage => stage.id === id)?.name || t('classification.unknownStage')}</li>)}
        <li>{t('classification.unclear')}</li><li>{t('classification.noCandidate')}</li>
      </ul>
      <details><summary className="cursor-pointer text-xs">{t('classification.compiledPreview')}</summary>
        {Object.entries(preview.compiled.questions).map(([key, question]) => <p key={key} className="mt-2 whitespace-pre-wrap break-words text-sm">{question.instructions}</p>)}
      </details>
    </div>}
    {conflict && <Button type="button" variant="outline" disabled={pending} onClick={() => void load()}>{t('classification.reloadConflict')}</Button>}
    {canEdit && <div className="flex flex-wrap gap-2 border-t border-border pt-4">
      <Button type="button" disabled={disabled || !changed} onClick={() => void act('save')}>
        {pending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}{t('classification.save')}
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => void act('preview')}>{t('classification.preview')}</Button>
      <Button type="button" variant="outline" disabled={disabled || !publishable} onClick={() => void act('publish')}>{t('classification.approve')}</Button>
      <p className="w-full text-xs text-muted-foreground">{t('classification.approvalHint')}</p>
    </div>}
  </section>;
}
