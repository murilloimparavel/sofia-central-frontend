import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '@/services/core/api';
import { KnowledgeBase } from './KnowledgeBases';

type Props = { agentId: string; canEdit: boolean };

export default function KnowledgeAgentBindings({ agentId, canEdit }: Props) {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRevision(null);
    setError('');
    Promise.all([api.get('/knowledge_bases'), api.get(`/agents/${agentId}/knowledge_bases`)])
      .then(([baseResponse, bindingResponse]) => {
        const all = baseResponse.data.data;
        const bindings = bindingResponse.data.data;
        if (!Array.isArray(all) || !Array.isArray(bindings?.base_ids) || !Number.isInteger(bindings?.revision)) {
          throw new Error('invalid response');
        }
        if (!cancelled) {
          setBases(all.filter((base: KnowledgeBase) => base.status === 'active'));
          setSelected(bindings.base_ids);
          setRevision(bindings.revision);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os vínculos deste agente.');
      });
    return () => { cancelled = true; };
  }, [agentId, reload]);

  async function save() {
    if (!canEdit || revision === null || busy) return;
    setBusy(true);
    try {
      const { data } = await api.put(`/agents/${agentId}/knowledge_bases`, {
        base_ids: selected,
        expected_revision: revision,
      });
      setRevision(data.data.revision);
      toast.success('Vínculos salvos.');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 409 ? 'Os vínculos foram alterados. Recarregue antes de salvar.' : 'Não foi possível salvar os vínculos.');
      setRevision(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border p-5" aria-labelledby="agent-knowledge-heading">
      <h2 id="agent-knowledge-heading" className="font-semibold">Bases de conhecimento do agente</h2>
      <p className="mt-2 text-sm text-muted-foreground">Os vínculos são uma configuração independente. O acesso às bases restritas depende da ativação segura do módulo.</p>
      {error ? (
        <div role="alert" className="mt-3">{error} <button className="text-primary underline" onClick={() => setReload(value => value + 1)}>Recarregar</button></div>
      ) : revision === null ? <p role="status" className="mt-3">Carregando vínculos…</p> : (
        <>
          <fieldset disabled={!canEdit || busy} className="mt-3 space-y-2">
            <legend className="text-sm">Escolha as bases acessíveis</legend>
            {bases.length === 0 && <p className="text-sm">Nenhuma base ativa disponível.</p>}
            {bases.map(base => (
              <label key={base.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(base.id)} onChange={event => setSelected(current => event.target.checked ? [...current, base.id] : current.filter(id => id !== base.id))} />
                {base.name}
              </label>
            ))}
          </fieldset>
          {canEdit && <button disabled={busy} className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void save()}>Salvar vínculos</button>}
        </>
      )}
    </section>
  );
}
