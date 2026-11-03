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

const inbox = (id: string) => ({ id, name: `Inbox ${id}` });
const inboxPage = (data: ReturnType<typeof inbox>[], page: number, total: number, pageSize = 20) => ({
  success: true,
  data,
  meta: {
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  },
});

describe('InboxesService.listAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads every page and includes WhatsApp inboxes returned after the first page', async () => {
    const getMock = vi.mocked(api.get);
    const firstPage = Array.from({ length: 20 }, (_, index) => inbox(`inbox-${index + 1}`));
    const whatsappPage = [
      { ...inbox('inbox-21'), channel_type: 'Channel::Whatsapp', provider: 'whatsapp_cloud' },
      { ...inbox('inbox-22'), channel_type: 'Channel::Whatsapp', provider: 'whatsapp_cloud' },
      inbox('inbox-23'),
    ];
    getMock
      .mockResolvedValueOnce({ data: inboxPage(firstPage, 1, 23) } as never)
      .mockResolvedValueOnce({ data: inboxPage(whatsappPage, 2, 23) } as never);

    const result = await InboxesService.listAll();

    expect(result.data).toHaveLength(23);
    expect(result.data.slice(20, 22).map(item => [item.channel_type, item.provider])).toEqual([
      ['Channel::Whatsapp', 'whatsapp_cloud'],
      ['Channel::Whatsapp', 'whatsapp_cloud'],
    ]);
    expect(getMock).toHaveBeenNthCalledWith(1, '/inboxes', { params: { page: 1, per_page: 100 } });
    expect(getMock).toHaveBeenNthCalledWith(2, '/inboxes', { params: { page: 2, per_page: 100 } });
  });

  it('deduplicates inbox IDs across pages while retaining later records', async () => {
    const getMock = vi.mocked(api.get);
    getMock
      .mockResolvedValueOnce({ data: inboxPage([inbox('one'), inbox('two')], 1, 3, 2) } as never)
      .mockResolvedValueOnce({ data: inboxPage([{ ...inbox('two'), name: 'Inbox two (updated)' }, inbox('three')], 2, 3, 2) } as never);

    const result = await InboxesService.listAll();

    expect(result.data.map(item => item.id)).toEqual(['one', 'two', 'three']);
    expect(result.data.find(item => item.id === 'two')?.name).toBe('Inbox two (updated)');
  });

  it('returns an empty complete list when pagination reports no records', async () => {
    const getMock = vi.mocked(api.get);
    getMock.mockResolvedValueOnce({ data: inboxPage([], 1, 0, 100) } as never);

    await expect(InboxesService.listAll()).resolves.toEqual({ data: [] });
  });

  it('rejects a repeated page instead of returning partial data', async () => {
    const getMock = vi.mocked(api.get);
    getMock
      .mockResolvedValueOnce({ data: inboxPage([inbox('one')], 1, 2, 1) } as never)
      .mockResolvedValueOnce({ data: inboxPage([inbox('one')], 2, 2, 1) } as never);

    await expect(InboxesService.listAll()).rejects.toThrow('page 2 repeated an earlier page');
  });

  it('rejects the whole result when a later page fails', async () => {
    const getMock = vi.mocked(api.get);
    getMock
      .mockResolvedValueOnce({ data: inboxPage([inbox('one')], 1, 2, 1) } as never)
      .mockRejectedValueOnce(new Error('page two failed'));

    await expect(InboxesService.listAll()).rejects.toThrow('page two failed');
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});

describe('InboxesService.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the existing single-page paginated request contract', async () => {
    const getMock = vi.mocked(api.get);
    const response = inboxPage([inbox('inbox-1')], 1, 2, 1);
    getMock.mockResolvedValueOnce({ data: response } as never);

    const result = await InboxesService.list();

    expect(result.data.map(item => item.id)).toEqual(['inbox-1']);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/inboxes');
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
