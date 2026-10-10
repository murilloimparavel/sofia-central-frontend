import { describe, it, expect, beforeEach, vi } from 'vitest';
import { login, validateToken } from './authService';
import { useAuthStore } from '@/store/authStore';
import type { LoginRequest } from '@/types/auth';

const post = vi.fn();

vi.mock('@/services/core/apiAuth', () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock('@/services/tours/tourService', () => ({
  tourService: { completeTour: vi.fn(), resetTour: vi.fn() },
}));

const validateResponse = { data: { data: { user: { id: 'u-1' } } } };

// Embedded in the shell, this store's copy of the token is filled once, at module
// load — which happens before the host logs in. Deciding "do I need a refresh?"
// from that copy asked for a new token while a valid one sat in localStorage, and
// the refresh writes back into the key the host reads too.
describe('validateToken', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue(validateResponse);
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, impersonation: null });
  });

  it('does not refresh when the token lives only in localStorage', async () => {
    localStorage.setItem('access_token', 'issued-by-the-host');

    await validateToken();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/auth/validate');
  });

  it('still refreshes when there is no token anywhere', async () => {
    post.mockResolvedValueOnce({ data: { data: { access_token: 'fresh' } } });

    await validateToken();

    expect(post).toHaveBeenNthCalledWith(1, '/auth/refresh');
    expect(post).toHaveBeenNthCalledWith(2, '/auth/validate');
  });
});

describe('login', () => {
  beforeEach(() => {
    post.mockReset();
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, impersonation: null });
  });

  it('sends credentials, extracts the standard response envelope and stores the access token', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          user: { id: 'user-1', name: 'Synthetic Agent', email: 'agent@example.test' },
          token: { access_token: 'synthetic-access-token' },
        },
      },
    });
    const credentials: LoginRequest = {
      email: 'agent@example.test',
      password: 'synthetic-password',
    };

    const result = await login(credentials);

    expect(post).toHaveBeenCalledWith('/auth/login', credentials);
    expect(result.response.data.user.id).toBe('user-1');
    expect(useAuthStore.getState().getAccessToken()).toBe('synthetic-access-token');
  });
});
