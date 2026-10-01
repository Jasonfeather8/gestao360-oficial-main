import { ShieldCheck } from 'lucide-react';
import type { MovimentacaoCofre, TransferenciaCofre } from '../../types';

type CofreMasterApprovalQueueProps = {
  pendingMovimentacoes: MovimentacaoCofre[];
  pendingTransferencias: TransferenciaCofre[];
  statusLabel: Record<string, string>;
  currency: (value: number) => string;
  onOpenQueue: () => void;
};

export default function CofreMasterApprovalQueue({ pendingMovimentacoes, pendingTransferencias, statusLabel, currency, onOpenQueue }: CofreMasterApprovalQueueProps) {
  return (
    <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Fila de aprovação Master</h2></div><button type="button" onClick={onOpenQueue} className="rounded-md bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-primary">Abrir fila central</button></div><p className="text-xs text-secondary">As decisões do Cofre são realizadas exclusivamente na fila centralizada, com justificativa e histórico.</p><div className="grid gap-3 lg:grid-cols-2"><div className="space-y-2"><h3 className="text-xs font-black uppercase tracking-wider text-secondary">Movimentações ({pendingMovimentacoes.length})</h3>{pendingMovimentacoes.length === 0 && <p className="text-sm text-secondary">Nenhuma movimentação aguardando decisão.</p>}{pendingMovimentacoes.map(movimento => <div key={movimento.id} className="rounded-lg border border-surface-border bg-surface p-3"><p className="text-sm font-bold">{movimento.descricao}</p><p className="text-[10px] text-secondary">{movimento.responsavel_id} · {currency(movimento.valor)}</p></div>)}</div><div className="space-y-2"><h3 className="text-xs font-black uppercase tracking-wider text-secondary">Transferências ({pendingTransferencias.length})</h3>{pendingTransferencias.length === 0 && <p className="text-sm text-secondary">Nenhuma transferência aguardando decisão.</p>}{pendingTransferencias.map(transferencia => <div key={transferencia.id} className="rounded-lg border border-surface-border bg-surface p-3"><p className="text-sm font-bold">{transferencia.direcao === 'banco_para_cofre' ? 'Banco → Cofre' : 'Cofre → Banco'}</p><p className="text-[10px] text-secondary">{currency(transferencia.valor)} · {statusLabel[transferencia.status] || transferencia.status}</p></div>)}</div></div></section>
  );
}
