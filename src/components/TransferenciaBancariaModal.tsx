import { FormEvent, useEffect, useState } from 'react';
import { ArrowRightLeft, Building, Calendar, Coins, X } from 'lucide-react';
import { ContaBancaria } from '../types';
import { useCategorias, useCentrosCusto, useTransferencias } from '../hooks/useData';

interface TransferenciaBancariaModalProps {
  isOpen: boolean;
  contas: ContaBancaria[];
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function TransferenciaBancariaModal({ isOpen, contas, onClose }: TransferenciaBancariaModalProps) {
  const { createTransferencia, isCreating } = useTransferencias();
  const { data: categorias = [] } = useCategorias();
  const { data: centros = [] } = useCentrosCusto();
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [valor, setValor] = useState('');
  const [dataTransferencia, setDataTransferencia] = useState(today());
  const [tarifa, setTarifa] = useState('');
  const [tarifaCategoriaId, setTarifaCategoriaId] = useState('');
  const [tarifaCentroCustoId, setTarifaCentroCustoId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setContaOrigemId(contas[0]?.id || '');
    setContaDestinoId(contas.find(conta => conta.id !== contas[0]?.id)?.id || '');
    setValor('');
    setDataTransferencia(today());
    setTarifa('');
    setTarifaCategoriaId('');
    setTarifaCentroCustoId('');
    setError('');
  }, [isOpen, contas]);

  if (!isOpen) return null;

  const parseAmount = (raw: string) => Number(raw.replace(/\./g, '').replace(',', '.'));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await createTransferencia({
        contaOrigemId,
        contaDestinoId,
        valor: parseAmount(valor),
        dataTransferencia,
        tarifa: tarifa.trim() ? parseAmount(tarifa) : 0,
        tarifaCategoriaId: tarifaCategoriaId || null,
        tarifaCentroCustoId: tarifaCentroCustoId || null,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível criar a transferência.');
    }
  };

  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-[560px] rounded-[32px] bg-white shadow-2xl overflow-hidden">
        <header className="px-8 py-6 border-b bg-neutral-50 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter"><ArrowRightLeft className="w-5 h-5 text-primary" /> Nova transferência</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Dois espelhos, uma operação atômica</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-neutral-200"><X className="w-5 h-5 text-neutral-400" /></button>
        </header>
        <div className="p-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Building className="w-4 h-4" /> Conta origem</span>
              <select value={contaOrigemId} onChange={event => setContaOrigemId(event.target.value)} className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-xs font-bold outline-none focus:border-primary">
                <option value="">Selecione</option>
                {contas.map(conta => <option key={conta.id} value={conta.id}>{conta.nome_banco || conta.nome}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Building className="w-4 h-4" /> Conta destino</span>
              <select value={contaDestinoId} onChange={event => setContaDestinoId(event.target.value)} className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-xs font-bold outline-none focus:border-primary">
                <option value="">Selecione</option>
                {contas.map(conta => <option key={conta.id} value={conta.id}>{conta.nome_banco || conta.nome}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Coins className="w-4 h-4" /> Valor</span>
              <input required inputMode="decimal" value={valor} onChange={event => setValor(event.target.value)} placeholder="0,00" className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-sm font-black outline-none focus:border-primary" />
            </label>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Calendar className="w-4 h-4" /> Data</span>
              <input required type="date" value={dataTransferencia} onChange={event => setDataTransferencia(event.target.value)} className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-xs font-bold outline-none focus:border-primary" />
            </label>
          </div>
          <div className="border-t border-neutral-100 pt-5 space-y-4">
            <label className="space-y-2 block">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tarifa bancária (opcional)</span>
              <input inputMode="decimal" value={tarifa} onChange={event => setTarifa(event.target.value)} placeholder="0,00" className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-sm font-black outline-none focus:border-primary" />
            </label>
            {tarifa.trim() && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <select value={tarifaCategoriaId} onChange={event => setTarifaCategoriaId(event.target.value)} className="h-11 rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-[10px] font-bold uppercase outline-none focus:border-primary">
                  <option value="">Categoria da tarifa (opcional)</option>
                  {categorias.filter(categoria => categoria.tipo === 'saida').map(categoria => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
                </select>
                <select value={tarifaCentroCustoId} onChange={event => setTarifaCentroCustoId(event.target.value)} className="h-11 rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 text-[10px] font-bold uppercase outline-none focus:border-primary">
                  <option value="">Centro de custo (opcional)</option>
                  {centros.map(centro => <option key={centro.id} value={centro.id}>{centro.nome}</option>)}
                </select>
              </div>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-red-600">{error}</p>}
        </div>
        <footer className="flex justify-end gap-3 border-t bg-neutral-50 px-8 py-6">
          <button type="button" onClick={onClose} className="px-5 text-[10px] font-black uppercase tracking-widest text-neutral-400">Cancelar</button>
          <button type="submit" disabled={isCreating || contas.length < 2} className="h-12 rounded-xl bg-neutral-900 px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50">{isCreating ? 'Criando...' : 'Criar transferência'}</button>
        </footer>
      </form>
    </div>
  );
}
