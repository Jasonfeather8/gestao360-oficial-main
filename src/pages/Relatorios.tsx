import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Download, 
  AlertCircle,
  Calendar,
  Filter,
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Target,
  Clock,
  ChevronDown,
  RefreshCw,
  MoreHorizontal,
  Info
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar,
  Legend
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval, parseISO, eachDayOfInterval, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLancamentos, useEntidades, useCategorias, useCentrosCusto } from '../hooks/useData';
import { motion } from 'motion/react';

const COLORS = ['#795900', '#2E7D32', '#D32F2F', '#FFA000', '#1976D2', '#9C27B0', '#00BCD4', '#607D8B'];

export default function Relatorios() {
  const { data: lancamentos = [], isLoading: loadingLançamentos } = useLancamentos();
  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: centros = [] } = useCentrosCusto();

  // Export CSV logic
  const handleExportCSV = () => {
    const periodItems = lancamentos.filter(l =>
      l.status_pagamento === 'pago' &&
      l.data_vencimento >= dateRange.start &&
      l.data_vencimento <= dateRange.end &&
      (selectedCostCenter === 'all' || l.centro_custo_id === selectedCostCenter)
    );

    const headers = 'ID,Tipo,Vencimento,Entidade,Categoria,Valor,StatusPag\n';
    const csvContent = periodItems.map(l => {
      const ent = entidades.find(e => e.id === l.entidade_id)?.nome_razao_social || 'N/A';
      const cat = categorias.find(c => c.id === l.categoria_id)?.nome || 'N/A';
      return `"${l.id}","${l.tipo}","${l.data_vencimento}","${ent}","${cat}",${l.valor_previsto},"${l.status_pagamento}"`;
    }).join('\n');

    const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_gestao360_${dateRange.start}_a_${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filters

  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [selectedCostCenter, setSelectedCostCenter] = useState('all');

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      maximumFractionDigits: 0 
    }).format(val);
  };

  // 1. KPI DATA CALCULATION
  const kpis = useMemo(() => {
    const periodItems = lancamentos.filter(l => 
      l.data_vencimento >= dateRange.start && 
      l.data_vencimento <= dateRange.end &&
      (selectedCostCenter === 'all' || l.centro_custo_id === selectedCostCenter)
    );

    const realizedIn = periodItems.filter(l => l.tipo === 'entrada' && l.status_pagamento === 'pago').reduce((acc, curr) => acc + curr.valor_previsto, 0);
    const realizedOut = periodItems.filter(l => l.tipo === 'saida' && l.status_pagamento === 'pago').reduce((acc, curr) => acc + curr.valor_previsto, 0);
    const expectedIn = periodItems.filter(l => l.tipo === 'entrada' && l.status_pagamento === 'aberto').reduce((acc, curr) => acc + curr.valor_previsto, 0);
    const expectedOut = periodItems.filter(l => l.tipo === 'saida' && l.status_pagamento === 'aberto').reduce((acc, curr) => acc + curr.valor_previsto, 0);

    const totalRevenue = realizedIn + expectedIn;
    const netProfit = realizedIn - realizedOut;
    
    // Inadimplency: Overdue receipts / Total expected receipts
    const today = new Date();
    const overdueIn = periodItems.filter(l => 
      l.tipo === 'entrada' && 
      l.status_pagamento === 'aberto' && 
      isBefore(parseISO(l.data_vencimento), today)
    ).reduce((acc, curr) => acc + curr.valor_previsto, 0);

    const inadimplencyRate = totalRevenue > 0 ? (overdueIn / totalRevenue) * 100 : 0;

    return {
      liquidity: realizedIn - realizedOut,
      expectedBalance: (realizedIn + expectedIn) - (realizedOut + expectedOut),
      inadimplencyRate,
      margin: totalRevenue > 0 ? ((realizedIn - realizedOut) / totalRevenue) * 100 : 0,
      realizedIn,
      realizedOut,
      expectedIn,
      expectedOut
    };
  }, [lancamentos, dateRange, selectedCostCenter]);

  // 2. CASH FLOW DATA (Daily)
  const cashFlowData = useMemo(() => {
    const days = eachDayOfInterval({
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end)
    });

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayItems = lancamentos.filter(l => 
        l.data_vencimento === dateStr &&
        (selectedCostCenter === 'all' || l.centro_custo_id === selectedCostCenter)
      );

      const realized = dayItems.filter(l => l.status_pagamento === 'pago')
        .reduce((acc, curr) => acc + (curr.tipo === 'entrada' ? curr.valor_previsto : -curr.valor_previsto), 0);
      
      const expected = dayItems.filter(l => l.status_pagamento === 'aberto')
        .reduce((acc, curr) => acc + (curr.tipo === 'entrada' ? curr.valor_previsto : -curr.valor_previsto), 0);

      return {
        name: format(day, 'dd/MM'),
        realizado: realized,
        previsto: realized + expected
      };
    });
  }, [lancamentos, dateRange, selectedCostCenter]);

  // 3. EXPENSES BY CATEGORY
  const categoryData = useMemo(() => {
    const outflows = lancamentos.filter(l => 
      l.tipo === 'saida' && 
      l.data_vencimento >= dateRange.start && 
      l.data_vencimento <= dateRange.end &&
      (selectedCostCenter === 'all' || l.centro_custo_id === selectedCostCenter)
    );

    const grouped = outflows.reduce((acc: any, curr) => {
      const cat = categorias.find(c => c.id === curr.categoria_id)?.nome || 'Outros';
      acc[cat] = (acc[cat] || 0) + curr.valor_previsto;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, value]: [string, any]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [lancamentos, categorias, dateRange, selectedCostCenter]);

  // 4. REVENUE BY CLIENT (Top 5)
  const clientData = useMemo(() => {
    const inflows = lancamentos.filter(l => 
      l.tipo === 'entrada' && 
      l.data_vencimento >= dateRange.start && 
      l.data_vencimento <= dateRange.end &&
      (selectedCostCenter === 'all' || l.centro_custo_id === selectedCostCenter)
    );

    const grouped = inflows.reduce((acc: any, curr) => {
      const ent = entidades.find(e => e.id === curr.entidade_id)?.nome_razao_social || 'N/A';
      acc[ent] = (acc[ent] || 0) + curr.valor_previsto;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, value]: [string, any]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [lancamentos, entidades, dateRange, selectedCostCenter]);

  return (
    <div className="space-y-8 pb-20">
      {/* Header com Filtros High-End */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tighter uppercase">Inteligência de Negócio</h1>
          <p className="text-secondary font-bold text-xs uppercase tracking-widest mt-1">Análise de Performance e Saúde Financeira</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white border-2 border-neutral-100 rounded-2xl p-1.5 shadow-sm">
            <div className="relative border-r border-neutral-100 pr-2">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="pl-9 pr-3 h-9 bg-transparent border-none text-[10px] font-black uppercase outline-none cursor-pointer"
              />
            </div>
            <div className="relative pl-2">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="pl-9 pr-3 h-9 bg-transparent border-none text-[10px] font-black uppercase outline-none cursor-pointer"
              />
            </div>
          </div>

          <select 
            value={selectedCostCenter}
            onChange={(e) => setSelectedCostCenter(e.target.value)}
            className="h-12 px-6 bg-white border-2 border-neutral-100 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:border-primary transition-all shadow-sm"
          >
            <option value="all">Todos os Centros</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>

          <button
            onClick={handleExportCSV}
            className="h-12 w-12 flex items-center justify-center bg-neutral-900 text-white rounded-2xl hover:bg-black transition-all shadow-lg active:scale-95"
          >
            <Download className="w-5 h-5" />
          </button>

        </div>
      </header>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { 
            label: 'Liquidez Corrente', 
            value: formatBRL(kpis.liquidity), 
            sub: 'Saldo Realizado', 
            icon: DollarSign, 
            color: 'text-bank-truth-green',
            bg: 'bg-emerald-50',
            trend: '+12.5%'
          },
          { 
            label: 'Saldo Projetado', 
            value: formatBRL(kpis.expectedBalance), 
            sub: 'Realizado + Previsto', 
            icon: Target, 
            color: 'text-primary',
            bg: 'bg-amber-50',
            trend: '+5.2%'
          },
          { 
            label: 'Índice de Inadimplência', 
            value: `${kpis.inadimplencyRate.toFixed(1)}%`, 
            sub: 'Receitas Atrasadas', 
            icon: AlertCircle, 
            color: 'text-alert-red',
            bg: 'bg-red-50',
            trend: '-2.1%'
          },
          { 
            label: 'Margem Operacional', 
            value: `${kpis.margin.toFixed(1)}%`, 
            sub: 'Eficiência de Caixa', 
            icon: TrendingUp, 
            color: 'text-bpi-blue',
            bg: 'bg-blue-50',
            trend: '+0.8%'
          }
        ].map((kpi, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white border-2 border-neutral-100 p-6 rounded-3xl shadow-sm group hover:border-primary/20 transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 rounded-2xl ${kpi.bg} ${kpi.color} flex items-center justify-center`}>
                <kpi.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[10px] font-black uppercase text-secondary tracking-widest mb-1">{kpi.label}</p>
            <h3 className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</h3>
            <p className="text-[9px] font-bold text-neutral-400 uppercase mt-1">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow Projection (Main Chart) */}
        <div className="lg:col-span-2 bg-white border-2 border-neutral-100 rounded-[32px] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tighter">Fluxo de Caixa Diário</h2>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Realizado vs Projetado</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-bank-truth-green" />
                <span className="text-[9px] font-black uppercase text-secondary">Realizado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-[9px] font-black uppercase text-secondary">Projetado</span>
              </div>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2E7D32" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2E7D32" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPrev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbc02d" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#fbc02d" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }}
                  tickFormatter={(val) => `R$ ${val >= 1000 ? (val/1000) + 'k' : val}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => [formatBRL(value), '']}
                />
                <Area 
                  type="monotone" 
                  dataKey="previsto" 
                  stroke="#fbc02d" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorPrev)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="realizado" 
                  stroke="#2E7D32" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorReal)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses Breakdown (Pareto) */}
        <div className="bg-white border-2 border-neutral-100 rounded-[32px] p-8 shadow-sm">
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tighter mb-1">Distribuição de Saídas</h2>
          <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-8">Top Categorias de Despesa</p>
          
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                   formatter={(value: number) => [formatBRL(value), '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 space-y-2">
            {categoryData.slice(0, 4).map((cat, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-[10px] font-bold text-neutral-600 uppercase truncate max-w-[120px]">{cat.name}</span>
                </div>
                <span className="text-[10px] font-black text-neutral-900">{formatBRL(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Concentration by Client */}
        <div className="bg-white border-2 border-neutral-100 rounded-[32px] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tighter">Concentração de Receita</h2>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Top 5 Clientes do Período</p>
            </div>
            <Users className="w-6 h-6 text-neutral-100" />
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 800, fill: '#333' }}
                  width={100}
                />
                <Tooltip 
                   cursor={{ fill: 'transparent' }}
                   contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                   formatter={(value: number) => [formatBRL(value), 'Valor Total']}
                />
                <Bar 
                  dataKey="value" 
                  fill="#795900" 
                  radius={[0, 10, 10, 0]} 
                  barSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Operating Balance Summary */}
        <div className="bg-neutral-900 rounded-[32px] p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
          
          <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-8 relative z-10">Resumo da Operação</h2>
          
          <div className="space-y-6 relative z-10">
            {[
              { label: 'Entradas Realizadas', val: kpis.realizedIn, icon: ArrowUpRight, color: 'text-emerald-400' },
              { label: 'Saídas Realizadas', val: kpis.realizedOut, icon: ArrowDownLeft, color: 'text-red-400' },
              { label: 'Receitas a Receber', val: kpis.expectedIn, icon: Clock, color: 'text-amber-400' },
              { label: 'Despesas a Pagar', val: kpis.expectedOut, icon: Clock, color: 'text-blue-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center ${item.color}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-black uppercase text-white/60 tracking-widest">{item.label}</span>
                </div>
                <span className={`text-sm font-mono font-black ${item.color}`}>{formatBRL(item.val)}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 flex items-center justify-between relative z-10">
            <div>
              <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">Resultado do Período</p>
              <h4 className={`text-2xl font-black ${kpis.expectedBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatBRL(kpis.expectedBalance)}
              </h4>
            </div>
            <RefreshCw className="w-6 h-6 text-white/20 animate-spin-slow" />
          </div>
        </div>
      </div>
    </div>
  );
}
