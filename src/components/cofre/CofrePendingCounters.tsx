type CofrePendingCountersProps = {
  pendingMovimentacoes: number;
  awaitingReceiving: number;
  awaitingReconciliation: number;
  pendingTransferencias: number;
};

export default function CofrePendingCounters({ pendingMovimentacoes, awaitingReceiving, awaitingReconciliation, pendingTransferencias }: CofrePendingCountersProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Movimentações aguardando Master</p><p className="mt-2 text-2xl font-black text-on-surface">{pendingMovimentacoes}</p></div>
      <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Transferências aguardando recebimento</p><p className="mt-2 text-2xl font-black text-on-surface">{awaitingReceiving}</p></div>
      <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Transferências aguardando conciliação</p><p className="mt-2 text-2xl font-black text-on-surface">{awaitingReconciliation}</p></div>
      <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Transferências aguardando Master</p><p className="mt-2 text-2xl font-black text-on-surface">{pendingTransferencias}</p></div>
    </section>
  );
}
