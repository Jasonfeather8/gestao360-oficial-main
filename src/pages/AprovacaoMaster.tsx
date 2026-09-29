import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Filter,
  Paperclip,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useMasterApprovalQueue } from '../hooks/useData';
import { MasterApprovalItemType, MasterApprovalQueueItem } from '../types';

const typeLabels: Record<MasterApprovalItemType, string> = {
  lancamento: 'Lançamento / quitação',
  fechamento_conciliacao: 'Fechamento',
  transferencia_bancaria: 'Transferência bancária',
  movimentacao_cofre: 'Movimentação do Cofre',
  transferencia_cofre: 'Transferência banco / Cofre',
};

const formatMoney = (value?: number | null) =>
  value == null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const itemDate = (item: MasterApprovalQueueItem) => item.data || item.created_at;

const categoryFor = (item: MasterApprovalQueueItem) => item.tipo;

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'amber' | 'blue' }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className={`mt-2 text-2xl font-black ${tone === 'amber' ? 'text-amber-600' : tone === 'blue' ? 'text-primary' : 'text-on-background'}`}>{value}</p>
    </div>
  );
}

function DetailList({ title, values }: { title: string; values?: Record<string, unknown> | null }) {
  if (!values || Object.keys(values).length === 0) return null;
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-low-low p-4">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{title}</h3>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-on-background">{JSON.stringify(values, null, 2)}</pre>
    </section>
  );
}

