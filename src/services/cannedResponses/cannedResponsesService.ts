import api from '@/services/core/api';
import { extractData, extractResponse } from '@/utils/apiHelpers';
import {
  CannedResponse,
  CannedResponseResponse,
  CannedResponseDeleteResponse,
  CannedResponseFormData,
  CannedResponsesResponse,
} from '@/types/knowledge';

interface CannedCacheEntry {
  data: CannedResponsesResponse;
  timestamp: number;
}

const CANNED_RESPONSES_TTL_MS = 3 * 60 * 1000; // 3 minutos
let cannedResponsesCache: CannedCacheEntry | null = null;
let cannedResponsesInFlight: Promise<CannedResponsesResponse> | null = null;

class CannedResponsesService {
  private get baseUrl(): string {
    return '/canned_responses';
  }

  clearCache(): void {
    cannedResponsesCache = null;
    cannedResponsesInFlight = null;
  }

  async getCannedResponses(searchKey?: string, perPage?: number): Promise<CannedResponsesResponse> {
    // Apenas usar cache para a listagem padrão (sem busca ou paginação customizada)
    const isDefaultQuery = !searchKey && !perPage;

    if (isDefaultQuery) {
      if (cannedResponsesCache && Date.now() - cannedResponsesCache.timestamp < CANNED_RESPONSES_TTL_MS) {
        return cannedResponsesCache.data;
      }
      if (cannedResponsesInFlight) {
        return cannedResponsesInFlight;
      }
    }

    try {
      const params = {
        ...(searchKey ? { search: searchKey } : {}),
        ...(perPage ? { per_page: perPage } : {}),
      };

      const fetchPromise = (async () => {
        const response = await api.get(this.baseUrl, { params });
        const result = extractResponse<CannedResponse>(response) as CannedResponsesResponse;
        if (isDefaultQuery) {
          cannedResponsesCache = {
            data: result,
            timestamp: Date.now(),
          };
        }
        return result;
      })();

      if (isDefaultQuery) {
        cannedResponsesInFlight = fetchPromise;
      }

      const result = await fetchPromise;
      return result;
    } catch (error) {
      console.error('Error fetching canned responses:', error);
      throw error;
    } finally {
      if (isDefaultQuery) {
        cannedResponsesInFlight = null;
      }
    }
  }

  async getCannedResponse(cannedResponseId: string): Promise<CannedResponseResponse> {
    const response = await api.get(`${this.baseUrl}/${cannedResponseId}`);
    return extractData<any>(response);
  }

  async createCannedResponse(data: CannedResponseFormData): Promise<CannedResponseResponse> {
    // Se tem attachments, enviar como FormData
    if (data.attachments && data.attachments.length > 0) {
      const formData = new FormData();
      formData.append('canned_response[short_code]', data.short_code);
      formData.append('canned_response[content]', data.content);

      // Adicionar cada arquivo
      data.attachments.forEach(file => {
        formData.append('attachments[]', file);
      });

      const response = await api.post(this.baseUrl, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return extractData<any>(response);
    }

    // Sem attachments, enviar como JSON normal
    const response = await api.post(this.baseUrl, {
      canned_response: data,
    });
    this.clearCache();
    return extractData<any>(response);
  }

  async updateCannedResponse(
    cannedResponseId: string,
    data: Partial<CannedResponseFormData>,
  ): Promise<CannedResponseResponse> {
    this.clearCache();
    const hasNewFiles = !!(data.attachments && data.attachments.length > 0);
    const hasRemovals = !!(data.removeAttachmentIds && data.removeAttachmentIds.length > 0);

    // Adições ou remoções de anexo exigem multipart
    if (hasNewFiles || hasRemovals) {
      const formData = new FormData();
      if (data.short_code) formData.append('canned_response[short_code]', data.short_code);
      if (data.content) formData.append('canned_response[content]', data.content);

      data.attachments?.forEach(file => {
        formData.append('attachments[]', file);
      });

      data.removeAttachmentIds?.forEach(id => {
        formData.append('remove_attachment_ids[]', id);
      });

      const response = await api.patch(`${this.baseUrl}/${cannedResponseId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return extractData<any>(response);
    }

    // Sem alteração de anexos, enviar como JSON normal
    const response = await api.patch(`${this.baseUrl}/${cannedResponseId}`, {
      canned_response: data,
    });
    return extractData<any>(response);
  }

  async deleteCannedResponse(cannedResponseId: string): Promise<CannedResponseDeleteResponse> {
    this.clearCache();
    const response = await api.delete(`${this.baseUrl}/${cannedResponseId}`);
    return extractData<CannedResponseDeleteResponse>(response);
  }

  // Helper method to generate short code from content (suggestion)
  generateShortCode(content: string): string {
    // Take first few words and make a short code suggestion
    const words = content.trim().split(' ').slice(0, 3);
    return words
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .substring(0, 20);
  }

  // Helper method to validate short code format
  isValidShortCode(shortCode: string): boolean {
    // Allow letters, numbers, underscores, hyphens
    return /^[a-zA-Z0-9_-]{2,}$/.test(shortCode);
  }

  // Helper method to sort canned responses
  sortCannedResponses(
    cannedResponses: CannedResponse[],
    sortBy: 'short_code' | 'created_at',
    sortOrder: 'asc' | 'desc',
  ): CannedResponse[] {
    return [...cannedResponses].sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'short_code') {
        comparison = a.short_code.localeCompare(b.short_code);
      } else if (sortBy === 'created_at') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  // Helper method to filter canned responses by search
  filterCannedResponses(cannedResponses: CannedResponse[], searchQuery: string): CannedResponse[] {
    if (!searchQuery.trim()) return cannedResponses;

    const query = searchQuery.toLowerCase();
    return cannedResponses.filter(
      cannedResponse =>
        cannedResponse.short_code.toLowerCase().includes(query) ||
        cannedResponse.content.toLowerCase().includes(query),
    );
  }
}

export const cannedResponsesService = new CannedResponsesService();
export default cannedResponsesService;
