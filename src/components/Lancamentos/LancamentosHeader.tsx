import { Download, Receipt, ShieldCheck } from 'lucide-react';
import Button from '../Button';

interface LancamentosHeaderProps {
  titleOverride?: string;
  isFinanceiroView: boolean;
  isMaster: boolean;
  selectedCount: number;
  selectedPrintCount: number;
  handlePrintSelected: () => void;
  onNavigateToMaster: () => void;
}

export default function LancamentosHeader({
  titleOverride,
  isFinanceiroView,
  isMaster,
  selectedCount,
  selectedPrintCount,
  handlePrintSelected,
  onNavigateToMaster
}: LancamentosHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900 flex items-center gap-3">
          <Receipt className="w-8 h-8 text-primary" />
          {titleOverride || 'Extrato'}
        </h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Gestão centralizada de movimentações e conciliação</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={handlePrintSelected}
          disabled={selectedCount === 0 || selectedPrintCount === 0}
          title="Imprimir relatório somente dos lançamentos selecionados"
        >
          <Download className="w-4 h-4" />
          Gerar PDF do Filtro
        </Button>
        {selectedPrintCount > 0 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
            {selectedPrintCount} selecionado{selectedPrintCount === 1 ? '' : 's'}
          </span>
        )}

        {isFinanceiroView && isMaster && (
          <Button onClick={onNavigateToMaster}>
            <ShieldCheck className="w-4 h-4" />
            Abrir fila de aprovação Master
          </Button>
        )}

      </div>
    </div>
  );
}