export default function AprovacaoMaster() {
  const { items, isLoading, isError, decide, isDeciding } = useMasterApprovalQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | MasterApprovalItemType>('all');
  const [priority, setPriority] = useState('all');
  const [account, setAccount] = useState('all');
  const [vault, setVault] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [justification, setJustification] = useState('');
  const [decisionMode, setDecisionMode] = useState<'approve' | 'reject' | null>(null);

  const accounts = useMemo(() => Array.from(new Map(items.filter(item => item.conta_id).map(item => [item.conta_id, item.conta_nome || item.conta_id!])).entries()), [items]);
  const vaults = useMemo(() => Array.from(new Map(items.filter(item => item.cofre_id).map(item => [item.cofre_id, item.cofre_nome || item.cofre_id!])).entries()), [items]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter(item => {
      const date = itemDate(item).slice(0, 10);
      const searchable = [item.titulo, item.descricao, item.origem, item.status, item.operador_nome, item.conta_nome, item.cofre_nome, item.item_id].filter(Boolean).join(' ').toLocaleLowerCase();
      return (type === 'all' || item.tipo === type)
        && (priority === 'all' || item.prioridade === priority)
        && (account === 'all' || item.conta_id === account)
        && (vault === 'all' || item.cofre_id === vault)
        && (!fromDate || date >= fromDate)
        && (!toDate || date <= toDate)
        && (!normalized || searchable.includes(normalized));
    });
  }, [account, fromDate, items, priority, query, toDate, type, vault]);

  const selected = filtered.find(item => item.item_id === selectedId) || items.find(item => item.item_id === selectedId) || filtered[0] || null;
  const categoryCount = (value: MasterApprovalItemType) => items.filter(item => item.tipo === value).length;
  const missing = selected?.pre_requisitos_faltantes || [];
  const canApprove = Boolean(selected?.aprovacao_possivel && missing.length === 0);

  const submitDecision = async () => {
    if (!selected || !decisionMode || isDeciding) return;
    if (decisionMode === 'reject' && !justification.trim()) return;
    await decide({
      itemId: selected.item_id,
      tipo: selected.tipo,
      aprovado: decisionMode === 'approve',
      justificativa: justification.trim() || undefined,
    });
    setDecisionMode(null);
    setJustification('');
    setSelectedId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 border-b border-surface-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-widest">Governança financeira</span></div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-on-background">Aprovação Master</h1>
          <p className="mt-1 text-xs font-medium text-on-surface-variant">Fila única de operações conciliadas, fechamentos e Cofre com impacto no saldo real.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-bold text-primary"><ClipboardCheck className="h-4 w-4" /> {items.length} itens aguardando decisão</div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Total" value={items.length} tone="blue" />
        <Stat label="Lançamentos" value={categoryCount('lancamento')} />
        <Stat label="Fechamentos" value={categoryCount('fechamento_conciliacao')} />
        <Stat label="Transf. bancárias" value={categoryCount('transferencia_bancaria')} />
        <Stat label="Mov. Cofre" value={categoryCount('movimentacao_cofre')} />
        <Stat label="Transf. Cofre" value={categoryCount('transferencia_cofre')} tone="amber" />
      </div>

      <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant"><Filter className="h-4 w-4" /> Filtros da fila</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-7">
          <label className="relative lg:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar operação, operador ou ID" className="h-10 w-full rounded-xl border border-surface-border bg-surface-low-low pl-9 pr-3 text-xs outline-none focus:border-primary" /></label>
          <select value={type} onChange={event => setType(event.target.value as typeof type)} className="h-10 rounded-xl border border-surface-border bg-surface-low-low px-3 text-xs outline-none focus:border-primary"><option value="all">Todos os tipos</option>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={priority} onChange={event => setPriority(event.target.value)} className="h-10 rounded-xl border border-surface-border bg-surface-low-low px-3 text-xs outline-none focus:border-primary"><option value="all">Toda prioridade</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>
          <select value={account} onChange={event => setAccount(event.target.value)} className="h-10 rounded-xl border border-surface-border bg-surface-low-low px-3 text-xs outline-none focus:border-primary"><option value="all">Todas as contas</option>{accounts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <select value={vault} onChange={event => setVault(event.target.value)} className="h-10 rounded-xl border border-surface-border bg-surface-low-low px-3 text-xs outline-none focus:border-primary"><option value="all">Todos os Cofres</option>{vaults.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <div className="flex gap-2"><input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} aria-label="Data inicial" className="h-10 min-w-0 w-1/2 rounded-xl border border-surface-border bg-surface-low-low px-2 text-[11px] outline-none focus:border-primary" /><input type="date" value={toDate} onChange={event => setToDate(event.target.value)} aria-label="Data final" className="h-10 min-w-0 w-1/2 rounded-xl border border-surface-border bg-surface-low-low px-2 text-[11px] outline-none focus:border-primary" /></div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section className="min-h-[420px] overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4"><h2 className="text-xs font-black uppercase tracking-widest text-on-background">Operações pendentes</h2><span className="text-[10px] font-bold text-on-surface-variant">{filtered.length} resultado(s)</span></div>
          {isLoading ? <div className="p-12 text-center text-xs text-on-surface-variant">Carregando fila segura…</div> : isError ? <div className="p-12 text-center text-xs text-alert-red">Não foi possível carregar a fila Master.</div> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-on-surface-variant"><CheckCircle2 className="h-10 w-10 opacity-30" /><p className="text-xs font-bold">Nenhuma operação corresponde aos filtros.</p></div> : <div className="divide-y divide-surface-border">{filtered.map(item => <button key={`${item.tipo}-${item.item_id}`} type="button" onClick={() => setSelectedId(item.item_id)} className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-low-low ${selected?.item_id === item.item_id ? 'bg-primary/5' : ''}`}><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tipo === 'lancamento' ? 'bg-blue-100 text-blue-700' : item.tipo.includes('cofre') ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>{item.tipo === 'lancamento' ? (item.detalhes?.tipo === 'saida' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />) : <FileText className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-black text-on-background">{item.titulo}</p><span className="rounded-full bg-surface-container px-2 py-0.5 text-[9px] font-black uppercase text-on-surface-variant">{item.prioridade}</span></div><p className="mt-1 truncate text-[11px] text-on-surface-variant">{typeLabels[item.tipo]} · {item.conta_nome || item.cofre_nome || 'Sem conta/Cofre'}</p><p className="mt-1 text-[10px] font-bold text-on-surface-variant">{formatDate(itemDate(item))} · {formatMoney(item.valor)}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" /></button>)}</div>}
        </section>

        <aside className="rounded-2xl border border-surface-border bg-surface shadow-sm">
          {!selected ? <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center text-on-surface-variant"><FileText className="h-10 w-10 opacity-30" /><p className="text-xs font-bold">Selecione uma operação para ver os detalhes.</p></div> : <div className="space-y-5 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-primary">{typeLabels[selected.tipo]}</p><h2 className="mt-1 text-lg font-black text-on-background">{selected.titulo}</h2><p className="mt-1 text-xs text-on-surface-variant">{selected.descricao || 'Sem descrição adicional.'}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${selected.prioridade === 'alta' ? 'bg-red-100 text-red-700' : 'bg-surface-container text-on-surface-variant'}`}>{selected.prioridade}</span></div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-low-low p-4"><div><p className="text-[9px] font-black uppercase text-on-surface-variant">Valor / impacto</p><p className="mt-1 text-lg font-black text-on-background">{formatMoney(selected.valor)}</p></div><div><p className="text-[9px] font-black uppercase text-on-surface-variant">Data</p><p className="mt-1 text-sm font-bold text-on-background">{formatDate(itemDate(selected))}</p></div><div><p className="text-[9px] font-black uppercase text-on-surface-variant">Operador</p><p className="mt-1 truncate text-xs font-bold text-on-background">{selected.operador_nome || selected.operador_id || '—'}</p></div><div><p className="text-[9px] font-black uppercase text-on-surface-variant">Status</p><p className="mt-1 text-xs font-bold text-on-background">{selected.status}</p></div></div>
            <section className="grid grid-cols-1 gap-2 rounded-2xl border border-surface-border p-4 text-[11px] sm:grid-cols-2"><div><span className="font-black uppercase tracking-wider text-on-surface-variant">Origem:</span> {selected.origem}</div><div><span className="font-black uppercase tracking-wider text-on-surface-variant">Conta:</span> {selected.conta_nome || selected.conta_id || '—'}</div><div><span className="font-black uppercase tracking-wider text-on-surface-variant">Cofre:</span> {selected.cofre_nome || selected.cofre_id || '—'}</div><div><span className="font-black uppercase tracking-wider text-on-surface-variant">Lançamento:</span> {selected.lancamento_id || '—'}</div><div><span className="font-black uppercase tracking-wider text-on-surface-variant">Transferência:</span> {selected.transferencia_id || selected.transferencia_cofre_id || '—'}</div><div><span className="font-black uppercase tracking-wider text-on-surface-variant">Fechamento:</span> {selected.fechamento_id || '—'}</div></section>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-primary">Impacto no saldo real</p><p className="mt-2 text-xs font-medium text-on-background">{selected.aprovacao_possivel ? `A aprovação confirma o efeito de ${formatMoney(selected.valor)} no saldo real, conforme a natureza da operação.` : 'O efeito no saldo real permanece bloqueado até que os pré-requisitos sejam atendidos.'}</p></div>
            {missing.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" /><p className="text-[10px] font-black uppercase tracking-widest">Pré-requisitos faltantes</p></div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{missing.map(value => <li key={value}>{value}</li>)}</ul></div>}
            <DetailList title="Detalhes da operação" values={selected.detalhes} /><DetailList title="Evidências" values={selected.evidencias} />
            {selected.anexos && selected.anexos.length > 0 && <section><h3 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant"><Paperclip className="h-4 w-4" /> Evidências / anexos</h3><div className="space-y-2">{selected.anexos.map(anexo => anexo.url ? <a key={anexo.id || anexo.url} href={anexo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-surface-border p-3 text-xs font-bold text-primary hover:bg-primary/5"><Paperclip className="h-4 w-4" />{anexo.nome || 'Abrir anexo'}</a> : <div key={anexo.id || anexo.nome} className="rounded-xl border border-surface-border p-3 text-xs">{anexo.nome || 'Anexo sem URL'}</div>)}</div></section>}
            <div className="flex gap-2 border-t border-surface-border pt-4"><button type="button" disabled={!canApprove || isDeciding} onClick={() => setDecisionMode('approve')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" /> Aprovar</button><button type="button" disabled={isDeciding} onClick={() => setDecisionMode('reject')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-4 w-4" /> Reprovar</button></div>{!canApprove && <p className="text-[10px] font-bold text-amber-700">A aprovação está bloqueada enquanto houver pré-requisitos faltantes.</p>}
          </div>}
        </aside>
      </div>

      {decisionMode && selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/50 p-4"><div className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-on-background">{decisionMode === 'approve' ? 'Confirmar aprovação' : 'Reprovar operação'}</h2><p className="mt-1 text-xs text-on-surface-variant">{decisionMode === 'approve' ? 'A decisão será validada e executada no servidor.' : 'A justificativa ficará registrada na auditoria.'}</p></div><button type="button" onClick={() => setDecisionMode(null)} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container" aria-label="Fechar"><XCircle className="h-5 w-5" /></button></div><textarea value={justification} onChange={event => setJustification(event.target.value)} required={decisionMode === 'reject'} placeholder={decisionMode === 'reject' ? 'Justificativa obrigatória para reprovação' : 'Observação da decisão (opcional)'} className="mt-5 min-h-28 w-full resize-y rounded-xl border border-surface-border bg-surface-low-low p-3 text-xs outline-none focus:border-primary" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDecisionMode(null)} className="rounded-xl px-4 py-3 text-xs font-bold text-on-surface-variant hover:bg-surface-container">Cancelar</button><button type="button" onClick={submitDecision} disabled={isDeciding || (decisionMode === 'reject' && !justification.trim())} className="rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-wider text-on-primary disabled:opacity-40">{isDeciding ? 'Enviando…' : decisionMode === 'approve' ? 'Confirmar aprovação' : 'Confirmar reprovação'}</button></div></div></div>}
    </div>
  );
}
