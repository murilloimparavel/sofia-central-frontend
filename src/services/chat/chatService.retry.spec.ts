import { beforeEach, describe, expect, it, vi } from 'vitest';
import chatService from './chatService';
import api from '@/services/core/api';

vi.mock('@/services/core/api', () => ({
  default: { post: vi.fn(), get: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

describe('chatService.retryMessage', () => {
  const postMock = vi.mocked(api.post);

  beforeEach(() => vi.clearAllMocks());

  it('calls the dedicated retry endpoint for a specific message', async () => {
    const message = { id: 'message-1', status: 'sent' };
    postMock.mockResolvedValue({ data: { data: message } } as never);

    await expect(chatService.retryMessage('conversation-1', 'message-1')).resolves.toEqual(message);
    expect(postMock).toHaveBeenCalledWith('/conversations/conversation-1/messages/message-1/retry');
  });
});
