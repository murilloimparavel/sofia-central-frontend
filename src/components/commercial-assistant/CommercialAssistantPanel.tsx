import { useMemo, useState, type FormEvent } from 'react';
import { Search, ExternalLink, LoaderCircle } from 'lucide-react';
import { searchCommercialAssistant, type AssistantMode, type SearchRequest } from './commercialAssistantApi';

type Result = Record<string, unknown>;
const today = new Date().toISOString().slice(0, 10);

function readAmount(value: unknown): number | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const amount = value as Record<string, unknown>;
    const currencies = amount._mctotal as Record<string, unknown> | undefined;
    const alternateCurrencies = amount._mcval as Record<string, unknown> | undefined;
    value = amount._f_total ?? amount.cash ?? amount.pix ?? amount.total ?? amount.amount ?? amount.value ?? amount.price ?? currencies?.BRL ?? alternateCurrencies?.BRL ?? amount.BRL;
  }
  if (typeof value === 'string') value = value.trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown, currency = 'BRL') {
  const amount = readAmount(value);
  return amount == null ? 'A consultar' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount);
}

function imageOf(item: Result) {
  const details = item.details as Result | undefined;
  const images = details?._t_imagesMeta as unknown[] | undefined;
  const value = details?._t_mainImageMeta ?? images?.[0] ?? details?.images ?? item.images ?? item.photos ?? item.foto;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageOf({ images: value[0] });
  if (value && typeof value === 'object') {
    const image = value as Result;
    return typeof image.url === 'string' ? image.url : typeof image.src === 'string' ? image.src : typeof image.imageUrl === 'string' ? image.imageUrl : null;
  }
  return null;
}

function listingTitle(item: Result) {
  const translatedTitle = (item._mstitle as Result | undefined)?.pt_BR;
  const title = item.title ?? item.name ?? translatedTitle ?? item.nomeImovel ?? item.nome ?? item.unidade ?? item.referencia ?? 'Apartamento';
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object') {
    const value = title as Result;
    return typeof value.nome === 'string' ? value.nome : typeof value.name === 'string' ? value.name : 'Apartamento';
  }
  return 'Apartamento';
}

function text(value: unknown, fallback = '—') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function ResultCards({ data, mode }: { data: Result; mode: AssistantMode }) {
  const reservation = (data.reservation as Result | undefined) ?? data;
  const items = (data.alternatives ?? data.listings ?? data.results ?? []) as Result[];
  if (mode === 'reservation' || (mode === 'alternative' && !items.length)) {
    const guestsDetails = reservation.guestsDetails as Result | undefined;
    return <article className="ca-reservation"><b>Reserva {text(reservation.reservationCode ?? reservation.code, 'localizada')}</b><span>{text(reservation.listingId ?? reservation.apartment, 'Apartamento')} · {text(reservation.status, 'Reserva')}</span><span>{text(reservation.checkIn ?? reservation.from)} → {text(reservation.checkOut ?? reservation.to)}</span><span>{text(guestsDetails?.adults ?? reservation.guests)} hóspedes · Pago: {money(reservation.totalPaid, text(reservation.currency, 'BRL'))}</span></article>;
  }
  return <div className="ca-results">{items.length ? items.map((item, index) => {
    const url = item.publicUrl ?? item.link ?? item.url ?? item.linkImovel ?? item.linkParceiro;
    const image = imageOf(item);
    const quote = item.quote as Result | undefined;
    const total = quote?.cash ?? quote?.pix ?? item.price ?? item.valorTotal ?? item.total ?? item.orcamento;
    const current = readAmount(reservation.total);
    const offer = readAmount(total);
    return <article className="ca-listing" key={text(item.id ?? item._id, String(index))}>
      {image ? <img src={image} alt="" loading="lazy" /> : <div className="ca-no-image">Sem foto</div>}
      <div className="ca-listing-body"><b>{listingTitle(item)}</b><span>{text(item.condominioNome ?? item.condominio ?? item.city, 'Disponível no período')}</span><strong>{money(total, text(item.currency ?? reservation.currency, 'BRL'))}</strong>
        {mode === 'alternative' && current != null && offer != null && <small>{offer - current >= 0 ? '+' : '−'}{money(Math.abs(offer - current), text(reservation.currency, 'BRL'))} em relação à reserva</small>}
        {typeof item.description === 'string' && <p>{item.description}</p>}
        {typeof url === 'string' && <a href={url} target="_blank" rel="noopener noreferrer">Ver apartamento <ExternalLink size={14} /></a>}
      </div>
    </article>;
  }) : <p className="ca-empty">{text(data.notice, 'Nenhuma opção encontrada para esses critérios.')}</p>}</div>;
}

