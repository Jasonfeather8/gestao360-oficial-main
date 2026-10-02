import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Building,
  Calendar,
  Coins,
  FileSpreadsheet,
  Hash,
  Upload,
  X,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { ContaBancaria, TransacaoBanco } from '../../types';
import { ImportLotDraft, ImportMode, ImportPreview, ImportReviewDecisionItem } from '../../types/extratoImportacao';
import Button from '../Button';

type ColumnMapping = {
  data: string;
  valor: string;
  descricao: string;
  documento: string;
};

type ImportPreviewTab = 'entradas' | 'saidas' | 'pendencias';

const isValidReviewDate = (value?: string) => {
  const date = value?.trim() || '';
  const brDate = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = brDate ? `${brDate[3]}-${brDate[2].padStart(2, '0')}-${brDate[1].padStart(2, '0')}` : date;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized;
};

interface ImportarExtratoModalProps {
  contas: ContaBancaria[];
  selectedImportContaId: string;
  setSelectedImportContaId: React.Dispatch<React.SetStateAction<string>>;
  importLot: ImportLotDraft | null;
  importMode: ImportMode;
  setImportMode: React.Dispatch<React.SetStateAction<ImportMode>>;
  importPreview: ImportPreview | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  processFile: (file: File) => Promise<void>;
  valueFormatter: (value: number) => string;
  setImportPreviewTab: React.Dispatch<React.SetStateAction<ImportPreviewTab>>;
  importPreviewTab: ImportPreviewTab;
  fileOriginLabel: (origin: TransacaoBanco['origem_arquivo']) => string;
  columnMapping: ColumnMapping;
  setColumnMapping: React.Dispatch<React.SetStateAction<ColumnMapping>>;
  csvHeaders: string[];
  csvPreviewRows: Array<Record<string, string>>;
  importError: string;
  handleImportCancel: () => Promise<boolean>;
  onSubmitCriticalErrorsForReview: () => Promise<void>;
  handleImportCSVSubmit: (event: React.FormEvent) => Promise<void>;
  reviewDecisions: Record<number, ImportReviewDecisionItem>;
  onEditPendingJustification: (index: number) => void;
  onConfirmPendingReview: (index: number, justification: string) => void;
  onRequestPendingReprocessing: (index: number, justification: string) => Promise<void>;
  onSubmitImportReview: () => Promise<void>;
  isPreparingImport: boolean;
  isConfirmingImport: boolean;
  isSubmittingImportReview: boolean;
}

