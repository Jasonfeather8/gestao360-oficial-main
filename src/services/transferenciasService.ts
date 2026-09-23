import { supabase } from '@/integrations/supabase/client';
import { TransferenciaBancaria, TransferenciaDestinoSugestao } from '../types';

export interface CriarTransferenciaPayload {
  contaOrigemId: string;
  contaDestinoId: string;
  valor: number;
  dataTransferencia: string;
  tarifa?: number;
  tarifaCategoriaId?: string | null;
  tarifaCentroCustoId?: string | null;
}

const toCents = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('Informe um valor válido para a transferência.');
  const cents = Math.round(value * 100);
  if (cents <= 0) throw new Error('O valor da transferência deve ser maior que zero.');
  return cents;
};

export const transferenciasService = {
  criar: async (payload: CriarTransferenciaPayload): Promise<TransferenciaBancaria> => {
    if (!payload.contaOrigemId || !payload.contaDestinoId) throw new Error('Selecione as contas de origem e destino.');
    if (payload.contaOrigemId === payload.contaDestinoId) throw new Error('As contas de origem e destino devem ser diferentes.');
    if (!payload.dataTransferencia) throw new Error('Informe a data da transferência.');

    const tarifaCentavos = payload.tarifa ? toCents(payload.tarifa) : 0;
    const { data, error } = await supabase.rpc('criar_transferencia_atomica', {
      p_conta_origem_id: payload.contaOrigemId,
      p_conta_destino_id: payload.contaDestinoId,
      p_valor_centavos: toCents(payload.valor),
      p_data_transferencia: payload.dataTransferencia,
      p_tarifa_centavos: tarifaCentavos,
      p_tarifa_categoria_id: payload.tarifaCategoriaId || null,
      p_tarifa_centro_custo_id: payload.tarifaCentroCustoId || null,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },

  listarAbertas: async (): Promise<TransferenciaBancaria[]> => {
    const { data, error } = await supabase
      .from('transferencias_bancarias')
      .select('*')
      .neq('status', 'estornada')
      .order('data_transferencia', { ascending: false });
    if (error) throw error;
    return (data || []) as TransferenciaBancaria[];
  },

  listarPendentesMaster: async (): Promise<TransferenciaBancaria[]> => {
    const { data, error } = await supabase
      .from('transferencias_bancarias')
      .select('*')
      .eq('status', 'conciliada_pendente_master')
      .order('data_transferencia', { ascending: false });
    if (error) throw error;
    return (data || []) as TransferenciaBancaria[];
  },

  decidir: async (transferenciaId: string, aprovado: boolean, justificativa?: string | null): Promise<TransferenciaBancaria> => {
    if (!transferenciaId) throw new Error('Transferência é obrigatória.');
    if (!aprovado && !justificativa?.trim()) throw new Error('A justificativa da reprovação é obrigatória.');
    const { data, error } = await supabase.rpc('decidir_transferencia_bancaria', {
      p_transferencia_id: transferenciaId,
      p_aprovado: aprovado,
      p_justificativa: justificativa?.trim() || null,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },

  sugerirDestino: async (transacaoId: string): Promise<TransferenciaDestinoSugestao[]> => {
    if (!transacaoId) return [];
    const { data, error } = await supabase.rpc('sugerir_transferencias_destino', {
      p_transacao_id: transacaoId,
    });
    if (error) throw error;
    return (data || []) as TransferenciaDestinoSugestao[];
  },

  conciliar: async (transferenciaId: string, transacaoId: string, lado: 'origem' | 'destino'): Promise<TransferenciaBancaria> => {
    if (!transferenciaId || !transacaoId) throw new Error('Transferência e transação bancária são obrigatórias.');
    const { data, error } = await supabase.rpc('conciliar_transferencia_atomica', {
      p_transferencia_id: transferenciaId,
      p_transacao_id: transacaoId,
      p_lado: lado,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },

  estornar: async (transferenciaId: string, motivo?: string): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('estornar_transferencia_atomica', {
      p_transferencia_id: transferenciaId,
      p_motivo: motivo?.trim() || null,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },
};

export default transferenciasService;
