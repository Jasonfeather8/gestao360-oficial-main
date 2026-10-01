import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, ArrowRightLeft, Building, Calendar, Upload, Zap } from 'lucide-react';
import type { ContaBancaria } from '../../types';

type DirectionFilter = 'todos' | 'entrada' | 'saida';
type ReviewFilter = 'todos' | 'pendencias';

interface ConciliacaoHeaderProps {
  directionFilter: DirectionFilter;
  setDirectionFilter: Dispatch<SetStateAction<DirectionFilter>>;
  reviewFilter: ReviewFilter;
  setReviewFilter: Dispatch<SetStateAction<ReviewFilter>>;
  contas: ContaBancaria[];
  selectedContaId: string;
  setSelectedContaId: Dispatch<SetStateAction<string>>;
  selectedMonth: string;
  setSelectedMonth: Dispatch<SetStateAction<string>>;
  onOpenTransferencia: () => void;
  onOpenImportar: () => void;
}

export default function ConciliacaoHeader({
  directionFilter,
  setDirectionFilter,
  reviewFilter,
  setReviewFilter,
  contas,
  selectedContaId,
  setSelectedContaId,
  selectedMonth,
  setSelectedMonth,
  onOpenTransferencia,
  onOpenImportar,
}: ConciliacaoHeaderProps) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div>
        <h1 className="text-3xl font-black text-on-surface tracking-tighter uppercase flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary fill-primary/20" />
          Estação de Conciliação
        </h1>
        <p className="text-secondary font-bold text-xs uppercase tracking-widest mt-1">Sincronização de Verdade Bancária e Integridade de Caixa</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white border-2 border-neutral-100 rounded-2xl p-1.5 shadow-sm">
          <button 
            onClick={() => setDirectionFilter('todos')}
            className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all ${directionFilter === 'todos' ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-400 hover:text-neutral-900'}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setDirectionFilter('entrada')}
            className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all ${directionFilter === 'entrada' ? 'bg-emerald-500 text-white shadow-lg' : 'text-neutral-400 hover:text-emerald-500'}`}
          >
            Entradas
          </button>
          <button
            onClick={() => setDirectionFilter('saida')}
            className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all ${directionFilter === 'saida' ? 'bg-red-500 text-white shadow-lg' : 'text-neutral-400 hover:text-red-500'}`}
          >
            Saídas
          </button>
          <button
            onClick={() => setReviewFilter(current => current === 'pendencias' ? 'todos' : 'pendencias')}
            className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${reviewFilter === 'pendencias' ? 'bg-amber-500 text-white shadow-lg' : 'text-neutral-400 hover:text-amber-600'}`}
            title="Mostrar somente transações com alerta de revisão"
          >
            <AlertTriangle className="w-3 h-3" /> Pendências
          </button>
        </div>

        <div className="flex items-center gap-3 h-12 px-4 bg-white border-2 border-neutral-100 rounded-2xl shadow-sm">
          <Building className="w-4 h-4 text-neutral-400" />
          <select value={selectedContaId} onChange={(e) => setSelectedContaId(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase outline-none cursor-pointer">
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3 h-12 px-4 bg-white border-2 border-neutral-100 rounded-2xl shadow-sm">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase outline-none" />
        </div>

        <button onClick={onOpenTransferencia} className="px-6 h-12 bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-primary/90 transition-all flex items-center gap-3 shadow-xl active:scale-95">
          <ArrowRightLeft className="w-4 h-4" /> Nova Transferência
        </button>
        <button onClick={onOpenImportar} className="px-6 h-12 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-black transition-all flex items-center gap-3 shadow-xl active:scale-95">
          <Upload className="w-4 h-4" /> Importar Extrato
        </button>
      </div>
    </header>
  );
}
