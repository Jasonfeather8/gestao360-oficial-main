import { ShieldCheck } from 'lucide-react';
import type { AuditoriaLog } from '../../types';

type CofreRecentAuditProps = {
  auditoria: AuditoriaLog[];
  formatId: (value?: string | null) => string;
  formatDate: (value?: string | null) => string;
};

export default function CofreRecentAudit({ auditoria, formatId, formatDate }: CofreRecentAuditProps) {
  return (
    <section className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-black text-on-surface">Auditoria recente do cofre</h2></div><div className="space-y-2">{auditoria.length === 0 && <p className="text-sm text-secondary">Nenhum evento de cofre encontrado.</p>}{auditoria.map(log => <div key={log.id} className="rounded-md border border-surface-border/60 p-2 text-xs text-secondary"><p><span className="font-bold text-on-surface">{formatId(log.usuario_id)}</span> · <span className="font-bold text-on-surface">{log.acao}</span> · {log.tabela_afetada}</p><p className="mt-1">Origem: {log.origem_alteracao || '—'} · {formatDate(log.data_hora)}</p>{(log.justificativa || log.status_anterior || log.status_novo) && <p className="mt-1">{log.status_anterior || log.status_novo ? `Status: ${log.status_anterior || '—'} → ${log.status_novo || '—'}` : ''}{log.justificativa ? ` · Justificativa: ${log.justificativa}` : ''}</p>}</div>)}</div></section>
  );
}