export default function ImportarExtratoModal({
  contas,
  selectedImportContaId,
  setSelectedImportContaId,
  importLot,
  importMode,
  setImportMode,
  importPreview,
  fileInputRef,
  processFile,
  valueFormatter,
  setImportPreviewTab,
  importPreviewTab,
  fileOriginLabel,
  columnMapping,
  setColumnMapping,
  csvHeaders,
  csvPreviewRows,
  importError,
  handleImportCancel,
  onSubmitCriticalErrorsForReview,
  handleImportCSVSubmit,
  reviewDecisions,
  onEditPendingJustification,
  onConfirmPendingReview,
  onRequestPendingReprocessing,
  onSubmitImportReview,
  isPreparingImport,
  isConfirmingImport,
  isSubmittingImportReview,
}: ImportarExtratoModalProps) {
  const [selectedPendingIndex, setSelectedPendingIndex] = useState(0);
  const [reviewJustifications, setReviewJustifications] = useState<Record<number, string>>({});
  const pendingReviews = importPreview?.pendingReviews || [];
  const selectedPending = pendingReviews[selectedPendingIndex];
  const hasCriticalErrors = Boolean(importPreview?.consistency.criticalErrors.some(issue => issue.code !== 'pending_review'));
  const allPendingApproved = pendingReviews.length > 0 && pendingReviews.every((pending, index) => {
    const decision = reviewDecisions[index];
    return decision?.categoria === 'conciliavel' && decision.decisao === 'aprovar' && Boolean(decision.justificativa.trim())
      && isValidReviewDate(pending.data_transacao || pending.data_original)
      && Number.isFinite(pending.valor)
      && Boolean(pending.tipo_movimento)
      && Boolean(pending.descricao?.trim() || pending.trecho.trim())
      && Number.isFinite(pending.confianca_extracao) && pending.confianca_extracao >= 0.85 && pending.confianca_extracao <= 1;
  });
  const isBusy = isPreparingImport || isConfirmingImport || isSubmittingImportReview;
  const requestImportCancel = () => {
    if (isBusy) return;
    if (importLot && !window.confirm('Cancelar este lote? O arquivo temporário será removido e o registro histórico do lote será mantido. Nenhuma transação bancária será apagada.')) return;
    void handleImportCancel();
  };
  const confirmReadingEnabled = Boolean(selectedPending
    && isValidReviewDate(selectedPending.data_transacao || selectedPending.data_original)
    && Number.isFinite(selectedPending.valor)
    && selectedPending.tipo_movimento
    && (selectedPending.descricao?.trim() || selectedPending.trecho.trim())
    && Number.isFinite(selectedPending.confianca_extracao)
    && selectedPending.confianca_extracao >= 0.85
    && selectedPending.confianca_extracao <= 1
    && reviewJustifications[selectedPendingIndex]?.trim());

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={requestImportCancel} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
      <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleImportCSVSubmit} className="bg-white w-full max-w-[600px] rounded-[40px] shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
        <input type="file" ref={fileInputRef} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void processFile(file); }} accept=".csv,.xlsx,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" />
        <header className="px-10 py-8 border-b bg-neutral-50/50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter">Motor de Importação</h2>
            <p className="text-[10px] text-primary uppercase font-black tracking-widest mt-1">Transforme arquivos brutos em inteligência financeira</p>
          </div>
          <button type="button" onClick={requestImportCancel} className="p-3 hover:bg-neutral-200 rounded-2xl transition-all">
            <X className="w-6 h-6 text-neutral-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-10 space-y-8 max-h-[70vh] scrollbar-thin">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Conta Destino</label>
              <div className="flex items-center gap-3 h-14 px-4 bg-neutral-100 border-2 border-neutral-100 rounded-2xl">
                <Building className="w-5 h-5 text-neutral-400" />
                <select value={selectedImportContaId} onChange={(e) => setSelectedImportContaId(e.target.value)} disabled={!!importLot} className="bg-transparent border-none text-xs font-bold uppercase outline-none cursor-pointer flex-1 disabled:opacity-60">
                  {contas.map(cnt => <option key={cnt.id} value={cnt.id}>{cnt.nome_banco || cnt.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Direcionador do lote (CSV/XLSX)</label>
              <p className="text-[9px] font-bold text-neutral-400 uppercase">Formato tabular; a direção será aplicada ao lote inteiro, sem edição por transação.</p>
              {importPreview?.fileType === 'pdf' ? (
                <div className="h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-100 px-4 flex items-center text-[9px] font-black uppercase tracking-widest text-emerald-700">
                  Classificação automática por evidência
                </div>
              ) : (
                <div className="flex bg-neutral-100 p-1 rounded-2xl h-14">
                  {(['ambos', 'entrada', 'saida'] as ImportMode[]).map(m => (
                    <button key={m} type="button" onClick={() => setImportMode(m)} className={`flex-1 rounded-xl text-[10px] font-black uppercase transition-all ${importMode === m ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}>{m}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!importPreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed rounded-[32px] p-16 text-center cursor-pointer bg-neutral-50 hover:bg-neutral-100 hover:border-primary/30 transition-all group"
            >
              <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Upload className="w-10 h-10 text-primary" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-neutral-800">Clique para selecionar o extrato</p>
              <p className="text-[10px] font-bold text-neutral-400 uppercase mt-2">PDF, CSV ou XLSX • limite de 20 MB</p>
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="p-5 bg-neutral-50 border-2 border-neutral-100 rounded-3xl space-y-3">
                <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase truncate">{importPreview.fileName}</span><span className="text-[10px] font-black uppercase text-primary">{importPreview.fileType.toUpperCase()}</span></div>
                <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-neutral-500 uppercase">
                  <span>Período: {importPreview.periodStart || 'não detectado'} — {importPreview.periodEnd || 'não detectado'}</span>
                  <span>{importPreview.pages ? `${importPreview.pages} página(s)` : `${importPreview.transactions.length} transações`}</span>
                  <span className="text-emerald-600">Entradas: {valueFormatter(importPreview.totalEntries)}</span>
                  <span className="text-red-500">Saídas: {valueFormatter(importPreview.totalExits)}</span>
                  <span>Saldo inicial: {importPreview.openingBalance === undefined ? 'não disponível' : valueFormatter(importPreview.openingBalance)}</span>
                  <span>Saldo final: {importPreview.closingBalance === undefined ? 'não disponível' : valueFormatter(importPreview.closingBalance)}</span>
                </div>
                {importPreview.bankIdentified && <p className="text-[10px] font-black text-primary uppercase">Banco identificado: {importPreview.bankIdentified}</p>}
                <div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase text-neutral-600">
                  <span>Registros extraídos: {importPreview.consistency.extractedCount}</span>
                  {importPreview.consistency.ocrCount > 0 && <span className="text-violet-700">Registros via OCR: {importPreview.consistency.ocrCount}</span>}
                </div>
                {importPreview.fileType === 'pdf' && <p className="text-[10px] font-black uppercase text-neutral-500">Origem: {importPreview.sourceOrigin === 'ocr' ? 'OCR backend-only • confiança reduzida' : 'texto e layout do PDF'} • o nome do arquivo não classifica o movimento.</p>}
                <p className="text-[10px] font-black uppercase text-neutral-500">Dados bancários extraídos somente para leitura; data, valor, descrição, direção e proveniência não são editáveis individualmente.</p>
                {importPreview.consistency.criticalErrors.length > 0 && (
                  <div className="border-2 border-red-200 bg-red-50 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-800">Confirmação bloqueada: {importPreview.consistency.criticalErrors.length} erro(s) crítico(s)</p>
                    {importPreview.consistency.criticalErrors.map(issue => <p key={`${issue.code}-${issue.transactionIndex ?? 'lote'}`} className="text-[9px] font-bold text-red-900 uppercase">{issue.message}</p>)}
                  </div>
                )}
                {importPreview.consistency.alerts.length > 0 && (
                  <div className="border-2 border-blue-200 bg-blue-50 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">Alertas de consistência</p>
                    {importPreview.consistency.alerts.map(issue => <p key={issue.code} className="text-[9px] font-bold text-blue-900 uppercase">{issue.message}</p>)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase text-neutral-500">
                  <span>Período informado: {importPreview.consistency.periodMatches === null ? 'não disponível' : importPreview.consistency.periodMatches ? 'consistente' : 'divergente'}</span>
                  <span>Continuidade: {importPreview.consistency.continuityMatches === null ? 'não aplicável' : importPreview.consistency.continuityMatches ? 'consistente' : 'divergente'}</span>
                  <span>Totais banco: {importPreview.consistency.totalsDifferenceCents ? `${importPreview.consistency.totalsDifferenceCents.entries ?? 0}¢ entradas / ${importPreview.consistency.totalsDifferenceCents.exits ?? 0}¢ saídas` : 'não informados'}</span>
                  <span>Saldo: {importPreview.consistency.balanceDifferenceCents === undefined ? 'não informado' : `${importPreview.consistency.balanceDifferenceCents}¢ de diferença`}</span>
                </div>
                {pendingReviews.length > 0 && (
                  <div className="border-2 border-amber-200 bg-amber-50 rounded-2xl p-4 flex items-center justify-between gap-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{pendingReviews.length} item(ns) pendente(s) de revisão — não serão importados nesta etapa</p>
                    <button type="button" onClick={() => { setImportPreviewTab('pendencias'); setSelectedPendingIndex(0); }} className="shrink-0 px-4 py-2 bg-white rounded-xl text-[9px] font-black uppercase text-amber-800">Revisar pendências</button>
                  </div>
                )}
                {importPreview.transactions.some(transaction => transaction.motivo_alerta) && (
                  <div className="border-2 border-blue-200 bg-blue-50 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">Avisos de extração — confira antes de confirmar</p>
                    {importPreview.transactions.filter(transaction => transaction.motivo_alerta).slice(0, 8).map((transaction, index) => (
                      <p key={`${transaction.pagina_origem}-${transaction.linha_origem}-${index}`} className="text-[9px] font-bold text-blue-900 uppercase">
                        Página {transaction.pagina_origem || '—'} • linha {transaction.linha_origem || '—'} • confiança {transaction.confianca_extracao === undefined ? '—' : `${Math.round(transaction.confianca_extracao * 100)}%`}: {transaction.motivo_alerta}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex bg-neutral-100 p-1 rounded-2xl">
                  {([
                    ['entradas', `Entradas (${importPreview.transactions.filter(transaction => transaction.tipo_movimento === 'credito').length})`],
                    ['saidas', `Saídas (${importPreview.transactions.filter(transaction => transaction.tipo_movimento === 'debito').length})`],
                    ['pendencias', `Pendências (${(importPreview.pendingReviews?.length || 0) + importPreview.consistency.criticalErrors.length})`],
                  ] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setImportPreviewTab(tab)} className={`flex-1 rounded-xl py-3 text-[9px] font-black uppercase transition-all ${importPreviewTab === tab ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}>{label}</button>)}
                </div>
                {importPreviewTab !== 'pendencias' ? (
                  <div className="border-2 border-neutral-100 rounded-3xl overflow-hidden divide-y divide-neutral-100">
                    {importPreview.transactions.filter(transaction => importPreviewTab === 'entradas' ? transaction.tipo_movimento === 'credito' : transaction.tipo_movimento === 'debito').map((transaction, index) => (
                      <div key={`${transaction.hash_transacao}-${index}`} className="p-4 space-y-3 text-[9px]">
                        <div className="flex justify-between gap-3 font-black uppercase text-neutral-500"><span>{transaction.data_transacao} • {valueFormatter(transaction.valor)}</span><span>Página {transaction.pagina_origem || '—'} • linha {transaction.linha_origem || '—'}</span></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div><p className="font-black uppercase text-neutral-400">Bruto extraído</p><p className="font-bold text-neutral-700 break-words">{transaction.data_original || '—'} • {transaction.descricao_original || '—'} • {transaction.valor_original === undefined ? '—' : valueFormatter(transaction.valor_original)}</p></div>
                          <div><p className="font-black uppercase text-neutral-400">Normalizado</p><p className="font-bold text-neutral-700 break-words">{transaction.data_transacao} • {transaction.descricao_banco} • {valueFormatter(transaction.valor)} • {transaction.tipo_movimento}</p></div>
                          <div><p className="font-black uppercase text-neutral-400">Origem no arquivo</p><p className="font-bold text-neutral-700">Página {transaction.pagina_origem || '—'} • linha {transaction.linha_origem || '—'} • {fileOriginLabel(transaction.origem_arquivo ? transaction.origem_arquivo : transaction.origem_extracao === 'ocr' ? 'pdf_ocr' : transaction.origem_extracao === 'texto' ? 'pdf_texto' : null)}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingReviews.length > 0 && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {pendingReviews.map((pending, index) => {
                            const decision = reviewDecisions[index];
                            return <button key={`${pending.pagina_origem}-${pending.linha_origem}-${index}`} type="button" onClick={() => setSelectedPendingIndex(index)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase ${selectedPendingIndex === index ? 'bg-primary text-white' : decision?.categoria === 'conciliavel' ? 'bg-emerald-100 text-emerald-800' : decision?.categoria === 'revisao_tecnica' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>Item {index + 1} • pág. {pending.pagina_origem || '—'} • linha {pending.linha_origem || '—'}</button>;
                          })}
                        </div>
                        {selectedPending && (
                          <div className="border-2 border-amber-200 bg-amber-50 rounded-3xl p-5 space-y-4">
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-900">Pendência {selectedPendingIndex + 1} de {pendingReviews.length}</h4>
                              <p className="mt-2 text-[10px] font-bold text-amber-900">Motivos: {selectedPending.motivos.join('; ')}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[10px]">
                              <div><p className="font-black uppercase text-neutral-500">Página original</p><p className="font-bold text-neutral-900">{selectedPending.pagina_origem || '—'}</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Linha original</p><p className="font-bold text-neutral-900">{selectedPending.linha_origem || '—'}</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Data extraída</p><p className="font-bold text-neutral-900">{selectedPending.data_transacao || selectedPending.data_original || 'Ausente'}</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Valor extraído</p><p className="font-bold text-neutral-900">{typeof selectedPending.valor === 'number' ? valueFormatter(selectedPending.valor) : 'Ausente'}</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Tipo de movimento</p><p className="font-bold text-neutral-900">{selectedPending.tipo_movimento || 'Ausente'}</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Descrição extraída</p><p className="font-bold text-neutral-900 break-words">{selectedPending.descricao || 'Ausente'}</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Confiança da extração</p><p className="font-bold text-neutral-900">{Number.isFinite(selectedPending.confianca_extracao) ? `${Math.round(selectedPending.confianca_extracao * 100)}%` : 'Ausente'} • mínimo 85%</p></div>
                              <div><p className="font-black uppercase text-neutral-500">Origem da extração</p><p className="font-bold text-neutral-900">{selectedPending.origem_extracao}</p></div>
                            </div>
                            <div className="rounded-2xl border border-amber-300 bg-white p-4">
                              <p className="text-[9px] font-black uppercase text-neutral-500">Trecho original completo</p>
                              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-neutral-900">{selectedPending.trecho || 'Trecho ausente'}</p>
                            </div>
                            <label className="block space-y-2">
                              <span className="text-[9px] font-black uppercase text-neutral-600">Justificativa obrigatória</span>
                              <textarea value={reviewJustifications[selectedPendingIndex] || ''} onChange={event => { onEditPendingJustification(selectedPendingIndex); setReviewJustifications(current => ({ ...current, [selectedPendingIndex]: event.target.value })); }} rows={3} className="w-full rounded-2xl border-2 border-neutral-200 bg-white p-3 text-xs outline-none focus:border-primary" placeholder="Explique a decisão de revisão..." />
                            </label>
                            {reviewDecisions[selectedPendingIndex] && <p className={`text-[9px] font-black uppercase ${reviewDecisions[selectedPendingIndex].categoria === 'conciliavel' ? 'text-emerald-700' : 'text-red-700'}`}>{reviewDecisions[selectedPendingIndex].categoria === 'conciliavel' ? 'Leitura confirmada como conciliável' : 'Reprocessamento solicitado; envio bloqueado'}</p>}
                            <div className="flex flex-wrap gap-3">
                              <button type="button" disabled={!confirmReadingEnabled || isBusy} onClick={() => onConfirmPendingReview(selectedPendingIndex, reviewJustifications[selectedPendingIndex] || '')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-[9px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />Confirmar leitura</button>
                              <button type="button" disabled={!reviewJustifications[selectedPendingIndex]?.trim() || isBusy} onClick={() => { void onRequestPendingReprocessing(selectedPendingIndex, reviewJustifications[selectedPendingIndex] || ''); }} className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-[9px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-4 w-4" />Solicitar reprocessamento</button>
                            </div>
                            {hasCriticalErrors && <p className="text-[9px] font-bold text-red-700">O envio para conciliação fica bloqueado até resolver os erros críticos do lote.</p>}
                          </div>
                        )}
                      </>
                    )}
                    {importPreview.consistency.criticalErrors.filter(issue => issue.code !== 'pending_review').map(issue => <p key={`${issue.code}-${issue.transactionIndex ?? 'lote'}`} className="rounded-xl bg-red-50 p-3 text-[9px] font-bold text-red-900">{issue.message}</p>)}
                    {!pendingReviews.length && !hasCriticalErrors && <p className="text-[9px] font-black text-emerald-700 uppercase">Nenhuma pendência de revisão.</p>}
                  </div>
                )}
              </div>
              {(importPreview.fileType === 'csv' || importPreview.fileType === 'xlsx') && <div className="space-y-4">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b pb-2">Mapeamento de Colunas</h4>
                <div className="grid grid-cols-1 gap-3">
                  {[{f:'data',l:'Data Transação',i:Calendar},{f:'valor',l:'Valor (R$)',i:Coins},{f:'descricao',l:'Descrição Banco',i:FileSpreadsheet},{f:'documento',l:'NSU / Documento',i:Hash}].map(it => (
                    <div key={it.f} className="flex items-center gap-6 bg-neutral-50 p-3 rounded-2xl border border-neutral-100">
                      <div className="w-36 shrink-0 flex items-center gap-3 text-[10px] font-black text-neutral-500 uppercase">
                        <it.i className="w-4 h-4" /> {it.l}
                      </div>
                      <select 
                        value={columnMapping[it.f as keyof typeof columnMapping]} 
                        onChange={(e) => setColumnMapping(p => ({...p,[it.f]:e.target.value}))} 
                        className="flex-1 h-11 bg-white border-2 border-neutral-100 rounded-xl px-4 text-xs font-black uppercase outline-none focus:border-primary transition-all"
                      >
                        <option value="">Ignorar Coluna</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>}

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b pb-2">Pré-visualização (Primeiras 5 linhas)</h4>
                <div className="border-2 border-neutral-100 rounded-3xl overflow-hidden bg-white">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 font-black uppercase">
                      <tr>
                        {(importPreview.fileType === 'csv' || importPreview.fileType === 'xlsx') ? Object.values(columnMapping).filter(v=>v).map(h=><th key={h} className="p-4">{h}</th>) : <><th className="p-4">Data</th><th className="p-4">Descrição</th><th className="p-4">Valor</th></>}
                      </tr>
                    </thead>
                    <tbody className="font-bold text-neutral-700">
                      {csvPreviewRows.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-50 last:border-none">
                          {(importPreview.fileType === 'csv' || importPreview.fileType === 'xlsx') ? Object.values(columnMapping).filter((value): value is string => Boolean(value)).map(h=><td key={h} className="p-4">{row[h]}</td>) : <><td className="p-4">{row.data}</td><td className="p-4">{row['descrição']}</td><td className="p-4">{row.valor}</td></>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="px-8 py-6 border-t bg-neutral-50/50 flex flex-wrap justify-end items-center gap-3 shrink-0">
          {(importError || (pendingReviews.length > 0 && !allPendingApproved && !hasCriticalErrors)) && <p className="mr-auto w-full text-[10px] font-black text-red-600 uppercase">{importError || (reviewDecisions && Object.values(reviewDecisions).some(decision => decision.categoria === 'revisao_tecnica') ? 'Envio bloqueado: há solicitação de reprocessamento; todas as pendências devem ser confirmadas como conciliáveis.' : 'Envio bloqueado: revise individualmente e confirme todas as pendências válidas com justificativa.')}</p>}
          {hasCriticalErrors ? (
            <>
              <Button type="button" disabled={isBusy} onClick={() => void onSubmitCriticalErrorsForReview()}>
                {isSubmittingImportReview ? 'Enviando...' : 'Enviar para revisão técnica'}
              </Button>
              <button type="button" disabled={isBusy} onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-3 text-[9px] font-black uppercase text-amber-900 disabled:opacity-40"><RotateCcw className="h-4 w-4" />Reprocessar/substituir arquivo</button>
              <button type="button" disabled={isBusy} onClick={requestImportCancel} className="px-4 py-3 text-[9px] font-black uppercase text-neutral-500 tracking-widest hover:text-neutral-900 transition-colors disabled:opacity-40">Cancelar lote</button>
            </>
          ) : (
            <>
              {pendingReviews.length > 0 ? (
                <>
                  <button type="button" disabled={isBusy} onClick={() => { setImportPreviewTab('pendencias'); setSelectedPendingIndex(0); }} className="rounded-xl bg-amber-100 px-4 py-3 text-[9px] font-black uppercase text-amber-900 disabled:opacity-40">Revisar pendências</button>
                  <Button type="button" disabled={!allPendingApproved || isBusy} onClick={() => void onSubmitImportReview()}>
                    {isSubmittingImportReview ? 'Enviando...' : 'Enviar para conciliação'}
                  </Button>
                </>
              ) : (
                <Button type="submit" disabled={!importPreview || isBusy || Boolean(importPreview?.consistency.criticalErrors.length) || ((importPreview?.fileType === 'csv' || importPreview?.fileType === 'xlsx') && (!columnMapping.data || !columnMapping.valor || !columnMapping.descricao))}>
                  {isPreparingImport || isConfirmingImport ? 'Processando...' : 'Confirmar importação'}
                </Button>
              )}
              <button type="button" disabled={isBusy} onClick={requestImportCancel} className="px-4 py-3 text-[9px] font-black uppercase text-neutral-500 tracking-widest hover:text-neutral-900 transition-colors disabled:opacity-40">Cancelar lote</button>
            </>
          )}
        </footer>
      </motion.form>
    </div>
  );
}
