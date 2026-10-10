import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCommercialAssistant } from './commercialAssistantApi';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/services/core/api', () => ({ default: { post } }));

describe('searchCommercialAssistant', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SEARCH_API_URL', 'https://search-api.example.test/');
    post.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('calls the authenticated Axios client with the Search API origin and unwraps its data envelope', async () => {
    const request = { reservationCode: 'PT-123' };
    post.mockResolvedValue({ data: { success: true, data: { reservation: { reservationCode: 'PT-123' } } } });

    await expect(searchCommercialAssistant('reservation', request)).resolves.toEqual({ reservation: { reservationCode: 'PT-123' } });
    expect(post).toHaveBeenCalledWith('https://search-api.example.test/api/v1/commercial-assistant/reservation', request);
  });

  it('fails clearly when the Search API origin is not configured', async () => {
    vi.stubEnv('VITE_SEARCH_API_URL', '');
    await expect(searchCommercialAssistant('availability', {})).rejects.toThrow('A URL da Search API não está configurada neste ambiente.');
    expect(post).not.toHaveBeenCalled();
  });
});
