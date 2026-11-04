import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@evoapi/design-system';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import api from '@/services/core/api';

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  lock_version: number;
  legacy_default: boolean;
  entries_count: number;
  published_count: number;
  can_archive?: boolean;
  can_publish_entries?: boolean;
};

type Props = { onSelect: (base: KnowledgeBase) => void };

export default function KnowledgeBases({ onSelect }: Props) {
  const { can, isReady } = usePermissions();
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<KnowledgeBase | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/knowledge_bases');
      if (!Array.isArray(data.data)) throw new Error('invalid response');
      setBases(data.data);
    } catch {
      setError('Não foi possível carregar as bases. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  const mayRead = can('ai_knowledge', 'read');
  useEffect(() => {
    if (isReady && mayRead) void load();
    else if (isReady) setLoading(false);
  }, [isReady, mayRead, load]);

  async function save() {
    if (busy || !editing || !name.trim()) return;
    setBusy(true);
    try {
      const knowledge_base = { name: name.trim(), description: description.trim() };
      if (editing.id) {
        await api.patch(`/knowledge_bases/${editing.id}`, {
          knowledge_base: { ...knowledge_base, lock_version: editing.lock_version },
        });
      } else {
        await api.post('/knowledge_bases', { knowledge_base });
      }
      setEditing(null);
      await load();
      toast.success('Base salva.');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 409
          ? 'A base foi alterada por outra pessoa. Recarregue e tente novamente.'
          : 'Não foi possível salvar a base.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (
      busy ||
      !archiveCandidate ||
      !archiveCandidate.can_archive ||
      !can('ai_knowledge', 'publish')
    )
      return;
    setBusy(true);
    try {
      await api.post(`/knowledge_bases/${archiveCandidate.id}/archive`, {
        lock_version: archiveCandidate.lock_version,
      });
      setArchiveCandidate(null);
      await load();
      toast.success('Base arquivada.');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 409
          ? 'A base foi alterada por outra pessoa. Recarregue e tente novamente.'
          : 'Não foi possível arquivar a base.',
      );
    } finally {
      setBusy(false);
    }
  }

  const visible = bases.filter(base =>
    base.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  const canCreate = can('ai_knowledge', 'create');
  if (isReady && !mayRead)
    return (
      <p role="alert" className="rounded-lg border p-5">
        Você não tem permissão para consultar as bases de conhecimento.
      </p>
    );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="size-4" /> Conhecimento da empresa
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Bases de conhecimento</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organize os conteúdos por assunto e escolha uma base para consultar.
          </p>
        </div>
        {canCreate && (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => {
              setName('');
              setDescription('');
              setEditing({
                id: '',
                name: '',
                description: '',
                status: 'active',
                lock_version: 0,
                legacy_default: false,
                entries_count: 0,
                published_count: 0,
              });
            }}
          >
            <Plus className="size-4" />
            Criar base
          </button>
        )}
      </header>
      <label className="block max-w-lg text-sm">
        Buscar bases
        <input
          aria-label="Buscar bases"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nome da base"
        />
      </label>
      {error ? (
        <div role="alert" className="rounded-lg border p-5">
          {error}{' '}
          <button className="text-primary underline" onClick={() => void load()}>
            Recarregar
          </button>
        </div>
      ) : loading ? (
        <p role="status">Carregando bases…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="font-semibold">Nenhuma base encontrada</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {bases.length > 0
              ? 'Nenhuma base corresponde à busca.'
              : 'Crie uma base para reunir conteúdos sobre um assunto. A base Geral também será criada automaticamente.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(base => (
            <article
              key={base.id}
              className="flex flex-col rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{base.name}</h2>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">
                  {base.status === 'active' ? 'Ativa' : 'Arquivada'}
                </span>
              </div>
              <p className="mt-2 flex-1 break-words text-sm text-muted-foreground">
                {base.description || 'Sem descrição.'}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {base.entries_count} conteúdos · {base.published_count} publicados
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => onSelect(base)}
                >
                  Abrir base
                </button>
                {can('ai_knowledge', 'publish') && base.can_archive === true && (
                  <button
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setArchiveCandidate(base)}
                  >
                    Arquivar base
                  </button>
                )}
                {can('ai_knowledge', 'update') && (
                  <button
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setName(base.name);
                      setDescription(base.description || '');
                      setEditing(base);
                    }}
                  >
                    Editar detalhes
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {archiveCandidate && (
        <Dialog open onOpenChange={open => !open && !busy && setArchiveCandidate(null)}>
          <DialogContent aria-describedby={undefined} className="max-w-lg space-y-4">
            <DialogTitle>Arquivar {archiveCandidate.name}?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Os conteúdos serão preservados e deixarão de ficar disponíveis para novas consultas.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2"
                disabled={busy}
                onClick={() => setArchiveCandidate(null)}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                disabled={busy}
                onClick={() => void archive()}
              >
                Confirmar arquivamento
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {editing && (
        <Dialog open onOpenChange={open => !open && !busy && setEditing(null)}>
          <DialogContent aria-describedby={undefined} className="max-w-lg space-y-4">
            <DialogTitle>{editing.id ? 'Editar base' : 'Criar base'}</DialogTitle>
            <label className="block text-sm">
              Nome
              <input
                autoFocus
                required
                maxLength={200}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Descrição <span className="text-muted-foreground">(opcional)</span>
              <textarea
                rows={3}
                maxLength={1000}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                disabled={busy || !name.trim()}
                onClick={() => void save()}
              >
                Salvar base
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function KnowledgeBaseBack({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div>
      <button
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        Todas as bases
      </button>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{name}</h1>
    </div>
  );
}
