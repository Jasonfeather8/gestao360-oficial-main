import { ArrowLeftRight } from 'lucide-react';
import type { TransferenciaCofre } from '../../types';
import CofreTransferenciaCard, { type CofreTransferenciaCardProps } from './CofreTransferenciaCard';

type CofreRecentTransfersProps = Omit<CofreTransferenciaCardProps, 'transferencia'> & {
  bancoParaCofre: TransferenciaCofre[];
  cofreParaBanco: TransferenciaCofre[];
  hasNoTransfers: boolean;
};

export default function CofreRecentTransfers({ bancoParaCofre, cofreParaBanco, hasNoTransfers, ...cardProps }: CofreRecentTransfersProps) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-on-surface">Transferências recentes</h2><ArrowLeftRight className="h-4 w-4 text-secondary" /></div><div className="grid gap-4">{hasNoTransfers ? <p className="py-8 text-center text-sm text-secondary">Nenhuma transferência registrada.</p> : <><div><h3 className="mb-2 text-xs font-black uppercase tracking-wider text-secondary">Banco → Cofre ({bancoParaCofre.length})</h3><div className="space-y-3">{bancoParaCofre.length ? bancoParaCofre.map(transferencia => <CofreTransferenciaCard key={transferencia.id} transferencia={transferencia} {...cardProps} />) : <p className="text-sm text-secondary">Nenhuma transferência recente nesta direção.</p>}</div></div><div><h3 className="mb-2 text-xs font-black uppercase tracking-wider text-secondary">Cofre → Banco ({cofreParaBanco.length})</h3><div className="space-y-3">{cofreParaBanco.length ? cofreParaBanco.map(transferencia => <CofreTransferenciaCard key={transferencia.id} transferencia={transferencia} {...cardProps} />) : <p className="text-sm text-secondary">Nenhuma transferência recente nesta direção.</p>}</div></div></>}</div></div>
  );
}