export default function CommercialAssistantPanel() {
  const [mode, setMode] = useState<AssistantMode>('alternative');
  const [source, setSource] = useState<'stays' | 'imobsys'>('stays');
  const [reservationCode, setReservationCode] = useState('');
  const [inventory, setInventory] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [childAges, setChildAges] = useState<number[]>([]);
  const [filters, setFilters] = useState({ idImovel: '', condominio: '', unidade: '', qtdeqrts: 'all', maxOcupantes: '', maxPax: false, entradaAntecipada: 'all', saidaProrrogada: 'all', umCada: false, piscina24h: false, bebidas: false });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const tabs = useMemo(() => [{ id: 'alternative' as const, label: 'Trocar apartamento' }, { id: 'reservation' as const, label: 'Buscar reserva' }, { id: 'availability' as const, label: 'Disponibilidade' }], []);
  const updateFilter = (key: keyof typeof filters, value: string | boolean) => setFilters(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setResult(null);
    try {
      const request: SearchRequest = { reservationCode: reservationCode.trim() };
      if (mode === 'alternative') request.inventory = inventory.trim() || undefined;
      if (mode === 'availability') {
        if (!from || !to || from >= to) throw new Error('Informe datas válidas de chegada e saída.');
        if (adults < 1 || adults + children > 50 || childAges.length !== children || childAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) throw new Error('Informe hóspedes válidos e a idade de cada criança.');
        request.from = from; request.to = to; request.adults = adults; request.children = children; request.childAges = childAges; request.source = source;
        if (source === 'imobsys') request.filters = { ...filters, maxOcupantes: filters.maxOcupantes ? Number(filters.maxOcupantes) : null };
        else request.inventory = inventory.trim() || undefined;
      }
      const data = await searchCommercialAssistant(mode, request);
      setResult(data);
    } catch (caught) {
      const status = (caught as { response?: { status?: number } })?.response?.status;
      const responseMessage = (caught as { response?: { data?: { message?: string; error?: { message?: string } } } })?.response?.data;
      setError(status === 404
        ? 'A API comercial ainda não está publicada neste ambiente. O backend do CRM precisa implementar /api/v1/commercial-assistant/* usando credenciais armazenadas no servidor.'
        : responseMessage?.error?.message ?? responseMessage?.message ?? (caught as Error).message ?? 'Não foi possível concluir a consulta.');
    } finally { setLoading(false); }
  };

  return <div className="ca-panel-content">
    <div className="ca-heading"><span className="ca-live" /> <b>O que você precisa consultar?</b><span className="ca-readonly">Somente leitura</span></div>
    <div className="ca-tabs" role="tablist" aria-label="Tipo de consulta">{tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={mode === tab.id} onClick={() => { setMode(tab.id); setError(''); setResult(null); }}>{tab.label}</button>)}</div>
    <form className="ca-form" onSubmit={submit}>
      {mode !== 'availability' && <label>Código da reserva<input value={reservationCode} onChange={e => setReservationCode(e.target.value)} placeholder="Ex.: PT19J" required autoComplete="off" /></label>}
      {mode === 'alternative' && <label>O que o cliente precisa?<input value={inventory} onChange={e => setInventory(e.target.value)} placeholder="Ex.: geladeira" /></label>}
      {mode === 'availability' && <>
        <label>Tipo de imóvel<select value={source} onChange={e => setSource(e.target.value as typeof source)}><option value="stays">Imóveis próprios</option><option value="imobsys">Imóveis parceiros</option></select></label>
        <div className="ca-grid"><label>Chegada<input type="date" value={from} onChange={e => setFrom(e.target.value)} required /></label><label>Saída<input type="date" value={to} onChange={e => setTo(e.target.value)} required /></label><label>Adultos<input type="number" min="1" max="50" value={adults} onChange={e => setAdults(Number(e.target.value))} /></label><label>Crianças<input type="number" min="0" max="15" value={children} onChange={e => { const count = Math.max(0, Number(e.target.value)); setChildren(count); setChildAges(ages => Array.from({ length: count }, (_, i) => ages[i] ?? 0)); }} /></label></div>
        {children > 0 && <div className="ca-grid ca-child-ages">{childAges.map((age, index) => <label key={index}>Idade criança {index + 1}<select value={age} onChange={e => setChildAges(ages => ages.map((value, i) => i === index ? Number(e.target.value) : value))}>{Array.from({ length: 18 }, (_, value) => <option value={value} key={value}>{value === 0 ? 'Menos de 1 ano' : `${value} ${value === 1 ? 'ano' : 'anos'}`}</option>)}</select></label>)}</div>}
        {source === 'stays' ? <label>Item desejado (opcional)<input value={inventory} onChange={e => setInventory(e.target.value)} placeholder="Ex.: geladeira" /></label> : <details className="ca-filters"><summary>Filtros adicionais</summary><div className="ca-grid"><label>ID do imóvel<input value={filters.idImovel} onChange={e => updateFilter('idImovel', e.target.value)} /></label><label>ID do condomínio<input value={filters.condominio} onChange={e => updateFilter('condominio', e.target.value)} /></label><label>Unidade<input value={filters.unidade} onChange={e => updateFilter('unidade', e.target.value)} placeholder="021-A0501" /></label><label>Quartos<select value={filters.qtdeqrts} onChange={e => updateFilter('qtdeqrts', e.target.value)}><option value="all">Todos</option><option value="0">Studio</option><option value="1">1 quarto</option><option value="2">2 quartos</option><option value="1,2">1 ou 2 quartos</option></select></label><label>Ocupantes<input type="number" min="1" value={filters.maxOcupantes} onChange={e => updateFilter('maxOcupantes', e.target.value)} /></label><label>Modo<select value={String(filters.maxPax)} onChange={e => updateFilter('maxPax', e.target.value === 'true')}><option value="false">Ocupação mínima</option><option value="true">Limitar ocupação máxima</option></select></label><label>Entrada antecipada<select value={filters.entradaAntecipada} onChange={e => updateFilter('entradaAntecipada', e.target.value)}><option value="all">Sem filtro</option><option value="0">Após o almoço</option><option value="1">Antes do almoço</option></select></label><label>Saída prorrogada<select value={filters.saidaProrrogada} onChange={e => updateFilter('saidaProrrogada', e.target.value)}><option value="all">Sem filtro</option><option value="0">Antes do almoço</option><option value="1">Após o almoço</option></select></label></div><div className="ca-checks">{([['umCada', 'Um imóvel por condomínio'], ['piscina24h', 'Piscina 24h'], ['bebidas', 'Bebidas']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={filters[key]} onChange={e => updateFilter(key, e.target.checked)} />{label}</label>)}</div><small>As idades são informadas para consulta. A disponibilidade não filtra idade individual no serviço atual.</small></details>}
      </>}
      {error && <div className="ca-error" role="alert">{error}</div>}
      <button className="ca-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="ca-spin" size={16} /> : <Search size={16} />}{loading ? 'Consultando…' : mode === 'reservation' ? 'Buscar reserva' : mode === 'alternative' ? 'Buscar alternativas' : 'Buscar apartamentos'}</button>
    </form>
    {result && <section className="ca-result" aria-live="polite"><h3>{mode === 'reservation' ? 'Reserva localizada' : mode === 'alternative' ? 'Opções para apresentar ao cliente' : 'Apartamentos disponíveis'}</h3><ResultCards data={result} mode={mode} /></section>}
  </div>;
}
