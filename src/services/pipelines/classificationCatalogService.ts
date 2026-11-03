import api from '@/services/core/api';
import { extractData } from '@/utils/apiHelpers';
import type {
  ClassificationCatalog,
  ClassificationCatalogWrite,
  ClassificationCatalogPreview,
} from '@/types/pipelines/classificationCatalog';

const resource = (pipelineId: string) => `/pipelines/${encodeURIComponent(pipelineId)}/classification_catalog`;

export const classificationCatalogService = {
  async get(pipelineId: string): Promise<ClassificationCatalog> {
    return extractData<ClassificationCatalog>(await api.get(resource(pipelineId)));
  },
  async update(pipelineId: string, content: ClassificationCatalogWrite): Promise<ClassificationCatalog> {
    return extractData<ClassificationCatalog>(await api.patch(resource(pipelineId), content));
  },
  async preview(pipelineId: string, content: ClassificationCatalogWrite): Promise<ClassificationCatalogPreview> {
    return extractData<ClassificationCatalogPreview>(await api.post(`${resource(pipelineId)}/preview`, content));
  },
  async publish(pipelineId: string, expectedHash: string): Promise<ClassificationCatalog> {
    return extractData<ClassificationCatalog>(await api.post(`${resource(pipelineId)}/publish`, { expected_hash: expectedHash }));
  },
};
