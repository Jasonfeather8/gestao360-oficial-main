import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  Link2,
  Unlink,
  Search,
  Upload,
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
  ShieldCheck,
  Shield
} from 'lucide-react';
import { useConciliacao, useContas, useLancamentos, useEntidades, useTransferencias } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { TransacaoBanco, LancamentoFinanceiro } from '../types';
import { ImportConfirmationMetadata, ImportLotDraft, ImportMode, ImportPreview } from '../types/extratoImportacao';
import { buildCsvTransactions, parseCsv, validateImportConsistency } from '../services/conciliacoesService';
import Button from '../components/Button';
import TransferenciaBancariaModal from '../components/TransferenciaBancariaModal';

export default function Conciliacao() {
  const { 
    conciliacoes = [],
    transacoes = [],
    fechamentos = [],
    prepareImport,
    confirmImport,
    fecharPeriodo,
    decidirFechamento,
    cancelImport,
    isPreparingImport,
    isConfirmingImport,
    isFechandoPeriodo,
    isDecidindoFechamento,
    linkConciliacao,
    unlinkConciliacao,
    cleanupTransacoes,
    isLinking,
    isCleaning
  } = useConciliacao();

  const { role, user } = useAuth();
  const { data: contas = [] } = useContas();
  const { data: lancamentos = [] } = useLancamentos({ pageSize: 1000 }); // Buscar volume maior para conciliar
  const { data: entidades = [] } = useEntidades();

  const {
    isImportarCSVOpen, isTransferenciaBancariaOpen, setModalOpen, selectedTransacaoForConciliationId,
    isVincularConciliarOpen, isClassificarDiferencaOpen,
    setSelectedTransacaoForConciliationId,
    setTransacaoBancoParaLancamento,
    setCurrentConciliationDifferenceValue,
    currentConciliationDifferenceValue
  } = useUIStore();

  const [selectedContaId, setSelectedContaId] = useState<string>('');
  const [selectedLancamentoIds, setSelectedLancamentoIds] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [reviewFilter, setReviewFilter] = useState<'todos' | 'pendencias'>('todos');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const {
    transferencias,
    suggestions: transferSuggestions,
    isLoadingSuggestions: isLoadingTransferSuggestions,
    reconcileTransferencia,
    isReconciling: isReconcilingTransferencia,
    transferenciasPendentesMaster,
    decideTransferencia,
    isDecidingTransferencia,
  } = useTransferencias(selectedTransacaoForConciliationId);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const normalizedTransacoes = useMemo(() => transacoes.filter(transaction => {
    const valueCents = Math.round(Number(transaction.valor) * 100);
    return /^\d{4}-\d{2}-\d{2}$/.test(transaction.data_transacao)
      && Number.isFinite(transaction.valor)
      && Number.isInteger(transaction.valor_centavos)
      && transaction.valor_centavos === valueCents
      && Boolean(transaction.data_original?.trim())
      && Boolean(transaction.descricao_banco?.trim())
      && Boolean(transaction.descricao_original?.trim())
      && /^[a-f0-9]{64}$/.test(transaction.hash_transacao)
      && ((transaction.valor > 0 && transaction.tipo_movimento === 'credito') || (transaction.valor < 0 && transaction.tipo_movimento === 'debito'));
  }), [transacoes]);
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
    setImportError('');
    if (importLot && !(await handleImportCancel())) return;
    try {
      if (!user?.id) throw new Error('Sessão expirada. Entre novamente para importar o extrato.');
      const result = await prepareImport({ file, contaBancariaId: selectedImportContaId, userId: user.id });
      setImportLot(result.lot);
      setImportPreview(result.preview);
      setCsvContentText(result.preview.fileType === 'csv' ? await file.text() : '');
      const headers = result.preview.sourceHeaders || Object.keys(result.preview.firstRows[0] || {});
      setCsvHeaders(headers);
      setCsvPreviewRows(result.preview.firstRows);
      if (result.preview.fileType === 'csv' || result.preview.fileType === 'xlsx') {
        setColumnMapping({
          data: headers.find(header => /dat/i.test(header)) || '',
          valor: headers.find(header => /val/i.test(header)) || '',
          descricao: headers.find(header => /desc/i.test(header)) || '',
          documento: headers.find(header => /doc/i.test(header)) || '',
        });
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível preparar o arquivo.');
    }
  };

  const handleImportCancel = async (): Promise<boolean> => {
    if (isPreparingImport || isConfirmingImport) return false;
    if (importLot) {
      try { await cancelImport(importLot); } catch (error) { setImportError('Não foi possível remover o arquivo temporário. Tente cancelar novamente.'); return false; }
    }
    resetImportState();
    setModalOpen('isImportarCSVOpen', false);
    return true;
  };

  const resetImportState = () => {
    setCsvContentText('');
    setImportLot(null);
    setImportPreview(null);
    setImportError('');
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    setImportPreviewTab('entradas');
    setColumnMapping({ data: '', valor: '', descricao: '', documento: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const handleImportCSVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importLot || !importPreview) return;
    try {
      let transactions = importPreview.transactions;
      if (importPreview.pendingReviews?.length) throw new Error('Existem itens pendentes de revisão. Nenhum item ambíguo pode ser confirmado silenciosamente.');
      if (importPreview.fileType === 'csv' || importPreview.fileType === 'xlsx') {
        const rows = importPreview.fileType === 'csv'
          ? parseCsv(csvContentText).rows
          : importPreview.sourceRows || [];
        transactions = await buildCsvTransactions(importLot.contaBancariaId, rows, columnMapping, importMode, importPreview.fileType);
      }
      if (!transactions.length) throw new Error('O arquivo precisa conter ao menos uma transação válida.');
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
        sourceOrigin: importPreview.sourceOrigin,
        pendingReviewCount: importPreview.pendingReviews?.length || 0,
        reviewState: importPreview.pendingReviews?.length ? 'has_pending_reviews' : 'validated',
      };
      const currentConsistency = validateImportConsistency(transactions, confirmationMetadata);
      if (currentConsistency.criticalErrors.length > 0) throw new Error(`A confirmação foi bloqueada: ${currentConsistency.criticalErrors.map(issue => issue.message).join(' ')}`);
      await confirmImport({ lot: importLot, transactions, metadata: confirmationMetadata });
      resetImportState();
      setModalOpen('isImportarCSVOpen', false);
    } catch (error) {
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
      const txCents = Math.round(Number(tx.valor.toFixed(2)) * 100);
      const erpCents = selected.reduce((sum, lanc) => {
        const value = lanc.tipo === 'saida' ? -Math.abs(lanc.valor_previsto) : Math.abs(lanc.valor_previsto);
        return sum + Math.round(Number(value.toFixed(2)) * 100);
      }, 0);
      const differenceCents = txCents - erpCents;
      const difference = differenceCents / 100;

      setCurrentConciliationDifferenceValue(difference);
      if (differenceCents !== 0) {
        setModalOpen('isVincularConciliarOpen', false);
        setModalOpen('isClassificarDiferencaOpen', true);
        return;
      }

      await linkConciliacao({ transacaoBancoId: tx.id, lancamentoIds: selectedLancamentoIds });
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

  // 1. Processar Transações do Banco
  const bankStatements = useMemo(() => {
    return normalizedTransacoes
      .filter(tx => {
        const matchConta = tx.conta_bancaria_id === selectedContaId;
        const matchMonth = tx.data_transacao.startsWith(selectedMonth);
        const matchDirection = directionFilter === 'todos' ? true :
                              directionFilter === 'entrada' ? tx.valor > 0 : tx.valor < 0;
        const matchReview = reviewFilter === 'todos' || hasReviewAlert(tx);
        return matchConta && matchMonth && matchDirection && matchReview;
      })
      .map(tx => ({
        ...tx,
        conciliation: conciliacoes.find(c => c.transacao_banco_id === tx.id) || null
      }));
  }, [normalizedTransacoes, selectedContaId, selectedMonth, directionFilter, reviewFilter, conciliacoes]);

  // 2. Processar Lançamentos do ERP
  const availableLaunches = useMemo(() => {
    return lancamentos.filter(l => {
      const matchConta = l.conta_bancaria_id === selectedContaId;
      const matchStatus = l.status_pagamento === 'aberto' && !conciliacoes.some(c => c.lancamento_id === l.id);
      const isTransferMirror = Boolean(l.transferencia_id && (l.transferencia_lado === 'origem' || l.transferencia_lado === 'destino'));
      const matchMonth = l.data_vencimento.startsWith(selectedMonth);
      const matchDirection = directionFilter === 'todos' ? true : l.tipo === directionFilter;
      return matchConta && matchStatus && !isTransferMirror && matchMonth && matchDirection;
    });
  }, [lancamentos, conciliacoes, selectedContaId, selectedMonth, directionFilter]);

  // 3. Lógica de Smart Match (Sugestão Visual)
  const smartMatches = useMemo(() => {
    if (!selectedTransacaoForConciliationId) return [];
    const tx = normalizedTransacoes.find(t => t.id === selectedTransacaoForConciliationId);
    if (!tx) return [];

    return availableLaunches.filter(l => {
      const erpVal = l.tipo === 'saida' ? -Math.abs(l.valor_previsto) : Math.abs(l.valor_previsto);
      const sameVal = Math.abs(erpVal - tx.valor) < 0.01;
      const sameDate = l.data_vencimento === tx.data_transacao;
      return sameVal || (sameVal && sameDate);
    }).map(l => l.id);
  }, [selectedTransacaoForConciliationId, normalizedTransacoes, availableLaunches]);

  const selectedTxForWorkspace = useMemo(() => normalizedTransacoes.find(t => t.id === selectedTransacaoForConciliationId) || null, [selectedTransacaoForConciliationId, normalizedTransacoes]);
  const originTransferSuggestions = useMemo(() => {
    if (!selectedTxForWorkspace || selectedTxForWorkspace.valor >= 0) return [];
    const txCents = Math.round(Math.abs(selectedTxForWorkspace.valor) * 100);
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
  const selectedLancsForWorkspace = useMemo(() => lancamentos.filter(l => selectedLancamentoIds.includes(l.id)), [selectedLancamentoIds, lancamentos]);

  const draftDifferenceAmount = useMemo(() => {
    if (!selectedTxForWorkspace || selectedLancsForWorkspace.length === 0) return 0;
    const txCents = Math.round(Number(selectedTxForWorkspace.valor.toFixed(2)) * 100);
    const erpCents = selectedLancsForWorkspace.reduce((sum, lanc) => {
      const value = lanc.tipo === 'saida' ? -Math.abs(lanc.valor_previsto) : Math.abs(lanc.valor_previsto);
      return sum + Math.round(Number(value.toFixed(2)) * 100);
    }, 0);
    return (txCents - erpCents) / 100;
  }, [selectedTxForWorkspace, selectedLancsForWorkspace]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tighter uppercase flex items-center gap-3">
            <Zap className="w-8 h-8 text-primary fill-primary/20" />
            Estação de Conciliação
          </h1>
          <p className="text-secondary font-bold text-xs uppercase tracking-widest mt-1">Sincronização de Verdade Bancária e Integridade de Caixa</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white border-2 border-neutral-100 rounded-2xl p-1.5 shadow-sm">
            <button 
              onClick={() => setDirectionFilter('todos')}
              className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all ${directionFilter === 'todos' ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-400 hover:text-neutral-900'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setDirectionFilter('entrada')}
              className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all ${directionFilter === 'entrada' ? 'bg-emerald-500 text-white shadow-lg' : 'text-neutral-400 hover:text-emerald-500'}`}
            >
              Entradas
            </button>
            <button
              onClick={() => setDirectionFilter('saida')}
              className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all ${directionFilter === 'saida' ? 'bg-red-500 text-white shadow-lg' : 'text-neutral-400 hover:text-red-500'}`}
            >
              Saídas
            </button>
            <button
              onClick={() => setReviewFilter(current => current === 'pendencias' ? 'todos' : 'pendencias')}
              className={`px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${reviewFilter === 'pendencias' ? 'bg-amber-500 text-white shadow-lg' : 'text-neutral-400 hover:text-amber-600'}`}
              title="Mostrar somente transações com alerta de revisão"
            >
              <AlertTriangle className="w-3 h-3" /> Pendências
            </button>
          </div>

          <div className="flex items-center gap-3 h-12 px-4 bg-white border-2 border-neutral-100 rounded-2xl shadow-sm">
            <Building className="w-4 h-4 text-neutral-400" />
            <select value={selectedContaId} onChange={(e) => setSelectedContaId(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase outline-none cursor-pointer">
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3 h-12 px-4 bg-white border-2 border-neutral-100 rounded-2xl shadow-sm">
            <Calendar className="w-4 h-4 text-neutral-400" />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase outline-none" />
          </div>

          <button onClick={() => setModalOpen('isTransferenciaBancariaOpen', true)} className="px-6 h-12 bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-primary/90 transition-all flex items-center gap-3 shadow-xl active:scale-95">
            <ArrowRightLeft className="w-4 h-4" /> Nova Transferência
          </button>
          <button onClick={() => setModalOpen('isImportarCSVOpen', true)} className="px-6 h-12 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-black transition-all flex items-center gap-3 shadow-xl active:scale-95">
            <Upload className="w-4 h-4" /> Importar Extrato
          </button>
        </div>
      </header>

      {(!role || role !== 'master') && (
        <div className="bg-neutral-100 border-2 border-neutral-200 p-4 rounded-3xl flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-neutral-400" />
          <p className="text-[10px] font-black text-secondary uppercase tracking-widest">
            Nota de Governança: A conciliação bancária impacta o <span className="text-primary">Saldo Operacional</span>. A liquidação definitiva no Saldo Real é exclusiva do nível Master.
          </p>
        </div>
      )}

      {/* Fechamento formal da competência */}
      <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <p className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Fechamento da competência</p>
              <p className="text-[9px] font-bold text-neutral-400 uppercase mt-0.5">
                {selectedMonth} • {contas.find(conta => conta.id === selectedContaId)?.nome || 'Selecione uma conta'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${
              fechamentoAtual?.status === 'aguardando_master' ? 'bg-amber-50 text-amber-700' :
              fechamentoAtual?.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' :
              fechamentoAtual?.status === 'reprovado' ? 'bg-red-50 text-red-700' :
              'bg-neutral-100 text-neutral-500'
            }`}>
              {fechamentoAtual?.status === 'aguardando_master' ? 'Aguardando Master' :
                fechamentoAtual?.status === 'aprovado' ? 'Aprovado' :
                fechamentoAtual?.status === 'reprovado' ? 'Reprovado' : 'Aberto'}
            </span>
            {(!fechamentoAtual || fechamentoAtual.status === 'aberto' || fechamentoAtual.status === 'reprovado') && (
              <button
                onClick={handleFecharPeriodo}
                disabled={!selectedContaId || !selectedMonth || fechamentoBusy}
                className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFechandoPeriodo ? 'Validando...' : 'Solicitar fechamento'}
              </button>
            )}
          </div>
        </div>
        {fechamentoAtual?.status === 'reprovado' && fechamentoAtual.motivo_reprovacao && (
          <p className="text-[9px] font-bold text-red-600 uppercase tracking-widest">Motivo: {fechamentoAtual.motivo_reprovacao}</p>
        )}
        {role === 'master' && fechamentosAguardandoMaster.length > 0 && (
          <div className="border-t border-neutral-100 pt-3 space-y-2">
            <p className="text-[9px] font-black text-primary uppercase tracking-widest">Fechamentos aguardando decisão</p>
            {fechamentosAguardandoMaster.map(fechamento => (
              <div key={fechamento.id} className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-3 py-2 rounded-xl">
                <div className="text-[9px] font-bold text-neutral-600 uppercase">
                  {contas.find(conta => conta.id === fechamento.conta_bancaria_id)?.nome || 'Conta'} • {fechamento.periodo_inicio.slice(0, 7)} • {valueFormatter(Number(fechamento.total_extrato))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecidirFechamento(fechamento.id, false)}
                    disabled={fechamentoBusy}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reprovar
                  </button>
                  <button
                    onClick={() => handleDecidirFechamento(fechamento.id, true)}
                    disabled={fechamentoBusy}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDecidindoFechamento ? 'Processando...' : 'Aprovar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {role === 'master' && transferenciasPendentesMaster.length > 0 && (
        <div className="bg-white border-2 border-amber-100 p-4 rounded-3xl shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Transferências aguardando Master</p>
                <p className="text-[9px] font-bold text-neutral-400 uppercase">Origem e destino já estão vinculados; falta a decisão final.</p>
              </div>
            </div>
            <span className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest">{transferenciasPendentesMaster.length} pendente(s)</span>
          </div>
          <div className="space-y-2">
            {transferenciasPendentesMaster.map(transferencia => (
              <div key={transferencia.id} className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-3 py-2 rounded-xl">
                <div className="text-[9px] font-bold text-neutral-600 uppercase">
                  {contas.find(conta => conta.id === transferencia.conta_origem_id)?.nome || 'Origem'} → {contas.find(conta => conta.id === transferencia.conta_destino_id)?.nome || 'Destino'} • {valueFormatter(Number(transferencia.valor))} • {transferencia.data_transferencia.split('-').reverse().join('/')}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecidirTransferencia(transferencia.id, false)}
                    disabled={isDecidingTransferencia}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reprovar
                  </button>
                  <button
                    onClick={() => handleDecidirTransferencia(transferencia.id, true)}
                    disabled={isDecidingTransferencia}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Aprovar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbox de Lote */}
      {bankStatements.some(tx => !tx.status_conciliacao) && (
        <div className="bg-primary/5 border-2 border-primary/10 p-4 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-primary" />
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">
              Existem {bankStatements.filter(tx => !tx.status_conciliacao).length} transações aguardando conciliação neste período.
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
              const suggestionsForTx = tx.valor > 0 ? transferSuggestions : originTransferSuggestions;
              const suggestionSide = tx.valor > 0 ? 'destino' as const : 'origem' as const;
              return (
              <motion.div
                layout
                key={tx.id} 
                onClick={() => {
                  if (!tx.status_conciliacao) {
                    setSelectedTransacaoForConciliationId(tx.id);
                    setSelectedLancamentoIds([]);
                  }
                }}
                className={`p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                  tx.status_conciliacao 
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
                  {tx.status_conciliacao ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnlink(tx.conciliation!.id); }}
                      className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"
                      title="Desvincular"
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                  ) : selectedTransacaoForConciliationId === tx.id ? (
                    <div className="flex flex-col items-end gap-2">
                      {suggestionsForTx.length > 0 && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600">
                            {isLoadingTransferSuggestions && tx.valor > 0 ? 'Buscando transferência...' : 'Sugestão de transferência'}
                          </span>
                          {suggestionsForTx.map(suggestion => (
                            <button
                              key={suggestion.id}
                              type="button"
                              disabled={isReconcilingTransferencia}
                              onClick={(event) => { event.stopPropagation(); void handleConfirmTransferSuggestion(suggestion.id, suggestionSide); }}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[8px] font-black uppercase tracking-wide text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Confirmar {suggestion.conta_origem_nome || 'transferência'} • {valueFormatter(suggestion.valor)}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
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
                <p className="text-xs font-black uppercase tracking-widest max-w-[200px]">Período totalmente conciliado no ERP</p>
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
                            <Zap className="w-2.5 h-2.5 fill-current" /> Smart Match
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {l.data_vencimento.split('-').reverse().join('/')}
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
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleImportCancel} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleImportCSVSubmit} className="bg-white w-full max-w-[600px] rounded-[40px] shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-10 py-8 border-b bg-neutral-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter">Motor de Importação</h2>
                  <p className="text-[10px] text-primary uppercase font-black tracking-widest mt-1">Transforme arquivos brutos em inteligência financeira</p>
                </div>
                <button type="button" onClick={handleImportCancel} className="p-3 hover:bg-neutral-200 rounded-2xl transition-all">
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
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Direcionador (somente CSV/XLSX)</label>
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
                    <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && void processFile(e.target.files[0])} accept=".csv,.xlsx,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" />
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
                      {importPreview.pendingReviews && importPreview.pendingReviews.length > 0 && (
                        <div className="border-2 border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{importPreview.pendingReviews.length} item(ns) pendente(s) de revisão — não serão importados</p>
                          {importPreview.pendingReviews.slice(0, 8).map((pending, index) => (
                            <p key={`${pending.pagina_origem}-${pending.linha_origem}-${index}`} className="text-[9px] font-bold text-amber-900 uppercase">
                              Página {pending.pagina_origem || '—'} • linha {pending.linha_origem || '—'}: {pending.motivos.join('; ')}
                            </p>
                          ))}
                          {importPreview.pendingReviews.length > 8 && <p className="text-[9px] font-black text-amber-800 uppercase">Mais {importPreview.pendingReviews.length - 8} pendência(s).</p>}
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
                        <div className="border-2 border-amber-200 bg-amber-50 rounded-3xl p-4 space-y-2">
                          {[...(importPreview.pendingReviews || []).map((pending, index) => <p key={`review-${index}`} className="text-[9px] font-bold text-amber-900 uppercase">Página {pending.pagina_origem || '—'} • linha {pending.linha_origem || '—'}: {pending.motivos.join('; ')} • {pending.trecho}</p>), ...importPreview.consistency.criticalErrors.map(issue => <p key={`${issue.code}-${issue.transactionIndex ?? 'lote'}`} className="text-[9px] font-bold text-red-900 uppercase">{issue.message}</p>)]}
                          {!importPreview.pendingReviews?.length && !importPreview.consistency.criticalErrors.length && <p className="text-[9px] font-black text-emerald-700 uppercase">Nenhuma pendência de revisão.</p>}
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

              <footer className="px-10 py-8 border-t bg-neutral-50/50 flex justify-end gap-4 shrink-0">
                {importError && <p className="mr-auto max-w-[280px] text-[10px] font-black text-red-500 uppercase">{importError}</p>}
                <button type="button" onClick={handleImportCancel} className="px-8 text-[10px] font-black uppercase text-neutral-400 tracking-widest hover:text-neutral-900 transition-colors">Cancelar</button>
                <Button type="submit" disabled={!importPreview || isPreparingImport || isConfirmingImport || Boolean(importPreview?.pendingReviews?.length) || Boolean(importPreview?.consistency.criticalErrors.length) || ((importPreview?.fileType === 'csv' || importPreview?.fileType === 'xlsx') && (!columnMapping.data || !columnMapping.valor || !columnMapping.descricao))}>
                  {isPreparingImport || isConfirmingImport ? 'Processando...' : importPreview?.consistency.criticalErrors.length || importPreview?.pendingReviews?.length ? 'Resolva as pendências' : 'Confirmar Importação'}
                </Button>
              </footer>
            </motion.form>
          </div>
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
                        <tr className="border-b border-primary/10"><td className="py-2 pr-3">Valor (centavos)</td><td className="py-2 font-mono">{Math.round(Number(selectedTxForWorkspace.valor.toFixed(2)) * 100)}¢</td><td className="py-2 font-mono">{selectedLancsForWorkspace.reduce((sum, lanc) => sum + Math.round(Number((lanc.tipo === 'saida' ? -Math.abs(lanc.valor_previsto) : Math.abs(lanc.valor_previsto)).toFixed(2)) * 100), 0)}¢</td></tr>
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
                  <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Diferença Residual</span>
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
                  <label className="text-[10px] font-black uppercase text-red-400 tracking-widest block">Valor Residual a Justificar</label>
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
      <TransferenciaBancariaModal
        isOpen={isTransferenciaBancariaOpen}
        contas={contas}
        onClose={() => setModalOpen('isTransferenciaBancariaOpen', false)}
      />
    </div>
  );
}