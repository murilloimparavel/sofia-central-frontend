import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import PipelineClassificationEditor from './PipelineClassificationEditor';
import { classificationCatalogService } from '@/services/pipelines/classificationCatalogService';
import { customAttributesService } from '@/services/customAttributes/customAttributesService';
import type { ClassificationCatalog } from '@/types/pipelines/classificationCatalog';

const permissions = vi.hoisted(() => ({ ready: true, read: true, update: true }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({
  isReady: permissions.ready, can: (_resource: string, action: string) => action === 'read' ? permissions.read : permissions.update,
}) }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/pipelines/classificationCatalogService', () => ({ classificationCatalogService: {
  get: vi.fn(), update: vi.fn(), preview: vi.fn(), publish: vi.fn(),
} }));
vi.mock('@/services/customAttributes/customAttributesService', () => ({ customAttributesService: { getCustomAttributes: vi.fn() } }));

const catalog = (): ClassificationCatalog => ({
  classification: {
    schema_version: 1, enabled: false, mode: 'off', purpose: 'Qualify opportunities',
    model: 'typesafe/jev-1.14', question_version: 'pipeline_stage_v1', debounce_ms: 2300,
    snapshot_ttl_seconds: 300, result_ttl_seconds: 300, inbox_ids: ['inbox-1'],
    context_sources: { fields: [] }, thresholds: { stage_candidate: 0.8 },
  },
  stages: [{ id: 'stage-1', name: 'Qualified', classification_profile: {
    classification_enabled: true, definition: 'A qualified opportunity',
    entry_criteria: ['Clear need'], stay_criteria: [], exit_criteria: [],
    incompatible_conditions: [], sufficient_examples: [], insufficient_examples: [],
  } }],
  draft_hash: 'revision-1', catalog_version: 0, catalog_hash: null, published: false, dirty: true,
  model_options: [{ id: 'typesafe/jev-1.14', label: 'Jev 1.14', provider: 'openrouter' }],
  credential_status: { configured: true, provider: 'openrouter' },
  limits: { max_stages: 20, max_criteria: 8, max_text_length: 1200, max_questions: 1, max_context_fields: 8 },
});

beforeEach(() => {
  vi.resetAllMocks();
  permissions.ready = true; permissions.read = true; permissions.update = true;
  vi.mocked(classificationCatalogService.get).mockResolvedValue(catalog());
  vi.mocked(customAttributesService.getCustomAttributes).mockResolvedValue({ success: true, data: [], meta: { timestamp: '' , pagination: { page: 1, page_size: 100, total: 0, total_pages: 0 } } });
});

