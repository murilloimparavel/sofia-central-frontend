import api from '@/services/core/api';

export type AssistantMode = 'alternative' | 'reservation' | 'availability';

export interface SearchRequest {
  reservationCode?: string;
  amenity?: string;
  inventory?: string;
  from?: string;
  to?: string;
  adults?: number;
  children?: number;
  childAges?: number[];
  source?: 'stays' | 'imobsys';
  filters?: Record<string, string | number | boolean | null>;
}

// Search API endpoints validate the CRM session and keep provider credentials
// server-side. Never call Stays/ImobSys directly from browser code.
export async function searchCommercialAssistant(mode: AssistantMode, request: SearchRequest) {
  const baseUrl = import.meta.env.VITE_SEARCH_API_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('A URL da Search API não está configurada neste ambiente.');
  const { data } = await api.post(`${baseUrl}/api/v1/commercial-assistant/${mode}`, request);
  return data?.data ?? data;
}
