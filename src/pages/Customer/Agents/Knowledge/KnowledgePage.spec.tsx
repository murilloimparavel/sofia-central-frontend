import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePage from './KnowledgePage';
import api from '@/services/core/api';
const auth = vi.hoisted(() => ({ publish: true }));
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    isReady: true,
    can: (_r: string, a: string) => a !== 'publish' || auth.publish,
  }),
}));
vi.mock('@/components/agents/AgentsTabsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/services/core/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
describe('knowledge authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.publish = true;
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
  });
  it('creates a draft before publishing it', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'entry-1' } } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Nova informação'));
    await user.type(screen.getByLabelText('Título'), 'Endereço');
    await user.type(screen.getByLabelText('Conteúdo'), 'Rua das Flores');
    await user.click(screen.getByText('Publicar'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/knowledge_entries/entry-1/publish'),
    );
    expect(api.post).toHaveBeenCalledWith(
      '/knowledge_entries',
      expect.objectContaining({
        ai_knowledge_entry: expect.objectContaining({ title: 'Endereço', body: 'Rua das Flores' }),
      }),
    );
  });
  it('does not offer publishing to consultants', async () => {
    auth.publish = false;
    render(<KnowledgePage />);
    await userEvent.click(screen.getByText('Nova informação'));
    expect(screen.queryByText('Publicar')).not.toBeInTheDocument();
    expect(screen.getByText('Salvar rascunho')).toBeInTheDocument();
  });
});
