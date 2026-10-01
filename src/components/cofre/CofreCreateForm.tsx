import type { FormEventHandler, Dispatch, SetStateAction } from 'react';

type CofreCreateFormProps = {
  onSubmit: FormEventHandler<HTMLFormElement>;
  cofreNome: string;
  setCofreNome: Dispatch<SetStateAction<string>>;
  saldoInicial: string;
  setSaldoInicial: Dispatch<SetStateAction<string>>;
  isMutating: boolean;
};

export default function CofreCreateForm({ onSubmit, cofreNome, setCofreNome, saldoInicial, setSaldoInicial, isMutating }: CofreCreateFormProps) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-[1fr_180px_auto]"><input required value={cofreNome} onChange={event => setCofreNome(event.target.value)} placeholder="Nome do cofre" className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary" /><input required value={saldoInicial} onChange={event => setSaldoInicial(event.target.value)} placeholder="Saldo inicial" inputMode="decimal" className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary" /><button disabled={isMutating} className="rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Cadastrar</button></form>
  );
}
