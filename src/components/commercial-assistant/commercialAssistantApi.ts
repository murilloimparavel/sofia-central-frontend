import api from '@/services/core/api';

export type AssistantMode = 'alternative' | 'reservation' | 'availability';

export interface SearchRequest {
  reservationCode?: string;
  inventory?: string;
  from?: string;
  to?: string;
  adults?: number;
  children?: number;
  childAges?: number[];
  source?: 'stays' | 'imobsys';
  filters?: Record<string, string | number | boolean | null>;
}

// CRM endpoints proxy Stays/ImobSys using server-side secrets. Never call those
// providers directly from browser code.
export async function searchCommercialAssistant(mode: AssistantMode, request: SearchRequest) {
  const { data } = await api.post(`/commercial-assistant/${mode}`, request);
  return data?.data ?? data;
}
