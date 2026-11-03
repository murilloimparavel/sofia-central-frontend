import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePage from './KnowledgePage';
import api from '@/services/core/api';
const auth = vi.hoisted(() => ({ publish: true, read: true }));
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    isReady: true,
    can: (_r: string, a: string) =>
      (a !== 'publish' || auth.publish) && (a !== 'read' || auth.read),
  }),
}));
vi.mock('@/components/agents/AgentsTabsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/services/core/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
const base = {
  id: 'base-1',
  name: 'Geral',
  description: '',
  status: 'active',
  lock_version: 0,
  legacy_default: true,
  entries_count: 0,
  published_count: 0,
  can_publish_entries: true,
};
const list = (entries: unknown[] = []) =>
  vi.mocked(api.get).mockImplementation(async (url: string) => ({
    data: { data: url === '/knowledge_bases' ? [base] : entries },
  }));
const openBase = async () =>
  userEvent.click(await screen.findByRole('button', { name: 'Abrir base' }));
describe('knowledge authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.publish = true;
    auth.read = true;
    list();
  });
  it('creates a draft before publishing it', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'entry-1' } } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(screen.getByRole('button', { name: 'Adicionar conteúdo' }));
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
    await openBase();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar conteúdo' }));
    expect(screen.queryByText('Publicar')).not.toBeInTheDocument();
    expect(screen.getByText('Salvar rascunho')).toBeInTheDocument();
  });
  it('opens articles for reading before editing and preserves published status', async () => {
    list([
      {
        id: 'published',
        title: 'Check-in',
        body: 'Entrada às 14h',
        content_type: 'rule',
        status: 'published',
        tags: ['horarios'],
        source: 'Manual',
        can_edit: true,
        can_publish: true,
      },
    ]);
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(await screen.findByRole('button', { name: /Check-in/ }));
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar conteúdo' }));
    await user.type(screen.getByLabelText('Conteúdo'), ' atualizado');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/knowledge_entries/published',
        expect.objectContaining({
          ai_knowledge_entry: expect.objectContaining({
            status: 'published',
            tags: ['horarios'],
            source: 'Manual',
          }),
        }),
      ),
    );
  });
  it('allows an authorized operator to archive a draft in a restricted base without publishing it', async () => {
    const restricted = {
      ...base,
      id: 'restricted',
      name: 'Restrita',
      legacy_default: false,
      can_publish_entries: false,
    };
    const entry = {
      id: 'draft',
      title: 'Regra',
      body: 'Conteúdo',
      content_type: 'rule',
      tags: [],
      source: '',
      status: 'draft',
      can_edit: true,
      can_publish: false,
      can_archive: true,
    };
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: { data: url === '/knowledge_bases' ? [restricted] : [entry] },
    }));
    vi.mocked(api.patch).mockResolvedValue({ data: { data: { ...entry, status: 'archived' } } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(await screen.findByRole('button', { name: /Regra/ }));
    await user.click(screen.getByRole('button', { name: 'Editar conteúdo' }));
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Arquivar' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/knowledge_entries/draft',
        expect.objectContaining({
          ai_knowledge_entry: expect.objectContaining({ status: 'archived' }),
        }),
      ),
    );
  });
  it('does not offer archive without explicit server authorization', async () => {
    list([
      {
        id: 'draft',
        title: 'Regra',
        body: 'Conteúdo',
        content_type: 'rule',
        tags: [],
        source: '',
        status: 'draft',
        can_edit: true,
        can_publish: false,
        can_archive: false,
      },
    ]);
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(await screen.findByRole('button', { name: /Regra/ }));
    await user.click(screen.getByRole('button', { name: 'Editar conteúdo' }));
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
  });
  it('filters by category using the existing API', async () => {
    render(<KnowledgePage />);
    await openBase();
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por categoria'), 'property');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/knowledge_entries', {
        params: { q: '', status: '', content_type: 'property', knowledge_base_id: 'base-1' },
      }),
    );
  });
  it('retains the created draft when publication fails so retry cannot duplicate it', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { data: { id: 'created' } } })
      .mockRejectedValueOnce(new Error('offline'));
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(screen.getByRole('button', { name: 'Adicionar conteúdo' }));
    await user.type(screen.getByLabelText('Título'), 'Piscinas');
    await user.type(screen.getByLabelText('Conteúdo'), 'Informações verificadas');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await screen.findByRole('button', { name: 'Salvar rascunho' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publicar' })).not.toBeDisabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/knowledge_entries/created', expect.anything()),
    );
    expect(
      vi.mocked(api.post).mock.calls.filter(([url]) => url === '/knowledge_entries'),
    ).toHaveLength(1);
  });
  it('scopes listing and new content to the base selected by the operator', async () => {
    const second = { ...base, id: 'base-2', name: 'Hospedagem' };
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: { data: url === '/knowledge_bases' ? [base, second] : [] },
    }));
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'created' } } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await screen.findByText('Hospedagem');
    await user.click(screen.getAllByRole('button', { name: 'Abrir base' })[1]);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/knowledge_entries', {
        params: { q: '', status: '', content_type: '', knowledge_base_id: 'base-2' },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Adicionar conteúdo' }));
    await user.type(screen.getByLabelText('Título'), 'Check-in');
    await user.type(screen.getByLabelText('Conteúdo'), 'Às 14h');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/knowledge_entries',
        expect.objectContaining({
          ai_knowledge_entry: expect.objectContaining({
            knowledge_base_id: 'base-2',
            status: 'draft',
          }),
        }),
      ),
    );
  });
  it('creates a collection through its dedicated API', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { ...base, id: 'new-base' } } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Criar base' }));
    await user.type(screen.getByLabelText('Nome'), 'Condomínios');
    await user.type(screen.getByLabelText('Descrição (opcional)'), 'Normas por condomínio');
    await user.click(screen.getByRole('button', { name: 'Salvar base' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/knowledge_bases', {
        knowledge_base: { name: 'Condomínios', description: 'Normas por condomínio' },
      }),
    );
  });
  it('refreshes the automatically created general base after the first collection is created', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValue({
        data: { data: [base, { ...base, id: 'new-base', name: 'Normas', legacy_default: false }] },
      });
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'new-base' } } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    expect(
      await screen.findByText(/base Geral também será criada automaticamente/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar base' }));
    await user.type(screen.getByLabelText('Nome'), 'Normas');
    await user.click(screen.getByRole('button', { name: 'Salvar base' }));
    expect(await screen.findByText('Geral')).toBeInTheDocument();
    expect(screen.getByText('Normas')).toBeInTheDocument();
  });
  it('archives only an explicitly permitted non-default base with its revision', async () => {
    const restricted = {
      ...base,
      id: 'base-2',
      name: 'Normas',
      legacy_default: false,
      lock_version: 3,
      can_archive: true,
    };
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: { data: url === '/knowledge_bases' ? [base, restricted] : [] },
    }));
    vi.mocked(api.post).mockResolvedValue({ data: { data: restricted } });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await screen.findByText('Normas');
    expect(screen.getAllByRole('button', { name: 'Arquivar base' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Arquivar base' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/knowledge_bases/base-2/archive', { lock_version: 3 }),
    );
  });
  it('tests retrieval only against the chosen base and renders the published excerpts', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: [{ id: 'entry-2', title: 'Horário', excerpt: 'Check-in após 14h', source: 'Manual' }],
      },
    });
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(screen.getByRole('button', { name: 'Testar busca' }));
    await user.type(screen.getByLabelText('Pergunta'), 'Qual horário?');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/knowledge_bases/base-1/test_retrieval', {
        query: 'Qual horário?',
      }),
    );
    expect(await screen.findByText('Check-in após 14h')).toBeInTheDocument();
  });
  it('shows access denied instead of an empty collection when the operator lacks read permission', () => {
    auth.read = false;
    render(<KnowledgePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('não tem permissão');
    expect(api.get).not.toHaveBeenCalled();
  });
  it('does not offer publication in a base whose server policy disallows it', async () => {
    const restricted = {
      ...base,
      id: 'base-restricted',
      name: 'Restrita',
      legacy_default: false,
      can_publish_entries: false,
    };
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: { data: url === '/knowledge_bases' ? [restricted] : [] },
    }));
    render(<KnowledgePage />);
    const user = userEvent.setup();
    await openBase();
    await user.click(screen.getByRole('button', { name: 'Adicionar conteúdo' }));
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument();
    expect(screen.getByText(/publicação nesta base ainda não está disponível/)).toBeInTheDocument();
  });
});
