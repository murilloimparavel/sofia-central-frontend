import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/services/core/api';
import KnowledgeAgentBindings from './KnowledgeAgentBindings';

vi.mock('@/services/core/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

describe('agent knowledge bindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: { data: url === '/knowledge_bases' ? [{ id: 'a', name: 'Vendas', status: 'active' }] : { revision: 3, base_ids: [] } },
    }));
  });

  it('saves selected bases with the current revision', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { data: { revision: 4 } } });
    render(<KnowledgeAgentBindings agentId="agent" canEdit />);
    await userEvent.click(await screen.findByLabelText('Vendas'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar vínculos' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/agents/agent/knowledge_bases', { base_ids: ['a'], expected_revision: 3 }));
  });

  it('shows conflicts and requires reload before retry', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { status: 409 } });
    render(<KnowledgeAgentBindings agentId="agent" canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar vínculos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Os vínculos foram alterados');
    expect(screen.queryByRole('button', { name: 'Salvar vínculos' })).not.toBeInTheDocument();
  });

  it('disallows editing when the actor is read only', async () => {
    render(<KnowledgeAgentBindings agentId="agent" canEdit={false} />);
    expect(await screen.findByLabelText('Vendas')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar vínculos' })).not.toBeInTheDocument();
  });
});
