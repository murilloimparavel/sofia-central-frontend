import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@evoapi/design-system';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import AgentsTabsLayout from '@/components/agents/AgentsTabsLayout';
import api from '@/services/core/api';
import KnowledgeBases, { KnowledgeBaseBack, type KnowledgeBase } from './KnowledgeBases';
import KnowledgeTestSearch from './KnowledgeTestSearch';
type Entry = {
  id: string;
  title: string;
  body: string;
  content_type: string;
  tags: string[];
  source: string;
  status: string;
  updated_at?: string;
  can_edit?: boolean;
  can_publish?: boolean;
  can_archive?: boolean;
};
const blank = (): Entry => ({
  id: '',
  title: '',
  body: '',
  content_type: 'faq',
  tags: [],
  source: '',
  status: 'draft',
});
const types: Record<string, string> = {
  faq: 'Perguntas e respostas',
  rule: 'Regra operacional',
  company: 'Informação da empresa',
  property: 'Descrição de imóvel',
};
const statuses: Record<string, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};
const field = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
export default function KnowledgePage() {
  const { can, isReady } = usePermissions();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [base, setBase] = useState<KnowledgeBase | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [viewing, setViewing] = useState<Entry | null>(null);
  const requestId = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!base) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/knowledge_entries', {
        params: { q: query, status, content_type: category, knowledge_base_id: base.id },
      });
      if (currentRequest === requestId.current) setEntries(data.data || []);
    } catch {
      if (currentRequest === requestId.current)
        setError('Não foi possível carregar a base de conhecimento. Tente novamente.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [query, status, category, base]);
  const mayRead = can('ai_knowledge', 'read');
  useEffect(() => {
    if (!base || !isReady || !mayRead) return;
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load, isReady, mayRead, base]);
  const editable =
    !!editor &&
    (editor.id
      ? can('ai_knowledge', 'update') && editor.can_edit === true
      : can('ai_knowledge', 'create'));
  const save = async (nextStatus: string) => {
    if (busy || !editable || !base || base.status !== 'active') return;
    if (nextStatus === 'published' && base.can_publish_entries !== true) return;
    if (!editor || !editor.title.trim() || !editor.body.trim()) {
      toast.error('Preencha o título e o conteúdo.');
      return;
    }
    setBusy(true);
    try {
      const { id } = editor;
      const payload = {
        knowledge_base_id: base.id,
        title: editor.title,
        body: editor.body,
        content_type: editor.content_type,
        tags: editor.tags.map(tag => tag.trim()).filter(Boolean),
        source: editor.source,
        status: editor.status,
      };
      if (id)
        await api.patch(`/knowledge_entries/${id}`, {
          ai_knowledge_entry: { ...payload, status: nextStatus },
        });
      else {
        const { data } = await api.post('/knowledge_entries', { ai_knowledge_entry: payload });
        setEditor({ ...editor, id: data.data.id, can_edit: true });
        if (nextStatus === 'published' || nextStatus === 'archived')
          await api.post(
            `/knowledge_entries/${data.data.id}/${nextStatus === 'published' ? 'publish' : 'archive'}`,
          );
      }
      toast.success('Informação salva.');
      setEditor(null);
      await load();
    } catch {
      toast.error('Não foi possível salvar. Confira sua permissão e tente novamente.');
    } finally {
      setBusy(false);
    }
  };
  if (!base)
    return (
      <AgentsTabsLayout tab="knowledge">
        <div className="overflow-y-auto p-4 sm:p-6">
          <KnowledgeBases onSelect={setBase} />
        </div>
      </AgentsTabsLayout>
    );
  return (
    <AgentsTabsLayout tab="knowledge">
      <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <KnowledgeBaseBack
              name={base.name}
              onBack={() => {
                ++requestId.current;
                setEntries([]);
                setQuery('');
                setStatus('');
                setCategory('');
                setShowTest(false);
                setBase(null);
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Respostas confiáveis, organizadas em um só lugar.
            </p>
          </div>
          {base.status === 'active' && can('ai_knowledge', 'create') && (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
              onClick={() => setEditor(blank())}
            >
              <Plus className="size-4" />
              Adicionar conteúdo
            </button>
          )}
        </header>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Cadastre fatos, regras e respostas que mudam pouco. Preços e disponibilidade devem ser
          consultados nos sistemas conectados. Rascunhos precisam ser publicados por um
          administrador.
        </div>
        {base.status === 'active' && (
          <div>
            <button
              className="rounded-lg border px-4 py-2 text-sm"
              aria-expanded={showTest}
              onClick={() => setShowTest(!showTest)}
            >
              {showTest ? 'Fechar teste de busca' : 'Testar busca'}
            </button>
          </div>
        )}
        {showTest && <KnowledgeTestSearch key={base.id} baseId={base.id} />}
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex flex-1 min-w-56 items-center gap-2 rounded-lg border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              aria-label="Buscar conhecimento"
              className="w-full py-2 bg-transparent outline-none"
              placeholder="Buscar conteúdo…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por estado"
            className={field + ' w-auto'}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">Todos os estados</option>
            {Object.entries(statuses).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por categoria"
            className={field + ' w-auto'}
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {Object.entries(types).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <div role="alert" className="rounded-lg border p-5">
            {error}{' '}
            <button className="text-primary underline" onClick={() => void load()}>
              Recarregar
            </button>
          </div>
        ) : loading ? (
          <p role="status">Carregando informações…</p>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <BookOpen className="size-10 mx-auto mb-4" />
            <h2 className="font-semibold text-foreground">Nenhum conteúdo encontrado</h2>
            <p>
              Comece pelas dúvidas mais frequentes e pelas regras que sua equipe explica todos os
              dias.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {entries.map(entry => (
              <button
                key={entry.id}
                className="rounded-xl border border-border p-5 text-left hover:border-primary/50"
                onClick={() => setViewing(entry)}
              >
                <div className="flex justify-between gap-3">
                  <h2 className="font-semibold">{entry.title}</h2>
                  <span className="text-xs rounded-full bg-muted px-2 py-1 whitespace-nowrap">
                    {statuses[entry.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{types[entry.content_type]}</p>
                <p className="mt-3 text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
                  {entry.body}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {entry.updated_at
                    ? `Atualizado em ${new Date(entry.updated_at).toLocaleDateString('pt-BR')}`
                    : 'Consultar conteúdo'}
                </p>
              </button>
            ))}
          </div>
        )}
        {viewing && (
          <Dialog open onOpenChange={open => !open && setViewing(null)}>
            <DialogContent
              aria-describedby={undefined}
              className="max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <DialogTitle>{viewing.title}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {types[viewing.content_type]} · {statuses[viewing.status]}
              </p>
              <div className="whitespace-pre-wrap break-words border-t border-border pt-4 text-sm leading-relaxed">
                {viewing.body}
              </div>
              {(viewing.source || viewing.tags.length > 0) && (
                <details className="rounded-lg border p-3 text-sm">
                  <summary className="cursor-pointer">Mais informações</summary>
                  <p className="mt-2 break-words whitespace-pre-wrap">{viewing.source}</p>
                  <p className="mt-2 text-muted-foreground">{viewing.tags.join(' · ')}</p>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <button className="rounded-lg border px-4 py-2" onClick={() => setViewing(null)}>
                  Fechar
                </button>
                {base.status === 'active' &&
                  can('ai_knowledge', 'update') &&
                  viewing.can_edit === true && (
                    <button
                      className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                      onClick={() => {
                        setEditor({ ...viewing });
                        setViewing(null);
                      }}
                    >
                      Editar conteúdo
                    </button>
                  )}
                {base.status === 'active' &&
                  viewing.can_edit === false &&
                  can('ai_knowledge', 'create') && (
                    <button
                      className="rounded-lg border px-4 py-2"
                      onClick={() => {
                        setEditor({
                          ...viewing,
                          id: '',
                          status: 'draft',
                          can_edit: true,
                          source: `Correção de ${viewing.id}${viewing.source ? ` — ${viewing.source}` : ''}`,
                        });
                        setViewing(null);
                      }}
                    >
                      Sugerir correção
                    </button>
                  )}
              </div>
            </DialogContent>
          </Dialog>
        )}
        {editor && (
          <Dialog open onOpenChange={open => !open && !busy && setEditor(null)}>
            <DialogContent
              aria-describedby={undefined}
              className="max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
            >
              <DialogTitle>{editor.id ? 'Editar conteúdo' : 'Adicionar conteúdo'}</DialogTitle>
              <label className="block text-sm">
                Título
                <input
                  disabled={!editable || busy}
                  className={field}
                  maxLength={200}
                  value={editor.title}
                  onChange={e => setEditor({ ...editor, title: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Categoria
                <select
                  disabled={!editable || busy}
                  className={field}
                  value={editor.content_type}
                  onChange={e => setEditor({ ...editor, content_type: e.target.value })}
                >
                  {Object.entries(types).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Conteúdo
                <textarea
                  rows={8}
                  disabled={!editable || busy}
                  className={field}
                  value={editor.body}
                  onChange={e => setEditor({ ...editor, body: e.target.value })}
                />
              </label>
              <details className="rounded-lg border border-border p-3 space-y-3">
                <summary className="cursor-pointer text-sm font-medium">Mais opções</summary>
                <label className="block text-sm">
                  Tags (separadas por vírgula)
                  <input
                    disabled={!editable || busy}
                    className={field}
                    value={editor.tags.join(', ')}
                    onChange={e =>
                      setEditor({ ...editor, tags: e.target.value.split(',').map(v => v.trim()) })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Fonte / referência
                  <input
                    disabled={!editable || busy}
                    className={field}
                    value={editor.source || ''}
                    onChange={e => setEditor({ ...editor, source: e.target.value })}
                  />
                </label>
              </details>
              <p className="text-xs text-muted-foreground">
                {base.can_publish_entries === true
                  ? 'Somente conteúdos publicados ficam disponíveis para consulta da IA.'
                  : 'A publicação nesta base ainda não está disponível. Você pode salvar conteúdos como rascunho.'}
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                {editor.id && editor.can_edit === false && can('ai_knowledge', 'create') && (
                  <button
                    className="rounded-lg border px-4 py-2"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        id: '',
                        status: 'draft',
                        can_edit: true,
                        source: `Correção de ${editor.id}${editor.source ? ` — ${editor.source}` : ''}`,
                      })
                    }
                  >
                    Sugerir correção
                  </button>
                )}
                <button
                  className="rounded-lg border px-4 py-2"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Fechar
                </button>
                {(editor.id
                  ? can('ai_knowledge', 'update') && editor.can_edit !== false
                  : can('ai_knowledge', 'create')) && (
                  <button
                    disabled={busy}
                    className="rounded-lg border px-4 py-2"
                    onClick={() => void save(editor.status)}
                  >
                    {editor.status === 'published' ? 'Salvar alterações' : 'Salvar rascunho'}
                  </button>
                )}
                {editable &&
                  can('ai_knowledge', 'publish') &&
                  editor.can_archive === true &&
                  editor.id &&
                  editor.status !== 'archived' && (
                    <button
                      disabled={busy}
                      className="rounded-lg border px-4 py-2"
                      onClick={() => void save('archived')}
                    >
                      Arquivar
                    </button>
                  )}
                {editable &&
                  can('ai_knowledge', 'publish') &&
                  editor.can_publish !== false &&
                  base.can_publish_entries === true && (
                    <button
                      disabled={busy}
                      className="rounded-lg bg-primary text-primary-foreground px-4 py-2"
                      onClick={() => void save('published')}
                    >
                      Publicar
                    </button>
                  )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AgentsTabsLayout>
  );
}
