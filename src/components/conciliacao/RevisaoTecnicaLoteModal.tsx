import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, X } from 'lucide-react';
import { useRegistrarRevisaoTecnicaImportacao } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import type { ImportLotRecord, TechnicalImportReviewAction, TechnicalImportReviewDecision } from '../../types/extratoImportacao';

type Props = {
  lot: ImportLotRecord;
  onClose: () => void;
};

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : {};
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];
const numberValue = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const textValue = (value: unknown): string => typeof value === 'string' ? value : '';
const currency = (value: number | null) => value === null
  ? 'Não informado'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const jsonText = (value: unknown) => JSON.stringify(value ?? null, null, 2);

const actionLabels: Record<TechnicalImportReviewAction, string> = {
  marcar_duplicado: 'Marcar duplicado',
  marcar_cabecalho_rodape: 'Marcar cabeçalho/rodapé',
  excluir_composicao_financeira: 'Excluir da composição financeira',
  reprocessar_pagina: 'Solicitar reprocessamento da página',
  substituir_arquivo: 'Solicitar substituição do arquivo',
  registrar_pagina_ausente: 'Registrar página ausente',
  registrar_pagina_ilegivel: 'Registrar página ilegível',
};

export default function RevisaoTecnicaLoteModal({ lot, onClose }: Props) {
  const { role } = useAuth();
  const { registrarDecisaoTecnica, isRegistrandoDecisaoTecnica } = useRegistrarRevisaoTecnicaImportacao();
  const [selectedAction, setSelectedAction] = useState<TechnicalImportReviewDecision | null>(null);
  const [justification, setJustification] = useState('');
  const [manualPage, setManualPage] = useState('');
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [localDecisions, setLocalDecisions] = useState<TechnicalImportReviewDecision[]>([]);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const metadata = record(lot.metadata);
  const preview = record(metadata.preview);
  const parser = { ...record(preview.parserMetadata), ...record(metadata.parserMetadata) };
  const consistency = { ...record(preview.consistency), ...record(metadata.consistency) };
  const transactions = useMemo(() => {
    const candidates = records(preview.transactions);
    return candidates.length ? candidates : records(metadata.rawTransactions);
  }, [metadata.rawTransactions, preview.transactions]);
  const pendingReviews = records(metadata.pendingReviews ?? parser.pendingReviews ?? preview.pendingReviews);
  const decisions = [...records(record(metadata.technicalReview).decisions) as unknown as TechnicalImportReviewDecision[], ...localDecisions];
  const pages = numberValue(parser.pages ?? metadata.pages ?? preview.pages) ?? numberValue(lot.metadata && record(lot.metadata).paginas) ?? 0;
  const reportedCount = numberValue(metadata.reportedTransactionCount ?? parser.reportedTransactionCount ?? preview.reportedTransactionCount);
  const bank = textValue(metadata.bankIdentified ?? parser.bankIdentified ?? preview.bankIdentified) || 'Não identificado';
  const opening = numberValue(metadata.openingBalance ?? record(parser.balances).opening ?? preview.openingBalance);
  const closing = numberValue(metadata.closingBalance ?? record(parser.balances).closing ?? preview.closingBalance);
  const parserTotals = { ...record(preview.parserTotals), ...record(parser.totals), ...record(metadata.parserTotals) };
  const bankEntries = numberValue(parserTotals.entries ?? preview.totalEntries);
  const bankExits = numberValue(parserTotals.exits ?? preview.totalExits);
  const rawTransactions = records(metadata.rawTransactions).length ? records(metadata.rawTransactions) : transactions;
  const criticalErrors = [
    ...records(preview.consistency && record(preview.consistency).criticalErrors),
    ...records(consistency.criticalErrors),
    ...records(metadata.criticalErrors),
  ].filter((issue, index, issues) => issues.findIndex(candidate =>
    textValue(candidate.code) === textValue(issue.code)
      && textValue(candidate.message) === textValue(issue.message)
      && numberValue(candidate.transactionIndex) === numberValue(issue.transactionIndex)
  ) === index);

  const seenPages = useMemo(() => Array.from(new Set<number>(transactions
    .map(transaction => numberValue(transaction.pagina_origem))
    .filter((page): page is number => page !== null && page > 0))).sort((a, b) => a - b), [transactions]);
  const missingPages = pages > 0 ? Array.from({ length: pages }, (_, index) => index + 1).filter(page => !seenPages.includes(page)) : [];
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, number[]>();
    transactions.forEach((transaction, index) => {
      const signature = [textValue(transaction.data_transacao), numberValue(transaction.valor_centavos) ?? numberValue(transaction.valor) ?? '', textValue(transaction.descricao_banco).trim().toLocaleLowerCase(), textValue(transaction.numero_documento)].join('|');
      groups.set(signature, [...(groups.get(signature) || []), index]);
    });
    return Array.from(groups.values()).filter(indexes => indexes.length > 1);
  }, [transactions]);

  const isRemovedFromComposition = (transaction: RecordValue, index: number) => decisions.some(decision =>
    decision.acao === 'excluir_composicao_financeira'
      && (decision.transactionIndex === index || decision.hash_transacao === transaction.hash_transacao)
  );
  const compositionTransactions = transactions.filter((transaction, index) => !isRemovedFromComposition(transaction, index));
  const calculatedEntries = compositionTransactions.reduce((sum, transaction) => sum + (textValue(transaction.tipo_movimento) === 'credito' ? Math.abs(numberValue(transaction.valor) ?? 0) : 0), 0);
  const calculatedExits = compositionTransactions.reduce((sum, transaction) => sum + (textValue(transaction.tipo_movimento) === 'debito' ? Math.abs(numberValue(transaction.valor) ?? 0) : 0), 0);
  const calculatedClosing = opening === null ? null : opening + calculatedEntries - calculatedExits;
  const balanceDifference = calculatedClosing !== null && closing !== null ? Math.round((calculatedClosing - closing) * 100) : null;
  const hasCriticalErrors = criticalErrors.length > 0;
  const isBalanceDivergent = balanceDifference !== null && Math.abs(balanceDifference) > 1;
  const sourceRows = records(preview.sourceRows).length
    ? records(preview.sourceRows)
    : records(metadata.sourceRows).length
      ? records(metadata.sourceRows)
      : records(preview.firstRows);
  const excessCount = reportedCount === null ? null : Math.max(0, rawTransactions.length - reportedCount);
  const viewPageTransactions = viewPage === null ? [] : transactions.filter(transaction => numberValue(transaction.pagina_origem) === viewPage);
  const viewPageRows = viewPage === null ? [] : sourceRows.filter(row => numberValue(row.pagina ?? row.pagina_origem) === viewPage);

  if (role !== 'master' && role !== 'gerente') return null;

  const beginAction = (acao: TechnicalImportReviewAction, target: Pick<TechnicalImportReviewDecision, 'pagina' | 'transactionIndex' | 'hash_transacao'> = {}) => {
    setNotice(null);
    setSelectedAction({ acao, justificativa: '', ...target });
    setJustification('');
  };

  const submitDecision = async () => {
    if (!selectedAction || !justification.trim() || isRegistrandoDecisaoTecnica) return;
    const decision = { ...selectedAction, justificativa: justification.trim() };
    try {
      await registrarDecisaoTecnica({ lotId: lot.id, decision });
      setLocalDecisions(current => [...current, decision]);
      setNotice({ type: 'success', message: 'Decisão técnica registrada e auditada. Os dados brutos e normalizados foram preservados.' });
      setSelectedAction(null);
      setJustification('');
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível registrar a decisão técnica.' });
    }
  };

  const actionButton = (acao: TechnicalImportReviewAction, target?: Pick<TechnicalImportReviewDecision, 'pagina' | 'transactionIndex' | 'hash_transacao'>) => (
    <button type="button" onClick={() => beginAction(acao, target)} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-amber-900 hover:bg-amber-50">
      {actionLabels[acao]}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="technical-review-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 p-5 sm:p-6">
          <div>
            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-amber-700"><FileSearch className="h-4 w-4" /> Revisão técnica separada</p>
            <h2 id="technical-review-title" className="mt-2 text-lg font-black text-neutral-900">{lot.arquivo_nome || 'Lote de extrato'}</h2>
            <p className="mt-1 text-[10px] font-bold text-neutral-500">Metadata técnica do lote • Não é aprovação Master nem altera dados financeiros.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar revisão técnica" className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Banco identificado" value={bank} />
            <Summary label="Período do extrato" value={`${textValue(metadata.periodStart ?? preview.periodStart) || lot.data_inicio || '—'} a ${textValue(metadata.periodEnd ?? preview.periodEnd) || lot.data_fim || '—'}`} />
            <Summary label="Transações extraídas" value={`${transactions.length}${reportedCount !== null ? ` / ${reportedCount} informadas pelo banco` : ''}`} />
            <Summary label="Excedentes possíveis" value={excessCount === null ? 'Não informado' : String(excessCount)} />
          </div>

          <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-900">Dados informados pelo banco</h3>
            <div className="mt-3 grid gap-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Saldo inicial informado" value={currency(opening)} />
              <Summary label="Entradas informadas" value={currency(bankEntries)} />
              <Summary label="Saídas informadas" value={currency(bankExits)} />
              <Summary label="Saldo final informado" value={currency(closing)} />
              <Summary label="Quantidade de transações informada" value={reportedCount === null ? 'Não informado' : String(reportedCount)} />
              <Summary label="Total de páginas" value={pages ? String(pages) : 'Não informado'} />
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Diferenças calculadas</h3>
                <p className="mt-1 text-[10px] font-bold text-neutral-600">Fórmula do saldo: saldo inicial + entradas - saídas = saldo final</p>
              </div>
              <div className="text-right text-[10px] font-black text-neutral-800">
                {currency(opening)} + {currency(calculatedEntries)} - {currency(calculatedExits)} = {currency(calculatedClosing)}
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Summary label="Diferença de entradas vs. banco" value={bankEntries === null ? 'Não calculável' : currency(calculatedEntries - bankEntries)} />
              <Summary label="Diferença de saídas vs. banco" value={bankExits === null ? 'Não calculável' : currency(calculatedExits - bankExits)} />
              <Summary label="Diferença do saldo final" value={balanceDifference === null ? 'Não calculável' : currency(balanceDifference / 100)} />
            </div>
            <p className={`mt-3 rounded-xl px-3 py-2 text-[10px] font-black ${isBalanceDivergent || hasCriticalErrors ? 'bg-red-100 text-red-800' : balanceDifference === null ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
              {isBalanceDivergent ? `Divergência calculada: ${currency(balanceDifference! / 100)}.` : balanceDifference === null ? 'Fórmula incompleta: faltam saldos informados para concluir a comparação.' : 'Fórmula do saldo sem divergência acima de 1 centavo.'}
              {hasCriticalErrors ? ` ${criticalErrors.length} erro(s) crítico(s) permanecem.` : ''}
              {(isBalanceDivergent || hasCriticalErrors || balanceDifference === null) ? ' A confirmação permanece bloqueada enquanto a fórmula não fechar e/ou os erros críticos não forem resolvidos no fluxo de validação.' : ' A confirmação permanece bloqueada nesta revisão técnica; somente o fluxo de validação existente pode liberar o lote.'}
            </p>
            {criticalErrors.length > 0 && <ul className="mt-2 list-inside list-disc text-[10px] text-red-800">{criticalErrors.map((issue, index) => <li key={`${textValue(issue.code)}-${index}`}>{textValue(issue.message) || textValue(issue.code) || 'Erro crítico sem detalhe'}</li>)}</ul>}
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-neutral-100 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Páginas encontradas e ausentes</h3>
              <p className="mt-2 text-[10px] font-bold text-neutral-600">Encontradas: {seenPages.length ? seenPages.join(', ') : 'nenhuma identificada'} · Ausentes: {missingPages.length ? missingPages.join(', ') : pages ? 'nenhuma' : 'não calculável'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missingPages.map(page => <span key={page} className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-amber-50 p-2 text-[9px] font-bold text-amber-900">Página {page}<button type="button" onClick={() => setViewPage(page)} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-900 hover:bg-amber-50">Visualizar página</button>{actionButton('registrar_pagina_ausente', { pagina: page })}{actionButton('registrar_pagina_ilegivel', { pagina: page })}{actionButton('reprocessar_pagina', { pagina: page })}</span>)}
                {seenPages.map(page => <span key={page} className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-neutral-50 p-2 text-[9px] font-bold text-neutral-700">Página {page}<button type="button" onClick={() => setViewPage(page)} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-neutral-700 hover:bg-neutral-100">Visualizar página</button>{actionButton('reprocessar_pagina', { pagina: page })}{actionButton('registrar_pagina_ilegivel', { pagina: page })}</span>)}
              </div>
              {viewPage !== null && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-widest text-blue-900">Visualização técnica da página {viewPage}</p><button type="button" onClick={() => setViewPage(null)} className="text-[9px] font-black uppercase text-neutral-500">Fechar visualização</button></div>
                {viewPageTransactions.length > 0 ? <div className="mt-2 space-y-2">{viewPageTransactions.map((transaction, index) => <DataBlock key={`${textValue(transaction.hash_transacao)}-${index}`} title={`Registro ${index + 1} · Linha ${numberValue(transaction.linha_origem) ?? '—'}`} value={{ data_original: transaction.data_original, descricao_original: transaction.descricao_original, valor_original: transaction.valor_original, data_transacao: transaction.data_transacao, descricao_banco: transaction.descricao_banco, valor: transaction.valor, tipo_movimento: transaction.tipo_movimento }} />)}</div> : <p className="mt-2 text-[10px] font-bold text-neutral-600">Nenhum registro extraído vinculado a esta página.</p>}
                {viewPageRows.length > 0 && <div className="mt-3 space-y-2"><p className="text-[9px] font-black uppercase tracking-widest text-blue-900">Linhas brutas da página</p>{viewPageRows.map((row, index) => <pre key={index} className="whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-[9px] text-neutral-700">{jsonText(row)}</pre>)}</div>}
              </div>}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                <label htmlFor="technical-review-page" className="text-[9px] font-black uppercase tracking-wide text-neutral-500">Página não listada</label>
                <input id="technical-review-page" type="number" min="1" step="1" value={manualPage} onChange={event => setManualPage(event.target.value)} className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                {Number.isInteger(Number(manualPage)) && Number(manualPage) > 0 && <>
                  <button type="button" onClick={() => setViewPage(Number(manualPage))} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-neutral-700 hover:bg-neutral-100">Visualizar página</button>
                  {actionButton('registrar_pagina_ausente', { pagina: Number(manualPage) })}
                  {actionButton('registrar_pagina_ilegivel', { pagina: Number(manualPage) })}
                  {actionButton('reprocessar_pagina', { pagina: Number(manualPage) })}
                </>}
              </div>
            </section>
            <section className="rounded-2xl border border-neutral-100 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Excedentes e duplicidades possíveis</h3>
              <p className="mt-2 text-[10px] font-bold text-neutral-600">Registros excedentes em relação à quantidade declarada: {excessCount === null ? 'não calculável' : excessCount}.</p>
              <p className="mt-2 text-[10px] font-bold text-neutral-600">Grupos de possíveis duplicidades por data, valor, descrição e documento: {duplicateGroups.length + criticalErrors.filter(issue => textValue(issue.code).includes('duplicate')).length + pendingReviews.filter(item => Array.isArray(item.motivos) && item.motivos.some(reason => typeof reason === 'string' && /duplic/i.test(reason))).length}.</p>
              {duplicateGroups.map((indexes, groupIndex) => <p key={groupIndex} className="mt-2 text-[9px] text-amber-800">Registros {indexes.map(index => index + 1).join(', ')} possuem dados compatíveis.</p>)}
              {pendingReviews.length > 0 && <p className="mt-2 text-[9px] font-bold text-neutral-500">Pendências técnicas legadas: {pendingReviews.length}.</p>}
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-neutral-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Transações brutas e normalizadas</h3><p className="mt-1 text-[9px] text-neutral-500">Decisões apenas afetam a composição visual local; o bruto e os dados normalizados não são apagados nem sobrescritos.</p></div>
              {actionButton('substituir_arquivo')}
            </div>
            <div className="mt-3 space-y-3">
              {transactions.length === 0 && <p className="rounded-xl bg-neutral-50 p-3 text-[10px] font-bold text-neutral-500">Metadata antiga sem transações detalhadas; dados completos indisponíveis.</p>}
              {transactions.map((transaction, index) => {
                const hash = textValue(transaction.hash_transacao);
                const origin = `Página ${numberValue(transaction.pagina_origem) ?? '—'} · Linha ${numberValue(transaction.linha_origem) ?? '—'}`;
                const excluded = isRemovedFromComposition(transaction, index);
                return <article key={`${hash}-${index}`} className={`rounded-xl border p-3 ${excluded ? 'border-amber-200 bg-amber-50/40' : 'border-neutral-100 bg-neutral-50/60'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[9px] font-black uppercase text-neutral-700">Transação {index + 1} · {origin}{excluded ? ' · Fora da composição visual' : ''}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {actionButton('marcar_duplicado', { transactionIndex: index, hash_transacao: hash })}
                      {actionButton('marcar_cabecalho_rodape', { transactionIndex: index, hash_transacao: hash })}
                      {actionButton('excluir_composicao_financeira', { transactionIndex: index, hash_transacao: hash })}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <DataBlock title="Dados brutos/originais" value={{ data_original: transaction.data_original, descricao_original: transaction.descricao_original, valor_original: transaction.valor_original, valor_centavos: transaction.valor_centavos }} />
                    <DataBlock title="Dados extraídos/normalizados" value={{ data_transacao: transaction.data_transacao, descricao_banco: transaction.descricao_banco, valor: transaction.valor, tipo_movimento: transaction.tipo_movimento, numero_documento: transaction.numero_documento, hash_transacao: transaction.hash_transacao, pagina_origem: transaction.pagina_origem, linha_origem: transaction.linha_origem }} />
                  </div>
                  {transaction.motivo_alerta && <p className="mt-2 text-[9px] font-bold text-amber-800">Alerta: {textValue(transaction.motivo_alerta)}</p>}
                </article>;
              })}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-neutral-100 p-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Linhas de origem e dados brutos da extração</h3>
            {sourceRows.length ? <div className="mt-3 space-y-2">{sourceRows.map((row, index) => <div key={index} className="grid gap-1 rounded-lg bg-neutral-50 p-2 text-[9px] text-neutral-700 sm:grid-cols-2"><span className="font-black">Linha de origem {index + 1}</span><pre className="whitespace-pre-wrap break-words font-mono">{jsonText(row)}</pre></div>)}</div> : <p className="mt-2 text-[10px] font-bold text-neutral-500">Linhas de origem não foram preservadas nos metadados disponíveis.</p>}
            <details className="mt-3 rounded-xl bg-neutral-50 p-3"><summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-neutral-600">Metadata bruta preservada</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[9px] text-neutral-600">{jsonText(metadata.preview ?? metadata.rawTransactions ?? null)}</pre></details>
          </section>

          <section className="mt-4 rounded-2xl border border-neutral-100 p-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Decisões técnicas já registradas</h3>
            {decisions.length ? <ul className="mt-2 space-y-2">{decisions.map((decision, index) => <li key={`${decision.registrado_em ?? index}-${index}`} className="rounded-lg bg-neutral-50 p-2 text-[9px] text-neutral-700"><strong>{actionLabels[decision.acao] ?? decision.acao}</strong>{decision.pagina ? ` · Página ${decision.pagina}` : ''}{decision.transactionIndex !== undefined ? ` · Transação ${decision.transactionIndex + 1}` : ''} · {decision.justificativa}{decision.registrado_em ? ` · ${new Date(decision.registrado_em).toLocaleString('pt-BR')}` : ''}</li>)}</ul> : <p className="mt-2 text-[10px] text-neutral-500">Nenhuma decisão técnica registrada.</p>}
          </section>

          {selectedAction && <section className="sticky bottom-0 mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[10px] font-black uppercase tracking-widest text-amber-950">{actionLabels[selectedAction.acao]}{selectedAction.pagina ? ` · Página ${selectedAction.pagina}` : ''}{selectedAction.transactionIndex !== undefined ? ` · Transação ${selectedAction.transactionIndex + 1}` : ''}</h3><button type="button" onClick={() => setSelectedAction(null)} className="text-[9px] font-black uppercase text-neutral-500">Cancelar</button></div>
            <label className="mt-3 block text-[9px] font-black uppercase tracking-widest text-neutral-600">Justificativa obrigatória</label>
            <textarea value={justification} onChange={event => setJustification(event.target.value)} rows={3} maxLength={2000} required placeholder="Descreva o motivo e o encaminhamento técnico..." className="mt-1 w-full resize-y rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-800 outline-none focus:border-amber-400" />
            <p className="mt-1 text-[9px] text-neutral-500">Reprocessamento e substituição ficam somente como solicitação auditada; não inserem transações nem confirmam o lote.</p>
            <button type="button" onClick={submitDecision} disabled={!justification.trim() || isRegistrandoDecisaoTecnica} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50">
              {isRegistrandoDecisaoTecnica ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Registrar decisão técnica
            </button>
          </section>}
          {notice && <p className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-[10px] font-bold ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{notice.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}{notice.message}</p>}
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/80 p-2.5"><p className="text-[8px] font-black uppercase tracking-widest text-neutral-400">{label}</p><p className="mt-1 break-words text-[10px] font-bold text-neutral-800">{value}</p></div>;
}

function DataBlock({ title, value }: { title: string; value: unknown }) {
  return <div className="rounded-lg bg-white p-2"><p className="mb-1 text-[8px] font-black uppercase tracking-widest text-neutral-400">{title}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[9px] text-neutral-700">{jsonText(value)}</pre></div>;
}
