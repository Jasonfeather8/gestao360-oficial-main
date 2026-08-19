"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { 
  X, 
  User, 
  Tag, 
  CreditCard, 
  Calendar, 
  DollarSign, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Info,
  Hash,
  ExternalLink,
  ShieldCheck,
  Eye,
  Paperclip,
  Check,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Printer,
  Download
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useLancamento, useEntidades, useCategorias, useUsuarios, useLancamentoAnexos, useLancamentos, useContas } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { diagnosticLogger } from '../../services/diagnosticLogger';
import { format } from 'date-fns';

import { ptBR } from 'date-fns/locale';

export default function LancamentoDetailsSlide() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    isComprovanteOpen, 
    setModalOpen, 
    selectedLancamentoIdForModal,
    setSelectedLancamentoIdForModal 
  } = useUIStore();

  const { role } = useAuth();
  const { updateLancamento } = useLancamentos();
  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: usuarios = [] } = useUsuarios();
  const { data: contas = [] } = useContas();

  const [parcelas, setParcelas] = useState<any[]>([]);
  const [uploadedAnexos, setUploadedAnexos] = useState<any[]>([]);

  const isMaster = role === 'master';

  // Escutar a URL para abrir o painel globalmente
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && idFromUrl !== selectedLancamentoIdForModal) {
      setSelectedLancamentoIdForModal(idFromUrl);
      setModalOpen('isComprovanteOpen', true);
    }
  }, [searchParams]);

  const { data: lancamento, isLoading: loadingItem } = useLancamento(selectedLancamentoIdForModal);
  const { anexos = [], error: anexosError, refetch: refetchAnexos, deleteAnexo } = useLancamentoAnexos(selectedLancamentoIdForModal);
  const [isUploadingComprovante, setIsUploadingComprovante] = useState(false);

  useEffect(() => {
    if (anexosError) {
      diagnosticLogger.error('lancamento-anexos-ui', 'A UI recebeu erro ao carregar anexos', {
        lancamentoId: selectedLancamentoIdForModal,
        error: anexosError,
      });
    }
  }, [anexosError, selectedLancamentoIdForModal]);

  useEffect(() => {
    if (!lancamento) {
      setParcelas([]);
      return;
    }

    const loadParcelas = async () => {
      if (!lancamento.recorrencia_id) {
        setParcelas([lancamento]);
        return;
      }

      const { data } = await supabase
        .from('lancamentos_financeiros')
        .select('id, numero_parcela, quantidade_total_parcelas, valor_previsto, valor_recebido, data_vencimento, data_pagamento, hora_pagamento, created_at, status_pagamento, conta_bancaria_id')
        .eq('recorrencia_id', lancamento.recorrencia_id)
        .order('numero_parcela', { ascending: true });

      setParcelas(data?.length ? data : [lancamento]);
    };

    loadParcelas();
  }, [lancamento?.id, lancamento?.recorrencia_id]);

  const [dispensarComprovante, setDispensarComprovante] = useState(false);

  const handleClose = () => {
    // Remover o ID da URL ao fechar
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('id');
    setSearchParams(newParams);
    
    setModalOpen('isComprovanteOpen', false);
    setSelectedLancamentoIdForModal(null);
    setDispensarComprovante(false);
    setUploadedAnexos([]);
  };

  if (!isComprovanteOpen) return null;

  const getEntidadeName = (id: string) => entidades.find(e => e.id === id)?.nome_razao_social || 'Desconhecido';
  const getCategoriaName = (id: string) => categorias.find(c => c.id === id)?.nome || 'Sem categoria';
  const getUsuarioName = (id: string) => usuarios.find(u => u.id === id)?.nome || 'Sistema / Desconhecido';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });
    } catch { return dateStr; }
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch { return dateStr; }
  };

  const formatPaymentDateTime = (dateStr: string | null | undefined, timeStr: string | null | undefined) => {
    if (!dateStr) return '-';
    if (!timeStr) return formatDate(dateStr);
    return formatDateTime(`${dateStr}T${timeStr}`);
  };

  const getAccountName = (id: string | null | undefined) => {
    if (!id) return 'Não informado';
    const conta = contas.find(item => item.id === id);
    return conta?.nome_banco || conta?.nome || 'Conta não encontrada';
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleUploadComprovante = async (files: File[] | null) => {
    if (!files || files.length === 0 || !selectedLancamentoIdForModal) {
      diagnosticLogger.warn('lancamento-anexos-upload', 'Upload ignorado: arquivo ou lançamento ausente', {
        hasFiles: !!files && files.length > 0,
        fileCount: files?.length || 0,
        lancamentoId: selectedLancamentoIdForModal,
      });

      return;
    }

    setIsUploadingComprovante(true);
    diagnosticLogger.info('lancamento-anexos-upload', 'Upload iniciado', {
      lancamentoId: selectedLancamentoIdForModal,
      files: Array.from(files).map(file => ({ name: file.name, size: file.size, type: file.type })),
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado.');

      for (const file of Array.from(files)) {
        const extension = file.name.split('.').pop() || 'bin';
        const filePath = `lancamentos/${selectedLancamentoIdForModal}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        diagnosticLogger.info('lancamento-anexos-upload', 'Enviando arquivo para o Storage', { filePath, name: file.name });
        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file, { upsert: false });
        if (uploadError) {
          diagnosticLogger.error('lancamento-anexos-upload', 'Falha no upload para o Storage', { filePath, error: uploadError });
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
        diagnosticLogger.info('lancamento-anexos-upload', 'Arquivo salvo no Storage; inserindo registro', { filePath, publicUrl });
        const { data: insertedRows, error: insertError } = await (supabase.from('lancamento_anexos') as any).insert({
          lancamento_id: selectedLancamentoIdForModal,
          nome: file.name,
          url: publicUrl,
          tamanho: file.size,
          tipo_arquivo: file.type,
          user_id: user.id
        }).select();
        if (insertError) {
          diagnosticLogger.error('lancamento-anexos-upload', 'Arquivo subiu, mas registro não foi salvo no banco', { filePath, error: insertError });
          throw insertError;
        }
        diagnosticLogger.info('lancamento-anexos-upload', 'Registro do anexo salvo no banco', { filePath, insertedRows });
        if (insertedRows?.[0]) setUploadedAnexos(prev => [...prev, insertedRows[0]]);
      }

      const refreshed = await refetchAnexos();
      diagnosticLogger.info('lancamento-anexos-upload', 'Upload finalizado e UI atualizada', {
        lancamentoId: selectedLancamentoIdForModal,
        count: refreshed.data?.length || 0,
        queryError: refreshed.error,
      });
      if (refreshed.error) throw refreshed.error;
    } catch (error: any) {
      diagnosticLogger.error('lancamento-anexos-upload', 'Upload interrompido com erro', {
        lancamentoId: selectedLancamentoIdForModal,
        error,
      });
      alert('Erro ao anexar comprovante: ' + (error?.message || 'erro desconhecido; consulte os logs do diagnóstico'));
    } finally {
      setIsUploadingComprovante(false);
    }
  };

  const displayedAnexos = [...anexos, ...uploadedAnexos.filter(uploaded => !anexos.some(anexo => anexo.id === uploaded.id))];
  const hasAnexo = displayedAnexos.length > 0;
  const isQuitacaoPendente = lancamento?.status_pagamento === 'quitação_pendente';
  const canApprove = hasAnexo || dispensarComprovante;
  const quantidadeParcelas = lancamento?.quantidade_total_parcelas || parcelas.length;

  return (
    <AnimatePresence>
      {/* Printable Receipt Layout (Visible only during window.print()) */}
      {lancamento && (
        <div key="printable-receipt" className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[99999] text-black font-sans">

          <div className="max-w-2xl mx-auto border-2 border-black p-8 rounded-xl space-y-6">
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider">Comprovante de Lançamento</h1>
                <p className="text-xs uppercase font-bold text-gray-600">Gestão 360 - CFO ERP Headquarters</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold block">ID: #{lancamento.id.slice(0, 8)}</span>
                <span className="text-[10px] text-gray-500 block">Emissão: {new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Entidade / Destinatário:</span>
                <span className="font-black text-sm uppercase">{getEntidadeName(lancamento.entidade_id)}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Tipo de Operação:</span>
                <span className="font-black text-sm uppercase">{lancamento.tipo === 'entrada' ? 'Receita / Entrada' : 'Despesa / Saída'}</span>
              </div>
            </div>

            <div className="bg-gray-100 p-4 rounded-lg flex justify-between items-center">
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Valor Efetivo / Líquido:</span>
                <span className="text-2xl font-black font-mono">
                  {formatCurrency(lancamento.valor_recebido && lancamento.valor_recebido > 0 ? lancamento.valor_recebido : (lancamento.valor_previsto - (lancamento.desconto_valor || 0) + (lancamento.acrescimo_valor || 0)))}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Valor Previsto Original:</span>
                <span className="text-sm font-bold font-mono text-gray-700">{formatCurrency(lancamento.valor_previsto)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs border-y border-gray-200 py-4">
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[10px]">Vencimento:</span>
                <span className="font-bold">{formatDate(lancamento.data_vencimento)}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[10px]">Data Pagamento:</span>
                <span className="font-bold">{formatDate(lancamento.data_pagamento) || '-'}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[10px]">Categoria:</span>
                <span className="font-bold uppercase">{getCategoriaName(lancamento.categoria_id)}</span>
              </div>
            </div>

            {lancamento.observacoes && (
              <div className="text-xs">
                <span className="font-bold uppercase text-gray-500 block text-[10px] mb-1">Histórico / Observações:</span>
                <p className="italic text-gray-700 bg-gray-50 p-3 rounded border border-gray-200">{lancamento.observacoes}</p>
              </div>
            )}

            <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="border-t border-black pt-2">
                <p className="font-bold uppercase text-[10px]">{getUsuarioName(lancamento.usuario_criador_id)}</p>
                <p className="text-[8px] uppercase text-gray-500">Operador / Emissor</p>
              </div>
              <div className="border-t border-black pt-2">
                <p className="font-bold uppercase text-[10px]">
                  {lancamento.status_aprovacao === 'confirmado_master' ? 'Aprovado por Master' : 'Pendente de Validação'}
                </p>
                <p className="text-[8px] uppercase text-gray-500">Autenticação do Gestor</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div key="details-drawer" className="fixed inset-0 z-[500] flex items-center justify-center p-4 print:hidden">
        <motion.div

          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xs"
        />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white w-full max-w-[960px] max-h-[90vh] shadow-2xl relative z-10 flex flex-col border border-neutral-100 rounded-[32px] overflow-hidden"
        >
          {loadingItem ? (
            <div className="flex-1 flex items-center justify-center p-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Localizando Lançamento...</p>
              </div>
            </div>
          ) : !lancamento ? (
            <div className="flex-1 flex items-center justify-center p-20 text-center">
              <div>
                <AlertTriangle className="w-12 h-12 text-alert-red mx-auto mb-4" />
                <h3 className="font-black uppercase text-neutral-900">Registro não encontrado</h3>
                <p className="text-xs text-secondary mt-2">O lançamento pode ter sido removido ou você não tem permissão para visualizá-lo.</p>
                <button onClick={handleClose} className="mt-6 px-6 py-2 bg-neutral-900 text-white text-[10px] font-black uppercase rounded-lg">Voltar</button>
              </div>
            </div>
          ) : (
            <>
              <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-black uppercase tracking-widest ${
                      lancamento.tipo === 'entrada' ? 'bg-bank-truth-green/10 text-bank-truth-green' : 'bg-alert-red/10 text-alert-red'
                    }`}>
                      {lancamento.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-secondary flex items-center gap-1">
                      <Hash className="w-3 h-3" /> {lancamento.codigo_sequencial ? `${lancamento.codigo_sequencial}${lancamento.numero_parcela ? `-${lancamento.numero_parcela}` : ''}` : lancamento.id.slice(0, 8)}
                    </span>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">Detalhes da Operação</h3>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-neutral-200 rounded-xl transition-all">
                  <X className="w-5 h-5 text-secondary" />
                </button>
              </header>

              <div className="flex-1 overflow-hidden flex">
                {/* Coluna da Esquerda: Informações e Detalhes */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin border-r border-neutral-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-2">Status Aprovação</span>
                      <div className="flex items-center gap-2">
                        {lancamento.status_aprovacao === 'confirmado_master' ? (
                          <div className="flex items-center gap-1.5 text-neutral-900 font-black text-[10px] uppercase">
                            <ShieldCheck className="w-4 h-4 text-primary" /> Lançamento Aprovado
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-secondary font-black text-[10px] uppercase">
                            <Info className="w-4 h-4" /> Lançamento Pendente
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-2">Status Pagamento</span>
                      <div className="flex items-center gap-2">
                        {lancamento.status_pagamento === 'bpi' ? (
                          <div className="flex items-center gap-1.5 text-neutral-900 font-black text-[10px] uppercase">
                            <AlertTriangle className="w-4 h-4" /> BPI
                          </div>
                        ) : lancamento.status_pagamento === 'quitação_pendente' || lancamento.status_pagamento === 'pago_parcial' ? (
                          <div className="flex items-center gap-1.5 text-orange-600 font-black text-[10px] uppercase">
                            <Clock className="w-4 h-4" /> {lancamento.status_pagamento === 'pago_parcial' ? 'Parcial' : (isMaster ? 'Confirme Baixa' : 'Pendente Gestor')}
                          </div>
                        ) : lancamento.status_pagamento === 'pago' ? (
                          <div className="flex items-center gap-1.5 text-bank-truth-green font-black text-[10px] uppercase">
                            <CheckCircle2 className="w-4 h-4" /> Liquidado
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-alert-red font-black text-[10px] uppercase">
                            <Clock className="w-4 h-4" /> Em Aberto
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-neutral-100 pb-2">
                      <Info className="w-4 h-4" /> Informações Gerais
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <DetailItem icon={<User className="w-3.5 h-3.5" />} label="Responsável" value={getUsuarioName(lancamento.usuario_criador_id)} />
                      <DetailItem icon={<Tag className="w-3.5 h-3.5" />} label="Local / Cliente" value={getEntidadeName(lancamento.entidade_id)} />
                      <DetailItem icon={<FileText className="w-3.5 h-3.5" />} label="Categoria" value={getCategoriaName(lancamento.categoria_id)} />
                      <DetailItem icon={<CreditCard className="w-3.5 h-3.5" />} label="Banco / Conta" value={getAccountName(lancamento.conta_bancaria_id)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-neutral-100 pb-2">
                      <DollarSign className="w-4 h-4" /> Financeiro e Datas
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <DetailItem icon={<DollarSign className="w-3.5 h-3.5" />} label="Total Original" value={formatCurrency(lancamento.valor_original || lancamento.valor_previsto)} highlight />
                      
                      {lancamento.status_pagamento !== 'pago' && lancamento.valor_original && (
                        <DetailItem
                          icon={<Clock className="w-3.5 h-3.5 text-orange-600" />}
                          label="Saldo A Pagar"
                          value={formatCurrency(lancamento.valor_previsto)}
                          highlight
                        />
                      )}

                      {lancamento.status_pagamento === 'pago' && lancamento.valor_recebido !== undefined && (
                        <DetailItem
                          icon={<CheckCircle2 className="w-3.5 h-3.5 text-bank-truth-green" />}
                          label="Valor Liquidado"
                          value={formatCurrency(lancamento.valor_recebido)}
                          highlight
                        />
                      )}
                      
                      {/* Exibição detalhada para AVR ou Diferenças */}
                      {lancamento.status_pagamento === 'pago' && lancamento.valor_original && lancamento.valor_original !== lancamento.valor_recebido && (
                        <>
                          <div className="col-span-2 p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-3">
                            <div className="flex justify-between items-center border-b border-primary/10 pb-2">
                              <span className="text-[9px] font-black text-secondary uppercase tracking-widest">Memória de Cálculo (AVR)</span>
                              <span className="px-2 py-0.5 bg-primary text-white text-[8px] font-black uppercase rounded">Ajustado</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className="text-secondary">Valor Original:</span>
                                <span className="text-neutral-900">{formatCurrency(lancamento.valor_original)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className="text-secondary">Valor Quitado:</span>
                                <span className="text-bank-truth-green">{formatCurrency(lancamento.valor_recebido || 0)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] font-black pt-2 border-t border-primary/10">
                                <span className="text-primary uppercase tracking-widest">Saldo Aberto (Diferença):</span>
                                <span className="text-alert-red">{formatCurrency(lancamento.valor_original - (lancamento.valor_recebido || 0))}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      <DetailItem icon={<Calendar className="w-3.5 h-3.5" />} label="Vencimento" value={formatDate(lancamento.data_vencimento)} />
                      <DetailItem icon={<Calendar className="w-3.5 h-3.5" />} label="Data Competência" value={formatDate(lancamento.data_competencia)} />
                      <DetailItem icon={<Clock className="w-3.5 h-3.5" />} label="Registrado em" value={formatDateTime(lancamento.created_at)} />
                      <DetailItem icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Baixa realizada em" value={formatPaymentDateTime(lancamento.data_pagamento, lancamento.hora_pagamento)} />
                    </div>

                    <div className="rounded-2xl border border-neutral-100 overflow-hidden">
                      <div className="px-4 py-3 bg-neutral-50 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary block">Parcelamento</span>
                          <span className="text-[10px] font-bold text-secondary">{quantidadeParcelas} {quantidadeParcelas === 1 ? 'parcela' : 'parcelas'} no título</span>
                        </div>
                        <CreditCard className="w-4 h-4 text-primary" />
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {parcelas.map((parcela, index) => {
                          const pago = parcela.status_pagamento === 'pago';
                          const pendente = parcela.status_pagamento === 'quitação_pendente';
                          return (
                            <div key={`parcela-${parcela.id || 'item'}-${index}`} className="px-4 py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-neutral-900">Parcela {parcela.numero_parcela || index + 1}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                    pago ? 'bg-bank-truth-green/10 text-bank-truth-green' : pendente ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-secondary'
                                  }`}>
                                    {pago ? 'Paga' : pendente ? 'Pendente' : 'Em aberto'}
                                  </span>
                                </div>
                                <span className="text-[9px] font-bold text-secondary block mt-1">Vencimento: {formatDate(parcela.data_vencimento)}</span>
                                {parcela.created_at && <span className="text-[9px] font-bold text-secondary block">Registrada: {formatDateTime(parcela.created_at)}</span>}
                                {parcela.data_pagamento && <span className="text-[9px] font-bold text-secondary block">Baixa: {formatPaymentDateTime(parcela.data_pagamento, parcela.hora_pagamento)}</span>}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-[11px] font-black text-neutral-900">{formatCurrency(parcela.valor_previsto || 0)}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                    pago ? 'bg-bank-truth-green/10 text-bank-truth-green' : pendente ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-secondary'
                                  }`}>
                                    {pago ? 'Paga' : pendente ? 'Pendente' : 'Em aberto'}
                                  </span>
                                </div>
                                <span className="text-[8px] font-bold text-secondary uppercase block mt-1">{getAccountName(parcela.conta_bancaria_id)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 bg-neutral-900 text-white rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block mb-1">Confirmado em</span>
                        <span className="text-xs font-black font-mono">
                          {lancamento.status_aprovacao === 'confirmado_master'
                            ? ((lancamento as any).data_aprovacao ? formatDateTime((lancamento as any).data_aprovacao) : 'Sem registro')
                            : 'Aguardando Aprovação'}
                        </span>
                      </div>
                      {(lancamento as any).usuario_aprovador_id && (
                        <div className="text-right">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block mb-1">Aprovado por</span>
                          <span className="text-xs font-black">{getUsuarioName((lancamento as any).usuario_aprovador_id)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-neutral-100 pb-2">
                      <FileText className="w-4 h-4" /> Observações
                    </h4>
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 text-xs font-bold text-secondary leading-relaxed italic">
                      {lancamento.observacoes || 'Sem observações registradas.'}
                    </div>
                  </div>

                  <div className="space-y-4 pb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-neutral-100 pb-2">
                      <Paperclip className="w-4 h-4" /> Comprovantes e Anexos
                    </h4>
                    <label className={`relative flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed transition-all ${isUploadingComprovante ? 'border-neutral-200 bg-neutral-100 text-neutral-400' : 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer'}`}>
                      {isUploadingComprovante ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                      <span className="text-[9px] font-black uppercase tracking-widest">{isUploadingComprovante ? 'Enviando comprovante...' : 'Anexar comprovante'}</span>
                      <input type="file" multiple disabled={isUploadingComprovante} onChange={(event) => { const selectedFiles = event.target.files ? Array.from(event.target.files) as File[] : []; handleUploadComprovante(selectedFiles); event.currentTarget.value = ''; }} className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" />

                    </label>
                    {anexosError && (
                      <div className="p-3 rounded-xl border border-alert-red/30 bg-alert-red/5 text-alert-red">
                        <p className="text-[9px] font-black uppercase">Não foi possível carregar os anexos</p>
                        <p className="text-[8px] font-bold mt-1">{anexosError instanceof Error ? anexosError.message : 'Erro desconhecido. O diagnóstico foi registrado.'}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2">
                      {displayedAnexos.length > 0 ? (

                      displayedAnexos.map((anexo: any, index: number) => (
                        <div key={`comprovante-${index}`} className="group flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100 border border-neutral-100 rounded-2xl transition-all">
                          <a href={anexo.url} target="_blank" rel="noreferrer" download className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-primary shrink-0">
                              <Eye className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase text-neutral-900 truncate max-w-[200px]">{anexo.nome || 'Visualizar Comprovante'}</p>
                              <p className="text-[8px] font-bold text-secondary uppercase">{anexo.tipo_arquivo || 'Formato não informado'} • {anexo.created_at ? formatDateTime(anexo.created_at) : 'Data não informada'}</p>
                            </div>
                          </a>
                          <div className="flex items-center gap-2 shrink-0">
                            <ExternalLink className="w-4 h-4 text-secondary" />
                            <button type="button" onClick={() => { if (confirm('Excluir este comprovante permanentemente?')) { const filePath = anexo.url.split('documents/')[1]; deleteAnexo({ id: anexo.id, path: filePath }); } }} className="text-[8px] font-black uppercase text-alert-red hover:underline">Excluir</button>
                          </div>
                        </div>
                      ))
                      ) : (
                        <div className="p-8 bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center text-center">
                          <Paperclip className="w-8 h-8 text-neutral-300 mb-2" />
                          <p className="text-[10px] font-black uppercase text-secondary">Nenhum comprovante anexado</p>
                          <p className="text-[8px] font-bold text-neutral-400 uppercase mt-1">É necessário um anexo para aprovação direta</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coluna da Direita: Operações e Botões */}
                <div className="w-[360px] bg-neutral-50/50 p-8 flex flex-col gap-6 shrink-0 overflow-y-auto scrollbar-thin">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-neutral-100 pb-2">
                    <CheckCircle2 className="w-4 h-4" /> Operações
                  </h4>

                  {/* Widget de Impacto Financeiro Contextual - Apenas Master vê */}
                  {isMaster && (lancamento.status_aprovacao !== 'confirmado_master' || isQuitacaoPendente) && (
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-3 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <TrendingUp className={`w-4 h-4 ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`} />
                        <span className="text-[10px] font-black uppercase text-secondary tracking-widest">
                          {isQuitacaoPendente ? 'Impacto no Saldo Real' : 'Impacto no Saldo Confirmado'}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                         <span className={`text-2xl font-black font-mono ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                           {lancamento.tipo === 'entrada' ? '+' : '-'} {formatCurrency((lancamento as any).tipo_baixa === 'avr' ? (lancamento.valor_original || lancamento.valor_previsto) : lancamento.valor_previsto)}
                         </span>
                      </div>
                    </div>
                  )}

                  {isMaster && !hasAnexo && (lancamento.status_aprovacao !== 'confirmado_master' || isQuitacaoPendente) && (
                    <div className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 transition-all cursor-pointer ${
                        dispensarComprovante ? 'bg-primary border-primary' : 'bg-white border-neutral-200'
                      }`}
                      onClick={() => setDispensarComprovante(!dispensarComprovante)}
                      >
                        {dispensarComprovante && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 cursor-pointer" onClick={() => setDispensarComprovante(!dispensarComprovante)}>
                        <p className="text-[10px] font-black uppercase text-neutral-900">Dispensar comprovante</p>
                        <p className="text-[8px] font-bold text-secondary uppercase leading-tight mt-0.5">
                          Aprovar este lançamento manualmente sem a necessidade de um anexo.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 mt-auto">
                    {lancamento.status_pagamento === 'aberto' ? (
                      <button
                        type="button"
                        disabled={!canApprove}
                        onClick={() => {
                          if (!canApprove) return;
                          setSelectedLancamentoIdForModal(lancamento.id);
                          setModalOpen('isComprovanteOpen', false);
                          setModalOpen('isBaixaLancamentoOpen', true);
                        }}
                        className={`w-full h-14 text-white transition-all rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg ${
                          canApprove ? 'bg-bank-truth-green hover:brightness-110' : 'bg-neutral-300 cursor-not-allowed opacity-70'
                        }`}
                      >
                        <CheckCircle2 className="w-5 h-5" /> {canApprove ? 'Dar baixa agora' : 'Anexe o comprovante ou dispense'}
                      </button>
                    ) : (
                      <div className="w-full p-4 bg-neutral-100 rounded-2xl border border-neutral-200 text-center">
                        <p className="text-[10px] font-black uppercase text-secondary tracking-widest">
                          {lancamento.status_pagamento === 'pago' ? 'Título Liquidado' : (isMaster ? 'Aprovação pendente via lote' : 'Aprovação reservada ao nível Master')}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={handlePrintReceipt}
                        className="w-full h-11 bg-white hover:bg-neutral-50 text-neutral-900 transition-all rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-neutral-200 shadow-sm"
                      >
                        <Printer className="w-4 h-4 text-primary" /> Imprimir / PDF
                      </button>
                      {hasAnexo && (
                        <a
                          href={anexos[0].url}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="w-full h-11 bg-primary/5 hover:bg-primary/10 text-primary transition-all rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-primary/10"
                        >
                          <Download className="w-4 h-4" /> Baixar Anexo
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function DetailItem({ icon, label, value, highlight = false }: { icon: any, label: string, value: string, highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3 group">
      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
        highlight ? 'bg-primary/10 text-primary' : 'bg-neutral-50 text-secondary group-hover:bg-neutral-100'
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[8px] font-black text-secondary uppercase tracking-widest block mb-0.5">{label}</span>
        <span className={`text-[11px] font-black uppercase truncate block ${highlight ? 'text-primary' : 'text-neutral-900'}`}>{value}</span>
      </div>
    </div>
  );
}