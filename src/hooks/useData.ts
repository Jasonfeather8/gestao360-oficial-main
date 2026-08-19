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
import { diagnosticLogger } from '../services/diagnosticLogger';
import { TipoDiferenca } from '../types';

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: notificationsService.getAll,
    enabled: !!user?.id,
    refetchInterval: 60000,
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

  const query = useQuery({ queryKey: ['lancamentos', filters], queryFn: () => lancamentosService.getAll(filters) });
  const createMutation = useMutation({ mutationFn: ({ item, recorrencia }: { item: any, recorrencia?: any }) => lancamentosService.create(item, recorrencia), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data, mode }: { id: string, data: any, mode?: 'single' | 'all' }) => lancamentosService.update(id, data, mode), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['lancamento'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const deleteMutation = useMutation({ mutationFn: ({ id, mode }: { id: string, mode?: 'single' | 'all' }) => lancamentosService.delete(id, mode), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const batchApproveMutation = useMutation({ mutationFn: ({ ids, targetStatus }: { ids: string[], targetStatus: 'digital' | 'confirmado_master' | 'reprovado' }) => lancamentosService.approveInBatch(ids, targetStatus), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const baixaMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => lancamentosService.baixaLancamento(id, data, isMaster), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['lancamento'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });

  const estornoMutation = useMutation({ mutationFn: (id: string) => lancamentosService.estornarLancamento(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });

  return {
    ...query,
    data: query.data?.data || [], 
    totalCount: query.data?.count || 0, 
    createLancamento: createMutation.mutateAsync,
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

export function useConciliacao() {
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const isMaster = role === 'master';

  const conciliacoesQuery = useQuery({ queryKey: ['conciliacoes'], queryFn: conciliacoesService.getConciliacoes });
  const transacoesQuery = useQuery({ queryKey: ['transacoes'], queryFn: conciliacoesService.getAllTransacoes });

  const importMutation = useMutation({
    mutationFn: ({ contaBancariaId, rows, importMode }: { contaBancariaId: string, rows: any[], importMode: 'entrada' | 'saida' | 'ambos' }) => 
      conciliacoesService.importCSV(contaBancariaId, rows, importMode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transacoes'] })
  });

  const linkMutation = useMutation({
    mutationFn: ({ lancamentoId, transacaoBancoId, usuarioId }: { lancamentoId: string, transacaoBancoId: string, usuarioId: string }) =>
      conciliacoesService.linkConciliacao(lancamentoId, transacaoBancoId, usuarioId, isMaster),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['conciliacoes'] }); 
      queryClient.invalidateQueries({ queryKey: ['transacoes'] }); 
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); 
    }
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ conciliacaoId }: { conciliacaoId: string }) => 
      conciliacoesService.unlinkConciliacao(conciliacaoId),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['conciliacoes'] }); 
      queryClient.invalidateQueries({ queryKey: ['transacoes'] }); 
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); 
    }
  });

  const cleanupMutation = useMutation({
    mutationFn: (contaId: string) => conciliacoesService.cleanupUnreconciled(contaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transacoes'] })
  });

  const classifyDifferenceMutation = useMutation({
    mutationFn: (data: any) => conciliacoesService.classifyDifference(data.conciliacaoId, data.tipoDiferenca, data.valorDiferenca, data.observacaoJustificativa),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diferencas'] })
  });

  return {
    conciliacoes: conciliacoesQuery.data || [],
    transacoes: transacoesQuery.data || [],
    isFetchingTransacoes: transacoesQuery.isPending,
    isLinking: linkMutation.isPending,
    isUnlinking: unlinkMutation.isPending,
    isCleaning: cleanupMutation.isPending,
    importCSV: importMutation.mutateAsync,
    linkConciliacao: linkMutation.mutateAsync,
    unlinkConciliacao: unlinkMutation.mutateAsync,
    cleanupTransacoes: cleanupMutation.mutateAsync,
    classifyDifference: classifyDifferenceMutation.mutateAsync
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