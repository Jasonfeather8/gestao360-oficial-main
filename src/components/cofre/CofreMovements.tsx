import type { MovimentacaoCofre } from '../../types';

type CofreMovementsProps = {
  movimentacoes: MovimentacaoCofre[];
  isMaster: boolean;
  statusLabel: Record<string, string>;
  currency: (value: number) => string;
  formatDate: (value?: string | null) => string;
  onReverseMovement: (id: string) => void;
};

export default function CofreMovements({ movimentacoes, isMaster, statusLabel, currency, formatDate, onReverseMovement }: CofreMovementsProps) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-on-surface">Movimentações do cofre</h2><span className="text-xs font-bold text-secondary">{movimentacoes.length} registros</span></div><div className="space-y-2">{movimentacoes.length === 0 ? <p className="py-8 text-center text-sm text-secondary">Nenhuma movimentação registrada.</p> : movimentacoes.map(movimento => <div key={movimento.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border/70 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-on-surface">{movimento.descricao}</p><p className="text-[10px] uppercase tracking-wider text-secondary">{movimento.tipo} · {movimento.origem} · resp. {movimento.responsavel_id}</p><p className="text-[10px] text-secondary">Confirmação: {movimento.confirmado_recebimento_por ? `${movimento.confirmado_recebimento_por} · ${formatDate(movimento.confirmado_recebimento_em)}` : '—'} · Aprovado por: {movimento.aprovado_por ? `${movimento.aprovado_por} · ${formatDate(movimento.aprovado_em)}` : '—'}</p></div><div className="text-right"><p className={`text-sm font-black ${movimento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{movimento.tipo === 'entrada' ? '+' : '-'}{currency(movimento.valor)}</p><p className="text-[10px] font-bold text-secondary">{statusLabel[movimento.status] || movimento.status}</p>{isMaster && movimento.status === 'aprovado' && <button type="button" onClick={() => onReverseMovement(movimento.id)} className="mt-1 text-[10px] font-bold text-alert-red hover:underline">Estornar</button>}</div></div>)}</div></div>
  );
}
