import { describe, it, expect, vi, beforeEach } from 'vitest';
import cannedResponsesService from './cannedResponsesService';
import api from '@/services/core/api';

vi.mock('@/services/core/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('cannedResponsesService cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cannedResponsesService.clearCache();
  });

  it('serves repeated requests from memory cache without hitting API again', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: [{ id: '1', short_code: 'oi', content: 'Olá' }] },
    });

    const res1 = await cannedResponsesService.getCannedResponses();
    expect(api.get).toHaveBeenCalledTimes(1);

    const res2 = await cannedResponsesService.getCannedResponses();
    expect(api.get).toHaveBeenCalledTimes(1); // Não chamou api de novo
    expect(res2).toEqual(res1);
  });

  it('clears cache when creating a new canned response', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: '1', short_code: 'oi', content: 'Olá' }] },
    });
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { data: { id: '2', short_code: 'tchau', content: 'Tchau' } },
    });

    await cannedResponsesService.getCannedResponses();
    expect(api.get).toHaveBeenCalledTimes(1);

    await cannedResponsesService.createCannedResponse({
      short_code: 'tchau',
      content: 'Tchau',
    });

    await cannedResponsesService.getCannedResponses();
    expect(api.get).toHaveBeenCalledTimes(2); // Invalidação funcionou!
  });
});
