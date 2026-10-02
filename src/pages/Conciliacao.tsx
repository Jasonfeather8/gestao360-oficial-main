import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  Link2,
  Unlink,
  Search,
  HelpCircle,
  AlertTriangle,
  ChevronRight,
  X,
  Plus,
  Coins,
  Building,
  Calendar,
  Hash,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  CheckCircle2,
  Trash2,
  Zap,
  Info,
  Clock,
  Filter,
  ShieldCheck
} from 'lucide-react';
import { useConciliacao, useConciliacaoImportLots, useContas, useLancamentos, useEntidades, useTransferencias } from '../hooks/useData';
import ConciliacaoHeader from '../components/conciliacao/ConciliacaoHeader';
import ConciliacaoCompetenceSummary from '../components/conciliacao/ConciliacaoCompetenceSummary';
import ConciliacaoImportLotsPanel from '../components/conciliacao/ConciliacaoImportLotsPanel';
import ConciliacaoClosingPanel from '../components/conciliacao/ConciliacaoClosingPanel';
import ConciliacaoPendingTransfers from '../components/conciliacao/ConciliacaoPendingTransfers';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { LancamentoFinanceiro, TransacaoBanco, TransferenciaBancaria, TransferenciaDestinoSugestao } from '../types';
import { ImportConfirmationMetadata, ImportLotDraft, ImportMode, ImportPreview, ImportReviewDecisionItem, ImportReviewSubmissionMetadata } from '../types/extratoImportacao';
import { attachImportLotMetadata, buildCsvTransactions, parseCsv, validateImportConsistency } from '../services/conciliacoesService';
import Button from '../components/Button';
import ImportarExtratoModal from '../components/conciliacao/ImportarExtratoModal';
import MarcarTransferenciaModal from '../components/MarcarTransferenciaModal';
import TransferenciaBancariaModal from '../components/TransferenciaBancariaModal';
import { calculateFinalAmount } from '../utils/adjustments';
import { diagnosticLogger } from '../services/diagnosticLogger';

const IMPORT_LOG_SCOPE = 'Conciliacao][Importacao';

const getTransactionCents = (transaction: TransacaoBanco): number =>
  Number.isInteger(transaction.valor_centavos) ? transaction.valor_centavos as number : Math.round(transaction.valor * 100);

const getLancamentoAdjustedCents = (lancamento: LancamentoFinanceiro): number => {
  const adjustedCents = Math.round(calculateFinalAmount({
    original: lancamento.valor_previsto,
    discount: lancamento.desconto_valor,
    discountType: lancamento.desconto_tipo,
    increase: lancamento.acrescimo_valor,
    increaseType: lancamento.acrescimo_tipo,
  }) * 100);
  return lancamento.tipo === 'saida' ? -adjustedCents : adjustedCents;
};

const isValidReviewDate = (value?: string) => {
  const date = value?.trim() || '';
  const brDate = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = brDate ? `${brDate[3]}-${brDate[2].padStart(2, '0')}-${brDate[1].padStart(2, '0')}` : date;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized;
};

