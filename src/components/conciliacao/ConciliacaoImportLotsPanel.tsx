import { AlertTriangle, CheckCircle2, Clock3, FileSearch, FileSpreadsheet, ShieldAlert, UserRound } from 'lucide-react';
import type { ContaBancaria } from '../../types';
import type { ImportLotRecord } from '../../types/extratoImportacao';

type ConciliacaoImportLotsPanelProps = {
  lots: ImportLotRecord[];
  contas: ContaBancaria[];
  selectedContaId: string;
  canReviewTechnical: boolean;
  onOpenTechnicalReview: (lot: ImportLotRecord) => void;
  onResumeValidation: (lot: ImportLotRecord) => void;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const asPositiveInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

const criticalErrorCount = (metadataValue: unknown, status: ImportLotRecord['status']) => {
  const metadata = asRecord(metadataValue);
  const consistency = asRecord(metadata?.consistency);
  const issueLists = [metadata?.criticalErrors, consistency?.criticalErrors]
    .filter(Array.isArray) as unknown[][];
  const issues = new Set<string>();
  issueLists.flat().forEach((issue, index) => {
    const record = asRecord(issue);
    if (record) {
      issues.add(`${String(record.code || '')}:${String(record.transactionIndex ?? '')}:${String(record.message || '')}`);
    } else {
      issues.add(`item:${index}:${String(issue)}`);
    }
  });
  const hasTechnicalError = ['technicalError', 'erro_tecnico', 'erroTecnico', 'error']
    .some(key => Boolean(metadata?.[key]));
  return Math.max(issues.size, hasTechnicalError || status === 'erro' ? 1 : 0);
};

const formatPeriod = (start: string | null, end: string | null) => {
  if (!start && !end) return 'Período não informado';
  const formatDate = (date: string) => date.split('-').reverse().join('/');
  if (start && end && start !== end) return `${formatDate(start)} a ${formatDate(end)}`;
  return formatDate(start || end || '');
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Data não informada'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
};

const statusDetails: Record<ImportLotRecord['status'], { label: string; classes: string; next: string }> = {
  em_validacao: { label: 'Em validação', classes: 'bg-blue-100 text-blue-800', next: 'Acompanhar a validação do lote' },
  em_revisao: { label: 'Em revisão', classes: 'bg-amber-100 text-amber-800', next: 'Abrir revisão técnica; confirmação segue bloqueada até validação' },
  erro: { label: 'Erro', classes: 'bg-red-100 text-red-800', next: 'Consultar o erro; nenhuma ação disponível nesta tela' },
  cancelado: { label: 'Cancelado', classes: 'bg-neutral-100 text-neutral-700', next: 'Nenhuma ação pendente para este lote' },
  confirmado: { label: 'Confirmado', classes: 'bg-emerald-100 text-emerald-800', next: 'Nenhuma ação pendente para este lote' },
};

export default function ConciliacaoImportLotsPanel({ lots, contas, selectedContaId, canReviewTechnical, onOpenTechnicalReview, onResumeValidation }: ConciliacaoImportLotsPanelProps) {
  const selectedAccountName = contas.find(account => account.id === selectedContaId)?.nome || 'Conta não identificada';

  return (
    <section className="rounded-3xl border-2 border-neutral-100 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-900">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Lotes de extrato
          </h2>
          <p className="mt-1 text-[9px] font-bold uppercase text-neutral-400">Todos os lotes da conta selecionada, independentemente da competência ou status</p>
        </div>
        <span className="rounded-lg bg-neutral-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-600">
          {lots.length} {lots.length === 1 ? 'lote' : 'lotes'}
        </span>
      </div>

      {lots.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-[10px] font-bold text-neutral-500">
          Nenhum lote encontrado para {selectedAccountName}.
        </p>
      ) : (
        <div className="space-y-3">
          {lots.map(lot => {
            const status = statusDetails[lot.status];
            const errors = criticalErrorCount(lot.metadata, lot.status);
            const metadata = asRecord(lot.metadata);
            const pendingReviews = lot.status === 'em_revisao' && Array.isArray(metadata?.pendingReviews)
              ? metadata.pendingReviews.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
              : [];
            const reviewReasons = lot.status === 'em_revisao' && Array.isArray(metadata?.reviewReasons)
              ? metadata.reviewReasons.filter((reason): reason is string => typeof reason === 'string' && Boolean(reason.trim()))
              : [];
            return (
              <article key={lot.id} className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-neutral-900">{lot.arquivo_nome || 'Arquivo sem nome'}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-neutral-500">{formatPeriod(lot.data_inicio, lot.data_fim)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest ${status.classes}`}>
                    {lot.status === 'erro' || lot.status === 'em_revisao'
                      ? <AlertTriangle className="h-3 w-3" />
                      : lot.status === 'confirmado'
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <Clock3 className="h-3 w-3" />}
                    {status.label}
                  </span>
                </div>

                <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Conta</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">{selectedAccountName}</dd>
                  </div>
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Quantidade extraída</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">{Number.isFinite(lot.total_transacoes) ? lot.total_transacoes : 'Não informada'}</dd>
                  </div>
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Processado em</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">{formatDateTime(lot.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Tentativa</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">#{lot.tentativa_numero || 1}{lot.lote_origem_id ? ` · origem ${lot.lote_origem_id}` : ''}</dd>
                  </div>
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Responsável pela importação</dt>
                    <dd className="mt-1 flex items-center gap-1 break-all text-[10px] font-bold text-neutral-700">
                      <UserRound className="h-3 w-3 shrink-0 text-neutral-400" /> ID {lot.importado_por || 'não informado'}
                    </dd>
                  </div>
                  {lot.reprocessado_por && <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Solicitado por reprocessamento</dt>
                    <dd className="mt-1 flex items-center gap-1 break-all text-[10px] font-bold text-neutral-700"><UserRound className="h-3 w-3 shrink-0 text-neutral-400" /> ID {lot.reprocessado_por}</dd>
                  </div>}
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Quantidade de erros</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">{errors}</dd>
                  </div>
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Última ação</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">
                      {lot.lastAction
                        ? `${lot.lastAction.action} · ${lot.lastAction.occurredAt ? formatDateTime(lot.lastAction.occurredAt) : 'data não informada'}`
                        : 'Sem registro de auditoria'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Próxima ação disponível</dt>
                    <dd className="mt-1 text-[10px] font-bold text-neutral-700">{status.next}</dd>
                  </div>
                </dl>

                {lot.status === 'em_validacao' && canReviewTechnical && (
                  <button type="button" onClick={() => onResumeValidation(lot)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-blue-800">
                    <Clock3 className="h-4 w-4" /> Retomar validação
                  </button>
                )}

                {lot.status === 'em_revisao' && (
                  <div className="mt-3 space-y-3">
                    <p className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-[10px] font-bold text-amber-900">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Pendências em revisão técnica; nenhuma ação desta seção aprova o lote ou altera dados financeiros.
                    </p>
                    {canReviewTechnical && (
                      <button type="button" onClick={() => onOpenTechnicalReview(lot)} className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-amber-800">
                        <FileSearch className="h-4 w-4" /> Abrir revisão técnica
                      </button>
                    )}
                    {reviewReasons.length > 0 && (
                      <div className="text-[9px] text-neutral-700">
                        <p className="mb-1 font-black uppercase tracking-widest">Motivos da revisão</p>
                        <ul className="list-inside list-disc space-y-1">{reviewReasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>
                      </div>
                    )}
                    {pendingReviews.map((pending, index) => {
                      const reasons = Array.isArray(pending.motivos)
                        ? pending.motivos.filter((reason): reason is string => typeof reason === 'string' && Boolean(reason.trim()))
                        : [];
                      const page = asPositiveInteger(pending.pagina_origem);
                      const line = asPositiveInteger(pending.linha_origem);
                      const snippet = asText(pending.trecho);
                      const description = asText(pending.descricao);
                      return (
                        <div key={index} className="rounded-xl border border-amber-100 bg-white p-3 text-[10px] text-neutral-700">
                          <div className="flex flex-wrap gap-x-3 gap-y-1 font-bold text-neutral-500">
                            {page !== null && <span>Página {page}</span>}
                            {line !== null && <span>Linha {line}</span>}
                            {description && <span>{description}</span>}
                          </div>
                          {snippet !== null && <p className="mt-2 whitespace-pre-wrap break-words font-mono text-neutral-800">{snippet}</p>}
                          {reasons.length > 0 && (
                            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800">
                              {reasons.map((reason, reasonIndex) => <li key={`${reason}-${reasonIndex}`}>{reason}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {pendingReviews.length === 0 && reviewReasons.length === 0 && (
                      <p className="text-[10px] font-bold text-neutral-500">Detalhes de pendência indisponíveis nos metadados deste lote.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
