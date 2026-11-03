import api from '@/services/core/api';
import { extractData, extractResponse } from '@/utils/apiHelpers';
import type {
  Inbox,
  InboxesResponse,
  InboxResponse,
  InboxDeleteResponse,
  ChannelPayload,
} from '@/types/channels/inbox';

const appendFormDataValue = (formData: FormData, key: string, value: unknown): void => {
  if (value === undefined || value === null) return;

  if (value instanceof Blob) {
    formData.append(key, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => appendFormDataValue(formData, `${key}[]`, item));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
      appendFormDataValue(formData, `${key}[${nestedKey}]`, nestedValue);
    });
    return;
  }

  formData.append(key, String(value));
};

const ALL_INBOXES_PAGE_SIZE = 100;
const MAX_INBOXES_PAGES = 100;

const paginationError = (reason: string): Error => new Error(`Could not fetch all inbox pages: ${reason}`);

// Inbox service aligned with Evolution API
// Only endpoints needed for the Channels page are implemented initially.
const InboxesService = {
  async list(): Promise<InboxesResponse> {
    const response = await api.get('/inboxes');
    return extractResponse<Inbox>(response) as InboxesResponse;
  },

  async listAll(): Promise<Pick<InboxesResponse, 'data'>> {
    const inboxesById = new Map<string, Inbox>();
    const seenPageSignatures = new Set<string>();
    let expectedTotalPages: number | undefined;
    let expectedTotal: number | undefined;
    let expectedPageSize: number | undefined;

    for (let page = 1; page <= MAX_INBOXES_PAGES; page += 1) {
      const response = await api.get('/inboxes', {
        params: { page, per_page: ALL_INBOXES_PAGE_SIZE },
      });
      const result = extractResponse<Inbox>(response) as InboxesResponse;
      const pageData = result?.data;
      const pagination = result?.meta?.pagination;

      if (!Array.isArray(pageData) || !pagination) {
        throw paginationError(`page ${page} did not include data and pagination metadata`);
      }

      const { page: currentPage, page_size: pageSize, total, total_pages: totalPages } = pagination;
      if (
        !Number.isSafeInteger(currentPage) ||
        currentPage !== page ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        !Number.isSafeInteger(totalPages) ||
        totalPages < 0 ||
        totalPages !== Math.ceil(total / pageSize)
      ) {
        throw paginationError(`page ${page} returned invalid pagination metadata`);
      }

      if (totalPages > MAX_INBOXES_PAGES) {
        throw paginationError(`page count exceeds the ${MAX_INBOXES_PAGES}-page safety limit`);
      }
      if (expectedTotalPages !== undefined && totalPages !== expectedTotalPages) {
        throw paginationError('page count changed while loading inboxes');
      }
      if (expectedTotal !== undefined && total !== expectedTotal) {
        throw paginationError('record count changed while loading inboxes');
      }
      if (expectedPageSize !== undefined && pageSize !== expectedPageSize) {
        throw paginationError('page size changed while loading inboxes');
      }
      expectedTotalPages = totalPages;
      expectedTotal = total;
      expectedPageSize = pageSize;

      if (totalPages === 0) {
        if (page !== 1 || pageData.length > 0 || total !== 0) {
          throw paginationError(`page ${page} returned data for an empty collection`);
        }
        return { data: [] };
      }
      if (page > totalPages) {
        throw paginationError(`pagination ended before page ${page}`);
      }

      const pageIds = pageData.map(inbox => {
        if (!inbox || typeof inbox.id !== 'string' || inbox.id.length === 0) {
          throw paginationError(`page ${page} contained an inbox without a valid ID`);
        }
        return inbox.id;
      });
      const pageSignature = JSON.stringify(pageIds);
      if (seenPageSignatures.has(pageSignature)) {
        throw paginationError(`page ${page} repeated an earlier page`);
      }
      seenPageSignatures.add(pageSignature);

      let addedCount = 0;
      pageData.forEach(inbox => {
        if (!inboxesById.has(inbox.id)) {
          addedCount += 1;
        }
        inboxesById.set(inbox.id, inbox);
      });
      if (addedCount === 0) {
        throw paginationError(`page ${page} made no progress`);
      }

      if (page === totalPages) {
        return { data: Array.from(inboxesById.values()) };
      }
    }

    throw paginationError(`pagination did not finish within ${MAX_INBOXES_PAGES} pages`);
  },

  async getById(inboxId: string): Promise<InboxResponse> {
    const response = await api.get(`/inboxes/${inboxId}`);
    // getById returns StandardResponse<Inbox> (single object), not PaginatedResponse
    return {
      success: response.data.success,
      data: extractData<Inbox>(response),
      meta: response.data.meta,
      message: response.data?.message || '',
    } as InboxResponse;
  },

  async remove(inboxId: string): Promise<InboxDeleteResponse> {
    const response = await api.delete(`/inboxes/${inboxId}`);
    return extractData<InboxDeleteResponse>(response);
  },

  async createChannel(payload: ChannelPayload): Promise<InboxResponse> {
    const response = await api.post('/inboxes', payload);
    return extractData<InboxResponse>(response);
  },

  async create(payload: ChannelPayload): Promise<InboxResponse> {
    const response = await api.post('/inboxes', payload);
    return extractData<InboxResponse>(response);
  },

  async getCampaigns(inboxId: string) {
    const response = await api.get(`/inboxes/${inboxId}/campaigns`);
    return extractData(response);
  },

  async deleteAvatar(inboxId: string): Promise<InboxDeleteResponse> {
    const response = await api.delete(`/inboxes/${inboxId}/avatar`);
    return extractData<InboxDeleteResponse>(response);
  },

  async getAgentBot(inboxId: string) {
    const response = await api.get(`/inboxes/${inboxId}/agent_bot`);
    return extractData(response);
  },

  async setAgentBot(inboxId: string, botId: string) {
    const response = await api.post(`/inboxes/${inboxId}/set_agent_bot`, {
      agent_bot: botId,
    });
    return extractData(response);
  },

  async setupChannelProvider(inboxId: string) {
    const response = await api.post(`/inboxes/${inboxId}/setup_channel_provider`);
    return extractData(response);
  },

  async disconnectChannelProvider(inboxId: string) {
    const response = await api.post(`/inboxes/${inboxId}/disconnect_channel_provider`);
    return extractData(response);
  },

  async syncWhatsappSubscription(inboxId: string) {
    const response = await api.post(`/inboxes/${inboxId}/sync_whatsapp_subscription`);
    return extractData(response);
  },

  async update(inboxId: string, payload: Record<string, unknown>): Promise<InboxResponse> {
    const response = await api.patch(`/inboxes/${inboxId}`, payload);
    return extractData<InboxResponse>(response);
  },

  async updateWithAvatar(
    inboxId: string,
    payload: Record<string, unknown>,
    avatar: File,
  ): Promise<InboxResponse> {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      appendFormDataValue(formData, key, value);
    });
    formData.append('avatar', avatar);

    const response = await api.patch(`/inboxes/${inboxId}`, formData);
    return extractData<InboxResponse>(response);
  },

  async getFacebookPosts(inboxId: string, limit: number = 20) {
    const response = await api.get(`/inboxes/${inboxId}/facebook_posts`, {
      params: { limit },
    });
    return extractData(response);
  },
};

export default InboxesService;
