import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/services/core/api', () => ({ default: apiMock }));

import service from '../whatsappCloudTemplateService';

beforeEach(() => vi.clearAllMocks());

describe('WhatsApp Cloud template service', () => {
  it('loads safe WABA targets', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{ waba_id: 'waba-1', inboxes: [] }] } });
    await expect(service.targets()).resolves.toEqual([{ waba_id: 'waba-1', inboxes: [] }]);
    expect(apiMock.get).toHaveBeenCalledWith('/whatsapp_template_definitions/targets');
  });

  it('publishes only to the explicitly selected, deduplicated targets', async () => {
    apiMock.post.mockResolvedValue({ data: { data: [] } });
    await service.publish('definition-1', ['waba-1', 'waba-2']);
    expect(apiMock.post).toHaveBeenCalledWith('/whatsapp_template_definitions/definition-1/publish', {
      waba_ids: ['waba-1', 'waba-2'],
    });
  });

  it('creates a definition through the Cloud component contract', async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 'definition-1' } } });
    await service.create({
      name: 'hello', content: '', language: 'pt_BR', category: 'UTILITY', template_type: 'interactive',
      headerFormat: 'TEXT', headerText: 'Olá {{nome}}', bodyText: 'Aviso {{pedido}}', footerText: '', buttons: [],
    });
    const [, body] = apiMock.post.mock.calls[0];
    expect(body.definition.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'HEADER', format: 'TEXT' }),
      expect.objectContaining({ type: 'BODY', text: 'Aviso {{pedido}}' }),
    ]));
    expect(body.definition.category).toBe('UTILITY');
  });
});
