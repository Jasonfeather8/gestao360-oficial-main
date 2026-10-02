import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { entidadesService } from '../services/entidadesService';
import { centrosCustoService } from '../services/centrosCustoService';
import { categoriasService } from '../services/categoriasService';
import { contasService } from '../services/contasService';
import { lancamentosService } from '../services/lancamentosService';
import { recorrenciasService } from '../services/recorrenciasService';
import { conciliacoesService } from '../services/conciliacoesService';
import { usuariosService } from '../services/usuariosService';
import { auditoriaService } from '../services/auditoriaService';
import { notificationsService } from '../services/notificationsService';
import { transferenciasService, CriarTransferenciaPayload } from '../services/transferenciasService';
import { cofreService } from '../services/cofreService';
import { diagnosticLogger } from '../services/diagnosticLogger';
import { implantacaoService } from '../services/implantacaoService';
import { masterApprovalService } from '../services/masterApprovalService';
import { extratoImportacaoService } from '../services/extratoImportacaoService';
import { ImportConfirmationMetadata, ImportLotDraft, ImportReviewSubmissionMetadata, ImportTransaction } from '../types/extratoImportacao';

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: notificationsService.getAll,
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id) return;

    // Usando um nome único para o canal para evitar colisões
    const channelName = `notifications-${user.id}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
          queryClient.invalidateQueries({ queryKey: ['masterApprovalQueue'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: notificationsService.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsService.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  return {
    ...query,
    notifications: query.data || [],
    unreadCount: (query.data || []).filter(n => !n.read).length,
    markAsRead: markReadMutation.mutateAsync,
    markAllAsRead: markAllReadMutation.mutateAsync
  };
}

export function useMasterApprovalQueue() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const query = useQuery({
    queryKey: ['masterApprovalQueue'],
    queryFn: masterApprovalService.getQueue,
    enabled: role === 'master',
  });

  const invalidateDecisionData = () => {
    [
      'masterApprovalQueue',
      'notifications',
      'lancamentos',
      'lancamento',
      'conciliacoes',
      'diferencasConciliacao',
      'fechamentos',
      'transacoes',
      'transferenciasAbertas',
      'transferenciasPendentesMaster',
      'transferenciasCofre',
      'movimentacoesCofre',
      'cofresSaldos',
      'contasSaldos',
      'financialSummary',
      'dashboardStats',
      'consolidatedFinancialSummary',
      'auditoriaLogs',
    ].forEach(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] }));
  };

  const decisionMutation = useMutation({
    mutationFn: masterApprovalService.decide,
    onSuccess: invalidateDecisionData,
  });

  return {
    ...query,
    items: query.data || [],
    decide: decisionMutation.mutateAsync,
    isDeciding: decisionMutation.isPending,
  };
}

export function useFinancialSummary(filters?: { accountId?: string, costCenterId?: string }) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['financialSummary', user?.id, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financial_summary', {
        p_user_id: user?.id,
        p_account_id: filters?.accountId || null,
        p_cost_center_id: filters?.costCenterId || null
      });
      if (error) throw error;
      return data[0];
    },
    enabled: !!user?.id
  });
}

export function useConsolidatedFinancialSummary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['consolidatedFinancialSummary', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_consolidated_dashboard_summary');
      if (error) throw error;
      return (data?.[0] || null) as import('../types').ConsolidatedFinancialSummary | null;
    },
    enabled: !!user?.id,
  });
}

export function useImplantacaoValidation() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['implantacaoValidation', user?.id],
    queryFn: implantacaoService.consultarEvidencias,
    enabled: !!user?.id,
  });
}

export function useEntidades() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['entidades'], queryFn: entidadesService.getAll });
  const createMutation = useMutation({ mutationFn: entidadesService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidades'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => entidadesService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidades'] }) });
  const deleteMutation = useMutation({ mutationFn: entidadesService.delete, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidades'] }) });

  return {
    ...query,
    createEntity: createMutation.mutateAsync,
    updateEntity: updateMutation.mutateAsync,
    deleteEntity: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  };
}

export function useEntidadeDocuments(entidadeId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['entidadeDocuments', entidadeId], queryFn: () => entidadeId ? entidadesService.getDocuments(entidadeId) : Promise.resolve([]), enabled: !!entidadeId });
  const deleteMutation = useMutation({ mutationFn: ({ id, path }: { id: string, path: string }) => entidadesService.deleteDocument(id, path), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidadeDocuments', entidadeId] }) });

  return {
    ...query,
    documents: query.data || [],
    deleteDocument: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending
  };
}

export function useCentrosCusto() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['centrosCusto'], queryFn: centrosCustoService.getAll });
  const createMutation = useMutation({ mutationFn: centrosCustoService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centrosCusto'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => centrosCustoService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centrosCusto'] }) });
  const deleteMutation = useMutation({ mutationFn: ({ id }: { id: string }) => centrosCustoService.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centrosCusto'] }) });

  return { ...query, createCC: createMutation.mutateAsync, updateCC: updateMutation.mutateAsync, deleteCC: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useCategorias() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['categorias'], queryFn: categoriasService.getAll });
  const createMutation = useMutation({ mutationFn: categoriasService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => categoriasService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias'] }) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => categoriasService.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias'] }) });

  return { ...query, createCategory: createMutation.mutateAsync, updateCategory: updateMutation.mutateAsync, deleteCategory: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useCategoriasAjuste() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['categoriasAjuste'], queryFn: async () => { const { data, error } = await supabase.from('categorias_ajuste').select('*').order('nome'); if (error) throw error; return data; } });
  const createMutation = useMutation({ mutationFn: async (data: { nome: string, tipo: 'desconto' | 'acrescimo' }) => { const { data: { user } } = await supabase.auth.getUser(); const { data: result, error } = await supabase.from('categorias_ajuste').insert([{ ...data, user_id: user?.id }]).select().single(); if (error) throw error; return result; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoriasAjuste'] }) });
  const updateMutation = useMutation({ mutationFn: async ({ id, data }: { id: string, data: any }) => { const { error } = await supabase.from('categorias_ajuste').update(data).eq('id', id); if (error) throw error; return true; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoriasAjuste'] }) });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('categorias_ajuste').update({ status: 'inativo' }).eq('id', id); if (error) throw error; return true; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoriasAjuste'] }) });

  return { ...query, categoriasAjuste: query.data || [], createCategoriaAjuste: createMutation.mutateAsync, updateCategoriaAjuste: updateMutation.mutateAsync, deleteCategoriaAjuste: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useContasSaldos() {
  return useQuery({
    queryKey: ['contasSaldos'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contas_saldos_reais');
      if (error) throw error;
      return data as Array<{ conta_id: string; saldo_confirmado: number; saldo_operacional: number }>;
    }
  });
}

export function useContas() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['contas'], queryFn: contasService.getAll });
  const createMutation = useMutation({ mutationFn: (item: any) => contasService.create(item), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => contasService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas'] }) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => contasService.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas'] }) });

  return { ...query, createAccount: createMutation.mutateAsync, updateAccount: updateMutation.mutateAsync, deleteAccount: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useLancamentos(filters?: any) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isMaster = role === 'master';

  const query = useQuery({
    queryKey: ['lancamentos', filters],
    queryFn: ({ signal }) => lancamentosService.getAll(filters, signal),
    enabled: !filters?.conciliationWorkspace || Boolean(filters.conciliationWorkspace.accountId),
  });
  const invalidateLancamentoData = () => {
    queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    queryClient.invalidateQueries({ queryKey: ['lancamento'] });
    queryClient.invalidateQueries({ queryKey: ['conciliacoes'] });
    queryClient.invalidateQueries({ queryKey: ['diferencasConciliacao'] });
    queryClient.invalidateQueries({ queryKey: ['transacoes'] });
    queryClient.invalidateQueries({ queryKey: ['fechamentos'] });
    queryClient.invalidateQueries({ queryKey: ['transferenciasAbertas'] });
    queryClient.invalidateQueries({ queryKey: ['transferenciasSugestoesDestino'] });
    queryClient.invalidateQueries({ queryKey: ['transferenciasPendentesMaster'] });
    queryClient.invalidateQueries({ queryKey: ['contasSaldos'] });
    queryClient.invalidateQueries({ queryKey: ['financialSummary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] });
    queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] });
  };
  const createMutation = useMutation({ mutationFn: ({ item, recorrencia }: { item: any, recorrencia?: any }) => lancamentosService.create(item, recorrencia), onSuccess: invalidateLancamentoData });
  const createFromTransactionMutation = useMutation({
    mutationFn: ({ transacaoBancoId, dadosComerciais }: { transacaoBancoId: string; dadosComerciais: Record<string, unknown> }) => lancamentosService.criarAPartirDeTransacao(transacaoBancoId, dadosComerciais),
    onSuccess: invalidateLancamentoData,
  });
  const updateMutation = useMutation({ mutationFn: ({ id, data, mode }: { id: string, data: any, mode?: 'single' | 'all' }) => lancamentosService.update(id, data, mode), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['lancamento'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] }); } });
  const deleteMutation = useMutation({ mutationFn: ({ id, mode }: { id: string, mode?: 'single' | 'all' }) => lancamentosService.delete(id, mode), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); queryClient.invalidateQueries({ queryKey: ['financialSummary'] }); queryClient.invalidateQueries({ queryKey: ['dashboardStats'] }); queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] }); } });
  const batchApproveMutation = useMutation({ mutationFn: ({ ids, targetStatus }: { ids: string[], targetStatus: 'digital' | 'confirmado_master' | 'reprovado' }) => lancamentosService.approveInBatch(ids, targetStatus), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] }); } });
  const baixaMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => lancamentosService.baixaLancamento(id, data, isMaster), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['lancamento'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] }); } });

  const estornoMutation = useMutation({ mutationFn: (id: string) => lancamentosService.estornarLancamento(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); queryClient.invalidateQueries({ queryKey: ['financialSummary'] }); queryClient.invalidateQueries({ queryKey: ['dashboardStats'] }); queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] }); } });

  return {
    ...query,
    data: query.data?.data || [],
    totalCount: query.data?.count || 0,
    createLancamento: createMutation.mutateAsync,
    createLancamentoFromTransaction: createFromTransactionMutation.mutateAsync,
    updateLancamento: updateMutation.mutateAsync,
    deleteLancamento: deleteMutation.mutateAsync,
    baixaLancamento: baixaMutation.mutateAsync,
    estornarLancamento: estornoMutation.mutateAsync,
    batchApprove: batchApproveMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBatchApproving: batchApproveMutation.isPending
  };
}

export function useLancamento(id: string | null) {
  return useQuery({ queryKey: ['lancamento', id], queryFn: () => id ? lancamentosService.getById(id) : Promise.resolve(null), enabled: !!id });
}

export function useLancamentoParcelas(recorrenciaId: string | null) {
  return useQuery({
    queryKey: ['lancamentoParcelas', recorrenciaId],
    queryFn: () => recorrenciaId ? lancamentosService.getParcelasByRecorrenciaId(recorrenciaId) : Promise.resolve([]),
    enabled: !!recorrenciaId,
  });
}

export function useLancamentoAnexosByIds(lancamentoIds: string[]) {
  const ids = Array.from(new Set(lancamentoIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['lancamentoAnexosByIds', ids],
    queryFn: () => lancamentosService.getAnexosByLancamentoIds(ids),
    enabled: ids.length > 0,
  });
}

export function useAuditoriaLogsByRegistroIds(registroIds: string[]) {
  const ids = Array.from(new Set(registroIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['auditoriaLogs', 'registros', ids],
    queryFn: () => auditoriaService.getByRegistroIds(ids),
    enabled: ids.length > 0,
  });
}

export function useLancamentoAnexos(lancamentoId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['lancamentoAnexos', lancamentoId],
    queryFn: async () => {
      if (!lancamentoId) return [];
      diagnosticLogger.info('lancamento-anexos', 'Consultando anexos', { lancamentoId });
      const anexos = await lancamentosService.getAnexos(lancamentoId);
      diagnosticLogger.info('lancamento-anexos', 'Anexos consultados', { lancamentoId, count: anexos.length });
      return anexos;
    },
    enabled: !!lancamentoId,
    meta: { feature: 'lancamento-anexos' },
  });
  const deleteMutation = useMutation({ mutationFn: ({ id, path }: { id: string, path: string }) => lancamentosService.deleteAnexo(id, path), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lancamentoAnexos', lancamentoId] }) });

  return { ...query, anexos: query.data || [], deleteAnexo: deleteMutation.mutateAsync, isDeleting: deleteMutation.isPending };

}

export function useRecorrencias() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['recorrencias'], queryFn: recorrenciasService.getAll });
  const stopMutation = useMutation({ mutationFn: recorrenciasService.stopRecorrencia, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recorrencias'] }); queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); } });

  return { ...query, stopRecorrencia: stopMutation.mutateAsync, isStopping: stopMutation.isPending };
}

export function useConciliacaoImportLots(accountId: string) {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['conciliationImportLots', accountId],
    queryFn: () => extratoImportacaoService.getConciliationLots(accountId),
    enabled: (role === 'master' || role === 'gerente') && Boolean(accountId),
  });
}

export function useConciliacao() {
  const queryClient = useQueryClient();

  const conciliacoesQuery = useQuery({ queryKey: ['conciliacoes'], queryFn: conciliacoesService.getConciliacoes });
  const transacoesQuery = useQuery({ queryKey: ['transacoes'], queryFn: conciliacoesService.getAllTransacoes });
  const diferencasQuery = useQuery({ queryKey: ['diferencasConciliacao'], queryFn: conciliacoesService.getDiferencas });
  const fechamentosQuery = useQuery({ queryKey: ['fechamentos'], queryFn: conciliacoesService.getFechamentos });

  const invalidateFechamentoData = () => {
    queryClient.invalidateQueries({ queryKey: ['fechamentos'] });
    queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    queryClient.invalidateQueries({ queryKey: ['transacoes'] });
    queryClient.invalidateQueries({ queryKey: ['conciliacoes'] });
    queryClient.invalidateQueries({ queryKey: ['diferencasConciliacao'] });
    queryClient.invalidateQueries({ queryKey: ['contasSaldos'] });
    queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] });
    queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] });
  };

  const fecharPeriodoMutation = useMutation({
    mutationFn: ({ contaId, periodoInicio, periodoFim }: { contaId: string; periodoInicio: string; periodoFim: string }) =>
      conciliacoesService.fecharPeriodo(contaId, periodoInicio, periodoFim),
    onSuccess: invalidateFechamentoData,
  });

  const decidirFechamentoMutation = useMutation({
    mutationFn: ({ fechamentoId, aprovado, justificativa }: { fechamentoId: string; aprovado: boolean; justificativa?: string | null }) =>
      conciliacoesService.decidirFechamento(fechamentoId, aprovado, justificativa),
    onSuccess: invalidateFechamentoData,
  });

  const prepareImportMutation = useMutation({
    mutationFn: ({ file, contaBancariaId, userId }: { file: File; contaBancariaId: string; userId: string }) =>
      conciliacoesService.prepareImportFile(file, contaBancariaId, userId),
  });

  const invalidateConfirmedImportData = () => {
    [
      'transacoes',
      'conciliacoes',
      'transferenciasAbertas',
      'transferenciasSugestoesDestino',
      'transferenciasPendentesMaster',
      'fechamentos',
      'contasSaldos',
      'financialSummary',
      'consolidatedFinancialSummary',
      'dashboardStats',
      'auditoriaLogs',
    ].forEach(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] }));
  };

  const confirmImportMutation = useMutation({
    mutationFn: ({ lot, transactions, metadata }: { lot: ImportLotDraft; transactions: ImportTransaction[]; metadata?: ImportConfirmationMetadata }) =>
      conciliacoesService.confirmImport(lot, transactions, metadata),
    onSuccess: invalidateConfirmedImportData,
  });

  const submitImportForReviewMutation = useMutation({
    mutationFn: ({ lot, metadata }: { lot: ImportLotDraft; metadata: ImportReviewSubmissionMetadata }) =>
      extratoImportacaoService.submitImportForReview(lot, metadata),
  });

  const linkMutation = useMutation({
    mutationFn: conciliacoesService.linkConciliacao,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conciliacoes'] });
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['diferencasConciliacao'] });
      queryClient.invalidateQueries({ queryKey: ['fechamentos'] });
      queryClient.invalidateQueries({ queryKey: ['transferenciasAbertas'] });
      queryClient.invalidateQueries({ queryKey: ['transferenciasSugestoesDestino'] });
      queryClient.invalidateQueries({ queryKey: ['transferenciasPendentesMaster'] });
      queryClient.invalidateQueries({ queryKey: ['contasSaldos'] });
      queryClient.invalidateQueries({ queryKey: ['financialSummary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] });
      queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] });
    }
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ conciliacaoId }: { conciliacaoId: string }) =>
      conciliacoesService.unlinkConciliacao(conciliacaoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conciliacoes'] });
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['diferencasConciliacao'] });
      queryClient.invalidateQueries({ queryKey: ['fechamentos'] });
      queryClient.invalidateQueries({ queryKey: ['transferenciasAbertas'] });
      queryClient.invalidateQueries({ queryKey: ['transferenciasSugestoesDestino'] });
      queryClient.invalidateQueries({ queryKey: ['transferenciasPendentesMaster'] });
      queryClient.invalidateQueries({ queryKey: ['contasSaldos'] });
      queryClient.invalidateQueries({ queryKey: ['financialSummary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] });
      queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] });
    }
  });

  const cleanupMutation = useMutation({
    mutationFn: (contaId: string) => conciliacoesService.cleanupUnreconciled(contaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transacoes'] })
  });

  return {
    conciliacoes: conciliacoesQuery.data || [],
    transacoes: transacoesQuery.data || [],
    diferencas: diferencasQuery.data || [],
    fechamentos: fechamentosQuery.data || [],
    workspaceDataUpdatedAt: Math.max(
      conciliacoesQuery.dataUpdatedAt,
      transacoesQuery.dataUpdatedAt,
      diferencasQuery.dataUpdatedAt,
      fechamentosQuery.dataUpdatedAt,
    ),
    isFetchingTransacoes: transacoesQuery.isPending,
    isFetchingFechamentos: fechamentosQuery.isPending,
    isLinking: linkMutation.isPending,
    isUnlinking: unlinkMutation.isPending,
    isCleaning: cleanupMutation.isPending,
    prepareImport: prepareImportMutation.mutateAsync,
    confirmImport: confirmImportMutation.mutateAsync,
    submitImportForReview: submitImportForReviewMutation.mutateAsync,
    cancelImport: conciliacoesService.cleanupImport,
    isPreparingImport: prepareImportMutation.isPending,
    isConfirmingImport: confirmImportMutation.isPending,
    isSubmittingImportReview: submitImportForReviewMutation.isPending,
    linkConciliacao: linkMutation.mutateAsync,
    unlinkConciliacao: unlinkMutation.mutateAsync,
    cleanupTransacoes: cleanupMutation.mutateAsync,
    fecharPeriodo: fecharPeriodoMutation.mutateAsync,
    decidirFechamento: decidirFechamentoMutation.mutateAsync,
    isFechandoPeriodo: fecharPeriodoMutation.isPending,
    isDecidindoFechamento: decidirFechamentoMutation.isPending
  };
}

export function useTransferencias(transacaoDestinoId: string | null = null) {
  const queryClient = useQueryClient();
  const transferenciasQuery = useQuery({
    queryKey: ['transferenciasAbertas'],
    queryFn: transferenciasService.listarAbertas,
  });
  const suggestionsQuery = useQuery({
    queryKey: ['transferenciasSugestoesDestino', transacaoDestinoId],
    queryFn: () => transferenciasService.sugerirDestino(transacaoDestinoId as string),
    enabled: !!transacaoDestinoId,
  });
  const pendingMasterQuery = useQuery({
    queryKey: ['transferenciasPendentesMaster'],
    queryFn: transferenciasService.listarPendentesMaster,
    enabled: true,
  });

  const invalidateTransferenciaData = () => {
    queryClient.invalidateQueries({ queryKey: ['transferenciasAbertas'] });
    queryClient.invalidateQueries({ queryKey: ['transferenciasSugestoesDestino'] });
    queryClient.invalidateQueries({ queryKey: ['transferenciasPendentesMaster'] });
    queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    queryClient.invalidateQueries({ queryKey: ['conciliacoes'] });
    queryClient.invalidateQueries({ queryKey: ['diferencasConciliacao'] });
    queryClient.invalidateQueries({ queryKey: ['fechamentos'] });
    queryClient.invalidateQueries({ queryKey: ['transacoes'] });
    queryClient.invalidateQueries({ queryKey: ['contasSaldos'] });
    queryClient.invalidateQueries({ queryKey: ['financialSummary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    queryClient.invalidateQueries({ queryKey: ['consolidatedFinancialSummary'] });
    queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CriarTransferenciaPayload) => transferenciasService.criar(payload),
    onSuccess: invalidateTransferenciaData,
  });
  const reconcileMutation = useMutation({
    mutationFn: ({ transferenciaId, transacaoId, lado }: { transferenciaId: string; transacaoId: string; lado: 'origem' | 'destino' }) =>
      transferenciasService.conciliar(transferenciaId, transacaoId, lado),
    onSuccess: invalidateTransferenciaData,
  });
  const identifyMutation = useMutation({
    mutationFn: ({ transacaoId, contaRelacionadaId }: { transacaoId: string; contaRelacionadaId: string }) =>
      transferenciasService.identificarTransacao(transacaoId, contaRelacionadaId),
    onSuccess: invalidateTransferenciaData,
  });
  const reverseMutation = useMutation({
    mutationFn: ({ transferenciaId, motivo }: { transferenciaId: string; motivo?: string }) => transferenciasService.estornar(transferenciaId, motivo),
    onSuccess: invalidateTransferenciaData,
  });
  const decisionMutation = useMutation({
    mutationFn: ({ transferenciaId, aprovado, justificativa }: { transferenciaId: string; aprovado: boolean; justificativa?: string | null }) =>
      transferenciasService.decidir(transferenciaId, aprovado, justificativa),
    onSuccess: invalidateTransferenciaData,
  });

  return {
    transferencias: transferenciasQuery.data || [],
    transferenciasPendentesMaster: pendingMasterQuery.data || [],
    suggestions: suggestionsQuery.data || [],
    isLoadingSuggestions: suggestionsQuery.isPending,
    createTransferencia: createMutation.mutateAsync,
    reconcileTransferencia: reconcileMutation.mutateAsync,
    identifyTransactionTransferencia: identifyMutation.mutateAsync,
    reverseTransferencia: reverseMutation.mutateAsync,
    decideTransferencia: decisionMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isReconciling: reconcileMutation.isPending,
    isIdentifyingTransactionTransferencia: identifyMutation.isPending,
    isReversing: reverseMutation.isPending,
    isDecidingTransferencia: decisionMutation.isPending,
  };
}

export function useCofreLocal(cofreId?: string) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const cofresQuery = useQuery({ queryKey: ['cofres'], queryFn: cofreService.listarCofres });
  const saldosQuery = useQuery({ queryKey: ['cofresSaldos'], queryFn: cofreService.listarSaldos });
  const movimentosQuery = useQuery({ queryKey: ['movimentacoesCofre', cofreId], queryFn: () => cofreService.listarMovimentacoes(cofreId) });
  const transferenciasQuery = useQuery({ queryKey: ['transferenciasCofre'], queryFn: cofreService.listarTransferencias });

  const invalidate = () => {
    ['cofres', 'cofresSaldos', 'movimentacoesCofre', 'transferenciasCofre', 'lancamentos', 'contasSaldos', 'conciliacoes', 'transacoes', 'diferencasConciliacao', 'fechamentos', 'financialSummary', 'dashboardStats', 'consolidatedFinancialSummary', 'auditoriaLogs'].forEach(queryKey => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const criarCofreMutation = useMutation({ mutationFn: cofreService.criarCofre, onSuccess: invalidate });
  const atualizarCofreMutation = useMutation({ mutationFn: cofreService.atualizarCofre, onSuccess: invalidate });
  const movimentacaoMutation = useMutation({ mutationFn: cofreService.criarMovimentacao, onSuccess: invalidate });
  const transferenciaMutation = useMutation({ mutationFn: cofreService.criarTransferencia, onSuccess: invalidate });
  const confirmarMutation = useMutation({ mutationFn: cofreService.confirmarRecebimento, onSuccess: invalidate });
  const decidirMovimentacaoMutation = useMutation({ mutationFn: cofreService.decidirMovimentacao, onSuccess: invalidate });
  const decidirTransferenciaMutation = useMutation({ mutationFn: cofreService.decidirTransferencia, onSuccess: invalidate });
  const conciliarTransferenciaMutation = useMutation({
    mutationFn: ({ transferenciaId, transacaoBancoId }: { transferenciaId: string; transacaoBancoId: string }) =>
      cofreService.conciliarTransferencia(transferenciaId, transacaoBancoId),
    onSuccess: invalidate,
  });
  const listarCandidatasMutation = useMutation({ mutationFn: cofreService.listarTransacoesCandidatas });
  const situacaoBancariaMutation = useMutation({ mutationFn: cofreService.consultarSituacaoBancaria });
  const estornarMovimentacaoMutation = useMutation({ mutationFn: ({ id, motivo }: { id: string; motivo: string }) => cofreService.estornarMovimentacao(id, motivo), onSuccess: invalidate });
  const estornarTransferenciaMutation = useMutation({ mutationFn: ({ id, motivo }: { id: string; motivo: string }) => cofreService.estornarTransferencia(id, motivo), onSuccess: invalidate });

  return {
    role,
    cofres: cofresQuery.data || [],
    saldos: saldosQuery.data || [],
    movimentacoes: movimentosQuery.data || [],
    transferencias: transferenciasQuery.data || [],
    isLoading: cofresQuery.isLoading || saldosQuery.isLoading || movimentosQuery.isLoading || transferenciasQuery.isLoading,
    criarCofre: criarCofreMutation.mutateAsync,
    atualizarCofre: atualizarCofreMutation.mutateAsync,
    criarMovimentacao: movimentacaoMutation.mutateAsync,
    criarTransferencia: transferenciaMutation.mutateAsync,
    confirmarRecebimento: confirmarMutation.mutateAsync,
    decidirMovimentacao: decidirMovimentacaoMutation.mutateAsync,
    decidirTransferencia: decidirTransferenciaMutation.mutateAsync,
    conciliarTransferencia: conciliarTransferenciaMutation.mutateAsync,
    listarTransacoesCandidatas: listarCandidatasMutation.mutateAsync,
    consultarSituacaoBancaria: situacaoBancariaMutation.mutateAsync,
    estornarMovimentacao: estornarMovimentacaoMutation.mutateAsync,
    estornarTransferencia: estornarTransferenciaMutation.mutateAsync,
    isConciliandoTransferencia: conciliarTransferenciaMutation.isPending,
    isMutating: [criarCofreMutation, atualizarCofreMutation, movimentacaoMutation, transferenciaMutation, confirmarMutation, decidirMovimentacaoMutation, decidirTransferenciaMutation, conciliarTransferenciaMutation, estornarMovimentacaoMutation, estornarTransferenciaMutation].some(mutation => mutation.isPending),
  };
}

export function useUsuarios() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['usuarios'], queryFn: usuariosService.getAll });
  const createMutation = useMutation({ mutationFn: usuariosService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => usuariosService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }) });

  return { ...query, inviteUser: createMutation.mutateAsync, updateUser: updateMutation.mutateAsync, isInviting: createMutation.isPending };
}

export function useAuditoriaLogs() {
  return useQuery({ queryKey: ['auditoriaLogs'], queryFn: auditoriaService.getAll });
}