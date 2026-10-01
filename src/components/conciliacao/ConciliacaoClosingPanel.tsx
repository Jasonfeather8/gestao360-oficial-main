import { Shield } from 'lucide-react';

type ConciliacaoClosingPanelProps = {
  selectedMonth: string;
  contas: Array<{ id: string; nome: string }>;
  selectedContaId: string;
  fechamentoAtual: {
    status: 'aberto' | 'aguardando_master' | 'aprovado' | 'reprovado';
    motivo_reprovacao?: string | null;
  } | null;
  fechamentosAguardandoMaster: Array<{
    id: string;
    conta_bancaria_id: string;
    periodo_inicio: string;
    total_extrato: number;
  }>;
  role: string;
  fechamentoBusy: boolean;
  isFechandoPeriodo: boolean;
  handleFecharPeriodo: () => void | Promise<void>;
  onOpenMasterQueue: () => void;
  valueFormatter: (value: number) => string;
};

export default function ConciliacaoClosingPanel({
  selectedMonth,
  contas,
  selectedContaId,
  fechamentoAtual,
  fechamentosAguardandoMaster,
  role,
  fechamentoBusy,
  isFechandoPeriodo,
  handleFecharPeriodo,
  onOpenMasterQueue,
  valueFormatter,
}: ConciliacaoClosingPanelProps) {
  return (
    <>
      {/* Fechamento formal da competência */}
      <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <p className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Fechamento da competência</p>
              <p className="text-[9px] font-bold text-neutral-400 uppercase mt-0.5">
                {selectedMonth} • {contas.find(conta => conta.id === selectedContaId)?.nome || 'Selecione uma conta'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${
              fechamentoAtual?.status === 'aguardando_master' ? 'bg-amber-50 text-amber-700' :
              fechamentoAtual?.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' :
              fechamentoAtual?.status === 'reprovado' ? 'bg-red-50 text-red-700' :
              'bg-neutral-100 text-neutral-500'
            }`}>
              {fechamentoAtual?.status === 'aguardando_master' ? 'Aguardando Master' :
                fechamentoAtual?.status === 'aprovado' ? 'Aprovado' :
                fechamentoAtual?.status === 'reprovado' ? 'Reprovado' : 'Aberto'}
            </span>
            {(!fechamentoAtual || fechamentoAtual.status === 'aberto' || fechamentoAtual.status === 'reprovado') && (
              <button
                onClick={handleFecharPeriodo}
                disabled={!selectedContaId || !selectedMonth || fechamentoBusy}
                className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFechandoPeriodo ? 'Validando...' : 'Solicitar fechamento'}
              </button>
            )}
          </div>
        </div>
        {fechamentoAtual?.status === 'reprovado' && fechamentoAtual.motivo_reprovacao && (
          <p className="text-[9px] font-bold text-red-600 uppercase tracking-widest">Motivo: {fechamentoAtual.motivo_reprovacao}</p>
        )}
        {role === 'master' && fechamentosAguardandoMaster.length > 0 && (
          <div className="border-t border-neutral-100 pt-3 space-y-2">
            <p className="text-[9px] font-black text-primary uppercase tracking-widest">Fechamentos aguardando decisão</p>
            {fechamentosAguardandoMaster.map(fechamento => (
              <div key={fechamento.id} className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-3 py-2 rounded-xl">
                <div className="text-[9px] font-bold text-neutral-600 uppercase">
                  {contas.find(conta => conta.id === fechamento.conta_bancaria_id)?.nome || 'Conta'} • {fechamento.periodo_inicio.slice(0, 7)} • {valueFormatter(Number(fechamento.total_extrato))}
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
        )}
      </div>
    </>
  );
}
