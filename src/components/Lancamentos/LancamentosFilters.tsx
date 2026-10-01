import type { Dispatch, SetStateAction } from 'react';
import {
  CreditCard,
  FileText,
  Filter,
  Layers,
  Receipt,
  Search,
  Tag,
  User
} from 'lucide-react';
import { CategoriaFinanceira, CentroCusto, ContaBancaria, UserProfile } from '../../types';
import MultiSelectDropdown from '../MultiSelectDropdown';
import FinanceiroStatusFilter from './FinanceiroStatusFilter';

type FinanceiroStatusFilters = Parameters<typeof FinanceiroStatusFilter>[0]['filters'];

interface LancamentosFiltersProps {
  isFilterPanelOpen: boolean;
  setIsFilterPanelOpen: Dispatch<SetStateAction<boolean>>;
  hasActiveFilters: boolean;
  clearFiltersShortcut: () => void;
  typeOverride?: 'entrada' | 'saida';
  isFinanceiroView: boolean;
  isOperationalView: boolean;
  role: string;
  typeFilter: string[];
  setTypeFilter: Dispatch<SetStateAction<string[]>>;
  statusPagamento: string[];
  setStatusPagamento: Dispatch<SetStateAction<string[]>>;
  financeiroStatusFilters: FinanceiroStatusFilters;
  authorIdFilter: string[];
  setAuthorIdIdFilter: Dispatch<SetStateAction<string[]>>;
  categoryIdFilter: string[];
  setCategoryIdFilter: Dispatch<SetStateAction<string[]>>;
  contaIdFilter: string[];
  setContaIdFilter: Dispatch<SetStateAction<string[]>>;
  centroCustoIdFilter: string[];
  setCentroCustoIdFilter: Dispatch<SetStateAction<string[]>>;
  usuarios: UserProfile[];
  categorias: CategoriaFinanceira[];
  activeContas: ContaBancaria[];
  centrosCusto: CentroCusto[];
  setCurrentPage: Dispatch<SetStateAction<number>>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  docSearchTerm: string;
  setDocSearchTerm: Dispatch<SetStateAction<string>>;
  datePreset: '15' | '30' | '90' | 'custom';
  handleDateDirectionChange: (direction: 'past' | 'future' | 'both') => void;
  dateDirection: 'past' | 'future' | 'both';
  handlePresetChange: (preset: '15' | '30' | '90' | 'custom', direction?: 'past' | 'future' | 'both') => void;
  startDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  endDate: string;
  setEndDate: Dispatch<SetStateAction<string>>;
  setDatePreset: Dispatch<SetStateAction<'15' | '30' | '90' | 'custom'>>;
  setDateFilterActive: Dispatch<SetStateAction<boolean>>;
  pageSize: 50 | 100 | 'all';
  setPageSize: Dispatch<SetStateAction<50 | 100 | 'all'>>;
  setSelectedLancamentoIdsForBatch: Dispatch<SetStateAction<string[]>>;
}

