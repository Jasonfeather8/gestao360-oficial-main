import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import type { ImportLotRecord } from '../../types/extratoImportacao';

type ConciliacaoImportLotsPanelProps = {
  lots: ImportLotRecord[];
  selectedMonth: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const asPositiveInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

const formatPeriod = (start: string | null, end: string | null) => {
  if (!start && !end) return 'Competência não informada';
  const formatDate = (date: string) => date.split('-').reverse().join('/');
  if (start && end && start !== end) return `${formatDate(start)} a ${formatDate(end)}`;
  return formatDate(start || end || '');
};

export default function ConciliacaoImportLotsPanel({ lots, selectedMonth }: ConciliacaoImportLotsPanelProps) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const visibleLots = lots.filter(lot =>
    lot.status === 'em_revisao'
    || (lot.status === 'confirmado'
      && Boolean(lot.data_inicio && lot.data_fim && lot.data_inicio <= monthEnd && lot.data_fim >= monthStart))
  );

  return (
    <section className="rounded-3xl border-2 border-neutral-100 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-900">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Lotes de extrato
          </h2>
          <p className="mt-1 text-[9px] font-bold uppercase text-neutral-400">Revisões da conta e lotes confirmados da competência selecionada</p>
        </div>
        <span className="rounded-lg bg-neutral-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-600">
          {visibleLots.length} lotes
        </span>
      </div>

      {visibleLots.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-[10px] font-bold text-neutral-500">Nenhum lote em revisão ou confirmado nesta competência.</p>
      ) : (
        <div className="space-y-3">
          {visibleLots.map(lot => {
            const metadata = asRecord(lot.metadata);
            const pendingReviews = Array.isArray(metadata?.pendingReviews)
              ? metadata.pendingReviews.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
              : [];
            const reviewReasons = Array.isArray(metadata?.reviewReasons)
              ? metadata.reviewReasons.filter((reason): reason is string => typeof reason === 'string' && Boolean(reason.trim()))
              : [];
            const isInReview = lot.status === 'em_revisao';

            return (
              <article key={lot.id} className={`rounded-2xl border p-4 ${isInReview ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-100 bg-emerald-50/40'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-neutral-900">{lot.arquivo_nome}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-neutral-500">{formatPeriod(lot.data_inicio, lot.data_fim)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest ${isInReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {isInReview ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {isInReview ? 'Em revisão' : 'Confirmado'}
                  </span>
                </div>

                {isInReview ? (
                  <div className="mt-3 space-y-3">
                    <p className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-[10px] font-bold text-amber-900">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> A conciliação aguarda a confirmação deste lote. Pendências em modo somente leitura.
                    </p>
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
                ) : (
                  <p className="mt-3 text-[10px] font-bold text-emerald-800">As transações deste lote já estão no painel Verdade Bancária.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
