import api from '@/services/core/api';
import { extractData, extractResponse } from '@/utils/apiHelpers';
import type { StandardResponse } from '@/types/core';
import type {
  Pipeline,
  PipelinesListParams,
  PipelineDependents,
  CreatePipelineData,
  UpdatePipelineData,
  CreateStageData,
  PipelineItem,
  MovePipelineItemData,
  PipelineStage,
  PipelineStats,
  PipelinesResponse,
  StagesResponse,
  ItemsResponse,
  AvailableConversationsResponse,
  AvailableContactsResponse,
  PipelineItemResponse,
  ConversationForModal,
  StageAutomationRule,
} from '@/types/analytics';
import { Contact } from '@/types';

interface PipelinesCacheEntry {
  data: PipelinesResponse;
  timestamp: number;
}

const PIPELINES_TTL_MS = 3 * 60 * 1000; // 3 minutos
const pipelinesCache = new Map<string, PipelinesCacheEntry>();
const pipelinesInFlight = new Map<string, Promise<PipelinesResponse>>();

class PipelinesService {
  clearCache(): void {
    pipelinesCache.clear();
    pipelinesInFlight.clear();
  }

  // List all pipelines
  async getPipelines(params?: PipelinesListParams): Promise<PipelinesResponse> {
    const cacheKey = JSON.stringify(params || {});
    const cached = pipelinesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PIPELINES_TTL_MS) {
      return cached.data;
    }

    if (pipelinesInFlight.has(cacheKey)) {
      return pipelinesInFlight.get(cacheKey)!;
    }