describe('PipelineClassificationEditor', () => {
  it('waits for permission readiness and never loads data without read access', async () => {
    permissions.ready = false;
    const view = render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    expect(classificationCatalogService.get).not.toHaveBeenCalled();
    permissions.ready = true; permissions.read = false;
    view.rerender(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    expect(screen.getByText('classification.noReadPermission')).toBeInTheDocument();
    expect(classificationCatalogService.get).not.toHaveBeenCalled();
  });

  it('permits reading without any write or provider actions', async () => {
    permissions.update = false;
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    expect(await screen.findByLabelText('classification.purpose')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'classification.save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'classification.preview' })).not.toBeInTheDocument();
    expect(customAttributesService.getCustomAttributes).not.toHaveBeenCalled();
    expect(classificationCatalogService.preview).not.toHaveBeenCalled();
    expect(classificationCatalogService.publish).not.toHaveBeenCalled();
  });

  it('saves a draft with concurrency hash and preserves hidden settings without activation', async () => {
    const user = userEvent.setup();
    vi.mocked(classificationCatalogService.update).mockResolvedValue({ ...catalog(), draft_hash: 'revision-2' });
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    const purpose = await screen.findByLabelText('classification.purpose');
    await user.clear(purpose); await user.type(purpose, 'Support needs');
    await user.click(screen.getByRole('button', { name: 'classification.save' }));
    await waitFor(() => expect(classificationCatalogService.update).toHaveBeenCalledWith('pipeline-1', {
      classification: { ...catalog().classification, purpose: 'Support needs' }, stages: catalog().stages, expected_hash: 'revision-1',
    }));
    expect(classificationCatalogService.preview).not.toHaveBeenCalled();
    expect(classificationCatalogService.publish).not.toHaveBeenCalled();
  });

  it('offers only persisted boolean/list fields from contact and conversation', async () => {
    const user = userEvent.setup();
    const withStage = catalog();
    withStage.classification.context_sources.stage_key = 'qualified';
    vi.mocked(classificationCatalogService.get).mockResolvedValue(withStage);
    vi.mocked(customAttributesService.getCustomAttributes).mockResolvedValue({ success: true, data: [
      { id: 'a', attribute_key: 'consent', attribute_display_name: 'Consent', attribute_model: 'contact_attribute', attribute_display_type: 'checkbox', created_at: '', updated_at: '' },
      { id: 'b', attribute_key: 'private_note', attribute_display_name: 'Private note', attribute_model: 'contact_attribute', attribute_display_type: 'text', created_at: '', updated_at: '' },
      { id: 'c', attribute_key: 'internal', attribute_display_name: 'Internal', attribute_model: 'pipeline_attribute', attribute_display_type: 'checkbox', created_at: '', updated_at: '' },
    ], meta: { timestamp: '', pagination: { page: 1, page_size: 100, total: 3, total_pages: 1 } } });
    vi.mocked(classificationCatalogService.update).mockResolvedValue(catalog());
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    const fields = await screen.findByRole('group', { name: 'classification.sources' });
    await user.click(await within(fields).findByRole('checkbox', { name: /Consent/ }));
    expect(screen.queryByText('Private note')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'classification.save' }));
    await waitFor(() => expect(classificationCatalogService.update).toHaveBeenCalledWith('pipeline-1', expect.objectContaining({
      classification: expect.objectContaining({ context_sources: { stage_key: 'qualified', fields: [{ key: 'contact_consent', source: 'contact.custom_attributes', field: 'consent', type: 'boolean' }] } }),
    })));
  });

  it('preserves optional context configuration when removing an unavailable field', async () => {
    const user = userEvent.setup();
    const withStage = catalog();
    withStage.classification.context_sources = { stage_key: 'qualified', fields: [
      { key: 'interest', source: 'contact.custom_attributes', field: 'interested', type: 'boolean' },
    ] };
    vi.mocked(classificationCatalogService.get).mockResolvedValue(withStage);
    vi.mocked(classificationCatalogService.update).mockResolvedValue(catalog());
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    await user.click(await screen.findByRole('button', { name: 'classification.removeSource' }));
    await user.click(screen.getByRole('button', { name: 'classification.save' }));
    await waitFor(() => expect(classificationCatalogService.update).toHaveBeenCalledWith('pipeline-1', expect.objectContaining({
      classification: expect.objectContaining({ context_sources: { stage_key: 'qualified', fields: [] } }),
    })));
  });

  it('requires offline validation of the saved revision before approval, and invalidates preview on edit', async () => {
    const user = userEvent.setup();
    vi.mocked(classificationCatalogService.preview).mockResolvedValue({ valid: true, draft_hash: 'revision-1', compiled: {
      compiler_version: 'pipeline_catalog_v1', model: 'typesafe/jev-1.14', question_version: 'pipeline_stage_v1', aliases: { stage_1: 'stage-1' },
      questions: { stage_candidate: { type: 'choice', instructions: 'Which stage applies?', criteria: {} } },
    } });
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    const approve = await screen.findByRole('button', { name: 'classification.approve' });
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'classification.preview' }));
    await waitFor(() => expect(approve).toBeEnabled());
    expect(screen.getByText('classification.unclear')).toBeInTheDocument();
    await user.type(screen.getByLabelText('classification.purpose'), '!');
    expect(approve).toBeDisabled();
    expect(screen.queryByText('classification.previewValid')).not.toBeInTheDocument();
    expect(classificationCatalogService.publish).not.toHaveBeenCalled();
  });

  it('preserves the local draft on 409 and blocks writes until explicit reload', async () => {
    const user = userEvent.setup();
    const conflict = new AxiosError('conflict');
    conflict.response = { status: 409 } as AxiosError['response'];
    vi.mocked(classificationCatalogService.update).mockRejectedValue(conflict);
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    await user.type(await screen.findByLabelText('classification.purpose'), ' changed');
    await user.click(screen.getByRole('button', { name: 'classification.save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('classification.conflict');
    expect(screen.getByLabelText('classification.purpose')).toHaveValue('Qualify opportunities changed');
    expect(screen.getByRole('button', { name: 'classification.save' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'classification.reloadConflict' }));
    await waitFor(() => expect(screen.getByLabelText('classification.purpose')).toHaveValue('Qualify opportunities'));
  });

  it('approves only the saved and validated revision without activation', async () => {
    const user = userEvent.setup();
    vi.mocked(classificationCatalogService.preview).mockResolvedValue({ valid: true, draft_hash: 'revision-1', compiled: {
      compiler_version: 'pipeline_catalog_v1', model: 'typesafe/jev-1.14', question_version: 'pipeline_stage_v1',
      aliases: {}, questions: {},
    } });
    vi.mocked(classificationCatalogService.publish).mockResolvedValue({ ...catalog(), published: true, dirty: false, catalog_version: 1 });
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    await user.click(await screen.findByRole('button', { name: 'classification.preview' }));
    const approve = screen.getByRole('button', { name: 'classification.approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    expect(await screen.findByText('classification.approved')).toBeInTheDocument();
    expect(classificationCatalogService.publish).toHaveBeenCalledTimes(1);
    expect(classificationCatalogService.publish).toHaveBeenCalledWith('pipeline-1', 'revision-1');
    expect(classificationCatalogService.update).not.toHaveBeenCalled();
    expect(screen.getByText('classification.off')).toBeInTheDocument();
  });

  it('edits stage criteria through the aggregate catalog while retaining pipeline purpose', async () => {
    const user = userEvent.setup();
    vi.mocked(classificationCatalogService.update).mockResolvedValue(catalog());
    render(<PipelineClassificationEditor pipelineId="pipeline-1" stageId="stage-1" />);
    const definition = await screen.findByLabelText('classification.definition');
    await user.type(definition, ' with evidence');
    expect(screen.queryByLabelText('classification.purpose')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'classification.save' }));
    await waitFor(() => expect(classificationCatalogService.update).toHaveBeenCalledWith('pipeline-1', expect.objectContaining({
      classification: catalog().classification,
      stages: [expect.objectContaining({ classification_profile: expect.objectContaining({ definition: 'A qualified opportunity with evidence' }) })],
    })));
  });

  it('compares readonly existing descriptions with independent editable criteria without automatic import', async () => {
    const withReference = catalog();
    withReference.legacy_reference = { pipeline_description: 'Existing sales instructions',
      stages: [{ id: 'stage-1', description: 'Existing qualification instructions' }] };
    vi.mocked(classificationCatalogService.get).mockResolvedValue(withReference);
    render(<PipelineClassificationEditor pipelineId="pipeline-1" stageId="stage-1" />);
    expect(await screen.findByText('Existing qualification instructions')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Existing qualification instructions')).not.toBeInTheDocument();
    expect(screen.getByLabelText('classification.definition')).toHaveValue('A qualified opportunity');
    expect(screen.getByRole('button', { name: 'classification.save' })).toBeDisabled();
    expect(classificationCatalogService.update).not.toHaveBeenCalled();
    expect(classificationCatalogService.preview).not.toHaveBeenCalled();
    expect(classificationCatalogService.publish).not.toHaveBeenCalled();
  });

  it('keeps pasted review instructions and old descriptions outside save, preview and approval payloads', async () => {
    const user = userEvent.setup();
    const secret = 'FAKE_SECRET_FOR_REVIEW_ONLY_12345';
    const withReference = catalog();
    withReference.legacy_reference = { pipeline_description: 'Existing sales description', stages: [] };
    vi.mocked(classificationCatalogService.get).mockResolvedValue(withReference);
    vi.mocked(classificationCatalogService.update).mockResolvedValue(withReference);
    vi.mocked(classificationCatalogService.preview).mockResolvedValue({ valid: true, draft_hash: 'revision-1',
      legacy_reference: withReference.legacy_reference, compiled: {
        compiler_version: 'pipeline_catalog_v1', model: 'typesafe/jev-1.14', question_version: 'pipeline_stage_v1', aliases: {}, questions: {},
      } });
    vi.mocked(classificationCatalogService.publish).mockResolvedValue({ ...withReference, published: true, dirty: false });
    render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    expect(await screen.findByText('Existing sales description')).toBeInTheDocument();
    expect(screen.getByLabelText('classification.purpose')).toHaveValue('Qualify opportunities');
    await user.click(screen.getByText('classification.manualReview'));
    await user.type(screen.getByLabelText('classification.localReference'), secret);
    expect(screen.getByRole('button', { name: 'classification.save' })).toBeDisabled();
    expect(classificationCatalogService.preview).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('classification.purpose'), ' reviewed');
    await user.click(screen.getByRole('button', { name: 'classification.save' }));
    await screen.findByText('classification.saved');
    await user.click(screen.getByRole('button', { name: 'classification.preview' }));
    const approve = screen.getByRole('button', { name: 'classification.approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    await screen.findByText('classification.approved');
    const calls = JSON.stringify([
      vi.mocked(classificationCatalogService.update).mock.calls,
      vi.mocked(classificationCatalogService.preview).mock.calls,
      vi.mocked(classificationCatalogService.publish).mock.calls,
    ]);
    expect(calls).not.toContain(secret);
    expect(calls).not.toContain('legacy_reference');
    expect(calls).not.toContain('Existing sales description');
    expect(withReference.legacy_reference.pipeline_description).toBe('Existing sales description');
    expect(classificationCatalogService.publish).toHaveBeenCalledWith('pipeline-1', 'revision-1');
  });

  it('clears temporary instructions when changing pipeline or closing the editor', async () => {
    const user = userEvent.setup();
    const view = render(<PipelineClassificationEditor pipelineId="pipeline-1" />);
    await screen.findByLabelText('classification.purpose');
    await user.click(screen.getByText('classification.manualReview'));
    await user.type(screen.getByLabelText('classification.localReference'), 'Temporary campaign reference');
    view.rerender(<PipelineClassificationEditor pipelineId="pipeline-2" />);
    await waitFor(() => expect(screen.getByLabelText('classification.localReference')).toHaveValue(''));
    await user.type(screen.getByLabelText('classification.localReference'), 'Another temporary reference');
    view.unmount();
    render(<PipelineClassificationEditor pipelineId="pipeline-2" />);
    expect(await screen.findByLabelText('classification.localReference')).toHaveValue('');
  });
});
