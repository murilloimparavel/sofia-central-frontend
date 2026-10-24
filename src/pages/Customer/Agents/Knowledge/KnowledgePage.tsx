import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@evoapi/design-system';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import AgentsTabsLayout from '@/components/agents/AgentsTabsLayout';
import api from '@/services/core/api';
type Entry = {
  id: string;
  title: string;
  body: string;
  content_type: string;
  tags: string[];
  source: string;
  status: string;
  can_edit?: boolean;
  can_publish?: boolean;
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
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/knowledge_entries', { params: { q: query, status } });
      setEntries(data.data || []);
    } catch {
      setError('Não foi possível carregar a base de conhecimento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [query, status]);
  useEffect(() => {
    if (!isReady || !can('ai_knowledge', 'read')) return;
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load, isReady, can]);
  const editable = !!editor && (!editor.id || editor.can_edit === true);
  const save = async (nextStatus: string) => {
    if (!editor || !editor.title.trim() || !editor.body.trim()) {
      toast.error('Preencha o título e o conteúdo.');
      return;
    }
    setBusy(true);
    try {
      const { id, can_edit: _canEdit, can_publish: _canPublish, ...payload } = editor;
      if (id)
        await api.patch(`/knowledge_entries/${id}`, {
          ai_knowledge_entry: { ...payload, status: nextStatus },
        });
      else {
        const { data } = await api.post('/knowledge_entries', { ai_knowledge_entry: payload });
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
  return (
    <AgentsTabsLayout tab="knowledge">
      <div className="overflow-y-auto p-6 space-y-5">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Cadastre fatos, regras e respostas que mudam pouco. Preços e disponibilidade devem ser
          consultados nos sistemas conectados. Rascunhos precisam ser publicados por um
          administrador.
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex flex-1 min-w-56 items-center gap-2 rounded-lg border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              aria-label="Buscar conhecimento"
              className="w-full py-2 bg-transparent outline-none"
              placeholder="Buscar informação…"
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
          {can('ai_knowledge', 'create') && (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
              onClick={() => setEditor(blank())}
            >
              <Plus className="size-4" />
              Nova informação
            </button>
          )}
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
            <h2 className="font-semibold text-foreground">Nenhuma informação encontrada</h2>
            <p>Adicione uma pergunta frequente, regra ou descrição para começar.</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {entries.map(entry => (
              <button
                key={entry.id}
                className="rounded-xl border border-border p-5 text-left hover:border-primary/50"
                onClick={() => setEditor(entry)}
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
                <p className="mt-3 text-xs text-muted-foreground">{entry.tags.join(' · ')}</p>
              </button>
            ))}
          </div>
        )}
        {editor && (
          <Dialog open onOpenChange={open => !open && !busy && setEditor(null)}>
            <DialogContent
              aria-describedby={undefined}
              className="max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
            >
              <DialogTitle>{editor.id ? 'Informação da base' : 'Nova informação'}</DialogTitle>
              <label className="block text-sm">
                Título
                <input
                  disabled={!editable}
                  className={field}
                  maxLength={200}
                  value={editor.title}
                  onChange={e => setEditor({ ...editor, title: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Tipo
                <select
                  disabled={!editable}
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
                  disabled={!editable}
                  className={field}
                  value={editor.body}
                  onChange={e => setEditor({ ...editor, body: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Tags (separadas por vírgula)
                <input
                  disabled={!editable}
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
                  disabled={!editable}
                  className={field}
                  value={editor.source || ''}
                  onChange={e => setEditor({ ...editor, source: e.target.value })}
                />
              </label>
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
                    onClick={() => void save('draft')}
                  >
                    Salvar rascunho
                  </button>
                )}
                {can('ai_knowledge', 'publish') && editor.can_publish !== false && (
                  <>
                    <button
                      disabled={busy}
                      className="rounded-lg border px-4 py-2"
                      onClick={() => void save('archived')}
                    >
                      Arquivar
                    </button>
                    <button
                      disabled={busy}
                      className="rounded-lg bg-primary text-primary-foreground px-4 py-2"
                      onClick={() => void save('published')}
                    >
                      Publicar
                    </button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AgentsTabsLayout>
  );
}
