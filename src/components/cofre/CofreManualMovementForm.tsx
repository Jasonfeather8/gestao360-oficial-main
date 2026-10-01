import type { Dispatch, FormEventHandler, SetStateAction } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { CofreLocal, TipoMovimentacaoCofre } from '../../types';

type CofreManualMovementFormProps = {
  onSubmit: FormEventHandler<HTMLFormElement>;
  tipoManual: TipoMovimentacaoCofre;
  setTipoManual: Dispatch<SetStateAction<TipoMovimentacaoCofre>>;
  valorManual: string;
  setValorManual: Dispatch<SetStateAction<string>>;
  dataManual: string;
  setDataManual: Dispatch<SetStateAction<string>>;
  descricaoManual: string;
  setDescricaoManual: Dispatch<SetStateAction<string>>;
  isMutating: boolean;
  selectedCofre: CofreLocal | undefined;
};

export default function CofreManualMovementForm({ onSubmit, tipoManual, setTipoManual, valorManual, setValorManual, dataManual, setDataManual, descricaoManual, setDescricaoManual, isMutating, selectedCofre }: CofreManualMovementFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-surface-border bg-surface p-5"><div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Movimentação manual</h2></div><p className="text-xs text-secondary">Registre uma entrada ou saída física sem vincular a um lançamento financeiro.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-secondary">Tipo<select value={tipoManual} onChange={event => setTipoManual(event.target.value as TipoMovimentacaoCofre)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label className="text-xs font-bold text-secondary">Valor<input required value={valorManual} onChange={event => setValorManual(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataManual} onChange={event => setDataManual(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label></div><label className="block text-xs font-bold text-secondary">Descrição<textarea required value={descricaoManual} onChange={event => setDescricaoManual(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50">Registrar movimentação manual</button></form>
  );
}
