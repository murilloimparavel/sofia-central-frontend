import { useMemo, useState, type FormEvent } from 'react';
import { Search, ExternalLink, LoaderCircle } from 'lucide-react';
import { format } from 'date-fns';
import { searchCommercialAssistant, type AssistantMode, type SearchRequest } from './commercialAssistantApi';

type Result = Record<string, unknown>;
const today = format(new Date(), 'yyyy-MM-dd');

function readAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
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
    const url = item.publicUrl ?? item.link ?? item.url ?? item.linkImovel ?? item.linkParceiro ?? item.link_reserva;
    const image = imageOf(item);
    const quote = item.quote as Result | undefined;
    const total = quote?.cash ?? quote?.pix ?? item.price ?? item.valorTotal ?? item.valor_total ?? item.total ?? item.orcamento;
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
  const [filters, setFilters] = useState({ condominio: '', umCada: false });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const tabs = useMemo(() => [{ id: 'alternative' as const, label: 'Trocar apartamento' }, { id: 'reservation' as const, label: 'Buscar reserva' }, { id: 'availability' as const, label: 'Disponibilidade' }], []);
  const updateFilter = (key: keyof typeof filters, value: string | boolean) => setFilters(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setResult(null);
    try {
      const request: SearchRequest = { reservationCode: reservationCode.trim() };
      if (mode === 'alternative') request.amenity = inventory.trim() || undefined;
      if (mode === 'availability') {
        if (!from || !to || from >= to) throw new Error('Informe datas válidas de chegada e saída.');
        if (adults < 1 || adults + children > 30 || childAges.length !== children || childAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) throw new Error('Informe de 1 a 30 hóspedes e a idade de cada criança.');
        request.from = from; request.to = to; request.adults = adults; request.children = children; request.childAges = childAges; request.source = source;
        if (source === 'imobsys') request.filters = filters;
        else request.inventory = inventory.trim() || undefined;
      }
      const data = await searchCommercialAssistant(mode, request);
      setResult(data);
    } catch (caught) {
      const status = (caught as { response?: { status?: number } })?.response?.status;
      const responseMessage = (caught as { response?: { data?: { message?: string; error?: { message?: string } } } })?.response?.data;
      setError(status === 404
        ? 'A Search API comercial ainda não está publicada neste ambiente. Verifique a configuração da URL da Search API.'
        : responseMessage?.error?.message ?? responseMessage?.message ?? (caught as Error).message ?? 'Não foi possível concluir a consulta.');
    } finally { setLoading(false); }
  };

  return <div className="ca-panel-content">
    <div className="ca-heading"><span className="ca-live" /> <b>O que você precisa consultar?</b><span className="ca-readonly">Somente leitura</span></div>
    <div className="ca-tabs" role="tablist" aria-label="Tipo de consulta">{tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={mode === tab.id} onClick={() => { setMode(tab.id); setError(''); setResult(null); }}>{tab.label}</button>)}</div>
    <form className="ca-form" onSubmit={submit}>
      {mode !== 'availability' && <label>Código da reserva<input value={reservationCode} onChange={e => setReservationCode(e.target.value)} placeholder="Ex.: PT19J" required autoComplete="off" /></label>}
      {mode === 'alternative' && <label>Comodidade necessária (opcional)<input value={inventory} onChange={e => setInventory(e.target.value)} placeholder="Ex.: geladeira" /></label>}
      {mode === 'availability' && <>
        <label>Tipo de imóvel<select value={source} onChange={e => setSource(e.target.value as typeof source)}><option value="stays">Imóveis próprios</option><option value="imobsys">Imóveis parceiros</option></select></label>
        <div className="ca-grid"><label>Chegada<input type="date" value={from} onChange={e => setFrom(e.target.value)} required /></label><label>Saída<input type="date" value={to} onChange={e => setTo(e.target.value)} required /></label><label>Adultos<input type="number" min="1" max="30" value={adults} onChange={e => setAdults(Number(e.target.value))} /></label><label>Crianças<input type="number" min="0" max="15" value={children} onChange={e => { const count = Math.max(0, Number(e.target.value)); setChildren(count); setChildAges(ages => Array.from({ length: count }, (_, i) => ages[i] ?? 0)); }} /></label></div>
        {children > 0 && <div className="ca-grid ca-child-ages">{childAges.map((age, index) => <label key={index}>Idade criança {index + 1}<select value={age} onChange={e => setChildAges(ages => ages.map((value, i) => i === index ? Number(e.target.value) : value))}>{Array.from({ length: 18 }, (_, value) => <option value={value} key={value}>{value === 0 ? 'Menos de 1 ano' : `${value} ${value === 1 ? 'ano' : 'anos'}`}</option>)}</select></label>)}</div>}
        {children > 0 && <small className="ca-limit-note">As idades ajudam no atendimento, mas as APIs consultadas consideram apenas o total de hóspedes.</small>}
        {source === 'stays' ? <label>Inventário desejado (opcional)<input value={inventory} onChange={e => setInventory(e.target.value)} placeholder="Informe um filtro de inventário Stays" /></label> : <details className="ca-filters"><summary>Filtros adicionais</summary><div className="ca-grid"><label>ID do condomínio<input value={filters.condominio} onChange={e => updateFilter('condominio', e.target.value)} /></label></div><div className="ca-checks"><label><input type="checkbox" checked={filters.umCada} onChange={e => updateFilter('umCada', e.target.checked)} />Um imóvel por condomínio</label></div></details>}
      </>}
      {error && <div className="ca-error" role="alert">{error}</div>}
      <button className="ca-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="ca-spin" size={16} /> : <Search size={16} />}{loading ? 'Consultando…' : mode === 'reservation' ? 'Buscar reserva' : mode === 'alternative' ? 'Buscar alternativas' : 'Buscar apartamentos'}</button>
    </form>
    {result && <section className="ca-result" aria-live="polite"><h3>{mode === 'reservation' ? 'Reserva localizada' : mode === 'alternative' ? 'Opções para apresentar ao cliente' : 'Apartamentos disponíveis'}</h3><ResultCards data={result} mode={mode} /></section>}
  </div>;
}
