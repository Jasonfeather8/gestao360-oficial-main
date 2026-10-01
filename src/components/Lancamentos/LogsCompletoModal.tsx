import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { LancamentoFinanceiro } from '../../types';

interface LogsCompletoModalProps {
  selectedLogItem: LancamentoFinanceiro | null;
  onClose: () => void;
}

export default function LogsCompletoModal({ selectedLogItem, onClose }: LogsCompletoModalProps) {
  return (
    <AnimatePresence>
      {selectedLogItem && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 w-full max-w-[560px] max-h-[80vh] bg-white rounded-3xl shadow-2xl overflow-hidden">
            <header className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Logs completos</h3>
                <p className="text-[9px] font-bold uppercase tracking-widest text-secondary mt-1">Registro {selectedLogItem.codigo_sequencial || selectedLogItem.id}</p>
              </div>
              <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-neutral-200"><X className="w-5 h-5 text-secondary" /></button>
            </header>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
              {(selectedLogItem.observacoes || 'Sem logs registrados.')
                .replace(/\\n/g, '\n')
                .split(/\r?\n/)
                .map(log => log.trim())
                .filter(Boolean)
                .map((log, index) => (
                  <div key={`${selectedLogItem.id}-log-${index}`} className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/70 px-4 py-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-black text-neutral-500">
                      {index + 1}
                    </span>
                    <p className="min-w-0 whitespace-pre-wrap break-words text-xs leading-relaxed font-bold text-neutral-700">{log}</p>
                  </div>
                ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
