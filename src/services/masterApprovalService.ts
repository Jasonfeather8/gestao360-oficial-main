import { supabase } from '@/integrations/supabase/client';
import { MasterApprovalDecision, MasterApprovalQueueItem } from '../types';

export const masterApprovalService = {
  async getQueue(): Promise<MasterApprovalQueueItem[]> {
    const { data, error } = await supabase.rpc('get_master_approval_queue');
    if (error) throw error;
    return (data || []) as MasterApprovalQueueItem[];
  },

  async decide(decision: MasterApprovalDecision): Promise<Record<string, unknown>> {
    if (!decision.itemId || !decision.tipo) throw new Error('Item e tipo são obrigatórios.');
    if (!decision.aprovado && !decision.justificativa?.trim()) {
      throw new Error('A justificativa é obrigatória para reprovar.');
    }

    const { data, error } = await supabase.rpc('decidir_aprovacao_master', {
      p_item_id: decision.itemId,
      p_tipo: decision.tipo,
      p_aprovado: decision.aprovado,
      p_justificativa: decision.aprovado ? null : decision.justificativa.trim(),
    });
    if (error) throw error;

    const result = (data || {}) as Record<string, unknown>;
    if (result.bloqueada === true) {
      throw new Error(String(result.mensagem));
    }

    return result;
  },
};

export default masterApprovalService;
