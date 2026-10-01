import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  Plus,
  MoreVertical,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  History,
  Trash2,
  Edit,
  Receipt,
  Coins,
  XCircle,
  CreditCard,
  Repeat,
  Paperclip
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLancamentos, useContas, useEntidades, useCategorias, useUsuarios, useCentrosCusto, useCategoriasAjuste, useContasSaldos, useConciliacao } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { useDragScroll } from '../hooks/useDragScroll';
import { LancamentoFinanceiro } from '../types';
import { calculateAdjustmentAmount, calculateFinalAmount } from '../utils/adjustments';
import AccountFilterCards from '../components/Lancamentos/AccountFilterCards';
import LancamentosHeader from '../components/Lancamentos/LancamentosHeader';
import LancamentosFilters from '../components/Lancamentos/LancamentosFilters';
import LancamentoActionMenu from '../components/Lancamentos/LancamentoActionMenu';
import LancamentosPrintReport from '../components/Lancamentos/LancamentosPrintReport';
import LogsCompletoModal from '../components/Lancamentos/LogsCompletoModal';
import LancamentosPagination from '../components/Lancamentos/LancamentosPagination';

interface LancamentosProps {
  typeOverride?: 'entrada' | 'saida';
  titleOverride?: string;
  statusPagamentoOverride?: 'aberto' | 'pago' | 'pago_parcial' | 'bpi';
  statusAprovacaoOverride?: string;
  initialTypeFilter?: 'all' | 'entrada' | 'saida';
  initialStatusPagamento?: 'all' | 'aberto' | 'pago' | 'pago_parcial' | 'bpi' | 'quitação_pendente';
}

