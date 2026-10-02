type ConciliacaoCompetenceSummaryProps = {
  periodProgress: {
    readyForClosing: boolean;
    state: string;
    total: number;
    identified: number;
    pending: number;
    percentage: number;
    differenceCount: number;
    differenceCents: number;
    residualCents: number;
    unclassifiedDifferenceCount: number;
    fechamentoStatus: string;
  };
  valueFormatter: (value: number) => string;
  operationNotice: string | null;
  completionNotice: string | null;
};

export default function ConciliacaoCompetenceSummary({
  periodProgress,
  valueFormatter,
  operationNotice,
  completionNotice,
}: ConciliacaoCompetenceSummaryProps) {
  return (
    <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Estado da competência</p>
          <p className="text-[9px] font-bold text-neutral-400 uppercase mt-0.5">Conta e mês inteiros; filtros não alteram estes números.</p>
        </div>
        <span className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
          periodProgress.readyForClosing ? 'bg-emerald-50 text-emerald-700' :
            periodProgress.state.startsWith('Bloqueado') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {periodProgress.state}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] font-black uppercase tracking-widest">
        <span className="rounded-xl bg-neutral-50 px-3 py-2 text-neutral-600">Extrato: {periodProgress.total}</span>
        <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">Identificadas: {periodProgress.identified}</span>
        <span className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">Não identificados: {periodProgress.pending}</span>
        <span className="rounded-xl bg-neutral-50 px-3 py-2 text-neutral-600">Conciliado: {periodProgress.percentage}%</span>
        <span className="rounded-xl bg-neutral-50 px-3 py-2 text-neutral-600">Divergências de valores: {periodProgress.differenceCount} • {valueFormatter(periodProgress.differenceCents / 100)}</span>
        <span className={`rounded-xl px-3 py-2 ${periodProgress.residualCents === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>Residual global: {periodProgress.residualCents}¢ ({valueFormatter(periodProgress.residualCents / 100)})</span>
        <span className={`rounded-xl px-3 py-2 ${periodProgress.unclassifiedDifferenceCount === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>Não classificadas: {periodProgress.unclassifiedDifferenceCount}</span>
        <span className="rounded-xl bg-neutral-100 px-3 py-2 text-neutral-600">Fechamento: {periodProgress.fechamentoStatus === 'aguardando_master' ? 'Aguardando Master' : periodProgress.fechamentoStatus === 'aprovado' ? 'Aprovado' : periodProgress.fechamentoStatus === 'reprovado' ? 'Reprovado' : 'Aberto'}</span>
      </div>
      {operationNotice && <p className="rounded-xl bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700">{operationNotice}</p>}
      {completionNotice && <p className="rounded-xl bg-emerald-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-800">{completionNotice}</p>}
    </div>
  );
}
