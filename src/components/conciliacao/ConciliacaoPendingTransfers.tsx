import { ContaBancaria, TransferenciaBancaria } from '../../types';
import { Shield } from 'lucide-react';

type ConciliacaoPendingTransfersProps = {
  role: string;
  transferenciasPendentesMaster: TransferenciaBancaria[];
  contas: ContaBancaria[];
  valueFormatter: (value: number) => string;
  onOpenMasterQueue: () => void;
};

export default function ConciliacaoPendingTransfers({
  role,
  transferenciasPendentesMaster,
  contas,
  valueFormatter,
  onOpenMasterQueue,
}: ConciliacaoPendingTransfersProps) {
  return (
    <>
      {role === 'master' && transferenciasPendentesMaster.length > 0 && (
        <div className="bg-white border-2 border-amber-100 p-4 rounded-3xl shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Transferências aguardando Master</p>
                <p className="text-[9px] font-bold text-neutral-400 uppercase">Origem e destino já estão vinculados; falta a decisão final.</p>
              </div>
            </div>
            <span className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest">{transferenciasPendentesMaster.length} pendente(s)</span>
          </div>
          <div className="space-y-2">
            {transferenciasPendentesMaster.map(transferencia => (
              <div key={transferencia.id} className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-3 py-2 rounded-xl">
                <div className="text-[9px] font-bold text-neutral-600 uppercase">
                  {contas.find(conta => conta.id === transferencia.conta_origem_id)?.nome || 'Origem'} → {contas.find(conta => conta.id === transferencia.conta_destino_id)?.nome || 'Destino'} • {valueFormatter(Number(transferencia.valor))} • {transferencia.data_transferencia.split('-').reverse().join('/')}
                </div>
                <button
                  type="button"
                  onClick={onOpenMasterQueue}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-primary/90"
                >
                  Abrir fila Master
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