export default function Conciliacao() {
  const navigate = useNavigate();
  const {
    conciliacoes = [],
    transacoes = [],
    diferencas = [],
    fechamentos = [],
    prepareImport,
    confirmImport,
    submitImportForReview,
    fecharPeriodo,
    decidirFechamento,
    cancelImport,
    isPreparingImport,
    isConfirmingImport,
    isSubmittingImportReview,
    isFechandoPeriodo,
    isDecidindoFechamento,
    workspaceDataUpdatedAt,
    linkConciliacao,
    unlinkConciliacao,
    cleanupTransacoes,
    isLinking,
    isCleaning
  } = useConciliacao();

  const { role, user } = useAuth();
  const [selectedContaId, setSelectedContaId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const { data: contas = [] } = useContas();
  const { data: lancamentos = [], dataUpdatedAt: lancamentosDataUpdatedAt } = useLancamentos({
    conciliationWorkspace: {
      accountId: selectedContaId,
      periodStart: `${selectedMonth}-01`,
      periodEnd: `${selectedMonth}-${String(new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}`,
    },
  });
  const { data: entidades = [] } = useEntidades();
  const { data: importLots = [] } = useConciliacaoImportLots(selectedContaId);

  const {
    isImportarCSVOpen, isTransferenciaBancariaOpen, setModalOpen, selectedTransacaoForConciliationId,
    isVincularConciliarOpen, isClassificarDiferencaOpen,
    setSelectedTransacaoForConciliationId,
    setTransacaoBancoParaLancamento,
    setCurrentConciliationDifferenceValue,
    currentConciliationDifferenceValue,
    conciliacaoOperacaoSucesso,
    sinalizarConciliacaoOperacao,
    limparConciliacaoOperacaoSucesso
  } = useUIStore();

  const [selectedLancamentoIds, setSelectedLancamentoIds] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [reviewFilter, setReviewFilter] = useState<'todos' | 'pendencias'>('todos');
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [completionCandidate, setCompletionCandidate] = useState<{ id: number; requestedAt: number; contaId: string; mes: string } | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const {
    transferencias,
    suggestions: transferSuggestions,
    isLoadingSuggestions: isLoadingTransferSuggestions,
    reconcileTransferencia,
    isReconciling: isReconcilingTransferencia,
    identifyTransactionTransferencia,
    isIdentifyingTransactionTransferencia,
    transferenciasPendentesMaster,
    decideTransferencia,
    isDecidingTransferencia,
  } = useTransferencias(selectedTransacaoForConciliationId);
  const [isMarcarTransferenciaOpen, setIsMarcarTransferenciaOpen] = useState(false);

  // Import states
  const [csvContentText, setCsvContentText] = useState('');
  const [importLot, setImportLot] = useState<ImportLotDraft | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [selectedImportContaId, setSelectedImportContaId] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('ambos');
  const [columnMapping, setColumnMapping] = useState({ data: '', valor: '', descricao: '', documento: '' });
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [importPreviewTab, setImportPreviewTab] = useState<'entradas' | 'saidas' | 'pendencias'>('entradas');
  const [importReviewDecisions, setImportReviewDecisions] = useState<Record<number, ImportReviewDecisionItem>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTraceIdRef = useRef<string | null>(null);

  // Difference states
  const [diffType, setDiffType] = useState<'juros' | 'multa' | 'desconto' | 'tarifa' | 'pagamento_parcial' | 'ajuste_manual'>('tarifa');
  const [diffJustification, setDiffJustification] = useState('');

  useEffect(() => {
    if (contas.length > 0 && !selectedContaId) {
      setSelectedContaId(contas[0].id);
      setSelectedImportContaId(contas[0].id);
    }
  }, [contas, selectedContaId]);

  const valueFormatter = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const normalizedTransacoes = useMemo(() => transacoes.filter(transaction =>
    /^\d{4}-\d{2}-\d{2}$/.test(transaction.data_transacao)
      && Number.isFinite(transaction.valor)
  ), [transacoes]);
  const hasReviewAlert = (transaction: TransacaoBanco) => Boolean(transaction.motivo_alerta?.trim()) || (transaction.confianca_extracao !== null && transaction.confianca_extracao !== undefined && transaction.confianca_extracao < 0.9);
  const fileOriginLabel = (origin: TransacaoBanco['origem_arquivo']) => ({
    pdf_texto: 'PDF textual',
    pdf_ocr: 'PDF OCR',
    csv: 'CSV',
    xlsx: 'XLSX',
  }[origin || ''] || 'Origem anterior');

  const periodoAtual = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return {
      inicio: `${selectedMonth}-01`,
      fim: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    };
  }, [selectedMonth]);

  const fechamentoAtual = useMemo(
    () => fechamentos.find(fechamento =>
      fechamento.conta_bancaria_id === selectedContaId &&
      fechamento.periodo_inicio === periodoAtual.inicio &&
      fechamento.periodo_fim === periodoAtual.fim
    ) || null,
    [fechamentos, periodoAtual, selectedContaId]
  );

  const fechamentosAguardandoMaster = useMemo(
    () => fechamentos.filter(fechamento => fechamento.status === 'aguardando_master'),
    [fechamentos]
  );

  const fechamentoBusy = isFechandoPeriodo || isDecidindoFechamento;

  const handleFecharPeriodo = async () => {
    if (!selectedContaId || !selectedMonth || fechamentoBusy) return;
    if (!confirm(`Solicitar o fechamento da competência ${selectedMonth}? O servidor validará todas as pendências antes de enviar para o Master.`)) return;
    try {
      await fecharPeriodo({ contaId: selectedContaId, periodoInicio: periodoAtual.inicio, periodoFim: periodoAtual.fim });
      alert('Fechamento solicitado com sucesso. A competência está aguardando o Master.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível solicitar o fechamento.');
    }
  };

  const handleDecidirFechamento = async (fechamentoId: string, aprovado: boolean) => {
    if (fechamentoBusy) return;
    if (aprovado && !confirm('Aprovar este fechamento? A decisão do Master confirmará os lançamentos vinculados.')) return;
    const justificativa = aprovado ? null : prompt('Informe a justificativa da reprovação:');
    if (!aprovado && justificativa === null) return;
    try {
      await decidirFechamento({ fechamentoId, aprovado, justificativa: justificativa?.trim() || null });
      alert(aprovado ? 'Fechamento aprovado com sucesso.' : 'Fechamento reprovado e devolvido ao fluxo operacional.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível decidir o fechamento.');
    }
  };

  const handleCleanup = async () => {
    if (!selectedContaId) return;
    if (confirm('Deseja remover todas as transações importadas desta conta que ainda não foram conciliadas? Esta ação é útil para corrigir erros de importação.')) {
      try {
        await cleanupTransacoes(selectedContaId);
        alert('Transações pendentes removidas com sucesso.');
      } catch (err) { alert('Erro ao limpar dados.'); }
    }
  };

  const processFile = async (file: File) => {
    const traceId = crypto.randomUUID();
    importTraceIdRef.current = traceId;
    const startedAt = Date.now();
    let currentStage = 'início da seleção';
    diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: início da seleção e processamento do arquivo`, {
      nomeArquivo: file.name,
      tipoArquivo: file.type,
      tamanhoBytes: file.size,
      contaId: selectedImportContaId,
      modo: importMode,
    });
    setImportError('');
    if (importLot) {
      currentStage = 'limpeza do lote anterior';
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: iniciando cancelamento do lote anterior`, { contaId: importLot.contaBancariaId });
      if (!(await handleImportCancel())) {
        diagnosticLogger.warn(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: processamento bloqueado ao cancelar o lote anterior`, { etapa: currentStage, duracaoMs: Date.now() - startedAt });
        return;
      }
      importTraceIdRef.current = traceId;
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: lote anterior cancelado e estado limpo`, { etapa: currentStage, resultado: 'sucesso', duracaoMs: Date.now() - startedAt });
    }
    try {
      currentStage = 'validação da sessão';
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: validação da sessão iniciada`);
      if (!user?.id) throw new Error('Sessão expirada. Entre novamente para importar o extrato.');
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: validação da sessão concluída`, { resultado: 'válida' });

      currentStage = 'preparação do arquivo';
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: prepareImport iniciado`, { tipoArquivo: file.type, tamanhoBytes: file.size, contaId: selectedImportContaId });
      const result = await prepareImport({ file, contaBancariaId: selectedImportContaId, userId: user.id });
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: prepareImport concluído`, {
        resultado: 'sucesso',
        tipoPreview: result.preview.fileType,
        paginas: result.preview.pages,
        periodoInicio: result.preview.periodStart,
        periodoFim: result.preview.periodEnd,
        transacoes: result.preview.transactions.length,
        entradas: result.preview.totalEntries,
        saidas: result.preview.totalExits,
        headers: result.preview.sourceHeaders?.length || 0,
        linhasPreview: result.preview.firstRows.length,
        pendencias: result.preview.pendingReviews?.length || 0,
        alertas: result.preview.parserMetadata?.alerts?.length || 0,
      });
      setImportLot(result.lot);
      setImportPreview(result.preview);
      if (result.preview.fileType === 'csv') {
        currentStage = 'leitura do texto CSV';
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: leitura do texto CSV iniciada`);
        const csvText = await file.text();
        setCsvContentText(csvText);
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: leitura do texto CSV concluída`, { resultado: 'sucesso', linhas: csvText.split(/\r?\n/).length });
      } else {
        setCsvContentText('');
      }

      currentStage = 'resolução de headers e montagem do preview';
      const headers = result.preview.sourceHeaders || Object.keys(result.preview.firstRows[0] || {});
      setCsvHeaders(headers);
      setCsvPreviewRows(result.preview.firstRows);
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: headers resolvidos e preview montado`, { headers: headers.length, linhasPreview: result.preview.firstRows.length, tipoPreview: result.preview.fileType });
      if (result.preview.fileType === 'csv' || result.preview.fileType === 'xlsx') {
        setColumnMapping({
          data: headers.find(header => /dat/i.test(header)) || '',
          valor: headers.find(header => /val/i.test(header)) || '',
          descricao: headers.find(header => /desc/i.test(header)) || '',
          documento: headers.find(header => /doc/i.test(header)) || '',
        });
      }
    } catch (error) {
      diagnosticLogger.error(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: falha na etapa ${currentStage}`, { etapa: currentStage, duracaoMs: Date.now() - startedAt, erro: error });
      setImportError(error instanceof Error ? error.message : 'Não foi possível preparar o arquivo.');
    }
  };

  const handleImportCancel = async (): Promise<boolean> => {
    const traceId = importTraceIdRef.current || crypto.randomUUID();
    importTraceIdRef.current = traceId;
    const startedAt = Date.now();
    let currentStage = 'cancelamento do lote';
    if (isPreparingImport || isConfirmingImport || isSubmittingImportReview) {
      diagnosticLogger.warn(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: cancelamento bloqueado por operação em andamento`, { etapa: currentStage, preparando: isPreparingImport, confirmando: isConfirmingImport, enviandoRevisao: isSubmittingImportReview });
      return false;
    }
    if (importLot) {
      try {
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: cancelamento do lote iniciado`, { contaId: importLot.contaBancariaId });
        await cancelImport(importLot);
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: cancelamento do lote concluído`, { resultado: 'sucesso', duracaoMs: Date.now() - startedAt });
      } catch (error) {
        diagnosticLogger.error(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: falha na etapa ${currentStage}`, { etapa: currentStage, duracaoMs: Date.now() - startedAt, erro: error });
        setImportError('Não foi possível remover o arquivo temporário. Tente cancelar novamente.');
        return false;
      }
    } else {
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: nenhum lote anterior para cancelar`);
    }
    resetImportState();
    setModalOpen('isImportarCSVOpen', false);
    diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: cancelamento e fechamento concluídos`, { resultado: 'sucesso', duracaoMs: Date.now() - startedAt });
    return true;
  };

  const resetImportState = () => {
    const traceId = importTraceIdRef.current || crypto.randomUUID();
    setCsvContentText('');
    setImportLot(null);
    setImportPreview(null);
    setImportError('');
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    setImportPreviewTab('entradas');
    setImportReviewDecisions({});
    setColumnMapping({ data: '', valor: '', descricao: '', documento: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
    diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: estado de importação limpo`, { resultado: 'sucesso' });
  };

  const handleEditPendingJustification = (index: number) => {
    setImportReviewDecisions(current => {
      if (!current[index]) return current;
      const updated = { ...current };
      delete updated[index];
      return updated;
    });
    setImportError('');
  };

  const handleConfirmPendingReview = (index: number, justification: string) => {
    const pending = importPreview?.pendingReviews?.[index];
    if (!pending || !isValidReviewDate(pending.data_transacao || pending.data_original) || !Number.isFinite(pending.valor) || !pending.tipo_movimento || !(pending.descricao?.trim() || pending.trecho.trim()) || !Number.isFinite(pending.confianca_extracao) || pending.confianca_extracao < 0.85 || pending.confianca_extracao > 1 || !justification.trim()) {
      setImportError('Não é possível confirmar a leitura: confira data, valor, movimento, descrição/trecho, confiança mínima de 0,85 e justificativa.');
      return;
    }
    setImportReviewDecisions(current => ({
      ...current,
      [index]: { pendencia_index: index, categoria: 'conciliavel', decisao: 'aprovar', justificativa: justification.trim() },
    }));
    setImportError('');
  };

  const handleRequestPendingReprocessing = async (index: number, justification: string) => {
    const pendingReviews = importPreview?.pendingReviews || [];
    if (!importLot || !pendingReviews[index] || !justification.trim()) {
      setImportError('Informe uma justificativa para solicitar o reprocessamento.');
      return;
    }
    if (isPreparingImport || isConfirmingImport || isSubmittingImportReview) {
      setImportError('Aguarde a operação atual terminar antes de solicitar o reprocessamento.');
      return;
    }
    const decision: ImportReviewDecisionItem = {
      pendencia_index: index,
      categoria: 'revisao_tecnica',
      decisao: 'rejeitar',
      justificativa: justification.trim(),
    };
    const decisions = Object.values({ ...importReviewDecisions, [index]: decision }).filter((value): value is ImportReviewDecisionItem => Boolean(value));
    setImportReviewDecisions(current => ({ ...current, [index]: decision }));
    setImportError('');
    try {
      await submitImportForReview({
        lot: importLot,
        metadata: {
          reviewState: 'in_review',
          pendingReviews,
          reviewReasons: Array.from(new Set(decisions.map(item => item.categoria))),
          reviewDecisions: decisions,
        },
      });
      alert('Reprocessamento solicitado com sucesso. A importação não foi confirmada.');
      resetImportState();
      setModalOpen('isImportarCSVOpen', false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível solicitar o reprocessamento.');
    }
  };

  const handleSubmitImportReview = async () => {
    if (!importLot || !importPreview) return;
    if (isPreparingImport || isConfirmingImport || isSubmittingImportReview) {
      setImportError('Aguarde a operação atual terminar antes de enviar o lote para conciliação.');
      return;
    }
    const pendingReviews = importPreview.pendingReviews || [];
    if (!pendingReviews.length) {
      setImportError('Não há pendências para enviar à conciliação.');
      return;
    }
    const criticalErrors = importPreview.consistency.criticalErrors.filter(issue => issue.code !== 'pending_review');
    if (criticalErrors.length) {
      setImportError('Envio bloqueado: corrija primeiro os erros críticos indicados no lote.');
      return;
    }
    const missingDecision = pendingReviews.findIndex((pending, index) => {
      const decision = importReviewDecisions[index];
      return !decision || decision.categoria !== 'conciliavel' || decision.decisao !== 'aprovar' || !decision.justificativa.trim()
        || !isValidReviewDate(pending.data_transacao || pending.data_original)
        || !Number.isFinite(pending.valor)
        || !pending.tipo_movimento
        || !(pending.descricao?.trim() || pending.trecho.trim())
        || !Number.isFinite(pending.confianca_extracao)
        || pending.confianca_extracao < 0.85
        || pending.confianca_extracao > 1;
    });
    if (missingDecision >= 0) {
      const decision = importReviewDecisions[missingDecision];
      setImportError(decision?.categoria === 'revisao_tecnica'
        ? 'Envio bloqueado: há item solicitado para reprocessamento. Todas as pendências precisam ser confirmadas como conciliáveis.'
        : 'Envio bloqueado: confirme individualmente todas as pendências válidas, com justificativa.');
      setImportPreviewTab('pendencias');
      return;
    }
    const metadata: ImportReviewSubmissionMetadata = {
      reviewState: 'in_review',
      pendingReviews,
      reviewReasons: ['conciliavel'],
      reviewDecisions: pendingReviews.map((_, index) => importReviewDecisions[index]),
    };
    try {
      await submitImportForReview({ lot: importLot, metadata });
      alert('Lote enviado para conciliação com sucesso. A importação ainda não foi confirmada.');
      resetImportState();
      setModalOpen('isImportarCSVOpen', false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível enviar o lote para conciliação.');
    }
  };

  const handleImportCSVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importLot || !importPreview) return;
    const traceId = importTraceIdRef.current || crypto.randomUUID();
    importTraceIdRef.current = traceId;
    const startedAt = Date.now();
    let currentStage = 'validação de pendências';
    try {
      let transactions = importPreview.transactions;
      if (importPreview.pendingReviews?.length) {
        diagnosticLogger.warn(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: confirmação bloqueada por pendências de revisão`, { pendencias: importPreview.pendingReviews.length });
        throw new Error('Existem itens pendentes de revisão. Nenhum item ambíguo pode ser confirmado silenciosamente.');
      }
      if (importPreview.consistency.criticalErrors.length) throw new Error(`A confirmação foi bloqueada: ${importPreview.consistency.criticalErrors.map(issue => issue.message).join(' ')}`);
      if (importPreview.fileType === 'csv' || importPreview.fileType === 'xlsx') {
        let rows: Array<Record<string, string>>;
        currentStage = `parsing ${importPreview.fileType.toUpperCase()}`;
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: parsing ${importPreview.fileType.toUpperCase()} iniciado`, { headers: csvHeaders.length, modo: importMode });
        if (importPreview.fileType === 'csv') {
          rows = parseCsv(csvContentText).rows;
        } else {
          rows = importPreview.sourceRows || [];
        }
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: parsing ${importPreview.fileType.toUpperCase()} concluído`, { resultado: 'sucesso', headers: csvHeaders.length, linhas: rows.length });
        currentStage = 'construção de transações';
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: construção de transações iniciada`, { linhas: rows.length, modo: importMode, tipoPreview: importPreview.fileType });
        const builtTransactions = await buildCsvTransactions(importLot.contaBancariaId, rows, columnMapping, importMode, importPreview.fileType);
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: construção de transações concluída`, { resultado: 'sucesso', transacoes: builtTransactions.length });
        currentStage = 'anexação de metadata do lote';
        transactions = attachImportLotMetadata(builtTransactions, importLot);
        diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: metadata do lote anexada`, { resultado: 'sucesso', transacoes: transactions.length });
      }
      if (!transactions.length) {
        diagnosticLogger.warn(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: confirmação bloqueada porque o arquivo não contém transações`, { transacoes: 0 });
        throw new Error('O arquivo precisa conter ao menos uma transação válida.');
      }
      currentStage = 'montagem da metadata de confirmação';
      const confirmationMetadata: ImportConfirmationMetadata = {
        pages: importPreview.pages,
        periodStart: importPreview.periodStart,
        periodEnd: importPreview.periodEnd,
        openingBalance: importPreview.openingBalance,
        closingBalance: importPreview.closingBalance,
        bankIdentified: importPreview.bankIdentified,
        totalEntries: importPreview.totalEntries,
        totalExits: importPreview.totalExits,
        parserTotals: importPreview.parserTotals,
        reportedTransactionCount: importPreview.reportedTransactionCount,
        extractedCount: transactions.length,
        ocrCount: transactions.filter(transaction => transaction.origem_extracao === 'ocr').length,
        consistency: importPreview.consistency,
        parserMetadata: importPreview.parserMetadata,
        sourceOrigin: importPreview.sourceOrigin,
        alerts: importPreview.parserMetadata?.alerts,
        pendingReviewCount: importPreview.pendingReviews?.length || 0,
        reviewState: importPreview.pendingReviews?.length ? 'has_pending_reviews' : 'validated',
      };
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: metadata de confirmação montada`, {
        paginas: confirmationMetadata.pages,
        periodoInicio: confirmationMetadata.periodStart,
        periodoFim: confirmationMetadata.periodEnd,
        transacoes: confirmationMetadata.extractedCount,
        ocr: confirmationMetadata.ocrCount,
        alertas: confirmationMetadata.alerts?.length || 0,
        pendencias: confirmationMetadata.pendingReviewCount,
      });
      currentStage = 'validação de consistência';
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: validateImportConsistency iniciado`, { transacoes: transactions.length });
      const currentConsistency = validateImportConsistency(transactions, confirmationMetadata);
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: validateImportConsistency concluído`, { resultado: currentConsistency.criticalErrors.length ? 'bloqueado' : 'válido', errosCriticos: currentConsistency.criticalErrors.length });
      if (currentConsistency.criticalErrors.length > 0) throw new Error(`A confirmação foi bloqueada: ${currentConsistency.criticalErrors.map(issue => issue.message).join(' ')}`);
      currentStage = 'confirmação da importação';
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: confirmImport iniciado`, { transacoes: transactions.length, contaId: importLot.contaBancariaId });
      await confirmImport({ lot: importLot, transactions, metadata: confirmationMetadata });
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: confirmImport concluído`, { resultado: 'sucesso', transacoes: transactions.length, duracaoMs: Date.now() - startedAt });
      resetImportState();
      setModalOpen('isImportarCSVOpen', false);
      diagnosticLogger.info(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: importação finalizada e modal fechado`, { resultado: 'sucesso' });
    } catch (error) {
      diagnosticLogger.error(IMPORT_LOG_SCOPE, `Tentativa ${traceId}: falha na etapa ${currentStage}`, { etapa: currentStage, duracaoMs: Date.now() - startedAt, erro: error });
      setImportError(error instanceof Error ? error.message : 'Não foi possível confirmar a importação.');
    }
  };


  const clearConciliationSelection = () => {
    setModalOpen('isVincularConciliarOpen', false);
    setModalOpen('isClassificarDiferencaOpen', false);
    setSelectedTransacaoForConciliationId(null);
    setSelectedLancamentoIds([]);
    setCurrentConciliationDifferenceValue(0);
  };

  const executeConciliationLink = async () => {
    if (!selectedTransacaoForConciliationId || selectedLancamentoIds.length === 0) return;
    try {
      const tx = normalizedTransacoes.find(t => t.id === selectedTransacaoForConciliationId);
      const selected = lancamentos.filter(l => selectedLancamentoIds.includes(l.id));
      if (!tx || selected.length !== selectedLancamentoIds.length) return;
      const txCents = getTransactionCents(tx);
      const erpCents = selected.reduce((sum, lanc) => sum + getLancamentoAdjustedCents(lanc), 0);
      const differenceCents = txCents - erpCents;
      const difference = differenceCents / 100;

      setCurrentConciliationDifferenceValue(difference);
      if (differenceCents !== 0) {
        setModalOpen('isVincularConciliarOpen', false);
        setModalOpen('isClassificarDiferencaOpen', true);
        return;
      }

      await linkConciliacao({ transacaoBancoId: tx.id, lancamentoIds: selectedLancamentoIds });
      sinalizarConciliacaoOperacao({
        tipo: 'conciliacao',
        contaId: tx.conta_bancaria_id,
        mes: tx.data_transacao.slice(0, 7),
        quantidade: selectedLancamentoIds.length,
      });
      clearConciliationSelection();
    } catch (err: any) { alert('Erro: ' + err.message); }
  };

  const handleClassifyDiffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransacaoForConciliationId || selectedLancamentoIds.length === 0 || !diffJustification.trim()) return;
    try {
      await linkConciliacao({
        transacaoBancoId: selectedTransacaoForConciliationId,
        lancamentoIds: selectedLancamentoIds,
        tipoDiferenca: diffType,
        justificativa: diffJustification.trim(),
      });
      const transaction = periodTransactions.find(item => item.id === selectedTransacaoForConciliationId);
      if (transaction) {
        sinalizarConciliacaoOperacao({
          tipo: 'classificacao_diferenca',
          contaId: transaction.conta_bancaria_id,
          mes: transaction.data_transacao.slice(0, 7),
          quantidade: selectedLancamentoIds.length,
        });
      }
      setDiffJustification('');
      clearConciliationSelection();
    } catch (err: any) { alert('Erro: ' + err.message); }
  };

  const handleUnlink = async (conId: string) => {
    if (confirm('Deseja realmente desfazer esta conciliação? O lançamento voltará para o status "Aberto".')) {
      try { await unlinkConciliacao({ conciliacaoId: conId }); } catch (err: any) { alert('Erro: ' + err.message); }
    }
  };

  const handleConfirmTransferSuggestion = async (transferenciaId: string, lado: 'origem' | 'destino') => {
    const tx = normalizedTransacoes.find(transaction => transaction.id === selectedTransacaoForConciliationId);
    if (!tx || isReconcilingTransferencia) return;
    if (!confirm(`Confirmar esta sugestão e conciliar ${lado === 'origem' ? 'a saída de origem' : 'a entrada de destino'} da transferência?`)) return;
    try {
      await reconcileTransferencia({ transferenciaId, transacaoId: tx.id, lado });
      setSelectedTransacaoForConciliationId(null);
      setSelectedLancamentoIds([]);
    } catch (error) {
      alert(`Erro: ${error instanceof Error ? error.message : 'Não foi possível conciliar a transferência.'}`);
    }
  };

  const handleMarcarTransferencia = async (contaRelacionadaId: string) => {
    if (!selectedTransacaoForConciliationId || isIdentifyingTransactionTransferencia) return;
    await identifyTransactionTransferencia({
      transacaoId: selectedTransacaoForConciliationId,
      contaRelacionadaId,
    });
    setIsMarcarTransferenciaOpen(false);
    setSelectedTransacaoForConciliationId(null);
    setSelectedLancamentoIds([]);
  };

  const handleDecidirTransferencia = async (transferenciaId: string, aprovado: boolean) => {
    if (isDecidingTransferencia) return;
    if (aprovado && !confirm('Aprovar esta transferência? Os dois espelhos serão confirmados no saldo consolidado.')) return;
    const justificativa = aprovado ? null : prompt('Informe a justificativa da reprovação:');
    if (!aprovado && justificativa === null) return;
    try {
      await decideTransferencia({ transferenciaId, aprovado, justificativa: justificativa?.trim() || null });
      alert(aprovado ? 'Transferência aprovada.' : 'Transferência reprovada e devolvida para tratamento operacional.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível decidir a transferência.');
    }
  };

  // O período operacional é sempre calculado sem os filtros de apresentação.
  const periodTransactions = useMemo(() => normalizedTransacoes
    .filter(tx => tx.conta_bancaria_id === selectedContaId && tx.data_transacao.startsWith(selectedMonth))
    .map(tx => ({ ...tx, conciliation: conciliacoes.find(c => c.transacao_banco_id === tx.id) || null })),
  [normalizedTransacoes, selectedContaId, selectedMonth, conciliacoes]);

  const isTransactionIdentified = (transaction: (typeof periodTransactions)[number]) => {
    const hasConciliationLink = Boolean(transaction.conciliation);
    const hasTransferLink = transferencias.some(transferencia =>
      transferencia.status !== 'estornada' &&
      (
        (transferencia.transacao_origem_id === transaction.id && transferencia.conta_origem_id === transaction.conta_bancaria_id) ||
        (transferencia.transacao_destino_id === transaction.id && transferencia.conta_destino_id === transaction.conta_bancaria_id)
      )
    );
    return hasConciliationLink || hasTransferLink;
  };

  // 1. Processar Transações do Banco (somente a apresentação respeita os filtros).
  const bankStatements = useMemo(() => periodTransactions.filter(tx => {
    const matchDirection = directionFilter === 'todos' ? true : directionFilter === 'entrada' ? tx.valor > 0 : tx.valor < 0;
    const matchReview = reviewFilter === 'todos' || hasReviewAlert(tx);
    return matchDirection && matchReview;
  }), [periodTransactions, directionFilter, reviewFilter]);

  const periodProgress = useMemo(() => {
    const identified = periodTransactions.filter(isTransactionIdentified);
    const periodConciliacoes = conciliacoes.filter(conciliacao =>
      periodTransactions.some(transaction => transaction.id === conciliacao.transacao_banco_id)
    );
    const periodConciliacaoIds = new Set(periodConciliacoes.map(conciliacao => conciliacao.id));
    const periodDifferences = diferencas.filter(diferenca => periodConciliacaoIds.has(diferenca.conciliacao_id));
    const differenceCents = periodDifferences.reduce(
      (total, diferenca) => total + Math.abs(Math.round(Number(diferenca.valor_diferenca || 0) * 100)),
      0,
    );
    const unclassifiedDifferences = periodDifferences.filter(diferenca =>
      !diferenca.tipo_diferenca?.trim() || !diferenca.observacao_justificativa?.trim()
    );
    const residualCents = periodTransactions.reduce((total, transaction) => {
      const transactionConciliacoes = periodConciliacoes.filter(conciliacao => conciliacao.transacao_banco_id === transaction.id);
      const hasTransferLink = transferencias.some(transferencia =>
        transferencia.status !== 'estornada' &&
        ((transferencia.transacao_origem_id === transaction.id && transferencia.conta_origem_id === transaction.conta_bancaria_id) ||
          (transferencia.transacao_destino_id === transaction.id && transferencia.conta_destino_id === transaction.conta_bancaria_id))
      );
      if (hasTransferLink) return total;
      const linkedLaunchesCents = transactionConciliacoes.reduce((sum, conciliacao) => {
        const lancamento = lancamentos.find(item => item.id === conciliacao.lancamento_id);
        return sum + (lancamento ? getLancamentoAdjustedCents(lancamento) : 0);
      }, 0);
      const linkedDifferencesCents = periodDifferences
        .filter(diferenca => transactionConciliacoes.some(conciliacao => conciliacao.id === diferenca.conciliacao_id))
        .reduce((sum, diferenca) => sum + Math.round(Number(diferenca.valor_diferenca || 0) * 100), 0);
      return total + getTransactionCents(transaction) - linkedLaunchesCents - linkedDifferencesCents;
    }, 0);
    const total = periodTransactions.length;
    const pending = total - identified.length;
    const importLotsInReview = importLots.filter(lot => lot.status === 'em_revisao').length;
    const readyForClosing = total > 0 && pending === 0 && residualCents === 0 && unclassifiedDifferences.length === 0 && importLotsInReview === 0;
    const state = total === 0 || identified.length === 0
      ? 'Aguardando conciliação'
      : unclassifiedDifferences.length > 0
        ? 'Bloqueado por diferença sem classificação'
        : pending > 0
          ? 'Existem pendências'
          : importLotsInReview > 0
            ? 'Aguardando revisão de lote'
            : readyForClosing && periodDifferences.length > 0
              ? '100% com diferenças justificadas/pronto para fechamento'
              : readyForClosing
                ? '100% identificado'
                : '100% identificado, residual não explicado';
    return {
      total,
      identified: identified.length,
      pending,
      percentage: total ? Math.round((identified.length / total) * 100) : 0,
      differenceCount: periodDifferences.length,
      differenceCents,
      unclassifiedDifferenceCount: unclassifiedDifferences.length,
      residualCents,
      readyForClosing,
      state,
      fechamentoStatus: fechamentoAtual?.status || 'aberto',
    };
  }, [periodTransactions, conciliacoes, diferencas, transferencias, lancamentos, fechamentoAtual, importLots]);

  const realDataUpdatedAt = Math.max(workspaceDataUpdatedAt, lancamentosDataUpdatedAt);
  const handledOperationId = useRef<number | null>(null);

  useEffect(() => {
    if (!conciliacaoOperacaoSucesso || handledOperationId.current === conciliacaoOperacaoSucesso.id || !selectedContaId) return;
    if (conciliacaoOperacaoSucesso.contaId !== selectedContaId || conciliacaoOperacaoSucesso.mes !== selectedMonth) {
      limparConciliacaoOperacaoSucesso();
      return;
    }

    handledOperationId.current = conciliacaoOperacaoSucesso.id;
    const operationMessages = {
      conciliacao: `Conciliação 1:${conciliacaoOperacaoSucesso.quantidade || 1} concluída com sucesso.`,
      classificacao_diferenca: 'Diferença classificada e justificada com sucesso.',
      novo_lancamento: 'Novo lançamento criado e vinculado à transação do extrato.',
    };
    setOperationNotice(operationMessages[conciliacaoOperacaoSucesso.tipo]);
    setCompletionCandidate({
      id: conciliacaoOperacaoSucesso.id,
      requestedAt: conciliacaoOperacaoSucesso.id,
      contaId: conciliacaoOperacaoSucesso.contaId,
      mes: conciliacaoOperacaoSucesso.mes,
    });
    limparConciliacaoOperacaoSucesso();
  }, [conciliacaoOperacaoSucesso, selectedContaId, selectedMonth, limparConciliacaoOperacaoSucesso]);

  useEffect(() => {
    if (
      !completionCandidate ||
      completionCandidate.contaId !== selectedContaId ||
      completionCandidate.mes !== selectedMonth ||
      realDataUpdatedAt <= completionCandidate.requestedAt ||
      !periodProgress.readyForClosing
    ) return;
    setCompletionNotice('Competência 100% conciliada e pronta para fechamento.');
    setCompletionCandidate(null);
  }, [completionCandidate, realDataUpdatedAt, periodProgress.readyForClosing, selectedContaId, selectedMonth]);

  useEffect(() => {
    if (!operationNotice) return;
    const timeout = window.setTimeout(() => setOperationNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [operationNotice]);

  useEffect(() => {
    if (!completionNotice) return;
    const timeout = window.setTimeout(() => setCompletionNotice(null), 9000);
    return () => window.clearTimeout(timeout);
  }, [completionNotice]);

  // 2. Processar Lançamentos do ERP, com competência e vencimento legado.
  const eligibleLaunches = useMemo(() => lancamentos.filter(l => {
    const matchStatus = l.status_pagamento === 'aberto' && !conciliacoes.some(c => c.lancamento_id === l.id);
    const isTransferMirror = Boolean(l.transferencia_id && (l.transferencia_lado === 'origem' || l.transferencia_lado === 'destino'));
    const referenceDate = l.data_competencia || l.data_vencimento;
    return matchStatus && !isTransferMirror && referenceDate.startsWith(selectedMonth);
  }), [lancamentos, conciliacoes, selectedMonth]);
  const availableLaunches = useMemo(() => eligibleLaunches.filter(l =>
    directionFilter === 'todos' || l.tipo === directionFilter
  ), [eligibleLaunches, directionFilter]);

  // 3. Smart Match: valor exato e valor + data são critérios distintos.
  const smartMatchTypes = useMemo(() => {
    const matches = new Map<string, 'valor' | 'valor_data'>();
    if (!selectedTransacaoForConciliationId) return matches;
    const tx = normalizedTransacoes.find(t => t.id === selectedTransacaoForConciliationId);
    if (!tx) return matches;
    const txCents = getTransactionCents(tx);
    eligibleLaunches.forEach(l => {
      const sameValue = getLancamentoAdjustedCents(l) === txCents;
      if (!sameValue) return;
      const referenceDate = l.data_competencia || l.data_vencimento;
      matches.set(l.id, referenceDate === tx.data_transacao ? 'valor_data' : 'valor');
    });
    return matches;
  }, [selectedTransacaoForConciliationId, normalizedTransacoes, eligibleLaunches]);
  const smartMatches = useMemo(() => Array.from(smartMatchTypes.keys()), [smartMatchTypes]);

  const selectedTxForWorkspace = useMemo(() => normalizedTransacoes.find(t => t.id === selectedTransacaoForConciliationId) || null, [selectedTransacaoForConciliationId, normalizedTransacoes]);
  const originTransferSuggestions = useMemo(() => {
    if (!selectedTxForWorkspace || selectedTxForWorkspace.valor >= 0) return [];
    const txCents = Math.abs(getTransactionCents(selectedTxForWorkspace));
    const txDate = new Date(`${selectedTxForWorkspace.data_transacao}T00:00:00Z`).getTime();
    return transferencias.filter(transferencia => {
      const transferDate = new Date(`${transferencia.data_transferencia}T00:00:00Z`).getTime();
      return transferencia.status !== 'estornada'
        && transferencia.conta_origem_id === selectedTxForWorkspace.conta_bancaria_id
        && !transferencia.transacao_origem_id
        && Math.round(Number(transferencia.valor) * 100) === txCents
        && Math.abs(transferDate - txDate) <= 7 * 24 * 60 * 60 * 1000;
    });
  }, [selectedTxForWorkspace, transferencias]);

  const getTransferSuggestionDetails = (suggestion: TransferenciaBancaria | TransferenciaDestinoSugestao, transaction: TransacaoBanco) => {
    const transactionDate = new Date(`${transaction.data_transacao}T00:00:00Z`).getTime();
    const transferDate = new Date(`${suggestion.data_transferencia}T00:00:00Z`).getTime();
    const providedDayDifference = 'diferenca_dias' in suggestion ? suggestion.diferenca_dias : undefined;
    const originName = 'conta_origem_nome' in suggestion ? suggestion.conta_origem_nome : undefined;
    const destinationName = 'conta_destino_nome' in suggestion ? suggestion.conta_destino_nome : undefined;
    const dayDifference = typeof providedDayDifference === 'number'
      ? Math.abs(providedDayDifference)
      : Math.round(Math.abs(transferDate - transactionDate) / (24 * 60 * 60 * 1000));
    return {
      id: suggestion.id.slice(0, 8),
      origin: originName || contas.find(conta => conta.id === suggestion.conta_origem_id)?.nome || 'Conta de origem',
      destination: destinationName || contas.find(conta => conta.id === suggestion.conta_destino_id)?.nome || 'Conta de destino',
      amount: valueFormatter(Number(suggestion.valor)),
      dayDifference,
      status: {
        aberta: 'Aberta',
        aguardando_destino: 'Aguardando destino',
        conciliada_pendente_master: 'Aguardando Master',
        conciliada: 'Conciliada',
        estornada: 'Estornada',
      }[suggestion.status] || suggestion.status,
    };
  };

  const selectedLancsForWorkspace = useMemo(() => lancamentos.filter(l => selectedLancamentoIds.includes(l.id)), [selectedLancamentoIds, lancamentos]);

  const draftDifferenceAmount = useMemo(() => {
    if (!selectedTxForWorkspace || selectedLancsForWorkspace.length === 0) return 0;
    const txCents = getTransactionCents(selectedTxForWorkspace);
    const erpCents = selectedLancsForWorkspace.reduce((sum, lanc) => sum + getLancamentoAdjustedCents(lanc), 0);
    return (txCents - erpCents) / 100;
  }, [selectedTxForWorkspace, selectedLancsForWorkspace]);

  return (
    <div className="space-y-6 animate-fade-in">
      <ConciliacaoHeader
        directionFilter={directionFilter}
        setDirectionFilter={setDirectionFilter}
        reviewFilter={reviewFilter}
        setReviewFilter={setReviewFilter}
        contas={contas}
        selectedContaId={selectedContaId}
        setSelectedContaId={setSelectedContaId}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        onOpenTransferencia={() => setModalOpen('isTransferenciaBancariaOpen', true)}
        onOpenImportar={() => setModalOpen('isImportarCSVOpen', true)}
      />

      {(!role || role !== 'master') && (
        <div className="bg-neutral-100 border-2 border-neutral-200 p-4 rounded-3xl flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-neutral-400" />
          <p className="text-[10px] font-black text-secondary uppercase tracking-widest">
            Nota de Governança: A conciliação bancária impacta o <span className="text-primary">Saldo Operacional</span>. A liquidação definitiva no Saldo Real é exclusiva do nível Master.
          </p>
        </div>
      )}

      <ConciliacaoCompetenceSummary
        periodProgress={periodProgress}
        valueFormatter={valueFormatter}
        operationNotice={operationNotice}
        completionNotice={completionNotice}
      />

      {(role === 'master' || role === 'gerente') && (
        <ConciliacaoImportLotsPanel lots={importLots} selectedMonth={selectedMonth} />
      )}

      <ConciliacaoClosingPanel
        selectedMonth={selectedMonth}
        contas={contas}
        selectedContaId={selectedContaId}
        fechamentoAtual={fechamentoAtual}
        fechamentosAguardandoMaster={fechamentosAguardandoMaster}
        role={role}
        fechamentoBusy={fechamentoBusy}
        isFechandoPeriodo={isFechandoPeriodo}
        handleFecharPeriodo={handleFecharPeriodo}
        onOpenMasterQueue={() => navigate('/aprovacao-master')}
        valueFormatter={valueFormatter}
      />

      <ConciliacaoPendingTransfers
        role={role}
        transferenciasPendentesMaster={transferenciasPendentesMaster}
        contas={contas}
        valueFormatter={valueFormatter}
        onOpenMasterQueue={() => navigate('/aprovacao-master')}
      />

      {/* Toolbox de Lote */}
      {periodProgress.pending > 0 && (
        <div className="bg-primary/5 border-2 border-primary/10 p-4 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-primary" />
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">
              Existem {periodProgress.pending} transações aguardando conciliação neste período.
            </p>
          </div>
          <button 
            onClick={handleCleanup}
            className="flex items-center gap-2 text-[10px] font-black text-alert-red hover:underline uppercase tracking-widest"
          >
            <Trash2 className="w-4 h-4" /> Limpar Importações Pendentes
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-280px)] min-h-[500px]">
        {/* LADO ESQUERDO: BANCO */}
        <div className="bg-white border-2 border-neutral-100 rounded-[32px] overflow-hidden shadow-sm flex flex-col">
          <header className="px-8 py-5 border-b bg-neutral-50/50 flex justify-between items-center shrink-0">
            <div>
              <span className="text-[10px] font-black uppercase text-secondary tracking-[0.2em] flex items-center gap-2">
                <Building className="w-4 h-4" /> Verdade Bancária
              </span>
              <p className="text-[9px] font-bold text-neutral-400 uppercase mt-0.5">Transações reais do extrato</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white border border-neutral-200 rounded-lg text-[10px] font-black text-neutral-900">
                {bankStatements.length} ITENS
              </span>
            </div>
          </header>

          <div className="flex-1 p-6 space-y-3 overflow-y-auto scrollbar-thin bg-neutral-50/30">
            {bankStatements.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 gap-4">
                <FileSpreadsheet className="w-16 h-16 text-neutral-300" />
                <p className="text-xs font-black uppercase tracking-widest max-w-[200px]">Importe um extrato para começar a conciliação</p>
              </div>
            ) : bankStatements.map(tx => {
              const transactionIdentified = isTransactionIdentified(tx);
              const suggestionsForTx = tx.valor > 0 ? transferSuggestions : originTransferSuggestions;
              const suggestionSide = tx.valor > 0 ? 'destino' as const : 'origem' as const;
              return (
              <motion.div
                layout
                key={tx.id} 
                onClick={() => {
                  if (!transactionIdentified) {
                    setSelectedTransacaoForConciliationId(tx.id);
                    setSelectedLancamentoIds([]);
                  }
                }}
                className={`p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                  transactionIdentified
                    ? 'opacity-40 grayscale bg-neutral-100 cursor-default' 
                    : selectedTransacaoForConciliationId === tx.id 
                      ? 'border-primary bg-white shadow-xl scale-[1.02] ring-4 ring-primary/5' 
                      : 'border-white bg-white hover:border-neutral-200 cursor-pointer shadow-sm'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    tx.valor > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {tx.valor > 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-neutral-900 leading-tight truncate max-w-[250px]">{tx.descricao_original || tx.descricao_banco}</p>
                    {tx.descricao_original && tx.descricao_original !== tx.descricao_banco && (
                      <p className="text-[9px] font-bold text-neutral-500 truncate max-w-[250px] mt-0.5">Normalizado: {tx.descricao_banco}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {tx.data_original || tx.data_transacao}
                      </span>
                      {tx.data_original && tx.data_original !== tx.data_transacao && <span className="text-[9px] font-bold text-neutral-400 uppercase">Normalizada: {tx.data_transacao}</span>}
                      {tx.numero_documento && (
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {tx.numero_documento}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="px-2 py-1 rounded-lg bg-neutral-100 text-[8px] font-black uppercase tracking-widest text-neutral-500">{fileOriginLabel(tx.origem_arquivo)}</span>
                      {tx.confianca_extracao !== null && tx.confianca_extracao !== undefined && <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Confiança {Math.round(tx.confianca_extracao * 100)}%</span>}
                      {hasReviewAlert(tx) && <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-600"><AlertTriangle className="w-3 h-3" /> Revisar</span>}
                    </div>
                    {hasReviewAlert(tx) && <p className="text-[9px] font-bold text-amber-700 mt-1 truncate max-w-[280px]">{tx.motivo_alerta}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className={`text-sm font-black font-mono ${tx.valor < 0 ? 'text-alert-red' : 'text-bank-truth-green'}`}>
                    {valueFormatter(tx.valor)}
                  </div>
                  {transactionIdentified ? (
                    tx.conciliation ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnlink(tx.conciliation!.id); }}
                        className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"
                        title="Desvincular"
                      >
                        <Unlink className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest" title="Vínculo de transferência íntegro">
                        Transferência identificada
                      </span>
                    )
                  ) : selectedTransacaoForConciliationId === tx.id ? (
                    <div className="flex flex-col items-end gap-2">
                      {(suggestionsForTx.length > 0 || (isLoadingTransferSuggestions && tx.valor > 0)) && (
                        <div className="flex flex-col items-end gap-2">
                          <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest ${suggestionsForTx.length > 1 ? 'text-sky-700' : 'text-emerald-600'}`}>
                            {isLoadingTransferSuggestions && tx.valor > 0
                              ? 'Buscando transferência...'
                              : suggestionsForTx.length === 1
                                ? 'Correspondência única encontrada'
                                : `${suggestionsForTx.length} correspondências encontradas — escolha uma opção`}
                          </div>
                          {suggestionsForTx.map(suggestion => {
                            const details = getTransferSuggestionDetails(suggestion, tx);
                            return (
                              <button
                                key={suggestion.id}
                                type="button"
                                disabled={isReconcilingTransferencia}
                                onClick={(event) => { event.stopPropagation(); void handleConfirmTransferSuggestion(suggestion.id, suggestionSide); }}
                                className={`w-full max-w-[360px] rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                                  suggestionsForTx.length > 1
                                    ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                }`}
                              >
                                <span className="flex items-center justify-between gap-3 text-[8px] font-black uppercase tracking-wide">
                                  <span>Confirmar correspondência</span>
                                  <span className="shrink-0">ID {details.id}</span>
                                </span>
                                <span className="mt-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide">
                                  <ArrowRightLeft className="h-3 w-3 shrink-0" />
                                  {details.origin} → {details.destination}
                                </span>
                                <span className="mt-1 block text-[8px] font-bold uppercase tracking-wide">
                                  Valor {details.amount} • Diferença de {details.dayDifference} {details.dayDifference === 1 ? 'dia' : 'dias'} • Status: {details.status}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMarcarTransferenciaOpen(true);
                          }}
                          className="h-8 px-3 rounded-xl border border-primary/30 bg-primary/5 text-primary text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-primary/10 transition-all"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 inline mr-1" /> Marcar como transferência
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTransacaoBancoParaLancamento(tx);
                            setModalOpen('isNovoLancamentoOpen', true);
                          }}
                          className="h-8 px-3 rounded-xl bg-primary text-white text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-primary/90 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5 inline mr-1" /> Novo Lançamento
                        </button>
                        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white animate-pulse">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </motion.div>
              );
            })}
          </div>
        </div>

        {/* LADO DIREITO: ERP */}
        <div className="bg-white border-2 border-neutral-100 rounded-[32px] overflow-hidden shadow-sm flex flex-col">
          <header className="px-8 py-5 border-b bg-neutral-50/50 flex justify-between items-center shrink-0">
            <div>
              <span className="text-[10px] font-black uppercase text-secondary tracking-[0.2em] flex items-center gap-2">
                <Coins className="w-4 h-4" /> Previsões do ERP
              </span>
              <p className="text-[9px] font-bold text-neutral-400 uppercase mt-0.5">Lançamentos cadastrados no sistema</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white border border-neutral-200 rounded-lg text-[10px] font-black text-neutral-900">
                {availableLaunches.length} DISPONÍVEIS
              </span>
              {selectedLancamentoIds.length > 0 && selectedTransacaoForConciliationId && (
                <button
                  onClick={() => setModalOpen('isVincularConciliarOpen', true)}
                  className="px-3 py-2 bg-primary text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm"
                >
                  Confirmar {selectedLancamentoIds.length} selecionado(s)
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 p-6 space-y-3 overflow-y-auto scrollbar-thin bg-neutral-50/30">
            {availableLaunches.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 gap-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                <p className="text-xs font-black uppercase tracking-widest max-w-[200px]">
                  {periodProgress.pending > 0 ? 'Nenhuma provisão elegível encontrada para os itens pendentes' : 'Período totalmente conciliado no ERP'}
                </p>
              </div>
            ) : availableLaunches.map(l => {
              const isSmartMatch = smartMatches.includes(l.id);
              return (
                <motion.div
                  layout
                  key={l.id}
                  className={`p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                    isSmartMatch 
                      ? 'border-emerald-200 bg-emerald-50/30 ring-2 ring-emerald-500/10' 
                      : 'border-white bg-white hover:border-neutral-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                      l.tipo === 'entrada' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {l.tipo === 'entrada' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black uppercase text-neutral-900 leading-tight truncate max-w-[200px]">
                          {entidades.find(e => e.id === l.entidade_id)?.nome_razao_social || 'Desconhecido'}
                        </p>
                        {isSmartMatch && (
                          <span className="bg-emerald-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5 fill-current" /> {smartMatchTypes.get(l.id) === 'valor_data' ? 'Match exato: valor + data' : 'Match exato: valor'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {(l.data_competencia || l.data_vencimento).split('-').reverse().join('/')}
                        </span>
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest truncate max-w-[150px]">
                          {l.observacoes || 'Sem descrição'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-sm font-black font-mono text-neutral-900">
                      {valueFormatter(l.valor_previsto)}
                    </div>
                    <label className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      !selectedTransacaoForConciliationId
                        ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
                        : selectedLancamentoIds.includes(l.id)
                          ? 'bg-primary text-white shadow-lg'
                          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`} title="Selecionar lançamento">
                      <input
                        type="checkbox"
                        checked={selectedLancamentoIds.includes(l.id)}
                        disabled={!selectedTransacaoForConciliationId}
                        onChange={() => setSelectedLancamentoIds(current => current.includes(l.id) ? current.filter(id => id !== l.id) : [...current, l.id])}
                        className="sr-only"
                      />
                      {selectedLancamentoIds.includes(l.id) ? <CheckCircle2 className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
                    </label>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* WIZARDS & MODALS */}
      <AnimatePresence>
        {isImportarCSVOpen && (
          <ImportarExtratoModal
            contas={contas}
            selectedImportContaId={selectedImportContaId}
            setSelectedImportContaId={setSelectedImportContaId}
            importLot={importLot}
            importMode={importMode}
            setImportMode={setImportMode}
            importPreview={importPreview}
            fileInputRef={fileInputRef}
            processFile={processFile}
            valueFormatter={valueFormatter}
            setImportPreviewTab={setImportPreviewTab}
            importPreviewTab={importPreviewTab}
            fileOriginLabel={fileOriginLabel}
            columnMapping={columnMapping}
            setColumnMapping={setColumnMapping}
            csvHeaders={csvHeaders}
            csvPreviewRows={csvPreviewRows}
            importError={importError}
            handleImportCancel={handleImportCancel}
            handleImportCSVSubmit={handleImportCSVSubmit}
            reviewDecisions={importReviewDecisions}
            onEditPendingJustification={handleEditPendingJustification}
            onConfirmPendingReview={handleConfirmPendingReview}
            onRequestPendingReprocessing={handleRequestPendingReprocessing}
            onSubmitImportReview={handleSubmitImportReview}
            isPreparingImport={isPreparingImport}
            isConfirmingImport={isConfirmingImport}
            isSubmittingImportReview={isSubmittingImportReview}
          />
        )}

        {isVincularConciliarOpen && selectedTxForWorkspace && selectedLancsForWorkspace.length > 0 && (
          <div className="fixed inset-0 z-[600] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalOpen('isVincularConciliarOpen', false)} className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="w-full md:w-[500px] h-full bg-white shadow-2xl flex flex-col relative z-20">
              <header className="px-8 py-6 border-b bg-neutral-50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter">Consolidar Itens</h2>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-1">Conferência de correspondência</p>
                </div>
                <button onClick={() => setModalOpen('isVincularConciliarOpen', false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-all"><X className="w-6 h-6 text-neutral-400" /></button>
              </header>

              <div className="flex-1 p-8 space-y-8 overflow-y-auto scrollbar-thin">
                {/* Visual Card: Banco */}
                <div className="p-8 rounded-[32px] border-2 border-neutral-100 bg-neutral-50/50 space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-neutral-900 opacity-5 rounded-full" />
                  <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                    <Building className="w-4 h-4" /> Origem Bancária
                  </span>
                  <div>
                    <p className="font-black text-sm uppercase text-neutral-900 leading-tight">{selectedTxForWorkspace.descricao_banco}</p>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase mt-1">Data: {selectedTxForWorkspace.data_transacao.split('-').reverse().join('/')}</p>
                  </div>
                  <p className="font-black text-3xl text-neutral-900 font-mono">{valueFormatter(selectedTxForWorkspace.valor)}</p>
                </div>

                <div className="flex justify-center -my-4 relative z-10">
                  <div className="w-14 h-14 bg-white border-2 border-neutral-100 rounded-2xl shadow-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Link2 className="w-6 h-6" />
                  </div>
                </div>

                {/* Comparação objetiva dos lançamentos selecionados */}
                <div className="p-6 rounded-[32px] border-2 border-primary/20 bg-primary/5 space-y-4 relative overflow-hidden">
                  <span className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Coins className="w-4 h-4" /> ERP selecionado ({selectedLancsForWorkspace.length})
                  </span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] text-left">
                      <thead className="text-neutral-400 uppercase font-black border-b border-primary/10">
                        <tr><th className="py-2 pr-3">Campo</th><th className="py-2">Banco</th><th className="py-2">ERP</th></tr>
                      </thead>
                      <tbody className="font-bold text-neutral-700">
                        <tr className="border-b border-primary/10"><td className="py-2 pr-3">Valor (centavos)</td><td className="py-2 font-mono">{Math.round(Number(selectedTxForWorkspace.valor.toFixed(2)) * 100)}¢</td><td className="py-2 font-mono">{selectedLancsForWorkspace.reduce((sum, lanc) => sum + getLancamentoAdjustedCents(lanc), 0)}¢</td></tr>
                        <tr className="border-b border-primary/10"><td className="py-2 pr-3">Data</td><td className="py-2">{selectedTxForWorkspace.data_transacao}</td><td className="py-2">{selectedLancsForWorkspace.map(l => l.data_vencimento).join(', ')}</td></tr>
                        <tr className="border-b border-primary/10"><td className="py-2 pr-3">Natureza</td><td className="py-2">{selectedTxForWorkspace.tipo_movimento === 'credito' ? 'entrada' : 'saida'}</td><td className="py-2">{selectedLancsForWorkspace.map(l => l.tipo).join(', ')}</td></tr>
                        <tr className="border-b border-primary/10"><td className="py-2 pr-3">Descrição</td><td className="py-2">{selectedTxForWorkspace.descricao_banco}</td><td className="py-2">{selectedLancsForWorkspace.map(l => l.observacoes || 'Sem descrição').join(' • ')}</td></tr>
                        <tr className="border-b border-primary/10"><td className="py-2 pr-3">Entidade</td><td className="py-2">—</td><td className="py-2">{selectedLancsForWorkspace.map(l => entidades.find(e => e.id === l.entidade_id)?.nome_razao_social || 'N/A').join(', ')}</td></tr>
                        <tr><td className="py-2 pr-3">Conta</td><td className="py-2">{contas.find(c => c.id === selectedTxForWorkspace.conta_bancaria_id)?.nome || selectedTxForWorkspace.conta_bancaria_id}</td><td className="py-2">{selectedLancsForWorkspace.map(l => contas.find(c => c.id === l.conta_bancaria_id)?.nome || l.conta_bancaria_id).join(', ')}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-alert-red">Divergências ficam destacadas no valor residual e serão validadas pelo servidor.</p>
                </div>
              </div>

              <footer className="p-10 border-t bg-neutral-50 shrink-0">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Diferença Residual ({Math.round(draftDifferenceAmount * 100)}¢)</span>
                  <div className={`px-5 py-2 rounded-2xl text-xs font-black font-mono shadow-sm ${Math.abs(draftDifferenceAmount) < 0.01 ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white'}`}>
                    {valueFormatter(draftDifferenceAmount)}
                  </div>
                </div>
                
                <button 
                  onClick={executeConciliationLink} 
                  disabled={isLinking}
                  className="w-full h-16 bg-neutral-900 text-white font-black text-xs uppercase tracking-[0.3em] rounded-[24px] shadow-2xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isLinking ? <Clock className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Confirmar Conciliação
                </button>
              </footer>
            </motion.div>
          </div>
        )}

        {isClassificarDiferencaOpen && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalOpen('isClassificarDiferencaOpen', false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }} 
              onSubmit={handleClassifyDiffSubmit} 
              className="bg-white w-full max-w-[480px] rounded-[40px] shadow-2xl relative z-20 overflow-hidden"
            >
              <header className="px-10 py-8 border-b bg-neutral-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tighter">Ajuste de Diferença</h2>
                  <p className="text-[9px] font-bold text-alert-red uppercase tracking-widest mt-1">O valor do banco não coincide com o ERP</p>
                </div>
                <button type="button" onClick={() => setModalOpen('isClassificarDiferencaOpen', false)} className="p-3 hover:bg-neutral-200 rounded-2xl transition-all">
                  <X className="w-6 h-6 text-neutral-400" />
                </button>
              </header>

              <div className="p-10 space-y-8">
                <div className="p-6 bg-red-50 border-2 border-red-100 rounded-3xl text-center space-y-1">
                  <label className="text-[10px] font-black uppercase text-red-400 tracking-widest block">Valor Residual a Justificar ({Math.round(currentConciliationDifferenceValue * 100)}¢)</label>
                  <div className="font-black text-3xl text-alert-red font-mono">{valueFormatter(currentConciliationDifferenceValue)}</div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Natureza do Ajuste
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'tarifa', label: 'Tarifa Bancária' },
                      { id: 'juros', label: 'Juros' },
                      { id: 'multa', label: 'Multa' },
                      { id: 'desconto', label: 'Desconto' },
                      { id: 'pagamento_parcial', label: 'Pagto Parcial' },
                      { id: 'ajuste_manual', label: 'Outro Ajuste' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDiffType(opt.id as any)}
                        className={`h-12 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${
                          diffType === opt.id ? 'bg-neutral-900 border-neutral-900 text-white shadow-lg' : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-2">
                    <Info className="w-4 h-4" /> Justificativa Contábil
                  </label>
                  <textarea 
                    required 
                    rows={3} 
                    value={diffJustification} 
                    onChange={(e) => setDiffJustification(e.target.value)} 
                    placeholder="Descreva o motivo desta divergência de valores..."
                    className="w-full p-5 bg-neutral-50 border-2 border-neutral-100 rounded-2xl text-xs font-bold text-neutral-800 focus:border-primary outline-none transition-all resize-none" 
                  />
                </div>
              </div>

              <footer className="px-10 py-8 border-t bg-neutral-50 flex justify-end gap-4 shrink-0">
                <button type="button" onClick={() => setModalOpen('isClassificarDiferencaOpen', false)} className="px-6 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Cancelar</button>
                <button 
                  type="submit"
                  className="px-10 h-14 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl hover:bg-black transition-all active:scale-95"
                >
                  Salvar Ajuste
                </button>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
      <MarcarTransferenciaModal
        isOpen={isMarcarTransferenciaOpen}
        transacao={selectedTxForWorkspace}
        contas={contas}
        isSubmitting={isIdentifyingTransactionTransferencia}
        onClose={() => setIsMarcarTransferenciaOpen(false)}
        onSubmit={handleMarcarTransferencia}
      />
      <TransferenciaBancariaModal
        isOpen={isTransferenciaBancariaOpen}
        contas={contas}
        onClose={() => setModalOpen('isTransferenciaBancariaOpen', false)}
      />
    </div>
  );
}