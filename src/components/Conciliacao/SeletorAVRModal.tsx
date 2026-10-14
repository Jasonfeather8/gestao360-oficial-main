import { motion } from 'motion/react';
import { CalendarDays, PenLine, X } from 'lucide-react';
import { valorEfetivoLancamento } from '../../services/extrato/comparacao';
import type { DirecaoExtrato, LancamentoFinanceiro } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function formatarData(data: string | null): string {
  return data ? dataFormatada.format(new Date(`${data}T00:00:00Z`)) : '—';
}

interface SeletorAVRModalProps {
  aberto: boolean;
  data: string;
  direcao: DirecaoExtrato;
  valorExtrato: number;
  candidatos: LancamentoFinanceiro[];
  onFechar: () => void;
  onSelecionar: (lancamento: LancamentoFinanceiro) => void;
}

export default function SeletorAVRModal({ aberto, data, direcao, valorExtrato, candidatos, onFechar, onSelecionar }: SeletorAVRModalProps) {
  if (!aberto) return null;

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        role="dialog" aria-modal="true" aria-labelledby="avr-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="avr-title" className="text-xl font-black text-on-surface">Ajuste de Valor Real (AVR)</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Lançamentos do ERP em {formatarData(data)} ({direcao === 'entrada' ? 'entrada' : 'saída'}) elegíveis para AVR.
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Valor desta linha no extrato: <span className="font-bold text-on-surface">{moeda.format(valorExtrato)}</span>
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full p-2 text-on-surface-variant hover:bg-surface"><X className="h-5 w-5" /></button>
        </header>

        {candidatos.length === 0 ? (
          <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">
            Nenhum lançamento do ERP do mesmo dia e mesma natureza está aberto e sem valor recebido para receber AVR.
          </div>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto scrollbar-thin">
            {candidatos.map((lancamento) => (
              <li key={lancamento.id}>
                <button
                  type="button"
                  onClick={() => onSelecionar(lancamento)}
                  className="w-full rounded-2xl border border-surface-border bg-white p-4 text-left transition hover:border-primary/60 hover:bg-primary/5 dark:bg-surface"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{lancamento.observacoes || 'Lançamento sem descrição'}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">
                        <CalendarDays className="h-3.5 w-3.5" />Vencimento {formatarData(lancamento.data_vencimento)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold ${direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{moeda.format(valorEfetivoLancamento(lancamento))}</p>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                        <PenLine className="h-3.5 w-3.5" />Fazer AVR
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-5 flex justify-end">
          <button type="button" onClick={onFechar} className="rounded-xl border border-surface-border px-5 py-2.5 text-sm font-bold text-on-surface hover:bg-surface">Cancelar</button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