export default function LancamentosFilters({
  isFilterPanelOpen,
  setIsFilterPanelOpen,
  hasActiveFilters,
  clearFiltersShortcut,
  typeOverride,
  isFinanceiroView,
  role,
  typeFilter,
  setTypeFilter,
  statusPagamento,
  setStatusPagamento,
  financeiroStatusFilters,
  authorIdFilter,
  setAuthorIdIdFilter,
  categoryIdFilter,
  setCategoryIdFilter,
  contaIdFilter,
  setContaIdFilter,
  centroCustoIdFilter,
  setCentroCustoIdFilter,
  usuarios,
  categorias,
  activeContas,
  centrosCusto,
  setCurrentPage,
  searchTerm,
  setSearchTerm,
  docSearchTerm,
  setDocSearchTerm,
  datePreset,
  handleDateDirectionChange,
  dateDirection,
  handlePresetChange,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  setDatePreset,
  setDateFilterActive,
  pageSize,
  setPageSize,
  setSelectedLancamentoIdsForBatch
}: LancamentosFiltersProps) {
  return (
    <>
      {isFilterPanelOpen && (
        <div className="bg-white border-2 border-neutral-100 p-5 rounded-3xl shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-900">Filtros adicionais</h2>
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mt-1">Refine sua busca no histórico</p>
            </div>
            <div className="flex items-center gap-3">
              {hasActiveFilters && <span className="text-[9px] font-black uppercase tracking-widest text-primary">Filtros ativos</span>}
              <button
                type="button"
                onClick={clearFiltersShortcut}
                className="text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => { setIsFilterPanelOpen(false); setCurrentPage(1); }}
                className="h-9 px-3 rounded-lg border border-neutral-200 text-[9px] font-black uppercase tracking-widest text-secondary hover:border-primary hover:text-primary transition-all"
              >
                Ocultar filtros
              </button>
            </div>
          </div>

          <div className={isFinanceiroView ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'}>
            {typeOverride !== 'entrada' && typeOverride !== 'saida' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Natureza do Fluxo
                </label>
                <div className="flex bg-neutral-100 p-1 rounded-xl h-11">
                  <button type="button" onClick={() => setTypeFilter([])} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter.length === 0 ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}>Todos</button>
                  <button type="button" onClick={() => setTypeFilter(current => current.includes('entrada') ? current.filter(value => value !== 'entrada') : [...current, 'entrada'])} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter.includes('entrada') ? 'bg-white text-bank-truth-green shadow-sm' : 'text-neutral-400'}`}>Entradas</button>
                  <button type="button" onClick={() => setTypeFilter(current => current.includes('saida') ? current.filter(value => value !== 'saida') : [...current, 'saida'])} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter.includes('saida') ? 'bg-white text-alert-red shadow-sm' : 'text-neutral-400'}`}>Saídas</button>
                </div>
              </div>
            )}

            {isFinanceiroView ? (
              <FinanceiroStatusFilter
                value={statusPagamento}
                onChange={setStatusPagamento}
                filters={financeiroStatusFilters}
              />
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Status de Pagamento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(typeOverride === 'entrada' || typeOverride === 'saida'
                    ? [
                        { id: 'all', label: 'Todos' },
                        { id: 'atrasadas', label: 'Atrasadas' },
                        { id: 'aberto', label: 'À Vencer' },
                      ]
                    : [
                        { id: 'all', label: 'Todos' },
                        { id: 'pago', label: 'Liquidados' },
                        { id: 'aberto', label: 'Contas em Aberto' },
                        { id: 'atrasadas', label: 'Atrasadas' },
                        { id: 'quitação_pendente', label: 'Pendente Master' },
                        { id: 'bpi', label: 'BPI (Inatividade)' },
                      ]).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      title={opt.id === 'quitação_pendente' ? 'Pendente de confirmação do Master' : undefined}
                      aria-label={opt.id === 'quitação_pendente' ? 'Pendente de confirmação do Master' : undefined}
                      onClick={() => opt.id === 'all'
                        ? setStatusPagamento([])
                        : setStatusPagamento(current => current.includes(opt.id) ? current.filter(value => value !== opt.id) : [...current, opt.id])}
                      className={`px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all text-left flex items-center justify-between ${
                        (opt.id === 'all' ? statusPagamento.length === 0 : statusPagamento.includes(opt.id)) ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-100 bg-neutral-50 text-secondary hover:border-neutral-200'
                      }`}
                    >
                      {opt.label}
                      {((opt.id === 'all' && statusPagamento.length === 0) || (opt.id !== 'all' && statusPagamento.includes(opt.id))) && <div className="w-2 h-2 bg-primary rounded-full shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={isFinanceiroView ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'}>
            {role !== 'colaborador' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <User className="w-4 h-4" /> Responsável
                </label>
                <MultiSelectDropdown
                  value={authorIdFilter}
                  onChange={setAuthorIdIdFilter}
                  allLabel="Todos os Usuários"
                  options={usuarios.map(u => ({ id: u.id, label: u.nome || u.email }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                <Tag className="w-4 h-4" /> Categoria
              </label>
              <MultiSelectDropdown
                value={categoryIdFilter}
                onChange={setCategoryIdFilter}
                allLabel="Todas as Categorias"
                options={categorias.map(c => ({ id: c.id, label: c.nome }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Conta Bancária
              </label>
              <MultiSelectDropdown
                value={contaIdFilter}
                onChange={setContaIdFilter}
                allLabel="Todas as Contas"
                options={activeContas.map(c => ({ id: c.id, label: c.nome_banco || c.nome }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                <Layers className="w-4 h-4" /> Centro de Custo
              </label>
              <MultiSelectDropdown
                value={centroCustoIdFilter}
                onChange={setCentroCustoIdFilter}
                allLabel="Todos os Centros"
                options={centrosCusto.filter((cc: any) => cc.status !== 'excluido').map(cc => ({ id: cc.id, label: cc.nome }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main filter bar */}
      <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl flex flex-col lg:flex-row gap-4 shadow-sm items-center">
        <button
          type="button"
          onClick={() => setIsFilterPanelOpen(prev => !prev)}
          title={isFilterPanelOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
          className={`h-12 w-12 flex items-center justify-center rounded-xl border-2 transition-all relative shrink-0 ${
            hasActiveFilters ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-neutral-100 text-neutral-400 hover:border-neutral-200'
          }`}
        >
          <Filter className="w-5 h-5" />
          {hasActiveFilters && <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-white" />}
        </button>

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
          <div className="flex flex-col bg-neutral-100 p-1 rounded-xl h-16 w-16 shrink-0" aria-label="Tempo" title="Tempo">
            <button
              type="button"
              disabled={datePreset === 'custom'}
              onClick={() => handleDateDirectionChange('past')}
              className={`flex-1 px-1 rounded-lg text-[8px] font-black uppercase leading-none tracking-tighter transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                dateDirection === 'past' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Passado
            </button>
            <button
              type="button"
              disabled={datePreset === 'custom'}
              onClick={() => handleDateDirectionChange('future')}
              className={`flex-1 px-1 rounded-lg text-[8px] font-black uppercase leading-none tracking-tighter transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                dateDirection === 'future' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Futuro
            </button>
            <button
              type="button"
              disabled={datePreset === 'custom'}
              onClick={() => handleDateDirectionChange('both')}
              className={`flex-1 px-1 rounded-lg text-[8px] font-black uppercase leading-none tracking-tighter transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                dateDirection === 'both' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Ambos
            </button>
          </div>

          <select
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value as '15' | '30' | '90' | 'custom')}
            className="h-12 bg-neutral-100 border-none rounded-xl px-3 text-[9px] font-black uppercase tracking-tighter text-neutral-600 outline-none shrink-0"
          >
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="custom">Personalizado</option>
          </select>

          <div className={`flex bg-neutral-100 p-1 rounded-xl h-12 transition-all ${datePreset === 'custom' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); setDateFilterActive(true); }}
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none"
            />
            <div className="w-px h-4 bg-neutral-200 self-center" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); setDateFilterActive(true); }}
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none"
            />
          </div>

          <select
            value={pageSize}
            onChange={(event) => {
              const value = event.target.value;
              const nextPageSize: 50 | 100 | 'all' = value === 'all' ? 'all' : value === '100' ? 100 : 50;
              setPageSize(nextPageSize);
              setCurrentPage(1);
              setSelectedLancamentoIdsForBatch([]);
            }}
            className="h-10 rounded-xl border-2 border-neutral-100 bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500 outline-none transition-all hover:bg-neutral-50"
          >
            <option value="50">50 títulos</option>
            <option value="100">100 títulos</option>
            <option value="all">Todos</option>
          </select>

        </div>
      </div>
    </>
  );
}