    try {
      const fetchPromise = (async () => {
        const response = await api.get('/pipelines', {
          params,
        });
        const result = extractResponse<Pipeline>(response) as PipelinesResponse;
        pipelinesCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
        return result;
      })();

      pipelinesInFlight.set(cacheKey, fetchPromise);
      const result = await fetchPromise;
      return result;
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      throw error;
    } finally {
      pipelinesInFlight.delete(cacheKey);
    }
  }

  // Get single pipeline
  async getPipeline(pipelineId: string): Promise<Pipeline> {
    const response = await api.get(`/pipelines/${pipelineId}`);
    return extractData<Pipeline>(response);
  }

  async getClassificationCatalog(pipelineId: string): Promise<Record<string, unknown>> {
    const response = await api.get(`/pipelines/${pipelineId}/classification_catalog`);
    return extractData<Record<string, unknown>>(response);
  }

  async previewClassificationCatalog(pipelineId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await api.post(`/pipelines/${pipelineId}/classification_catalog/preview`, payload);
    return extractData<Record<string, unknown>>(response);
  }

  async saveClassificationCatalog(pipelineId: string, payload: Record<string, unknown>, expectedHash: string): Promise<Record<string, unknown>> {
    const response = await api.put(`/pipelines/${pipelineId}/classification_catalog`, { ...payload, expected_hash: expectedHash });
    return extractData<Record<string, unknown>>(response);
  }

  async publishClassificationCatalog(pipelineId: string, expectedHash: string): Promise<Record<string, unknown>> {
    const response = await api.post(`/pipelines/${pipelineId}/classification_catalog/publish`, { expected_hash: expectedHash });
    return extractData<Record<string, unknown>>(response);
  }

  async getClassificationResults(pipelineId: string, limit = 50, beforeId?: string): Promise<Array<Record<string, unknown>>> {
    const response = await api.get(`/pipelines/${pipelineId}/classification_catalog/results`, { params: { limit, before_id: beforeId } });
    return extractData<Array<Record<string, unknown>>>(response);
  }

  async backfillClassificationBatch(pipelineId: string, limit = 50, afterId?: string): Promise<Record<string, unknown>> {
    const response = await api.post(`/pipelines/${pipelineId}/classification_catalog/backfill`, { limit, after_id: afterId });
    return extractData<Record<string, unknown>>(response);
  }

  async getPipelineClassificationRuntime(pipelineId: string): Promise<Record<string, unknown>> {
    const response = await api.get(`/pipelines/${pipelineId}/classification_catalog/runtime`);
    return extractData<Record<string, unknown>>(response);
  }

  async setAutomaticPipelineMoves(pipelineId: string, enabled: boolean): Promise<Record<string, unknown>> {
    const response = await api.patch(`/pipelines/${pipelineId}/classification_catalog/runtime`, { automatic_moves_enabled: enabled });
    return extractData<Record<string, unknown>>(response);
  }

  async updatePipelineClassificationRuntime(pipelineId: string, settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await api.patch(`/pipelines/${pipelineId}/classification_catalog/runtime`, settings);
    return extractData<Record<string, unknown>>(response);
  }

  async resetPipelineClassificationProvider(pipelineId: string): Promise<Record<string, unknown>> {
    const response = await api.post(`/pipelines/${pipelineId}/classification_catalog/runtime/reset_provider`);
    return extractData<Record<string, unknown>>(response);
  }

  // Get all pipelines filtered by contact (optimized - single request)
  async getPipelinesByContact(contactId: string): Promise<Pipeline[]> {
    const response = await api.get(`/pipelines/by_contact/${contactId}`);
    return extractData<Pipeline[]>(response);
  }

  // Get all pipelines filtered by conversation (optimized - single request)
  async getPipelinesByConversation(conversationId: string): Promise<Pipeline[]> {
    const response = await api.get(`/pipelines/by_conversation/${conversationId}`);
    return extractData<Pipeline[]>(response);
  }

  // Create pipeline
  async createPipeline(data: CreatePipelineData): Promise<Pipeline> {
    this.clearCache();
    const response = await api.post('/pipelines', data);
    return extractData<Pipeline>(response);
  }

  // Update pipeline
  async updatePipeline(pipelineId: string, data: UpdatePipelineData): Promise<Pipeline> {
    this.clearCache();
    const response = await api.patch(`/pipelines/${pipelineId}`, data);
    return extractData<Pipeline>(response);
  }

  // Delete pipeline
  async deletePipeline(pipelineId: string): Promise<{ success: boolean; message: string }> {
    this.clearCache();
    const response = await api.delete(`/pipelines/${pipelineId}`);
    return extractData<{ success: boolean; message: string }>(response);
  }

  // Duplicate pipeline
  async duplicatePipeline(
    pipelineId: string,
    data: { name: string; description?: string },
  ): Promise<Pipeline> {
    this.clearCache();
    const response = await api.post(`/pipelines/${pipelineId}/duplicate`, data);
    return extractData<Pipeline>(response);
  }

  // Toggle pipeline status
  async togglePipelineStatus(pipelineId: string, isActive: boolean): Promise<Pipeline> {
    this.clearCache();
    const response = await api.patch(`/pipelines/${pipelineId}`, {
      is_active: isActive,
    });
    return extractData<Pipeline>(response);
  }

  // What still feeds this pipeline. Drives the archive confirmation (EVO-2200).
  async getDependents(pipelineId: string): Promise<PipelineDependents> {
    const response = await api.get(`/pipelines/${pipelineId}/dependents`);
    return extractData<PipelineDependents>(response);
  }

  // Set pipeline as default
  async setAsDefault(pipelineId: string): Promise<Pipeline> {
    this.clearCache();
    const response = await api.patch(`/pipelines/${pipelineId}/set_as_default`);
    return extractData<Pipeline>(response);
  }

  // Get pipeline stages
  async getPipelineStages(pipelineId: string): Promise<StagesResponse> {
    const response = await api.get(`/pipelines/${pipelineId}/pipeline_stages`);
    return extractResponse<PipelineStage>(response) as StagesResponse;
  }

  // Create pipeline stage
  async createPipelineStage(pipelineId: string, data: CreateStageData): Promise<PipelineStage> {
    this.clearCache();
    const response = await api.post(`/pipelines/${pipelineId}/pipeline_stages`, {
      pipeline_stage: data,
    });
    return extractData<PipelineStage>(response);
  }

  // Update pipeline stage
  async updatePipelineStage(
    pipelineId: string,
    stageId: string,
    data: {
      name?: string;
      description?: string;
      position?: number;
      color?: string;
      stage_type?: string;
      // Sent whole: the API merges what arrives over what is stored, so an omitted key is
      // kept, not cleared. To erase, send the empty value.
      automation_rules?: { description?: string; rules?: StageAutomationRule[] };
      custom_fields?: Record<string, unknown>;
    },
  ): Promise<PipelineStage> {
    this.clearCache();
    const response = await api.patch(`/pipelines/${pipelineId}/pipeline_stages/${stageId}`, {
      pipeline_stage: data,
    });
    return extractData<PipelineStage>(response);
  }

  // Delete pipeline stage
  async deletePipelineStage(
    pipelineId: string,
    stageId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.clearCache();
    const response = await api.delete(`/pipelines/${pipelineId}/pipeline_stages/${stageId}`);
    return extractData<{ success: boolean; message: string }>(response);
  }

  // Reorder pipeline stages
  async reorderPipelineStages(
    pipelineId: string,
    stageOrders: string[],
  ): Promise<{ success: boolean; message: string }> {
    this.clearCache();
    const response = await api.patch(`/pipelines/${pipelineId}/pipeline_stages/reorder`, {
      stage_orders: stageOrders,
    });
    return extractData<{ success: boolean; message: string }>(response);
  }

  // Get items in a pipeline
  async getPipelineItems(
    pipelineId: string,
    params?: { page?: number; per_page?: number; stage_id?: string },
  ): Promise<ItemsResponse> {
    const response = await api.get(`/pipelines/${pipelineId}/pipeline_items`, {
      params,
    });
    return extractResponse<PipelineItem>(response) as ItemsResponse;
  }

  // Move item to different stage
  async moveItem(data: MovePipelineItemData): Promise<{ success: boolean; message: string }> {
    const response = await api.patch(
      `/pipelines/${data.pipeline_id}/pipeline_items/${data.item_id}/move_to_stage`,
      {
        new_stage_id: data.to_stage_id,
        notes: '',
      },
    );
    return extractData<{ success: boolean; message: string }>(response);
  }

  // Get available conversations for pipeline
  async getAvailableConversations(
    pipelineId: string,
    params: { search?: string } = {},
  ): Promise<ConversationForModal[]> {
    const response = await api.get<AvailableConversationsResponse>(
      `/pipelines/${pipelineId}/pipeline_items/available_conversations`,
      { params },
    );

    return extractData<ConversationForModal[]>(response);
  }

  // Get available contacts for pipeline
  async getAvailableContacts(
    pipelineId: string,
    params: { search?: string } = {},
  ): Promise<Contact[]> {
    const response = await api.get<AvailableContactsResponse>(
      `/pipelines/${pipelineId}/pipeline_items/available_contacts`,
      { params },
    );
    return extractData<Contact[]>(response);
  }

  // Add item to pipeline
  async addItemToPipeline(
    pipelineId: string,
    data: {
      item_id: string;
      type: 'conversation' | 'contact';
      pipeline_stage_id: string;
      custom_fields?: Record<string, unknown>;
      notes?: string;
    },
  ): Promise<PipelineItemResponse> {
    const response = await api.post(`/pipelines/${pipelineId}/pipeline_items`, data);
    return extractData<PipelineItemResponse>(response);
  }

  // Update item in pipeline
  async updateItemInPipeline(
    pipelineId: string,
    itemId: string,
    data: {
      pipeline_stage_id?: string;
      notes?: string;
      custom_fields?: Record<string, unknown>;
    },
  ): Promise<PipelineItemResponse> {
    const response = await api.patch(`/pipelines/${pipelineId}/pipeline_items/${itemId}`, data);
    return extractData<PipelineItemResponse>(response);
  }

  // Remove item from pipeline
  async removeItemFromPipeline(
    pipelineId: string,
    itemId: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/pipelines/${pipelineId}/pipeline_items/${itemId}`);
    return extractData<{ success: boolean; message: string }>(response);
  }

  // Get pipeline statistics
  async getPipelineStats(pipelineId?: string): Promise<StandardResponse<PipelineStats>> {
    const url = pipelineId ? `/pipelines/${pipelineId}/stats` : '/pipelines/stats';

    const response = await api.get(url);
    return extractData<StandardResponse<PipelineStats>>(response);
  }
}

export const pipelinesService = new PipelinesService();
