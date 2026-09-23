import { supabase } from '@/integrations/supabase/client';
import {
  CofreLocal,
  CofreSaldo,
  MovimentacaoCofre,
  TransferenciaCofre,
  CriarMovimentacaoCofrePayload,
  CriarTransferenciaCofrePayload,
} from '../types';

const toCents = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('Informe um valor válido.');
  const cents = Math.round(value * 100);
  if (cents <= 0) throw new Error('O valor deve ser maior que zero.');
  return cents;
};

const requireText = (value: string, message: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(message);
  return normalized;
};

export const cofreService = {
  listarCofres: async (): Promise<CofreLocal[]> => {
    const { data, error } = await supabase.from('cofres_locais').select('*').order('nome');
    if (error) throw error;
    return (data || []) as CofreLocal[];
  },

  listarSaldos: async (): Promise<CofreSaldo[]> => {
    const { data, error } = await supabase.rpc('get_cofres_saldos');
    if (error) throw error;
    return (data || []) as CofreSaldo[];
  },

  listarMovimentacoes: async (cofreId?: string): Promise<MovimentacaoCofre[]> => {
    let query = supabase.from('movimentacoes_cofre').select('*').order('created_at', { ascending: false });
    if (cofreId) query = query.eq('cofre_id', cofreId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as MovimentacaoCofre[];
  },

  listarTransferencias: async (): Promise<TransferenciaCofre[]> => {
    const { data, error } = await supabase
      .from('transferencias_cofre')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as TransferenciaCofre[];
  },

  criarCofre: async ({ nome, saldoInicial }: { nome: string; saldoInicial: number }): Promise<CofreLocal> => {
    if (!Number.isFinite(saldoInicial) || saldoInicial < 0) throw new Error('O saldo inicial não pode ser negativo.');
    const { data, error } = await supabase.rpc('criar_cofre', {
      p_nome: requireText(nome, 'Informe o nome do cofre.'),
      p_saldo_inicial_centavos: Math.round(saldoInicial * 100),
    });
    if (error) throw error;
    return data as CofreLocal;
  },

  atualizarCofre: async ({ id, nome, status }: { id: string; nome: string; status: 'ativo' | 'inativo' }): Promise<CofreLocal> => {
    const { data, error } = await supabase.rpc('atualizar_cofre', {
      p_cofre_id: id,
      p_nome: requireText(nome, 'Informe o nome do cofre.'),
      p_status: status,
    });
    if (error) throw error;
    return data as CofreLocal;
  },

  // Atomic contract: value is sent in integer cents; the server assigns responsavel_id,
  // validates the active vault/open write-off and approval role, and never accepts a client balance.
  criarMovimentacao: async (payload: CriarMovimentacaoCofrePayload): Promise<MovimentacaoCofre> => {
    const { data, error } = await supabase.rpc('criar_movimentacao_cofre', {
      p_cofre_id: payload.cofreId,
      p_tipo: payload.tipo,
      p_valor_centavos: toCents(payload.valor),
      p_data_movimentacao: payload.dataMovimentacao,
      p_descricao: requireText(payload.descricao, 'Informe a descrição da movimentação.'),
      p_origem: payload.origem,
      p_lancamento_id: payload.lancamentoId || null,
    });
    if (error) throw error;
    return data as MovimentacaoCofre;
  },

  // Atomic contract: creates one transfer header, one vault movement and one linked bank launch;
  // the initial state is receipt-pending and the server alone can approve financial effects.
  criarTransferencia: async (payload: CriarTransferenciaCofrePayload): Promise<TransferenciaCofre> => {
    const { data, error } = await supabase.rpc('criar_transferencia_cofre', {
      p_direcao: payload.direcao,
      p_conta_bancaria_id: payload.contaBancariaId,
      p_cofre_id: payload.cofreId,
      p_valor_centavos: toCents(payload.valor),
      p_data_transferencia: payload.dataTransferencia,
    });
    if (error) throw error;
    return data as TransferenciaCofre;
  },

  confirmarRecebimento: async (transferenciaId: string): Promise<TransferenciaCofre> => {
    const { data, error } = await supabase.rpc('confirmar_recebimento_cofre', {
      p_transferencia_id: transferenciaId,
    });
    if (error) throw error;
    return data as TransferenciaCofre;
  },

  decidirMovimentacao: async ({ id, aprovado, justificativa }: { id: string; aprovado: boolean; justificativa?: string }): Promise<MovimentacaoCofre> => {
    if (!aprovado && !justificativa?.trim()) throw new Error('A justificativa é obrigatória para reprovar.');
    const { data, error } = await supabase.rpc('decidir_movimentacao_cofre', {
      p_movimentacao_id: id,
      p_aprovado: aprovado,
      p_motivo_reprovacao: aprovado ? null : justificativa?.trim(),
    });
    if (error) throw error;
    return data as MovimentacaoCofre;
  },

  decidirTransferencia: async ({ id, aprovado, justificativa }: { id: string; aprovado: boolean; justificativa?: string }): Promise<TransferenciaCofre> => {
    if (!aprovado && !justificativa?.trim()) throw new Error('A justificativa é obrigatória para reprovar.');
    const { data, error } = await supabase.rpc('decidir_transferencia_cofre', {
      p_transferencia_id: id,
      p_aprovado: aprovado,
      p_motivo_reprovacao: aprovado ? null : justificativa?.trim(),
    });
    if (error) throw error;
    return data as TransferenciaCofre;
  },

  estornarMovimentacao: async (movimentacaoId: string, motivo: string): Promise<MovimentacaoCofre> => {
    const { data, error } = await supabase.rpc('estornar_movimentacao_cofre', {
      p_movimentacao_id: movimentacaoId,
      p_motivo: requireText(motivo, 'Informe o motivo do estorno.'),
    });
    if (error) throw error;
    return data as MovimentacaoCofre;
  },

  estornarTransferencia: async (transferenciaId: string, motivo: string): Promise<TransferenciaCofre> => {
    const { data, error } = await supabase.rpc('estornar_transferencia_cofre', {
      p_transferencia_id: transferenciaId,
      p_motivo: requireText(motivo, 'Informe o motivo do estorno.'),
    });
    if (error) throw error;
    return data as TransferenciaCofre;
  },
};

export default cofreService;
