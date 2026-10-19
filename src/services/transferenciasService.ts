import { supabase } from '@/integrations/supabase/client';
import type { TransferenciaBancaria } from '../types';

export interface CriarTransferenciaParams {
  contaOrigemId: string;
  contaDestinoId: string;
  valorCentavos: number;
  dataTransferencia: string;
  tarifaCentavos?: number;
  tarifaCategoriaId?: string;
  tarifaCentroCustoId?: string;
  observacao?: string;
}

export const transferenciasService = {
  listar: async (): Promise<TransferenciaBancaria[]> => {
    const { data, error } = await supabase
      .from('transferencias_bancarias')
      .select('*, conta_origem:contas_bancarias!transferencias_bancarias_conta_origem_id_fkey(nome), conta_destino:contas_bancarias!transferencias_bancarias_conta_destino_id_fkey(nome)')
      .order('data_transferencia', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as TransferenciaBancaria[];
  },

  criar: async (params: CriarTransferenciaParams): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('criar_transferencia_atomica', {
      p_conta_origem_id: params.contaOrigemId,
      p_conta_destino_id: params.contaDestinoId,
      p_valor_centavos: Math.trunc(params.valorCentavos),
      p_data_transferencia: params.dataTransferencia,
      p_tarifa_centavos: Math.trunc(params.tarifaCentavos ?? 0),
      p_tarifa_categoria_id: params.tarifaCategoriaId || null,
      p_tarifa_centro_custo_id: params.tarifaCentroCustoId || null,
      p_observacao: params.observacao?.trim() || null,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },
};
