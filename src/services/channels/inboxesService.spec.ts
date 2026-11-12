import { beforeEach, describe, expect, it, vi } from 'vitest';
import InboxesService from './inboxesService';
import api from '@/services/core/api';

vi.mock('@/services/core/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/utils/apiHelpers', () => ({
  extractData: vi.fn((response: { data: unknown }) => response.data),
  extractResponse: vi.fn((response: { data: unknown }) => response.data),
}));

describe('InboxesService.listAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads every page, including WhatsApp inboxes after the first page', async () => {
    const get = vi.mocked(api.get);
    get.mockResolvedValueOnce({ data: { data: [{ id: 'api', channel_type: 'Channel::Api' }], meta: { pagination: { total_pages: 2 } } } } as never);
    get.mockResolvedValueOnce({ data: { data: [{ id: 'wa', channel_type: 'Channel::Whatsapp' }], meta: { pagination: { total_pages: 2 } } } } as never);

    expect(await InboxesService.listAll()).toEqual([
      { id: 'api', channel_type: 'Channel::Api' },
      { id: 'wa', channel_type: 'Channel::Whatsapp' },
    ]);
    expect(get).toHaveBeenNthCalledWith(1, '/inboxes', { params: { page: 1 } });
    expect(get).toHaveBeenNthCalledWith(2, '/inboxes', { params: { page: 2 } });
  });

  it('propagates a later page failure instead of returning an incomplete list', async () => {
    const get = vi.mocked(api.get);
    get.mockResolvedValueOnce({ data: { data: [], meta: { pagination: { total_pages: 2 } } } } as never);
    get.mockRejectedValueOnce(new Error('request failed'));
    await expect(InboxesService.listAll()).rejects.toThrow('request failed');
  });
});

describe('InboxesService.updateWithAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends multipart payload with avatar and nested channel fields', async () => {
    const patchMock = vi.mocked(api.patch);
    patchMock.mockResolvedValue({
      data: { success: true, data: { id: 'inbox-1' } },
    } as never);

    const avatar = new File(['avatar-binary'], 'avatar.png', { type: 'image/png' });
    const payload = {
      name: 'Website',
      display_name: 'Website Chat',
      channel: {
        widget_color: '#0ea5e9',
        selected_feature_flags: ['attachments', 'emoji_picker'],
      },
      business_name: null,
    };

    await InboxesService.updateWithAvatar('inbox-1', payload, avatar);

    expect(patchMock).toHaveBeenCalledTimes(1);

    const [url, body, config] = patchMock.mock.calls[0];
    expect(url).toBe('/inboxes/inbox-1');
    expect(body).toBeInstanceOf(FormData);
    expect(config).toBeUndefined();

    const formData = body as FormData;
    expect(formData.get('name')).toBe('Website');
    expect(formData.get('display_name')).toBe('Website Chat');
    expect(formData.get('channel[widget_color]')).toBe('#0ea5e9');
    expect(formData.getAll('channel[selected_feature_flags][]')).toEqual(['attachments', 'emoji_picker']);
    expect(formData.get('avatar')).toBe(avatar);
    expect(formData.has('business_name')).toBe(false);
  });
});
