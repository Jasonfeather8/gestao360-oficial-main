import type { Dispatch, FormEventHandler, SetStateAction } from 'react';
import { Banknote } from 'lucide-react';
import type { CofreLocal, LancamentoFinanceiro, TipoMovimentacaoCofre } from '../../types';

type CofreDirectWriteoffFormProps = {
  onSubmit: FormEventHandler<HTMLFormElement>;
  tipoBaixa: TipoMovimentacaoCofre;
  setTipoBaixa: Dispatch<SetStateAction<TipoMovimentacaoCofre>>;
  valorBaixa: string;
  setValorBaixa: Dispatch<SetStateAction<string>>;
  dataBaixa: string;
  setDataBaixa: Dispatch<SetStateAction<string>>;
  lancamentoId: string;
  setLancamentoId: Dispatch<SetStateAction<string>>;
  descricaoBaixa: string;
  setDescricaoBaixa: Dispatch<SetStateAction<string>>;
  openLancamentos: LancamentoFinanceiro[];
  currency: (value: number) => string;
  isMutating: boolean;
  selectedCofre: CofreLocal | undefined;
};

export default function CofreDirectWriteoffForm({ onSubmit, tipoBaixa, setTipoBaixa, valorBaixa, setValorBaixa, dataBaixa, setDataBaixa, lancamentoId, setLancamentoId, descricaoBaixa, setDescricaoBaixa, openLancamentos, currency, isMutating, selectedCofre }: CofreDirectWriteoffFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-surface-border bg-surface p-5"><div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Baixa direta</h2></div><p className="text-xs text-secondary">Baixe um lançamento financeiro aberto junto com a movimentação do cofre.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-secondary">Tipo<select value={tipoBaixa} onChange={event => setTipoBaixa(event.target.value as TipoMovimentacaoCofre)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label className="text-xs font-bold text-secondary">Valor<input required value={valorBaixa} onChange={event => setValorBaixa(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataBaixa} onChange={event => setDataBaixa(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label></div><label className="block text-xs font-bold text-secondary">Lançamento aberto<select required value={lancamentoId} onChange={event => setLancamentoId(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="">Selecione o lançamento</option>{openLancamentos.map(lancamento => <option key={lancamento.id} value={lancamento.id}>{lancamento.codigo_sequencial || lancamento.id.slice(0, 8)} · {lancamento.observacoes || 'Sem descrição'} · {currency(lancamento.valor_previsto)}</option>)}</select></label><label className="block text-xs font-bold text-secondary">Descrição<textarea required value={descricaoBaixa} onChange={event => setDescricaoBaixa(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50">Registrar baixa direta</button></form>
  );
}
