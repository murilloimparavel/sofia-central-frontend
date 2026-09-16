import api from '@/services/core/api';
import { extractData, extractResponse } from '@/utils/apiHelpers';
import {
  CustomAttributeDefinition,
  CustomAttributeResponse,
  CustomAttributeDeleteResponse,
  CustomAttributeFormData,
  AttributeModel,
  CustomAttributesResponse,
} from '@/types/settings';

interface CustomAttributesCacheEntry {
  data: CustomAttributesResponse;
  timestamp: number;
}

const CUSTOM_ATTRIBUTES_TTL_MS = 5 * 60 * 1000; // 5 minutos
const customAttributesCache = new Map<string, CustomAttributesCacheEntry>();
const customAttributesInFlight = new Map<string, Promise<CustomAttributesResponse>>();

class CustomAttributesService {
  clearCache(): void {
    customAttributesCache.clear();
    customAttributesInFlight.clear();
  }

  async getCustomAttributes(attributeModel?: AttributeModel): Promise<CustomAttributesResponse> {
    const cacheKey = attributeModel || '__all__';
    const cached = customAttributesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CUSTOM_ATTRIBUTES_TTL_MS) {
      return cached.data;
    }

    if (customAttributesInFlight.has(cacheKey)) {
      return customAttributesInFlight.get(cacheKey)!;
    }

    try {
      const fetchPromise = (async () => {
        const response = await api.get('/custom_attribute_definitions', {
          params: {
            attribute_model: attributeModel,
          },
        });
        const result = extractResponse<CustomAttributeDefinition>(response) as CustomAttributesResponse;
        customAttributesCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
        return result;
      })();

      customAttributesInFlight.set(cacheKey, fetchPromise);
      const result = await fetchPromise;
      return result;
    } catch (error) {
      console.error('Error fetching custom attributes:', error);
      throw error;
    } finally {
      customAttributesInFlight.delete(cacheKey);
    }
  }

  async getCustomAttribute(attributeId: string): Promise<CustomAttributeResponse> {
    const response = await api.get(`/custom_attribute_definitions/${attributeId}`);
    return extractData<CustomAttributeResponse>(response);
  }

  async createCustomAttribute(data: CustomAttributeFormData): Promise<CustomAttributeResponse> {
    this.clearCache();
    const response = await api.post('/custom_attribute_definitions', {
      custom_attribute_definition: data,
    });
    return extractData<CustomAttributeResponse>(response);
  }

  async updateCustomAttribute(
    attributeId: string,
    data: Partial<CustomAttributeFormData>,
  ): Promise<CustomAttributeResponse> {
    this.clearCache();
    const response = await api.patch(`/custom_attribute_definitions/${attributeId}`, {
      custom_attribute_definition: data,
    });
    return extractData<CustomAttributeResponse>(response);
  }

  async deleteCustomAttribute(attributeId: string): Promise<CustomAttributeDeleteResponse> {
    this.clearCache();
    const response = await api.delete(`/custom_attribute_definitions/${attributeId}`);
    return extractData<CustomAttributeDeleteResponse>(response);
  }

  // Helper method to filter attributes by model on the frontend
  filterAttributesByModel(
    attributes: CustomAttributeDefinition[],
    model: AttributeModel,
  ): CustomAttributeDefinition[] {
    return attributes.filter(attr => attr.attribute_model === model);
  }

  // Helper method to generate attribute key from display name
  generateAttributeKey(displayName: string): string {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  // Helper method to validate regex pattern
  validateRegexPattern(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }
}

export const customAttributesService = new CustomAttributesService();
