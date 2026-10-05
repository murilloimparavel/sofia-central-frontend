import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/services/core/api';
import { conversationAPI } from './conversationService';

vi.mock('@/services/core/api', () => ({
  default: { post: vi.fn() },
}));

describe('conversationAPI.toggleTypingStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['on', 'off'] as const)('posts typing status %s to the CRM endpoint', async (typingStatus) => {
    await conversationAPI.toggleTypingStatus('conversation-123', typingStatus);

    expect(api.post).toHaveBeenCalledWith('/conversations/conversation-123/toggle_typing_status', {
      typing_status: typingStatus,
    });
  });
});
