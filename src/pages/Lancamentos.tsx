import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  Filter,
  Download,
  Plus,
  Search,
  MoreVertical,
  X,
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
  FileText,
  User,
  Tag,
  Coins,
  XCircle,
  CreditCard,
  Layers,
  Repeat,
  Paperclip
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLancamentos, useContas, useEntidades, useCategorias, useUsuarios, useCentrosCusto, useCategoriasAjuste, useContasSaldos } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { useDragScroll } from '../hooks/useDragScroll';
import { LancamentoFinanceiro } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import Button from '../components/Button';
import AccountFilterCards from '../components/Lancamentos/AccountFilterCards';
import LancamentoActionMenu from '../components/Lancamentos/LancamentoActionMenu';

interface LancamentosProps {
  typeOverride?: 'entrada' | 'saida';
  titleOverride?: string;
  statusPagamentoOverride?: 'aberto' | 'pago' | 'pago_parcial' | 'bpi';
  statusAprovacaoOverride?: string;
}

export default function Lancamentos({ 
  typeOverride, 
  titleOverride,
  statusPagamentoOverride,
  statusAprovacaoOverride
}: LancamentosProps) {
  const { role } = useAuth();
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
  const mirrorScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [searchParams] = useSearchParams();

  const isMaster = role === 'master';
  const isColaborador = role === 'colaborador';

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [docSearchTerm, setDocSearchTerm] = useState('');

  // Preset state
  const [datePreset, setDatePreset] = useState<'15' | '30' | '90' | 'custom'>('15');

  // Search & Period States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const handlePresetChange = (preset: '15' | '30' | '90' | 'custom') => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const today = new Date();
      const endStr = today.toISOString().split('T')[0];
      const start = new Date();
      start.setDate(today.getDate() - parseInt(preset));
      const startStr = start.toISOString().split('T')[0];
      
      setStartDate(startStr);
      setEndDate(endStr);
    }
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Advanced Filters
  const [approvalStatus, setApprovalStatus] = useState('all');
  const [statusPagamento, setStatusPagamento] = useState<string>(statusPagamentoOverride || (isColaborador ? 'quitação_pendente' : 'pago'));
  const [typeFilter, setTypeFilter] = useState<'all' | 'entrada' | 'saida'>(typeOverride || 'all');

  // Sincronizar o estado interno com as propriedades da rota ao navegar
  useEffect(() => {
    setStatusPagamento(statusPagamentoOverride || (isColaborador ? 'quitação_pendente' : 'pago'));
    setTypeFilter(typeOverride || 'all');
    setSelectedLancamentoIdsForBatch([]);
  }, [statusPagamentoOverride, typeOverride, isColaborador]);

  const [authorIdFilter, setAuthorIdIdFilter] = useState('all');

  const [categoryIdFilter, setCategoryIdFilter] = useState('all');
  const [contaIdFilter, setContaIdFilter] = useState('all');
  const [centroCustoIdFilter, setCentroCustoIdFilter] = useState('all');
  const [condicaoFilter, setCondicaoFilter] = useState('all');
  const [temDescontoFilter, setTemDescontoFilter] = useState('all');
  const [temAcrescimoFilter, setTemAcrescimoFilter] = useState('all');
  const [motivoDescontoFilter, setMotivoDescontoFilter] = useState('all');
  const [motivoAcrescimoFilter, setMotivoAcrescimoFilter] = useState('all');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const hasActiveFilters = searchTerm !== '' || docSearchTerm !== '' || approvalStatus !== 'all' || typeFilter !== (typeOverride || 'all') || authorIdFilter !== 'all' || categoryIdFilter !== 'all' || contaIdFilter !== 'all' || centroCustoIdFilter !== 'all' || condicaoFilter !== 'all' || temDescontoFilter !== 'all' || temAcrescimoFilter !== 'all' || motivoDescontoFilter !== 'all' || motivoAcrescimoFilter !== 'all';

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
    searchTerm,
    docCode: parseInt(docSearchTerm.split('-')[0]) || undefined,
    docParcel: parseInt(docSearchTerm.split('-')[1]) || undefined,
    startDate,
    endDate,
    approvalStatus: approvalStatus,
    statusPagamento: statusPagamento === 'all' && isColaborador ? 'quitação_pendente' : statusPagamento,
    type: typeFilter === 'all' ? undefined : typeFilter,
    authorId: isColaborador ? useUIStore.getState().currentUserId : authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: contaIdFilter,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    page: currentPage,
    pageSize
  });

  // Sync scroll between mirror and table
  useEffect(() => {
    const table = tableScroll.ref.current;
    const mirror = mirrorScrollRef.current;
    if (!table || !mirror) return;

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

    table.addEventListener('scroll', handleTableScroll);
    mirror.addEventListener('scroll', handleMirrorScroll);

    // Initial width
    setTableWidth(table.scrollWidth);

    const observer = new ResizeObserver(() => {
      if (table) setTableWidth(table.scrollWidth);
    });
    observer.observe(table);

    return () => {
      table.removeEventListener('scroll', handleTableScroll);
      mirror.removeEventListener('scroll', handleMirrorScroll);
      observer.disconnect();
    };
  }, [allLancamentos, tableScroll.ref]);

  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: usuarios = [] } = useUsuarios();
  const { data: rawContas = [] } = useContas();
  const { data: centrosCusto = [] } = useCentrosCusto();
  const { categoriasAjuste = [] } = useCategoriasAjuste();

  const activeContas = useMemo(() => rawContas.filter((c: any) => c.status !== 'excluido'), [rawContas]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    const lancamentoId = searchParams.get('id');
    if (lancamentoId) {
      setSelectedLancamentoIdForModal(lancamentoId);
      setModalOpen('isComprovanteOpen', true);
    }
  }, [searchParams, setSelectedLancamentoIdForModal, setModalOpen]);

  const filteredLancamentos = useMemo(() => {
    return allLancamentos.filter(l => selectedAccountId ? l.conta_bancaria_id === selectedAccountId : true);
  }, [allLancamentos, selectedAccountId]);

  const valueFormatter = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getValorLiquido = (item: LancamentoFinanceiro): number => {
    if (item.status_pagamento === 'pago' && item.valor_recebido) {
      return item.valor_recebido;
    }
    const desconto = Number((item as any).desconto_valor) || 0;
    const acrescimo = Number((item as any).acrescimo_valor) || 0;
    const liquido = item.valor_previsto - desconto + acrescimo;
    return liquido;
  };

  const hasAjuste = (item: LancamentoFinanceiro): boolean => {
    const desconto = Number((item as any).desconto_valor) || 0;
    const acrescimo = Number((item as any).acrescimo_valor) || 0;
    return desconto > 0 || acrescimo > 0;
  };

  const renderObservacoes = (item: LancamentoFinanceiro) => {
    const observacao = item.observacoes || 'Sem descrição';
    return (
      <div className="max-w-[240px]">
        <p className="text-[9px] text-neutral-400 uppercase tracking-widest font-bold line-clamp-2 break-words">{observacao}</p>
        {item.observacoes && (
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
        )}
      </div>
    );
  };

  const clearFiltersShortcut = () => {
    setSearchTerm('');
    setDocSearchTerm('');
    setApprovalStatus('all');
    setStatusPagamento(statusPagamentoOverride || (isColaborador ? 'quitação_pendente' : 'pago'));
    setTypeFilter(typeOverride || 'all');
    setAuthorIdIdFilter('all');
    setCategoryIdFilter('all');
    setContaIdFilter('all');
    setCentroCustoIdFilter('all');
    setCondicaoFilter('all');
    setTemDescontoFilter('all');
    setTemAcrescimoFilter('all');
    setMotivoDescontoFilter('all');
    setMotivoAcrescimoFilter('all');
    setSelectedLancamentoIdsForBatch([]);
    setSelectedAccountId(null);

    handlePresetChange('15');
    setCurrentPage(1);
  };

  const toggleSelectAll = () => {
    if (!isMaster) return;
    const selectable = filteredLancamentos.filter(l => 
      (l.status_aprovacao !== 'confirmado_master' || l.status_pagamento === 'quitação_pendente') && 
      l.status_pagamento !== 'bpi'
    );
    if (selectedLancamentoIdsForBatch.length === selectable.length) {
      setSelectedLancamentoIdsForBatch([]);
    } else {
      setSelectedLancamentoIdsForBatch(selectable.map(l => l.id));
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
    if (selectedLancamentoIdsForBatch.length === 0) return;
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

  const isOperationalView = !!typeOverride;

  const getDaysOverdue = (dateStr: string): number => {
    if (!dateStr) return -1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diffTime = today.getTime() - due.getTime();
    return Math.floor(diffTime / (1000 * 3600 * 24));
  };

  const renderStatusBadge = (item: LancamentoFinanceiro) => {
   if (item.status_pagamento === 'bpi') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-neutral-900 text-white font-black border border-neutral-950 text-[9px] uppercase tracking-tighter">
         BPI
       </span>
     );
   }
   if (item.status_pagamento === 'pago') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-50 text-bank-truth-green font-black border border-emerald-200 text-[9px] uppercase tracking-tighter">
         Pago
       </span>
     );
   }
   if (item.status_pagamento === 'quitação_pendente' || item.status_pagamento === 'pago_parcial') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse">
         {item.status_pagamento === 'pago_parcial' ? 'Parcial' : (isMaster ? 'Confirme Baixa' : 'Pendente Gestor')}
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

   const days = getDaysOverdue(item.data_vencimento);
   if (days > 0) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-red-50 text-alert-red font-black border border-red-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Vencido
       </span>
     );
   } else if (days === 0) {
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

  return (
    <div className="space-y-6 animate-fade-in" onClick={() => setActiveMenuId(null)}>
      
      <AccountFilterCards 
        accounts={accountCardsData}
        selectedId={selectedAccountId}
        onSelect={setSelectedAccountId}
        dragScrollProps={dragScrollTabs.props}
        dragScrollRef={dragScrollTabs.ref}
        valueFormatter={valueFormatter}
      />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-primary" />
            {titleOverride || 'Extrato'}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Gestão centralizada de movimentações e conciliação</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isMaster && (
            <Button
              onClick={() => handleBatchApprove()}
              disabled={selectedLancamentoIdsForBatch.length === 0 || isBatchApproving}
            >
              <ShieldCheck className="w-4 h-4" />
              Aprovar ({selectedLancamentoIdsForBatch.length})
            </Button>
          )}

        </div>
      </div>

      {/* Main filter bar */}
      <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl flex flex-col lg:flex-row gap-4 shadow-sm items-center">
        <div className="flex gap-3 w-full lg:w-auto">
          <div className="relative w-32 shrink-0">
            <FileText className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              type="text"
              placeholder="Cód. Doc"
              value={docSearchTerm}
              onChange={(e) => setDocSearchTerm(e.target.value)}
              className="w-full h-12 pl-10 pr-4 bg-neutral-50 border-2 border-neutral-100 rounded-2xl text-xs font-bold focus:border-primary outline-none transition-all"
            />
          </div>
          
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              type="text"
              placeholder="Pesquisar por entidade ou observação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 pl-12 pr-4 bg-neutral-50 border-2 border-neutral-100 rounded-2xl text-xs font-bold focus:border-primary outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-neutral-100 p-1 rounded-xl h-12 shrink-0">
            {[
              { id: '15', label: '15 dias' },
              { id: '30', label: '30 dias' },
              { id: '90', label: '90 dias' },
              { id: 'custom', label: 'Personalizado' }
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => handlePresetChange(opt.id as any)}
                className={`px-3 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${
                  datePreset === opt.id ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className={`flex bg-neutral-100 p-1 rounded-xl h-12 transition-all ${datePreset === 'custom' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); }} 
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none" 
            />
            <div className="w-px h-4 bg-neutral-200 self-center" />
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); }} 
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none" 
            />
          </div>

          <button
            onClick={() => setIsFilterPanelOpen(true)}
            className={`h-12 w-12 flex items-center justify-center rounded-xl border-2 transition-all relative shrink-0 ${
              hasActiveFilters ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-neutral-100 text-neutral-400 hover:border-neutral-200'
            }`}
          >
            <Filter className="w-5 h-5" />
            {hasActiveFilters && <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-white" />}
          </button>
        </div>
      </div>

      <div className="bg-white border-2 border-neutral-100 rounded-[32px] shadow-sm relative">
        <div
          ref={tableScroll.ref}
          {...tableScroll.props}
          className="overflow-x-auto scrollbar-none select-none rounded-t-[32px]"
        >
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-neutral-50/50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest select-none">
                <th className="py-5 px-4 w-10 text-center">
                  {isMaster && (
                    <input
                      type="checkbox"
                      checked={selectedLancamentoIdsForBatch.length > 0 && selectedLancamentoIdsForBatch.length === filteredLancamentos.filter(l => (l.status_aprovacao !== 'confirmado_master' || l.status_pagamento === 'quitação_pendente') && l.status_pagamento !== 'bpi').length}
                      onChange={toggleSelectAll}
                      className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                    />
                  )}
                </th>

                <th className="py-5 px-4">Documento</th>
                {isOperationalView ? (
                  <>
                    <th className="py-5 px-4">{typeOverride === 'saida' ? 'Local / Fornecedor' : 'Local / Cliente'}</th>
                    <th className="py-5 px-4">C. Atrasada</th>
                    <th className="py-5 px-4">Dt. Referência</th>
                    <th className="py-5 px-4 text-right">Total</th>
                    <th className="py-5 px-4 text-right">A pagar</th>
                    <th className="py-5 px-4 text-center">Status</th>
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
                    <th className="py-5 px-3 text-center">Recibo</th>
                  </>
                )}
                <th className="py-5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-bold">
              {isLoading ? (
                <tr><td colSpan={10} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-40"><Clock className="w-10 h-10 animate-spin text-primary" /><p className="font-black uppercase text-[10px] tracking-widest">Sincronizando registros...</p></div></td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="py-24 text-center"><div className="flex flex-col items-center gap-3 text-alert-red"><AlertTriangle className="w-10 h-10" /><p className="font-black uppercase text-[10px] tracking-widest">Erro ao carregar dados. Tente simplificar a busca.</p></div></td></tr>
              ) : filteredLancamentos.length === 0 ? (
                <tr><td colSpan={10} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-20"><Receipt className="w-12 h-12" /><p className="font-black uppercase text-[10px] tracking-widest">Nenhum lançamento localizado</p></div></td></tr>
              ) : (
                filteredLancamentos.map((item, idx) => {
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
                        {isMaster && isAprovacaoPendente && (
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
                            {item.status_pagamento === 'pago' || item.status_pagamento === 'bpi' ? (
                              <span className="text-neutral-300 font-normal">-</span>
                            ) : (
                              days > 0 ? (
                                <span className="text-alert-red font-black">{days} dia(s)</span>
                              ) : days === 0 ? (
                                <span className="text-alert-red font-black">Hoje</span>
                              ) : (
                                <span className="text-neutral-300 font-normal">-</span>
                              )
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono">
                            {(item.data_competencia || item.data_vencimento).split('-').reverse().join('/')}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(item.valor_original || item.valor_previsto)}
                          </td>
                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            {valueFormatter(getValorLiquido(item))}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {renderStatusBadge(item)}
                          </td>
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
                                <span className="text-bank-truth-green font-black text-[9px] uppercase">Liquidado</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : item.status_pagamento === 'quitação_pendente' ? (
                              <div className="flex flex-col">
                                <span className="text-amber-600 font-black text-[9px] uppercase">{isMaster ? 'Confirme Baixa' : 'Pendente Gestor'}</span>
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
                            {item.status_pagamento === 'aberto' && (
                              <button
                                type="button"
                                onClick={() => handleOpenBaixa(item.id)}

                                className="px-3 py-1.5 bg-bank-truth-green text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Dar baixa
                              </button>
                            )}
                          </div>

                          <LancamentoActionMenu
                            item={item}
                            isMaster={isMaster}
                            isActive={activeMenuId === item.id}
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
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Floating Horizontal Scrollbar Mirror - Stays fixed at viewport bottom */}
        <div
          ref={mirrorScrollRef}
          className="sticky bottom-0 z-[60] overflow-x-auto scrollbar-thin bg-neutral-50/90 backdrop-blur-md border-y border-neutral-200 flex h-5"
          style={{ marginBottom: '-1px' }}
        >
          <div style={{ width: tableWidth, height: 1 }} className="shrink-0" />
        </div>

        {/* Pagination Bar */}
        <div className="bg-neutral-50/50 px-8 py-4 border-t border-neutral-100 flex items-center justify-between rounded-b-[32px]">
          <span className="text-neutral-400 font-bold text-[9px] uppercase tracking-widest">
            Exibindo {filteredLancamentos.length} de {totalCount} registros
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
            >
              Anterior
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${
                      currentPage === pageNum
                        ? 'bg-neutral-900 text-white shadow-md'
                        : 'border-2 border-neutral-100 text-neutral-400 hover:bg-neutral-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="flex items-end pb-2 text-neutral-400">...</span>}
            </div>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
            >
              Próximo
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFilterPanelOpen && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFilterPanelOpen(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="w-full md:w-[400px] h-full bg-white shadow-2xl relative z-10 flex flex-col">
              <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">Filtros Inteligentes</h3>
                  <p className="text-[10px] font-bold text-secondary uppercase mt-0.5">Refine sua busca no histórico</p>
                </div>
                <button onClick={() => setIsFilterPanelOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-all">
                  <X className="w-5 h-5 text-secondary" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> Natureza do Fluxo
                  </label>
                  <div className="flex bg-neutral-100 p-1 rounded-xl h-11">
                    <button onClick={() => setTypeFilter('all')} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}>Todos</button>
                    <button onClick={() => setTypeFilter('entrada')} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter === 'entrada' ? 'bg-white text-bank-truth-green shadow-sm' : 'text-neutral-400'}`}>Entradas</button>
                    <button onClick={() => setTypeFilter('saida')} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter === 'saida' ? 'bg-white text-alert-red shadow-sm' : 'text-neutral-400'}`}>Saídas</button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Status de Pagamento
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'pago', label: 'Liquidados' },
                      { id: 'aberto', label: 'Em Aberto' },
                      { id: 'quitação_pendente', label: 'Pend. Gestor' },
                      { id: 'bpi', label: 'BPI (Inatividade)' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStatusPagamento(opt.id)}
                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all text-left flex items-center justify-between ${
                          statusPagamento === opt.id ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-100 bg-neutral-50 text-secondary hover:border-neutral-200'
                        }`}
                      >
                        {opt.label}
                        {statusPagamento === opt.id && <div className="w-2 h-2 bg-primary rounded-full" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {role !== 'colaborador' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                        <User className="w-4 h-4" /> Responsável
                      </label>
                      <select
                        value={authorIdFilter}
                        onChange={(e) => setAuthorIdIdFilter(e.target.value)}
                        className="w-full h-11 bg-neutral-50 border border-surface-border text-xs font-bold rounded-lg px-3 outline-none focus:border-primary"
                      >
                        <option value="all">Todos os Usuários</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                      <Tag className="w-4 h-4" /> Categoria
                    </label>
                    <select
                      value={categoryIdFilter}
                      onChange={(e) => setCategoryIdFilter(e.target.value)}
                      className="w-full h-11 bg-neutral-50 border border-surface-border text-xs font-bold rounded-lg px-3 outline-none focus:border-primary"
                    >
                      <option value="all">Todas as Categorias</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Conta Bancária
                    </label>
                    <select
                      value={contaIdFilter}
                      onChange={(e) => setContaIdFilter(e.target.value)}
                      className="w-full h-11 bg-neutral-50 border border-surface-border text-xs font-bold rounded-lg px-3 outline-none focus:border-primary"
                    >
                      <option value="all">Todas as Contas</option>
                      {activeContas.map(c => <option key={c.id} value={c.id}>{c.nome_banco || c.nome}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                      <Layers className="w-4 h-4" /> Centro de Custo
                    </label>
                    <select
                      value={centroCustoIdFilter}
                      onChange={(e) => setCentroCustoIdFilter(e.target.value)}
                      className="w-full h-11 bg-neutral-50 border border-surface-border text-xs font-bold rounded-lg px-3 outline-none focus:border-primary"
                    >
                      <option value="all">Todos os Centros</option>
                      {centrosCusto.filter((cc: any) => cc.status !== 'excluido').map(cc => <option key={cc.id} value={cc.id}>{cc.nome}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <footer className="p-8 border-t border-neutral-100 bg-neutral-50/50 flex flex-col gap-3">
                <button onClick={clearFiltersShortcut} className="w-full h-12 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors">Limpar Filtros</button>
                <button onClick={() => { setIsFilterPanelOpen(false); setCurrentPage(1); }} className="w-full h-14 bg-neutral-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all">Aplicar e Fechar</button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLogItem && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedLogItem(null)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 w-full max-w-[560px] max-h-[80vh] bg-white rounded-3xl shadow-2xl overflow-hidden">
              <header className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Logs completos</h3>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-secondary mt-1">Registro {selectedLogItem.codigo_sequencial || selectedLogItem.id}</p>
                </div>
                <button type="button" onClick={() => setSelectedLogItem(null)} className="p-2 rounded-xl hover:bg-neutral-200"><X className="w-5 h-5 text-secondary" /></button>
              </header>
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed font-bold text-neutral-700">{selectedLogItem.observacoes || 'Sem logs registrados.'}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}