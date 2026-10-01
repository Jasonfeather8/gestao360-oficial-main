import { Coins, Plus } from 'lucide-react';

type CofreHeaderProps = {
  canCreate: boolean;
  onCreateClick: () => void;
};

export default function CofreHeader({ canCreate, onCreateClick }: CofreHeaderProps) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2 text-primary"><Coins className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Módulo 5</span></div>
        <h1 className="mt-1 text-2xl font-black text-on-background">Cofre Local</h1>
        <p className="mt-1 text-sm text-secondary">Saldo físico separado das contas bancárias, com aprovação e auditoria.</p>
      </div>
      {canCreate && <button type="button" onClick={onCreateClick} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-sm"><Plus className="h-4 w-4" /> Novo cofre</button>}
    </header>
  );
}
