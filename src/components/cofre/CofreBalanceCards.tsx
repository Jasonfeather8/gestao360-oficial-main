import type { CofreSaldo } from '../../types';

type CofreBalanceCardsProps = {
  saldo?: CofreSaldo;
  currency: (value: number) => string;
};

export default function CofreBalanceCards({ saldo, currency }: CofreBalanceCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-bank-truth-green" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Saldo físico</p><p className="mt-2 text-2xl font-black text-on-surface">{currency(saldo?.saldo_fisico || 0)}</p><p className="mt-1 text-[11px] text-secondary">Somente movimentos aprovados</p></div>
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-primary" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Saldo pendente</p><p className="mt-2 text-2xl font-black text-on-surface">{currency(saldo?.saldo_pendente || 0)}</p><p className="mt-1 text-[11px] text-secondary">Aguardando decisão Master</p></div>
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-secondary" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Pendências</p><p className="mt-2 text-2xl font-black text-on-surface">{saldo?.movimentos_pendentes || 0}</p><p className="mt-1 text-[11px] text-secondary">Movimentações em aprovação</p></div>
    </section>
  );
}
