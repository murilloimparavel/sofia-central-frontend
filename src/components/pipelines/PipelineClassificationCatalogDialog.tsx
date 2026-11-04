import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Button, Textarea } from '@evoapi/design-system';
import { Loader2, Eye, Save, Upload, RefreshCw, Play } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { pipelinesService } from '@/services/pipelines';

type CatalogDraft = { classification: Record<string, unknown>; stages: Array<Record<string, unknown>> };
type RuntimeBudget = Record<string, unknown>;

const DEFAULT_RUNTIME_BUDGET: RuntimeBudget = {
  online_enabled: false,
  privacy_reviewed: false,
  language_validated: false,
  billing_ceiling_verified: false,
  max_attempt_cost_usd: 0.01,
  daily_usd: 0.25,
  daily_conversations: 25,
  budget_timezone: 'America/Sao_Paulo',
  retention_days: 90,
};

interface Props { open: boolean; onOpenChange: (open: boolean) => void; pipelineId: string; pipelineName: string }

export default function PipelineClassificationCatalogDialog({ open, onOpenChange, pipelineId, pipelineName }: Props) {
  const { can } = usePermissions();
  const canManageRuntime = can('installation_configs', 'manage');
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [draftHash, setDraftHash] = useState('');
  const [status, setStatus] = useState<Record<string, unknown>>({});
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);
  const [resultsHasMore, setResultsHasMore] = useState(false);
  const [loadingMoreResults, setLoadingMoreResults] = useState(false);
  const [backfillCursor, setBackfillCursor] = useState<string | undefined>();
  const [backfillDone, setBackfillDone] = useState(false);
  const [backfillSummary, setBackfillSummary] = useState<Record<string, unknown> | null>(null);
  const [automaticMovesEnabled, setAutomaticMovesEnabled] = useState(false);
  const [providerCircuit, setProviderCircuit] = useState<Record<string, unknown>>({});
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [onlineAuthorized, setOnlineAuthorized] = useState(false);
  const [runtimeBudget, setRuntimeBudget] = useState<RuntimeBudget>(DEFAULT_RUNTIME_BUDGET);
  const locallyDirty = (() => {
    if (!draft) return true;
    try { return JSON.stringify(JSON.parse(json)) !== JSON.stringify(draft); }
    catch { return true; }
  })();

  useEffect(() => {
    if (!open) return;
    setBackfillCursor(undefined);
    setBackfillDone(false);
    setBackfillSummary(null);
    setResults([]);
    setResultsHasMore(false);
    setBusy(true);
    pipelinesService.getClassificationCatalog(pipelineId)
      .then(data => {
        const next = { classification: data.classification as Record<string, unknown>, stages: data.stages as Array<Record<string, unknown>> };
        setDraft(next);
        setDraftHash(String(data.draft_hash || ''));
        setStatus(data);
        setJson(JSON.stringify(next, null, 2));
      })
      .catch(() => toast.error('Não foi possível carregar o catálogo de classificação.'))
      .finally(() => setBusy(false));
    pipelinesService.getClassificationResults(pipelineId)
      .then(value => {
        setResults(value);
        setResultsHasMore(value.length === 50);
      })
      .catch(() => {
        setResults([]);
        setResultsHasMore(false);
      });
    if (canManageRuntime) {
      pipelinesService.getPipelineClassificationRuntime(pipelineId)
        .then(value => {
          setAutomaticMovesEnabled(Boolean(value.automatic_moves_enabled));
          setProviderCircuit((value.provider_circuit as Record<string, unknown>) || {});
          setProviderConfigured(Boolean(value.provider_configured));
          setOnlineAuthorized(Boolean(value.online_authorized));
          setRuntimeBudget({ ...DEFAULT_RUNTIME_BUDGET, ...(value.budget as RuntimeBudget || {}) });
        })
        .catch(() => {
          setAutomaticMovesEnabled(false);
          setProviderConfigured(false);
          setOnlineAuthorized(false);
          setRuntimeBudget(DEFAULT_RUNTIME_BUDGET);
        });
    }
  }, [open, pipelineId, canManageRuntime]);

  const parse = (): CatalogDraft | null => {
    try {
      const value = JSON.parse(json) as CatalogDraft;
      if (!value || typeof value.classification !== 'object' || !Array.isArray(value.stages)) throw new Error('shape');
      return value;
    } catch {
      toast.error('JSON inválido. Edite a configuração e tente novamente.');
      return null;
    }
  };

  const preview = async () => {
    const value = parse();
    if (!value) return;
    setBusy(true);
    try {
      const result = await pipelinesService.previewClassificationCatalog(pipelineId, value);
      toast.success('Configuração válida para publicação.');
      setStatus(previous => ({ ...previous, preview: result.compiled }));
    } catch {
      toast.error('A configuração não passou na validação. Revise escopo, etapas e critérios.');
    } finally { setBusy(false); }
  };

  const save = async () => {
    const value = parse();
    if (!value) return;
    setBusy(true);
    try {
      const result = await pipelinesService.saveClassificationCatalog(pipelineId, value, draftHash);
      setDraft(value);
      setDraftHash(String(result.draft_hash || ''));
      setStatus(result);
      setJson(JSON.stringify(value, null, 2));
      toast.success('Rascunho salvo. Faça a publicação quando estiver pronto.');
    } catch {
      toast.error('Não foi possível salvar. O catálogo pode ter mudado em outra sessão; recarregue e tente de novo.');
    } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!draftHash) return;
    setBusy(true);
    try {
      const result = await pipelinesService.publishClassificationCatalog(pipelineId, draftHash);
      setStatus(result);
      toast.success('Catálogo publicado. O modo está definido no perfil da pipeline.');
    } catch {
      toast.error('Publicação bloqueada. Revise critérios, inboxes, permissões e autorizações de custo.');
    } finally { setBusy(false); }
  };

  const refreshResults = async () => {
    try {
      const value = await pipelinesService.getClassificationResults(pipelineId);
      setResults(value);
      setResultsHasMore(value.length === 50);
    }
    catch { toast.error('Não foi possível atualizar os resultados.'); }
  };

  const loadMoreResults = async () => {
    const beforeId = String(results[results.length - 1]?.id || '');
    if (!beforeId) return;
    setLoadingMoreResults(true);
    try {
      const value = await pipelinesService.getClassificationResults(pipelineId, 50, beforeId);
      setResults(previous => [...previous, ...value]);
      setResultsHasMore(value.length === 50);
    } catch { toast.error('Não foi possível carregar resultados anteriores.'); }
    finally { setLoadingMoreResults(false); }
  };

  const runBackfillBatch = async () => {
    setBusy(true);
    try {
      const result = await pipelinesService.backfillClassificationBatch(pipelineId, 50, backfillCursor);
      setBackfillCursor(typeof result.next_cursor === 'string' ? result.next_cursor : undefined);
      setBackfillDone(Boolean(result.done));
      setBackfillSummary(result);
      toast.success(`${String(result.scheduled || 0)} conversas agendadas; ${String(result.skipped || 0)} ignoradas.`);
    } catch {
      toast.error('O lote não foi agendado. Verifique se há um catálogo ativo e continue com o mesmo cursor.');
    } finally { setBusy(false); }
  };

  const toggleAutomaticMoves = async () => {
    setBusy(true);
    try {
      const result = await pipelinesService.setAutomaticPipelineMoves(pipelineId, !automaticMovesEnabled);
      setAutomaticMovesEnabled(Boolean(result.automatic_moves_enabled));
      setOnlineAuthorized(Boolean(result.online_authorized));
      toast.success(result.automatic_moves_enabled ? 'Movimentação automática habilitada na instalação.' : 'Movimentação automática pausada na instalação.');
    } catch {
      toast.error('Não foi possível alterar a pausa global. É necessária a permissão de configuração da instalação.');
    } finally { setBusy(false); }
  };

  const saveRuntimeBudget = async () => {
    setBusy(true);
    try {
      const result = await pipelinesService.updatePipelineClassificationRuntime(pipelineId, runtimeBudget);
      setOnlineAuthorized(Boolean(result.online_authorized));
      setProviderConfigured(Boolean(result.provider_configured));
      const saved = result.budget as RuntimeBudget | undefined;
      if (saved) setRuntimeBudget({ ...DEFAULT_RUNTIME_BUDGET, ...saved });
      toast.success('Limites e autorizações do classificador foram salvos.');
    } catch {
      toast.error('Não foi possível salvar. Revise credencial, aprovações, limites e fuso horário.');
    } finally { setBusy(false); }
  };

  const setRuntimeValue = (key: string, value: unknown) => {
    setRuntimeBudget(previous => ({ ...previous, [key]: value }));
  };

  const resetProviderCircuit = async () => {
    setBusy(true);
    try {
      const result = await pipelinesService.resetPipelineClassificationProvider(pipelineId);
      setProviderCircuit((result.provider_circuit as Record<string, unknown>) || {});
      toast.success('Disjuntor do provedor reiniciado.');
    } catch {
      toast.error('Não foi possível reiniciar o provedor. Confira a permissão de configuração da instalação.');
    } finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>Classificação Jev · {pipelineName}</DialogTitle>
        <DialogDescription>Configure critérios, valide decisões e acompanhe a classificação. Movimentação automática só ocorre em modo auto com autorização de runtime habilitada.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border px-2 py-1">Status do OpenRouter: {(status.credential_status as Record<string, unknown> | undefined)?.configured ? 'credencial configurada' : 'sem credencial autorizada'}</span>
        <span className="rounded-md border px-2 py-1">Catálogo: {status.published ? `v${status.catalog_version}` : 'não publicado'}{status.dirty ? ' · rascunho alterado' : ''}</span>
        <span className="rounded-md border px-2 py-1">Modelo: TypeSafe Jev 1.14</span>
      </div>
      <div className="grid gap-2 min-h-0 flex-1">
        <label className="text-sm font-medium" htmlFor="classification-catalog-json">Configuração tipada (classificação global e critérios de cada etapa)</label>
        <Textarea id="classification-catalog-json" className="min-h-[360px] flex-1 font-mono text-xs" value={json} onChange={event => setJson(event.target.value)} disabled={busy || !draft} spellCheck={false} />
        <p className="text-xs text-muted-foreground">O JSON precisa manter <code>classification</code> e <code>stages</code>. Use Preview para validar antes de salvar e publicar.</p>
      </div>
      <DialogFooter className="flex-wrap sm:justify-between">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={preview} disabled={busy || !draft}><Eye className="mr-2 h-4 w-4" />Validar</Button>
          <Button variant="outline" onClick={save} disabled={busy || !draft}><Save className="mr-2 h-4 w-4" />Salvar rascunho</Button>
          <Button onClick={publish} disabled={busy || !draft || locallyDirty || !draftHash}><Upload className="mr-2 h-4 w-4" />Publicar catálogo</Button>
          {busy && <Loader2 className="h-4 w-4 animate-spin self-center" />}
        </div>
      </DialogFooter>
      <section className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Backfill e monitoramento</h3>
            <p className="text-xs text-muted-foreground">Cada lote agenda até 50 conversas; repita para continuar usando o cursor retornado.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshResults} disabled={busy}><RefreshCw className="mr-1 h-3 w-3" />Atualizar</Button>
            <Button size="sm" onClick={runBackfillBatch} disabled={busy || backfillDone || !status.published || !onlineAuthorized || !providerConfigured}><Play className="mr-1 h-3 w-3" />{backfillCursor ? 'Próximo lote' : 'Iniciar lote'}</Button>
          </div>
        </div>
        {canManageRuntime && (!onlineAuthorized || !providerConfigured) && <p className="text-xs text-muted-foreground">Configure a credencial, revise o teto e salve as autorizações de runtime antes de iniciar um lote.</p>}
        {canManageRuntime && <div className="space-y-3 rounded border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs">Execução online: <strong>{onlineAuthorized && providerConfigured ? 'autorizada' : 'pausada até configurar os requisitos'}</strong></p>
              <p className="text-xs text-muted-foreground">Movimentação automática global: <strong>{automaticMovesEnabled ? 'ativa' : 'pausada'}</strong></p>
            </div>
            <Button size="sm" variant={automaticMovesEnabled ? 'destructive' : 'outline'} onClick={toggleAutomaticMoves}
              disabled={busy || (!automaticMovesEnabled && (!onlineAuthorized || !providerConfigured))}>
              {automaticMovesEnabled ? 'Pausar movimentações' : 'Habilitar movimentações'}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['online_enabled', 'Autorizar avaliação online'],
              ['privacy_reviewed', 'Revisão de privacidade concluída'],
              ['language_validated', 'Idioma e critérios validados'],
              ['billing_ceiling_verified', 'Teto de cobrança do provedor verificado'],
            ].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={runtimeBudget[key] === true} onChange={event => setRuntimeValue(key, event.target.checked)} disabled={busy} />
              {label}
            </label>)}
            <label className="grid gap-1 text-xs">Teto por avaliação (USD)
              <input type="number" min="0.001" max="0.05" step="0.001" value={String(runtimeBudget.max_attempt_cost_usd ?? '')}
                onChange={event => setRuntimeValue('max_attempt_cost_usd', Number(event.target.value))} disabled={busy} className="rounded border bg-background px-2 py-1" />
            </label>
            <label className="grid gap-1 text-xs">Teto diário (USD)
              <input type="number" min="0.01" max="1000" step="0.01" value={String(runtimeBudget.daily_usd ?? '')}
                onChange={event => setRuntimeValue('daily_usd', Number(event.target.value))} disabled={busy} className="rounded border bg-background px-2 py-1" />
            </label>
            <label className="grid gap-1 text-xs">Conversas por dia
              <input type="number" min="1" max="10000" step="1" value={String(runtimeBudget.daily_conversations ?? '')}
                onChange={event => setRuntimeValue('daily_conversations', Number(event.target.value))} disabled={busy} className="rounded border bg-background px-2 py-1" />
            </label>
            <label className="grid gap-1 text-xs">Fuso do limite diário
              <input type="text" value={String(runtimeBudget.budget_timezone ?? '')}
                onChange={event => setRuntimeValue('budget_timezone', event.target.value)} disabled={busy} className="rounded border bg-background px-2 py-1" />
            </label>
            <label className="grid gap-1 text-xs">Retenção do histórico (dias)
              <input type="number" min="1" max="3650" step="1" value={String(runtimeBudget.retention_days ?? '')}
                onChange={event => setRuntimeValue('retention_days', Number(event.target.value))} disabled={busy} className="rounded border bg-background px-2 py-1" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Falha de autorização mantém o classificador fechado. A credencial é lida do cofre EvoCRM e nunca aparece aqui.</p>
            <Button size="sm" variant="outline" onClick={saveRuntimeBudget} disabled={busy}>Salvar limites e autorizações</Button>
          </div>
        </div>}
        <div className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
          <p>Provedor: {providerCircuit.open ? `pausado (${String(providerCircuit.last_reason || 'falha')})` : 'disjuntor fechado'} · falhas consecutivas {String(providerCircuit.consecutive_failures ?? 0)}</p>
          {canManageRuntime && Boolean(providerCircuit.manual_reset_required) && <Button size="sm" variant="outline" onClick={resetProviderCircuit} disabled={busy}>Reiniciar provedor</Button>}
        </div>
        {backfillSummary && <p className="text-xs text-muted-foreground">Último lote: {String(backfillSummary.scheduled || 0)} agendadas, {String(backfillSummary.skipped || 0)} ignoradas · {backfillDone ? 'concluído' : 'há mais conversas'}</p>}
        <div className="max-h-32 overflow-y-auto rounded border divide-y">
          {results.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Nenhum resultado registrado.</p> : results.map(row => {
            const decision = row.decision as Record<string, unknown> | undefined;
            const application = decision?.application as Record<string, unknown> | undefined;
            const conversationId = String(row.conversation_id || '');
            return <div key={String(row.id)} className="p-2 text-xs flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-medium">{String(row.status)} · {String(row.reason || 'sem motivo')}</span>
              <span>confiança pipeline {String(decision?.pipeline_confidence ?? '—')}</span>
              <span>destino {String(row.recommended_pipeline_name || '—')} / {String(row.recommended_stage_name || '—')}</span>
              <span>movimentação {String(application?.status || 'pendente / observação')}</span>
              <span>{String(row.created_at || '')}</span>
              {conversationId && <Link className="text-primary underline" to={`/conversations/${conversationId}`}>Abrir conversa</Link>}
            </div>;
          })}
        </div>
        {resultsHasMore && <Button variant="outline" size="sm" onClick={loadMoreResults} disabled={busy || loadingMoreResults}>
          {loadingMoreResults ? 'Carregando…' : 'Carregar resultados anteriores'}
        </Button>}
      </section>
    </DialogContent>
  </Dialog>;
}
