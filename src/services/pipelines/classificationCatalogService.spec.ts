import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/services/core/api';
import { classificationCatalogService } from './classificationCatalogService';
import type { ClassificationCatalogWrite } from '@/types/pipelines/classificationCatalog';

vi.mock('@/services/core/api', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));

const content: ClassificationCatalogWrite = {
  classification: {
    schema_version: 1, enabled: false, mode: 'off', purpose: 'Support', model: 'typesafe/jev-1.14',
    question_version: 'pipeline_stage_v1', debounce_ms: 2000, snapshot_ttl_seconds: 300,
    result_ttl_seconds: 300, inbox_ids: [], context_sources: { fields: [] }, thresholds: { stage_candidate: 0.8 },
  }, stages: [], expected_hash: 'draft-hash',
};

beforeEach(() => vi.resetAllMocks());

describe('classification catalog HTTP contract', () => {
  it('loads the singleton catalog through the authenticated CRM client', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: { draft_hash: 'draft-hash' } } });
    expect(await classificationCatalogService.get('pipeline/1')).toEqual({ draft_hash: 'draft-hash' });
    expect(api.get).toHaveBeenCalledWith('/pipelines/pipeline%2F1/classification_catalog');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends a complete aggregate and expected revision with PATCH', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true, data: { draft_hash: 'next-hash' } } });
    await classificationCatalogService.update('p1', content);
    expect(api.patch).toHaveBeenCalledWith('/pipelines/p1/classification_catalog', content);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps offline preview on its dedicated endpoint', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: { valid: true, draft_hash: 'draft-hash' } } });
    expect(await classificationCatalogService.preview('p1', content)).toEqual({ valid: true, draft_hash: 'draft-hash' });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/pipelines/p1/classification_catalog/preview', content);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('publishes only the revision reference, without enabling or sending credentials', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: { catalog_version: 1 } } });
    await classificationCatalogService.publish('p1', 'draft-hash');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/pipelines/p1/classification_catalog/publish', { expected_hash: 'draft-hash' });
    expect(api.patch).not.toHaveBeenCalled();
  });
});
