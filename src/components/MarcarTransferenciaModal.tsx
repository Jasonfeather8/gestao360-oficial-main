import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Building, X } from 'lucide-react';
import { ContaBancaria, TransacaoBanco } from '../types';

interface MarcarTransferenciaModalProps {
  isOpen: boolean;
  transacao: TransacaoBanco | null;
  contas: ContaBancaria[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (contaRelacionadaId: string) => Promise<void>;
}

export default function MarcarTransferenciaModal({
  isOpen,
  transacao,
  contas,
  isSubmitting,
  onClose,
  onSubmit,
}: MarcarTransferenciaModalProps) {
  const [contaRelacionadaId, setContaRelacionadaId] = useState('');
  const [error, setError] = useState('');

  const contasRelacionadas = useMemo(
    () => contas.filter(conta => conta.id !== transacao?.conta_bancaria_id),
    [contas, transacao?.conta_bancaria_id],
  );
  const isEntrada = (transacao?.valor || 0) > 0;
  const contaAtual = contas.find(conta => conta.id === transacao?.conta_bancaria_id);
  const ladoAtual = isEntrada ? 'destino' : 'origem';
  const ladoRelacionado = isEntrada ? 'origem' : 'destino';

  useEffect(() => {
    if (!isOpen) return;
    setContaRelacionadaId(contasRelacionadas[0]?.id || '');
    setError('');
  }, [isOpen, contasRelacionadas]);

  if (!isOpen || !transacao) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await onSubmit(contaRelacionadaId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível marcar a transação como transferência.');
    }
  };

  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b bg-neutral-50 px-8 py-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter">
              <ArrowRightLeft className="h-5 w-5 text-primary" /> Marcar como transferência
            </h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">O servidor fará o vínculo de forma atômica</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-neutral-200" aria-label="Fechar">
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </header>

        <div className="space-y-5 p-8">
          <div className="rounded-2xl border-2 border-neutral-100 bg-neutral-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Transação selecionada</p>
            <p className="mt-2 truncate text-xs font-black uppercase text-neutral-900">{transacao.descricao_original || transacao.descricao_banco}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              <span>{transacao.data_transacao.split('-').reverse().join('/')}</span>
              <span className={isEntrada ? 'text-emerald-600' : 'text-red-600'}>{transacao.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-100 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Lado derivado</p>
              <p className="mt-2 flex items-center gap-2 text-xs font-black uppercase text-neutral-800">
                {isEntrada ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownLeft className="h-4 w-4 text-red-600" />}
                {ladoAtual} • {contaAtual?.nome_banco || contaAtual?.nome || 'Conta atual'}
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary">Conta relacionada</p>
              <p className="mt-2 flex items-center gap-2 text-xs font-black uppercase text-neutral-800">
                <Building className="h-4 w-4 text-primary" /> {ladoRelacionado}
              </p>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Escolha a conta relacionada</span>
            <select
              required
              value={contaRelacionadaId}
              onChange={event => setContaRelacionadaId(event.target.value)}
              disabled={contasRelacionadas.length === 0 || isSubmitting}
              className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-xs font-bold uppercase outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">Selecione</option>
              {contasRelacionadas.map(conta => <option key={conta.id} value={conta.id}>{conta.nome_banco || conta.nome}</option>)}
            </select>
          </label>

          {contasRelacionadas.length === 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-amber-700">Não há outra conta bancária disponível para relacionar.</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-red-600">{error}</p>}
        </div>

        <footer className="flex justify-end gap-3 border-t bg-neutral-50 px-8 py-6">
          <button type="button" onClick={onClose} className="px-5 text-[10px] font-black uppercase tracking-widest text-neutral-400">Cancelar</button>
          <button type="submit" disabled={!contaRelacionadaId || isSubmitting || contasRelacionadas.length === 0} className="h-12 rounded-xl bg-neutral-900 px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50">
            {isSubmitting ? 'Processando...' : 'Marcar transferência'}
          </button>
        </footer>
      </form>
    </div>
  );
}