export default function Lancamentos({
  typeOverride,
  titleOverride,
  statusPagamentoOverride,
  statusAprovacaoOverride,
  initialTypeFilter,
  initialStatusPagamento
}: LancamentosProps) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const {
    setModalOpen,
    setSelectedLancamentoIdForModal,
    selectedLancamentoIdsForBatch,
    setSelectedLancamentoIdsForBatch,
    setActiveTab,
    isAprovacaoModalOpen
  } = useUIStore();

  const dragScrollTabs = useDragScroll();
  const tableScroll = useDragScroll();
  const mainTableRef = useRef<HTMLTableElement>(null);
  const mirrorScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [searchParams] = useSearchParams();

  const isMaster = role === 'master';
  const isColaborador = role === 'colaborador';
  const { conciliacoes = [] } = useConciliacao();
  const isFinanceiroView = !typeOverride && !titleOverride;
  const isOperationalView = !!typeOverride;

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [docSearchTerm, setDocSearchTerm] = useState('');

  useEffect(() => {
    if (searchTerm.length < 3) {
      setDebouncedSearchTerm('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  // Preset state
  const [datePreset, setDatePreset] = useState<'15' | '30' | '90' | 'custom'>('15');
  const [dateDirection, setDateDirection] = useState<'past' | 'future' | 'both'>('past');
  const [dateFilterActive, setDateFilterActive] = useState(!isFinanceiroView && !isOperationalView);

  // Search & Period States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const handlePresetChange = (preset: '15' | '30' | '90' | 'custom', direction: 'past' | 'future' | 'both' = dateDirection) => {
    setDatePreset(preset);
    setDateFilterActive(true);
    if (preset !== 'custom') {
      const today = new Date();
      const start = new Date();
      const end = new Date();

      if (direction === 'future') {
        start.setDate(today.getDate() + 1);
        end.setDate(today.getDate() + parseInt(preset));
      } else if (direction === 'both') {
        start.setDate(today.getDate() - parseInt(preset));
        end.setDate(today.getDate() + parseInt(preset));
      } else {
        start.setDate(today.getDate() - parseInt(preset));
        end.setDate(today.getDate());
      }

      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  const handleDateDirectionChange = (direction: 'past' | 'future' | 'both') => {
    setDateDirection(direction);
    if (datePreset !== 'custom') {
      handlePresetChange(datePreset, direction);
    }
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<50 | 100 | 'all'>(50);

  // Advanced Filters
  const defaultStatusPagamento = initialStatusPagamento || statusPagamentoOverride || 'all';
  const defaultTypeFilter = initialTypeFilter || typeOverride || 'all';
  const [approvalStatus, setApprovalStatus] = useState('all');
  const [statusPagamento, setStatusPagamento] = useState<string[]>(defaultStatusPagamento === 'all' ? [] : [defaultStatusPagamento]);
  const [typeFilter, setTypeFilter] = useState<string[]>(defaultTypeFilter === 'all' ? [] : [defaultTypeFilter]);

  // Sincronizar o estado interno com as propriedades da rota ao navegar
  useEffect(() => {
    const nextStatus = initialStatusPagamento || statusPagamentoOverride || 'all';
    const nextType = initialTypeFilter || typeOverride || 'all';
    setStatusPagamento(nextStatus === 'all' ? [] : [nextStatus]);
    setTypeFilter(nextType === 'all' ? [] : [nextType]);
    setDateFilterActive(!isFinanceiroView && !isOperationalView);
    setSelectedLancamentoIdsForBatch([]);
  }, [initialStatusPagamento, initialTypeFilter, statusPagamentoOverride, typeOverride, titleOverride, isFinanceiroView]);

  const [authorIdFilter, setAuthorIdIdFilter] = useState<string[]>([]);

  const [categoryIdFilter, setCategoryIdFilter] = useState<string[]>([]);
  const [contaIdFilter, setContaIdFilter] = useState<string[]>([]);
  const [centroCustoIdFilter, setCentroCustoIdFilter] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [condicaoFilter, setCondicaoFilter] = useState('all');
  const [temDescontoFilter, setTemDescontoFilter] = useState('all');
  const [temAcrescimoFilter, setTemAcrescimoFilter] = useState('all');
  const [motivoDescontoFilter, setMotivoDescontoFilter] = useState('all');
  const [motivoAcrescimoFilter, setMotivoAcrescimoFilter] = useState('all');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);

  const selectionDiffersFromDefault = (selection: string[], defaultValue: string) => {
    const normalizedSelection = selection.filter(value => value !== 'all' && value !== '');
    const normalizedDefault = defaultValue === 'all' || defaultValue === '' ? [] : [defaultValue];
    return normalizedSelection.length !== normalizedDefault.length || normalizedSelection.some((value, index) => value !== normalizedDefault[index]);
  };

  const hasActiveFilters = debouncedSearchTerm !== '' || docSearchTerm !== '' || approvalStatus !== 'all' || selectionDiffersFromDefault(statusPagamento, defaultStatusPagamento) || selectionDiffersFromDefault(typeFilter, defaultTypeFilter) || authorIdFilter.length > 0 || categoryIdFilter.length > 0 || contaIdFilter.length > 0 || centroCustoIdFilter.length > 0 || condicaoFilter !== 'all' || temDescontoFilter !== 'all' || temAcrescimoFilter !== 'all' || motivoDescontoFilter !== 'all' || motivoAcrescimoFilter !== 'all';

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedLogItem, setSelectedLogItem] = useState<LancamentoFinanceiro | null>(null);

  const {
    data: allLancamentos = [],
    totalCount = 0,
    batchApprove,
    estornarLancamento,
    deleteLancamento,
    isBatchApproving,
    isLoading,
    isError
  } = useLancamentos({
    searchTerm: debouncedSearchTerm,
    docCode: parseInt(docSearchTerm.split('-')[0]) || undefined,
    docParcel: parseInt(docSearchTerm.split('-')[1]) || undefined,
    startDate: dateFilterActive ? startDate : undefined,
    endDate: dateFilterActive ? endDate : undefined,
    approvalStatus: isOperationalView ? statusAprovacaoOverride : approvalStatus,
    financialStatus: isFinanceiroView ? statusPagamento : undefined,
    statusPagamento: statusPagamento.length === 0 && !isFinanceiroView && !isOperationalView && isColaborador ? ['quitação_pendente'] : isFinanceiroView ? [] : statusPagamento,
    type: typeFilter,
    operationalView: isOperationalView,
    authorId: isColaborador ? useUIStore.getState().currentUserId : authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: contaIdFilter,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    isFinanceiroView,
    page: currentPage,
    pageSize: pageSize === 'all' ? undefined : pageSize
  });

  // Sync scroll between mirror and table
  useEffect(() => {
    const table = tableScroll.ref.current;
    const mainTable = mainTableRef.current;
    const mirror = mirrorScrollRef.current;
    if (!table || !mainTable || !mirror) return;

    const handleTableScroll = () => {
      if (Math.abs(mirror.scrollLeft - table.scrollLeft) > 1) {
        mirror.scrollLeft = table.scrollLeft;
      }
    };

    const handleMirrorScroll = () => {
      if (Math.abs(table.scrollLeft - mirror.scrollLeft) > 1) {
        table.scrollLeft = mirror.scrollLeft;
      }
    };

    let frameId: number | null = null;
    const measureTable = () => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const headerCells = Array.from(mainTable.querySelectorAll('thead th')) as HTMLTableCellElement[];
        const widths = headerCells.map(cell => cell.getBoundingClientRect().width);

        if (widths.length > 0) {
          setColumnWidths(previousWidths => {
            const widthsUnchanged = previousWidths.length === widths.length && previousWidths.every((width, index) => width === widths[index]);
            return widthsUnchanged ? previousWidths : widths;
          });
        }
        setTableWidth(table.scrollWidth);
      });
    };

    table.addEventListener('scroll', handleTableScroll);
    mirror.addEventListener('scroll', handleMirrorScroll);

    // Initial width and column measurements
    measureTable();

    const observer = new ResizeObserver(measureTable);
    observer.observe(table);
    observer.observe(mainTable);

    return () => {
      table.removeEventListener('scroll', handleTableScroll);
      mirror.removeEventListener('scroll', handleMirrorScroll);
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [allLancamentos, typeOverride, tableScroll.ref]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(Math.ceil(totalCount / pageSize), 1);

  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: usuarios = [] } = useUsuarios();
  const { data: rawContas = [] } = useContas();
  const { data: centrosCusto = [] } = useCentrosCusto();
  const { categoriasAjuste = [] } = useCategoriasAjuste();

  const activeContas = useMemo(() => rawContas.filter((c: any) => c.status !== 'excluido'), [rawContas]);

  useEffect(() => {
    const lancamentoId = searchParams.get('id');
    if (lancamentoId) {
      setSelectedLancamentoIdForModal(lancamentoId);
      setModalOpen('isComprovanteOpen', true);
    }
  }, [searchParams, setSelectedLancamentoIdForModal, setModalOpen]);

  const filteredLancamentos = useMemo(() => {
    return allLancamentos.filter(l => selectedAccountIds.length === 0 || selectedAccountIds.includes(l.conta_bancaria_id));
  }, [allLancamentos, selectedAccountIds]);

  const resolvedFinanceiroContaIds = useMemo(() => {
    if (selectedAccountIds.length === 0) return contaIdFilter;
    if (contaIdFilter.length === 0) return selectedAccountIds;
    const matchingAccountIds = selectedAccountIds.filter(id => contaIdFilter.includes(id));
    return matchingAccountIds.length > 0 ? matchingAccountIds : ['00000000-0000-0000-0000-000000000000'];
  }, [contaIdFilter, selectedAccountIds]);

  const financeiroStatusFilters = useMemo(() => ({
    searchTerm: debouncedSearchTerm,
    docCode: parseInt(docSearchTerm.split('-')[0]) || undefined,
    docParcel: parseInt(docSearchTerm.split('-')[1]) || undefined,
    startDate: dateFilterActive ? startDate : undefined,
    endDate: dateFilterActive ? endDate : undefined,
    approvalStatus,
    type: typeFilter,
    authorId: isColaborador ? useUIStore.getState().currentUserId : authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: resolvedFinanceiroContaIds,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    isFinanceiroView: true
  }), [approvalStatus, authorIdFilter, categoryIdFilter, centroCustoIdFilter, condicaoFilter, dateFilterActive, debouncedSearchTerm, docSearchTerm, endDate, isColaborador, motivoAcrescimoFilter, motivoDescontoFilter, resolvedFinanceiroContaIds, startDate, temAcrescimoFilter, temDescontoFilter, typeFilter]);

  const valueFormatter = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getValorLiquido = (item: LancamentoFinanceiro): number => {
    if ((item.status_pagamento === 'pago' || item.status_pagamento === 'pago_parcial') && item.valor_recebido) {
      return item.valor_recebido;
    }
    return calculateFinalAmount({
      original: item.valor_previsto,
      discount: item.desconto_valor,
      discountType: item.desconto_tipo,
      increase: item.acrescimo_valor,
      increaseType: item.acrescimo_tipo,
    });
  };

  const getSaldoAPagar = (item: LancamentoFinanceiro): number => {
    const valorAjustado = calculateFinalAmount({
      original: item.valor_previsto,
      discount: item.desconto_valor,
      discountType: item.desconto_tipo,
      increase: item.acrescimo_valor,
      increaseType: item.acrescimo_tipo,
    });
    const valorPago = Number(item.valor_recebido) || 0;
    return Math.max(0, valorAjustado - valorPago);
  };

  const hasAjuste = (item: LancamentoFinanceiro): boolean => {
    const desconto = Number((item as any).desconto_valor) || 0;
    const acrescimo = Number((item as any).acrescimo_valor) || 0;
    return desconto > 0 || acrescimo > 0;
  };

  const renderObservacoes = (item: LancamentoFinanceiro) => {
    if (!item.observacoes) return null;

    return (
      <div className="max-w-[240px]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedLogItem(item);
          }}
          className="mt-1 text-[8px] font-black uppercase tracking-widest text-primary hover:underline"
        >
          Ver logs completo
        </button>
      </div>
    );
  };

  const clearFiltersShortcut = () => {
    setSearchTerm('');
    setDocSearchTerm('');
    setApprovalStatus('all');
    setStatusPagamento(defaultStatusPagamento === 'all' ? [] : [defaultStatusPagamento]);
    setTypeFilter(defaultTypeFilter === 'all' ? [] : [defaultTypeFilter]);
    setAuthorIdIdFilter([]);
    setCategoryIdFilter([]);
    setContaIdFilter([]);
    setCentroCustoIdFilter([]);
    setCondicaoFilter('all');
    setTemDescontoFilter('all');
    setTemAcrescimoFilter('all');
    setMotivoDescontoFilter('all');
    setMotivoAcrescimoFilter('all');
    setSelectedLancamentoIdsForBatch([]);
    setSelectedAccountIds([]);
    setDateDirection('past');

    handlePresetChange('15', 'past');
    if (isFinanceiroView || isOperationalView) setDateFilterActive(false);
    setCurrentPage(1);
  };

  const toggleSelectAll = () => {
    if (!isMaster) return;
    if (selectedLancamentoIdsForBatch.length === filteredLancamentos.length) {
      setSelectedLancamentoIdsForBatch([]);
    } else {
      setSelectedLancamentoIdsForBatch(filteredLancamentos.map(l => l.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (!isMaster) return;
    setSelectedLancamentoIdsForBatch(
      selectedLancamentoIdsForBatch.includes(id)
        ? selectedLancamentoIdsForBatch.filter(i => i !== id)
        : [...selectedLancamentoIdsForBatch, id]
    );
  };

  const handleBatchApprove = () => {
    if (!isMaster) return;
    const eligibleIds = filteredLancamentos
      .filter(item => selectedLancamentoIdsForBatch.includes(item.id))
      .filter(item => (item.status_aprovacao !== 'confirmado_master' || item.status_pagamento === 'quitação_pendente') && item.status_pagamento !== 'bpi')
      .filter(item => !item.ja_recebido || conciliacoes.some(conciliacao => conciliacao.lancamento_id === item.id))
      .map(item => item.id);
    if (eligibleIds.length === 0) return;
    setSelectedLancamentoIdsForBatch(eligibleIds);
    setModalOpen('isAprovacaoModalOpen', true);
  };

  const handleOpenBaixa = (id: string) => {
    setSelectedLancamentoIdForModal(id);
    setModalOpen('isComprovanteOpen', false);
    setModalOpen('isBaixaLancamentoOpen', true);
    setActiveMenuId(null);
  };

  const handleEstornar = async (id: string) => {
    if (!isMaster) return;
    if (confirm('Deseja estornar este lançamento? O saldo bancário será restaurado.')) {
      try {
        await estornarLancamento(id);
        setActiveMenuId(null);
      } catch (err) { alert('Erro ao estornar'); }
    }
  };

  const handleEdit = (l: LancamentoFinanceiro) => {
    setSelectedLancamentoIdForModal(l.id);
    setModalOpen('isNovoLancamentoOpen', true);
    setActiveMenuId(null);
  };

  const handleDelete = async (id: string) => {
    if (!isMaster) return;
    if (confirm('Excluir este lançamento permanentemente?')) {
      try {
        await deleteLancamento({ id });
        setActiveMenuId(null);
      } catch (err) { alert('Erro ao excluir'); }
    }
  };

  const { data: contasSaldos = [] } = useContasSaldos();

  const accountCardsData = useMemo(() => {
    return activeContas.map(acc => {
      const saldoObj = contasSaldos.find(s => s.conta_id === acc.id);
      return {
        ...acc,
        auditadoBalance: saldoObj ? Number(saldoObj.saldo_confirmado) : (acc.saldo_inicial || 0),
        operacionalBalance: saldoObj ? Number(saldoObj.saldo_operacional) : (acc.saldo_inicial || 0)
      };
    });
  }, [activeContas, contasSaldos]);

  const selectedPrintLancamentos = filteredLancamentos.filter(item => selectedLancamentoIdsForBatch.includes(item.id));
  const selectedOperationalLancamentos = isOperationalView ? selectedPrintLancamentos : [];
  const operationalDocumentCodes = new Set<number>();
  const operationalTotals = selectedOperationalLancamentos.reduce(
    (totals, item) => {
      const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
      const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
      const valorPago = item.valor_recebido || 0;
      const hasDocumentCode = item.codigo_sequencial != null;

      if (!hasDocumentCode || !operationalDocumentCodes.has(item.codigo_sequencial)) {
        totals.valorDocOriginal += item.valor_original || item.valor_previsto;
        if (hasDocumentCode) operationalDocumentCodes.add(item.codigo_sequencial);
      }
      totals.valorParcOriginal += item.valor_previsto;
      totals.desconto += desconto;
      totals.acrescimo += acrescimo;
      totals.valorPago += valorPago;
      totals.aPagar += getSaldoAPagar(item);
      return totals;
    },
    { valorDocOriginal: 0, valorParcOriginal: 0, desconto: 0, acrescimo: 0, valorPago: 0, aPagar: 0 }
  );
  const printTotals = selectedPrintLancamentos.reduce(
    (totals, item) => {
      const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
      const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
      const valorPago = item.valor_recebido || 0;
      const liquido = getValorLiquido(item);

      totals.valorPrevisto += item.valor_previsto;
      totals.desconto += desconto;
      totals.acrescimo += acrescimo;
      totals.valorPago += valorPago;
      totals.liquido += liquido;
      totals.aPagar += getSaldoAPagar(item);
      if (item.tipo === 'entrada') totals.entradas += liquido;
      if (item.tipo === 'saida') totals.saidas += liquido;
      return totals;
    },
    { valorPrevisto: 0, desconto: 0, acrescimo: 0, valorPago: 0, liquido: 0, aPagar: 0, entradas: 0, saidas: 0 }
  );

  const mirrorColumnCount = isOperationalView ? 15 : 11;
  const hasMeasuredMirrorColumns = columnWidths.length === mirrorColumnCount;
  const mirrorGridWidth = hasMeasuredMirrorColumns
    ? `${columnWidths.reduce((total, width) => total + width, 0)}px`
    : `${Math.max(tableWidth, 1200)}px`;
  const mirrorGridTemplateColumns = hasMeasuredMirrorColumns
    ? columnWidths.map(width => `${width}px`).join(' ')
    : `repeat(${mirrorColumnCount}, minmax(0, 1fr))`;

  const formatPrintDate = (dateStr: string | null | undefined) => dateStr ? dateStr.slice(0, 10).split('-').reverse().join('/') : '-';
  const isPartialPayment = (item: LancamentoFinanceiro) => item.status_pagamento === 'pago_parcial';
  const getPrintStatus = (item: LancamentoFinanceiro) => {
    if (item.status_pagamento === 'pago') return 'Liquidado, Pago';
    if (isPartialPayment(item)) return 'Pago Parcial';
    if (item.status_pagamento === 'quitação_pendente') return 'Pendente de confirmação do Master';
    if (item.status_pagamento === 'bpi') return 'BPI';
    return item.status_aprovacao === 'reprovado' ? 'Reprovado' : 'Em aberto';
  };
  const handlePrintSelected = () => {
    if (selectedLancamentoIdsForBatch.length === 0 || selectedPrintLancamentos.length === 0) return;

    document.body.classList.add('printing-lancamentos-report');
    const cleanupPrintMode = () => document.body.classList.remove('printing-lancamentos-report');
    window.addEventListener('afterprint', cleanupPrintMode, { once: true });
    window.print();
  };

  const getDaysOverdue = (dateStr: string): number => {
    if (!dateStr) return -1;
    const today = new Date();
    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    const dueAtMidnight = new Date(year, month - 1, day);
    const diffTime = todayAtMidnight.getTime() - dueAtMidnight.getTime();
    return Math.floor(diffTime / (1000 * 3600 * 24));
  };

  const renderStatusBadge = (item: LancamentoFinanceiro) => {
   if (isFinanceiroView && item.status_aprovacao !== 'confirmado_master') {
     return (
       <span
         title={item.status_pagamento === 'quitação_pendente' ? 'Pendente de confirmação do Master' : undefined}
         aria-label={item.status_pagamento === 'quitação_pendente' ? 'Pendente de confirmação do Master' : undefined}
         className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse"
       >
         {item.status_pagamento === 'quitação_pendente' ? 'Pendente' : 'Pend. Gestor'}
       </span>
     );
   }
   if (item.status_pagamento === 'bpi') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-neutral-900 text-white font-black border border-neutral-950 text-[9px] uppercase tracking-tighter">
         BPI
       </span>
     );
   }
   if (item.status_aprovacao === 'confirmado_master' && item.status_pagamento === 'pago') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-50 text-bank-truth-green font-black border border-emerald-200 text-[9px] uppercase tracking-tighter">
         Confirmado
       </span>
     );
   }
   if (item.status_pagamento === 'pago') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-50 text-bank-truth-green font-black border border-emerald-200 text-[9px] uppercase tracking-tighter">
         Liquidado, Pago
       </span>
     );
   }
   if (isPartialPayment(item)) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Pago Parcial
       </span>
     );
   }
   const days = getDaysOverdue(item.data_vencimento);
   if (days > 0) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-red-50 text-alert-red font-black border border-red-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Vencido
       </span>
     );
   }
   if (item.status_pagamento === 'quitação_pendente') {
     return (
       <span
         title="Pendente de confirmação do Master"
         aria-label="Pendente de confirmação do Master"
         className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse"
       >
         Pendente
       </span>
     );
   }
   if (item.status_aprovacao === 'reprovado') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-red-50 text-alert-red font-black border border-red-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Reprovado
       </span>
     );
   }

   if (days === 0) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-100 text-orange-700 font-black border-2 border-orange-400 text-[9px] uppercase tracking-tighter animate-bounce">
         Vence Hoje
       </span>
     );
   } else {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold border border-blue-200 text-[9px] uppercase tracking-tighter">
         A Vencer
       </span>
     );
   }
 };

  const renderBancoCell = (item: LancamentoFinanceiro) => {
    const conta = activeContas.find(account => account.id === item.conta_bancaria_id);
    const bankName = conta?.nome_banco || conta?.nome || 'Conta bancária não identificada';

    return (
      <td className="py-3 px-4 text-center" title={bankName} aria-label={bankName}>
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 text-neutral-500" title={bankName} aria-label={bankName}>
          {conta?.logo_url ? (
            <img src={conta.logo_url} alt={bankName} title={bankName} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <CreditCard className="w-4 h-4" aria-hidden="true" />
          )}
        </span>
      </td>
    );
  };

  return (
    <div className="lancamentos-page space-y-6 animate-fade-in" onClick={() => setActiveMenuId(null)}>
      
      <AccountFilterCards
        accounts={accountCardsData}
        selectedIds={selectedAccountIds}
        onSelect={setSelectedAccountIds}
        dragScrollProps={dragScrollTabs.props}
        dragScrollRef={dragScrollTabs.ref}
        valueFormatter={valueFormatter}
      />

      <LancamentosHeader
        titleOverride={titleOverride}
        isFinanceiroView={isFinanceiroView}
        isMaster={isMaster}
        selectedCount={selectedLancamentoIdsForBatch.length}
        selectedPrintCount={selectedPrintLancamentos.length}
        handlePrintSelected={handlePrintSelected}
        onNavigateToMaster={() => navigate('/aprovacao-master')}
      />

      <LancamentosFilters
        isFilterPanelOpen={isFilterPanelOpen}
        setIsFilterPanelOpen={setIsFilterPanelOpen}
        hasActiveFilters={hasActiveFilters}
        clearFiltersShortcut={clearFiltersShortcut}
        typeOverride={typeOverride}
        isFinanceiroView={isFinanceiroView}
        isOperationalView={isOperationalView}
        role={role}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        statusPagamento={statusPagamento}
        setStatusPagamento={setStatusPagamento}
        financeiroStatusFilters={financeiroStatusFilters}
        authorIdFilter={authorIdFilter}
        setAuthorIdIdFilter={setAuthorIdIdFilter}
        categoryIdFilter={categoryIdFilter}
        setCategoryIdFilter={setCategoryIdFilter}
        contaIdFilter={contaIdFilter}
        setContaIdFilter={setContaIdFilter}
        centroCustoIdFilter={centroCustoIdFilter}
        setCentroCustoIdFilter={setCentroCustoIdFilter}
        usuarios={usuarios}
        categorias={categorias}
        activeContas={activeContas}
        centrosCusto={centrosCusto}
        setCurrentPage={setCurrentPage}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        docSearchTerm={docSearchTerm}
        setDocSearchTerm={setDocSearchTerm}
        datePreset={datePreset}
        handleDateDirectionChange={handleDateDirectionChange}
        dateDirection={dateDirection}
        handlePresetChange={handlePresetChange}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        setDatePreset={setDatePreset}
        setDateFilterActive={setDateFilterActive}
        pageSize={pageSize}
        setPageSize={setPageSize}
        setSelectedLancamentoIdsForBatch={setSelectedLancamentoIdsForBatch}
      />

      <div className="bg-white border-2 border-neutral-100 rounded-[32px] shadow-sm relative">
        <div
          ref={tableScroll.ref}
          {...tableScroll.props}
          className="overflow-x-auto scrollbar-none select-none rounded-t-[32px]"
        >
          <table ref={mainTableRef} className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-neutral-50/50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest select-none">
                <th className="py-5 px-4 w-10 text-center">
                  {isMaster && (
                    <input
                      type="checkbox"
                      checked={filteredLancamentos.length > 0 && selectedLancamentoIdsForBatch.length === filteredLancamentos.length}
                      onChange={toggleSelectAll}
                      className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                    />
                  )}
                </th>

                <th className="py-5 px-4">Documento</th>
                {isOperationalView ? (
                  <>
                    <th className="py-5 px-4">{typeOverride === 'saida' ? 'Local / Fornecedor' : 'Local / Cliente'}</th>
                    <th className="py-5 px-4">Ven. Ref.</th>
                    <th className="py-5 px-4">Data Doc.</th>
                    <th className="py-5 px-4 text-right">Valor Doc. Original</th>
                    <th className="py-5 px-4 text-right">Valor Parc. Original</th>
                    <th className="py-5 px-4 text-right">Desconto</th>
                    <th className="py-5 px-4 text-right">Acréscimo</th>
                    <th className="py-5 px-4 text-right">Valor Pago</th>
                    <th className="py-5 px-4 text-right">A Pagar</th>
                    <th className="py-5 px-4 text-center">Status</th>
                    <th className="py-5 px-4 text-center">Banco</th>
                    <th className="py-5 px-3 text-center">Recibo</th>
                  </>
                ) : (
                  <>
                    <th className="py-5 px-4">Fluxo</th>
                    <th className="py-5 px-4">Entidade</th>
                    <th className="py-5 px-4">Vencimento</th>
                    <th className="py-5 px-4">Pagamento</th>
                    <th className="py-5 px-4 text-right">Valor</th>
                    <th className="py-5 px-4 text-center">Aprovação</th>
                    <th className="py-5 px-4 text-center">Banco</th>
                    <th className="py-5 px-3 text-center">Recibo</th>
                  </>
                )}
                <th className="py-5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-bold">
              {isLoading ? (
                <tr><td colSpan={isOperationalView ? 15 : 11} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-40"><Clock className="w-10 h-10 animate-spin text-primary" /><p className="font-black uppercase text-[10px] tracking-widest">Sincronizando registros...</p></div></td></tr>
              ) : isError ? (
                <tr><td colSpan={isOperationalView ? 15 : 11} className="py-24 text-center"><div className="flex flex-col items-center gap-3 text-alert-red"><AlertTriangle className="w-10 h-10" /><p className="font-black uppercase text-[10px] tracking-widest">Erro ao carregar dados. Tente simplificar a busca.</p></div></td></tr>
              ) : filteredLancamentos.length === 0 ? (
                <tr><td colSpan={isOperationalView ? 15 : 11} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-20"><Receipt className="w-12 h-12" /><p className="font-black uppercase text-[10px] tracking-widest">Nenhum lançamento localizado</p></div></td></tr>
              ) : (
                <>
                  {filteredLancamentos.map((item, idx) => {
                    const isSelected = selectedLancamentoIdsForBatch.includes(item.id);
                    const isAprovacaoPendente = (item.status_aprovacao !== 'confirmado_master' || item.status_pagamento === 'quitação_pendente') && item.status_pagamento !== 'bpi';
                    const days = getDaysOverdue(item.data_vencimento);

                    return (
                    <tr
                      key={`${item.id}-${idx}`}
                      onClick={() => {
                        setSelectedLancamentoIdForModal(item.id);
                        setModalOpen('isComprovanteOpen', true);
                      }}
                      className={`border-b border-neutral-50 hover:bg-neutral-50/50 transition-all cursor-pointer group ${isSelected ? 'bg-primary/5 border-primary/10' : ''}`}
                    >
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {isMaster && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(item.id)}
                            className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                          />
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-900 font-black uppercase text-[10px]">
                            {item.codigo_sequencial ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}
                          </span>
                          {item.numero_parcela && (
                            <span className="text-[9px] text-neutral-400 font-bold whitespace-nowrap">
                              (par {item.numero_parcela}/{item.quantidade_total_parcelas || '?'})
                            </span>
                          )}
                        </div>
                      </td>
                      {isOperationalView ? (
                        <>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-neutral-900 font-black uppercase tracking-tighter truncate max-w-[200px]">
                                  {entidades.find(e => e.id === item.entidade_id)?.nome_razao_social || 'N/A'}
                                </span>
                              </div>
                              {renderObservacoes(item)}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                            {item.data_vencimento.split('-').reverse().join('/')}
                            <br />
                            {item.status_pagamento === 'pago' || item.status_pagamento === 'bpi' ? (
                              <span className="text-neutral-300 font-normal">-</span>
                            ) : (
                              days > 0 ? (
                                <span className="text-alert-red font-black">{days} dia(s)</span>
                              ) : days === 0 ? (
                                <span className="text-alert-red font-black">Hoje</span>
                              ) : (
                                <span className="text-blue-600 font-black">{Math.abs(days)} dia(s)</span>
                              )
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono">
                            {item.data_emissao.split('-').reverse().join('/')}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(item.valor_original || item.valor_previsto)}
                          </td>
                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            {valueFormatter(item.valor_previsto)}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto))}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto))}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(item.valor_recebido || 0)}
                          </td>
                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            {valueFormatter(getSaldoAPagar(item))}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {renderStatusBadge(item)}
                          </td>
                          {renderBancoCell(item)}
                          <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLancamentoIdForModal(item.id);
                                setModalOpen('isComprovanteOpen', true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 text-primary transition-all inline-flex items-center justify-center gap-1"
                              title="Ver Comprovante e Recibo"
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.tipo === 'entrada' ? 'bg-emerald-50 text-bank-truth-green' : 'bg-red-50 text-alert-red'}`}>
                              {item.tipo === 'entrada' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-neutral-900 font-black uppercase tracking-tighter truncate max-w-[200px]">{entidades.find(e => e.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
                              </div>
                              {renderObservacoes(item)}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono">{item.data_vencimento.split('-').reverse().join('/')}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {item.status_pagamento === 'pago' ? (
                              <div className="flex flex-col">
                                <span className="text-bank-truth-green font-black text-[9px] uppercase">Liquidado, Pago</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : isPartialPayment(item) ? (
                              <div className="flex flex-col">
                                <span className="text-orange-600 font-black text-[9px] uppercase">Pago Parcial</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : item.status_pagamento === 'quitação_pendente' ? (
                              <div className="flex flex-col">
                                <span className="text-amber-600 font-black text-[9px] uppercase" title="Pendente de confirmação do Master" aria-label="Pendente de confirmação do Master">Pendente</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : item.status_pagamento === 'bpi' ? (
                              <div className="flex flex-col">
                                <span className="text-neutral-900 font-black text-[9px] uppercase">Baixa Inatividade</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.bpi_em?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : (
                              <span className="text-neutral-300 font-bold uppercase text-[9px] tracking-widest">Aguardando</span>
                            )}
                          </td>

                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            <span className="flex flex-col items-end">
                              {valueFormatter(getValorLiquido(item))}
                              {hasAjuste(item) && (
                                <span className="text-[8px] font-bold text-secondary uppercase tracking-wider mt-0.5">
                                  Prev: {valueFormatter(item.valor_previsto)}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {renderStatusBadge(item)}
                          </td>
                          {renderBancoCell(item)}
                          <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLancamentoIdForModal(item.id);
                                setModalOpen('isComprovanteOpen', true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 text-primary transition-all inline-flex items-center justify-center gap-1"
                              title="Ver Comprovante e Recibo"
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex items-center gap-1.5 mr-2">
                            {isFinanceiroView && isMaster && isAprovacaoPendente && (!item.ja_recebido || conciliacoes.some(conciliacao => conciliacao.lancamento_id === item.id)) && (
                              <button
                                type="button"
                                onClick={() => navigate('/aprovacao-master')}
                                className="px-3 py-1.5 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm"
                              >
                                <ShieldCheck className="w-3 h-3" /> Fila Master
                              </button>
                            )}
                            {isOperationalView && (item.status_pagamento === 'aberto' || isPartialPayment(item)) && (
                              item.ja_recebido === true ? (
                                <span
                                  className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5"
                                  title="Título sinalizado: a baixa ocorrerá pela conciliação bancária."
                                >
                                  <ShieldCheck className="w-3 h-3" /> Baixa pela conciliação
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenBaixa(item.id)}
                                  className="px-3 py-1.5 bg-bank-truth-green text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Dar baixa
                                </button>
                              )
                            )}
                          </div>

                          <LancamentoActionMenu
                            item={item}
                            isMaster={isMaster}
                            isActive={activeMenuId === item.id}
                            isOperationalView={isOperationalView}
                            onToggle={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                            onBaixa={handleOpenBaixa}
                            onEstornar={handleEstornar}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Floating Horizontal Scrollbar Mirror - Stays fixed at viewport bottom */}
        <div
          ref={mirrorScrollRef}
          className={
            selectedPrintLancamentos.length > 0
              ? 'sticky bottom-0 z-[60] overflow-x-auto scrollbar-thin bg-neutral-50 border-y-2 border-neutral-200 shadow-[0_-2px_6px_rgba(0,0,0,0.08)] flex min-h-[52px]'
              : 'sticky bottom-0 z-[60] overflow-x-auto scrollbar-thin bg-neutral-50/90 backdrop-blur-md border-y border-neutral-200 flex h-5'
          }
          style={{ marginBottom: '-1px' }}
        >
          {selectedPrintLancamentos.length > 0 ? (
            <div
              className="grid min-w-[1200px] shrink-0 text-left"
              style={{
                width: mirrorGridWidth,
                gridTemplateColumns: mirrorGridTemplateColumns
              }}
            >
              {isOperationalView ? (
                <>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 font-black uppercase tracking-widest text-neutral-900">TOTAL</div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.valorDocOriginal)}
                  </div>
                  <div className={`py-3 px-4 text-right font-black font-mono text-xs ${typeOverride === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                    {valueFormatter(operationalTotals.valorParcOriginal)}
                  </div>
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.desconto)}
                  </div>
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.acrescimo)}
                  </div>
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.valorPago)}
                  </div>
                  <div className={`py-3 px-4 text-right font-black font-mono text-xs ${typeOverride === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                    {valueFormatter(operationalTotals.aPagar)}
                  </div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-3" />
                  <div className="py-3 px-4" />
                </>
              ) : (
                <>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 font-black uppercase tracking-widest text-neutral-900">TOTAL</div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(printTotals.liquido)}
                  </div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-3" />
                  <div className="py-3 px-4" />
                </>
              )}
            </div>
          ) : (
            <div style={{ width: tableWidth, height: 1 }} className="shrink-0" />
          )}
        </div>

        <LancamentosPagination
          filteredCount={filteredLancamentos.length}
          totalCount={totalCount}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
        />
      </div>

      <LancamentosPrintReport
        titleOverride={titleOverride}
        isOperationalView={isOperationalView}
        operationalTotals={operationalTotals}
        printTotals={printTotals}
        selectedPrintLancamentos={selectedPrintLancamentos}
        formatPrintDate={formatPrintDate}
        getDaysOverdue={getDaysOverdue}
        getPrintStatus={getPrintStatus}
        getSaldoAPagar={getSaldoAPagar}
        getValorLiquido={getValorLiquido}
        valueFormatter={valueFormatter}
        entidades={entidades}
      />

      <LogsCompletoModal selectedLogItem={selectedLogItem} onClose={() => setSelectedLogItem(null)} />
    </div>
  );
}