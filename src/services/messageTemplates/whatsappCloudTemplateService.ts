import api from '@/services/core/api';
import MessageTemplateService from '@/services/channels/messageTemplatesService';
import type { TemplateFormData } from '@/types';

export interface WhatsappTemplatePublication {
  id: string;
  waba_id: string;
  external_template_id?: string | null;
  status: string;
  raw_status?: string | null;
  meta_category?: string | null;
  rejected_reason?: string | null;
  operational_error?: string | null;
}

export interface WhatsappTemplateDefinition {
  id: string;
  name: string;
  content: string;
  language: string;
  category: string;
  components: Array<Record<string, unknown>>;
  variables: Array<Record<string, unknown>>;
  active: boolean;
  publications: WhatsappTemplatePublication[];
}

const service = {
  async targets(): Promise<Array<{ waba_id: string; inboxes: Array<{ inbox_id: string; name: string; phone_number: string }> }>> {
    const { data } = await api.get('/whatsapp_template_definitions/targets');
    return Array.isArray(data) ? data : data?.data || [];
  },
  async list(filters?: { search?: string; category?: string; language?: string; waba_id?: string; status?: string }): Promise<WhatsappTemplateDefinition[]> {
    const { data } = await api.get('/whatsapp_template_definitions', { params: filters });
    return Array.isArray(data) ? data : data?.data || [];
  },
  async create(form: TemplateFormData): Promise<WhatsappTemplateDefinition> {
    const payload = MessageTemplateService.transformToBackendFormat(form, 'Channel::WhatsappCloud');
    const { data } = await api.post('/whatsapp_template_definitions', {
      definition: { ...payload, content: payload.content || form.bodyText || '' },
    });
    return data?.data || data;
  },
  async update(id: string, form: TemplateFormData): Promise<WhatsappTemplateDefinition> {
    const payload = MessageTemplateService.transformToBackendFormat(form, 'Channel::WhatsappCloud');
    const { data } = await api.put(`/whatsapp_template_definitions/${id}`, {
      definition: { ...payload, content: payload.content || form.bodyText || '' },
    });
    return data?.data || data;
  },
  async publish(id: string, wabaIds: string[]): Promise<WhatsappTemplatePublication[]> {
    const { data } = await api.post(`/whatsapp_template_definitions/${id}/publish`, { waba_ids: wabaIds });
    return data?.data || data;
  },
};

export default service;
