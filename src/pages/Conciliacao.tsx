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
  CheckCircle2,
  Trash2,
  Zap,
  Info,
  Clock,
  Filter,
  ShieldCheck,
  Shield
} from 'lucide-react';
import { useConciliacao, useContas, useLancamentos, useEntidades } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { TransacaoBanco, LancamentoFinanceiro } from '../types';
import Button from '../components/Button';

export default function Conciliacao() {
  const { 
    conciliacoes = [], 
    transacoes = [], 
    importCSV, 
    linkConciliacao, 
    unlinkConciliacao, 
    cleanupTransacoes,
    classifyDifference,
    isLinking,
    isCleaning
  } = useConciliacao();

  const { role } = useAuth();
  const { data: contas = [] } = useContas();
  const { data: lancamentos = [] } = useLancamentos({ pageSize: 1000 }); // Buscar volume maior para conciliar
  const { data: entidades = [] } = useEntidades();

  const { 
    currentUserId, isImportarCSVOpen, setModalOpen, selectedTransacaoForConciliationId, selectedLancamentoForConciliationId,
    isVincularConciliarOpen, isClassificarDiferencaOpen,
    setSelectedTransacaoForConciliationId, setSelectedLancamentoForConciliationId,
    setCurrentConciliationDifferenceValue, setCurrentConciliationId,
    currentConciliationId, currentConciliationDifferenceValue
  } = useUIStore();

  const [selectedContaId, setSelectedContaId] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Import states
  const [csvContentText, setCsvContentText] = useState('');
  const [selectedImportContaId, setSelectedImportContaId] = useState('');
  const [importMode, setImportMode] = useState<'entrada' | 'saida' | 'ambos'>('ambos');
  const [columnMapping, setColumnMapping] = useState({ data: '', valor: '', descricao: '', documento: '' });
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<any[]>([]);
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

  const handleCleanup = async () => {
    if (!selectedContaId) return;
    if (confirm('Deseja remover todas as transações importadas desta conta que ainda não foram conciliadas? Esta ação é útil para corrigir erros de importação.')) {
      try {
        await cleanupTransacoes(selectedContaId);
        alert('Transações pendentes removidas com sucesso.');
      } catch (err) { alert('Erro ao limpar dados.'); }
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvContentText(text);
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
        setCsvHeaders(headers);
        const preview = lines.slice(1, 6).map(line => {
          const parts = line.split(sep).map(p => p.trim().replace(/"/g, ''));
          const row: any = {};
          headers.forEach((h, i) => { row[h] = parts[i]; });
          return row;
        });
        setCsvPreviewRows(preview);
        const mapping = { data: '', valor: '', descricao: '', documento: '' };
        headers.forEach(h => {
          const l = h.toLowerCase();
          if (l.includes('dat')) mapping.data = h;
          if (l.includes('val')) mapping.valor = h;
          if (l.includes('desc')) mapping.descricao = h;
          if (l.includes('doc')) mapping.documento = h;
        });
        setColumnMapping(mapping);
      }
    };
    reader.readAsText(file);
  };

  const handleImportCSVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const lines = csvContentText.split('\n').filter(l => l.trim());
      const separator = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
      const rowsToImport = lines.slice(1).map(line => {
        const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
        const rowData: any = {};
        headers.forEach((h, i) => { rowData[h] = parts[i]; });
        const valRaw = rowData[columnMapping.valor] || '0';
        // Limpeza avançada de valores monetários
        const val = parseFloat(valRaw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
        return { 
          data: rowData[columnMapping.data], 
          valor: val, 
          descricao: rowData[columnMapping.descricao], 
          documento: rowData[columnMapping.documento] || '' 
        };
      }).filter(r => r.data && !isNaN(r.valor));
      
      await importCSV({ contaBancariaId: selectedImportContaId, rows: rowsToImport, importMode });
      setModalOpen('isImportarCSVOpen', false);
      alert('Importação concluída com sucesso!');
    } catch (err: any) {
      alert('Erro na importação: ' + err.message);
    }
  };

  const executeConciliationLink = async () => {
    if (!selectedTransacaoForConciliationId || !selectedLancamentoForConciliationId) return;
    try {
      const tx = transacoes.find(t => t.id === selectedTransacaoForConciliationId);
      const lanc = lancamentos.find(l => l.id === selectedLancamentoForConciliationId);
      if (!tx || !lanc) return;
      
      const newCon = await linkConciliacao({ lancamentoId: lanc.id, transacaoBancoId: tx.id, usuarioId: currentUserId });
      
      const erpVal = lanc.tipo === 'saida' ? -Math.abs(lanc.valor_previsto) : Math.abs(lanc.valor_previsto);
      const diff = tx.valor - erpVal;
      
      if (Math.abs(diff) > 0.01) {
        setCurrentConciliationId(newCon.id); 
        setCurrentConciliationDifferenceValue(diff);
        setModalOpen('isVincularConciliarOpen', false); 
        setModalOpen('isClassificarDiferencaOpen', true);
      } else {
        setModalOpen('isVincularConciliarOpen', false);
        setSelectedTransacaoForConciliationId(null);
        setSelectedLancamentoForConciliationId(null);
      }
    } catch (err: any) { alert('Erro: ' + err.message); }
  };

  const handleClassifyDiffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentConciliationId) return;
    try {
      await classifyDifference({
        conciliacaoId: currentConciliationId,
        tipoDiferenca: diffType,
        valorDiferenca: currentConciliationDifferenceValue,
        observacaoJustificativa: diffJustification
      });
      setModalOpen('isClassificarDiferencaOpen', false);
      setCurrentConciliationId(null);
      setCurrentConciliationDifferenceValue(0);
      setDiffJustification('');
      setSelectedTransacaoForConciliationId(null);
      setSelectedLancamentoForConciliationId(null);
    } catch (err: any) { alert('Erro: ' + err.message); }
  };

  const handleUnlink = async (conId: string) => {
    if (confirm('Deseja realmente desfazer esta conciliação? O lançamento voltará para o status "Aberto".')) {
      try { await unlinkConciliacao({ conciliacaoId: conId }); } catch (err: any) { alert('Erro: ' + err.message); }
    }
  };

  // 1. Processar Transações do Banco
  const bankStatements = useMemo(() => {
    return transacoes
      .filter(tx => {
        const matchConta = tx.conta_bancaria_id === selectedContaId;
        const matchMonth = tx.data_transacao.startsWith(selectedMonth);
        const matchDirection = directionFilter === 'todos' ? true : 
                              directionFilter === 'entrada' ? tx.valor > 0 : tx.valor < 0;
        return matchConta && matchMonth && matchDirection;
      })
      .map(tx => ({ 
        ...tx, 
        conciliation: conciliacoes.find(c => c.transacao_banco_id === tx.id) || null 
      }));
  }, [transacoes, selectedContaId, selectedMonth, directionFilter, conciliacoes]);

  // 2. Processar Lançamentos do ERP
  const availableLaunches = useMemo(() => {
    return lancamentos.filter(l => {
      const matchConta = l.conta_bancaria_id === selectedContaId;
      const matchStatus = !conciliacoes.some(c => c.lancamento_id === l.id);
      const matchMonth = l.data_vencimento.startsWith(selectedMonth);
      const matchDirection = directionFilter === 'todos' ? true : l.tipo === directionFilter;
      return matchConta && matchStatus && matchMonth && matchDirection;
    });
  }, [lancamentos, conciliacoes, selectedContaId, selectedMonth, directionFilter]);

  // 3. Lógica de Smart Match (Sugestão Visual)
  const smartMatches = useMemo(() => {
    if (!selectedTransacaoForConciliationId) return [];
    const tx = transacoes.find(t => t.id === selectedTransacaoForConciliationId);
    if (!tx) return [];

    return availableLaunches.filter(l => {
      const erpVal = l.tipo === 'saida' ? -Math.abs(l.valor_previsto) : Math.abs(l.valor_previsto);
      const sameVal = Math.abs(erpVal - tx.valor) < 0.01;
      const sameDate = l.data_vencimento === tx.data_transacao;
      return sameVal || (sameVal && sameDate);
    }).map(l => l.id);
  }, [selectedTransacaoForConciliationId, transacoes, availableLaunches]);

  const selectedTxForWorkspace = useMemo(() => transacoes.find(t => t.id === selectedTransacaoForConciliationId) || null, [selectedTransacaoForConciliationId, transacoes]);
  const selectedLancForWorkspace = useMemo(() => lancamentos.find(l => l.id === selectedLancamentoForConciliationId) || null, [selectedLancamentoForConciliationId, lancamentos]);

  const draftDifferenceAmount = useMemo(() => {
    if (!selectedTxForWorkspace || !selectedLancForWorkspace) return 0;
    const erpVal = selectedLancForWorkspace.tipo === 'saida' ? -Math.abs(selectedLancForWorkspace.valor_previsto) : Math.abs(selectedLancForWorkspace.valor_previsto);
    return selectedTxForWorkspace.valor - erpVal;
  }, [selectedTxForWorkspace, selectedLancForWorkspace]);

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
            ) : bankStatements.map(tx => (
              <motion.div 
                layout
                key={tx.id} 
                onClick={() => !tx.status_conciliacao && setSelectedTransacaoForConciliationId(tx.id)} 
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
                  <div>
                    <p className="text-xs font-black uppercase text-neutral-900 leading-tight truncate max-w-[250px]">{tx.descricao_banco}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {tx.data_transacao.split('-').reverse().join('/')}
                      </span>
                      {tx.numero_documento && (
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {tx.numero_documento}
                        </span>
                      )}
                    </div>
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
                    <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white animate-pulse">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ))}
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
                    <button 
                      onClick={() => { setSelectedLancamentoForConciliationId(l.id); setModalOpen('isVincularConciliarOpen', true); }} 
                      disabled={!selectedTransacaoForConciliationId}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        !selectedTransacaoForConciliationId 
                          ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed' 
                          : 'bg-neutral-900 text-white hover:bg-black shadow-lg active:scale-95'
                      }`}
                    >
                      <Link2 className="w-5 h-5" />
                    </button>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalOpen('isImportarCSVOpen', false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleImportCSVSubmit} className="bg-white w-full max-w-[600px] rounded-[40px] shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-10 py-8 border-b bg-neutral-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter">Motor de Importação</h2>
                  <p className="text-[10px] text-primary uppercase font-black tracking-widest mt-1">Transforme arquivos brutos em inteligência financeira</p>
                </div>
                <button type="button" onClick={() => setModalOpen('isImportarCSVOpen', false)} className="p-3 hover:bg-neutral-200 rounded-2xl transition-all">
                  <X className="w-6 h-6 text-neutral-400" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-10 space-y-8 max-h-[70vh] scrollbar-thin">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Conta Destino</label>
                    <div className="flex items-center gap-3 h-14 px-4 bg-neutral-100 border-2 border-neutral-100 rounded-2xl">
                      <Building className="w-5 h-5 text-neutral-400" />
                      <select value={selectedImportContaId} onChange={(e) => setSelectedImportContaId(e.target.value)} className="bg-transparent border-none text-xs font-bold uppercase outline-none cursor-pointer flex-1">
                        {contas.map(cnt => <option key={cnt.id} value={cnt.id}>{cnt.nome_banco || cnt.nome}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Direcionador de Fluxo</label>
                    <div className="flex bg-neutral-100 p-1 rounded-2xl h-14">
                      {['ambos','entrada','saida'].map(m => (
                        <button key={m} type="button" onClick={() => setImportMode(m as any)} className={`flex-1 rounded-xl text-[10px] font-black uppercase transition-all ${importMode === m ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {!csvContentText ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()} 
                    className="border-4 border-dashed rounded-[32px] p-16 text-center cursor-pointer bg-neutral-50 hover:bg-neutral-100 hover:border-primary/30 transition-all group"
                  >
                    <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} accept=".csv" className="hidden" />
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                      <Upload className="w-10 h-10 text-primary" />
                    </div>
                    <p className="text-sm font-black uppercase tracking-widest text-neutral-800">Clique para selecionar o CSV</p>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase mt-2">Suporte para arquivos bancários padrão (Excel/CSV)</p>
                  </div>
                ) : (
                  <div className="space-y-8 animate-fade-in">
                    <div className="space-y-4">
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
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b pb-2">Pré-visualização (Primeiras 5 linhas)</h4>
                      <div className="border-2 border-neutral-100 rounded-3xl overflow-hidden bg-white">
                        <table className="w-full text-[10px] text-left">
                          <thead className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 font-black uppercase">
                            <tr>
                              {Object.values(columnMapping).filter(v=>v).map(h=><th key={h} className="p-4">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className="font-bold text-neutral-700">
                            {csvPreviewRows.map((row, i) => (
                              <tr key={i} className="border-b border-neutral-50 last:border-none">
                                {Object.values(columnMapping).filter(v=>v).map(h=><td key={h} className="p-4">{row[h]}</td>)}
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
                <button type="button" onClick={() => {setCsvContentText(''); setModalOpen('isImportarCSVOpen', false);}} className="px-8 text-[10px] font-black uppercase text-neutral-400 tracking-widest hover:text-neutral-900 transition-colors">Cancelar</button>
                <Button type="submit" disabled={!csvContentText || !columnMapping.data || !columnMapping.valor}>
                  Finalizar Importação
                </Button>
              </footer>
            </motion.form>
          </div>
        )}

        {isVincularConciliarOpen && selectedTxForWorkspace && selectedLancForWorkspace && (
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

                {/* Visual Card: ERP */}
                <div className="p-8 rounded-[32px] border-2 border-primary/20 bg-primary/5 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary opacity-5 rounded-full" />
                  <span className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Coins className="w-4 h-4" /> Previsão do ERP
                  </span>
                  <div>
                    <p className="font-black text-sm uppercase text-neutral-900 leading-tight">{entidades.find(e => e.id === selectedLancForWorkspace.entidade_id)?.nome_razao_social || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase mt-1">Vencimento: {selectedLancForWorkspace.data_vencimento.split('-').reverse().join('/')} • {selectedLancForWorkspace.observacoes}</p>
                  </div>
                  <p className="font-black text-3xl text-primary font-mono">{valueFormatter(selectedLancForWorkspace.valor_previsto)}</p>
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
    </div>
  );
}