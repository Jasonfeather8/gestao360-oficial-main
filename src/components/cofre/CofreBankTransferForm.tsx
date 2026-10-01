import type { Dispatch, FormEventHandler, SetStateAction } from 'react';
import { Landmark } from 'lucide-react';
import type { CofreLocal, ContaBancaria, DirecaoTransferenciaCofre } from '../../types';

type CofreBankTransferFormProps = {
  onSubmit: FormEventHandler<HTMLFormElement>;
  direcao: DirecaoTransferenciaCofre;
  setDirecao: Dispatch<SetStateAction<DirecaoTransferenciaCofre>>;
  contaBancariaId: string;
  setContaBancariaId: Dispatch<SetStateAction<string>>;
  valorTransferencia: string;
  setValorTransferencia: Dispatch<SetStateAction<string>>;
  dataTransferencia: string;
  setDataTransferencia: Dispatch<SetStateAction<string>>;
  contas: ContaBancaria[];
  isMutating: boolean;
  selectedCofre: CofreLocal | undefined;
};

export default function CofreBankTransferForm({ onSubmit, direcao, setDirecao, contaBancariaId, setContaBancariaId, valorTransferencia, setValorTransferencia, dataTransferencia, setDataTransferencia, contas, isMutating, selectedCofre }: CofreBankTransferFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4"><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Criar transferência banco ↔ cofre</h2></div><p className="text-xs text-secondary">Cria o cabeçalho, o movimento do cofre e o lançamento bancário espelho. Não é receita nem despesa.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-bold text-secondary">Direção<select value={direcao} onChange={event => setDirecao(event.target.value as typeof direcao)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="banco_para_cofre">Banco para cofre</option><option value="cofre_para_banco">Cofre para banco</option></select></label><label className="text-xs font-bold text-secondary">Conta bancária<select required value={contaBancariaId} onChange={event => setContaBancariaId(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="">Selecione...</option>{contas.map(conta => <option key={conta.id} value={conta.id}>{conta.nome} · {conta.nome_banco}</option>)}</select></label><label className="text-xs font-bold text-secondary">Valor<input required value={valorTransferencia} onChange={event => setValorTransferencia(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataTransferencia} onChange={event => setDataTransferencia(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label></div><button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Criar transferência</button></form>
  );
}
