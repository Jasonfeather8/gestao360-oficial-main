import { ShieldCheck } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { CofreLocal } from '../../types';

type CofreSelectorProps = {
  activeCofres: CofreLocal[];
  selectedCofre?: CofreLocal;
  setSelectedCofreId: Dispatch<SetStateAction<string>>;
  responsible?: string;
};

export default function CofreSelector({ activeCofres, selectedCofre, setSelectedCofreId, responsible }: CofreSelectorProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
      <label className="flex items-center gap-3 text-sm font-bold text-on-surface"><ShieldCheck className="h-5 w-5 text-primary" /> Cofre selecionado<select value={selectedCofre?.id || ''} onChange={event => setSelectedCofreId(event.target.value)} className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm font-semibold outline-none"><option value="">Selecione...</option>{activeCofres.map(cofre => <option key={cofre.id} value={cofre.id}>{cofre.nome}</option>)}</select></label>
      {selectedCofre && <span className="text-xs font-bold uppercase tracking-wider text-secondary">Responsável da sessão: {responsible}</span>}
    </section>
  );
}
