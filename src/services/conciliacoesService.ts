import { supabase } from '@/integrations/supabase/client';
import { Conciliacao, TransacaoBanco, DiferencaFinanceira, TipoDiferenca } from '../types';

export const conciliacoesService = {
  getConciliacoes: async (): Promise<Conciliacao[]> => {
    const { data, error } = await supabase.from('conciliacoes').select('*');
    if (error) throw error;
    return data as Conciliacao[];
  },

  getAllTransacoes: async (): Promise<TransacaoBanco[]> => {
    const { data, error } = await supabase
      .from('transacoes_banco')
      .select('*')
      .order('data_transacao', { ascending: false });
    if (error) throw error;
    return data as TransacaoBanco[];
  },

  importCSV: async (contaBancariaId: string, rows: any[], importMode: 'entrada' | 'saida' | 'ambos' = 'ambos'): Promise<boolean> => {
    const normalizeDate = (dateStr: string) => {
      if (!dateStr) return new Date().toISOString().split('T')[0];
      const cleanDate = dateStr.trim().split(' ')[0];
      if (cleanDate.includes('/')) {
        const [day, month, year] = cleanDate.split('/');
        const y = (year || '').length === 2 ? `20${year}` : year;
        return `${y}-${(month || '').padStart(2, '0')}-${(day || '').padStart(2, '0')}`;
      }
      return cleanDate;
    };

    const seenHashes = new Set<string>();
    const transacoes: any[] = [];

    rows.forEach(row => {
      const dataIso = normalizeDate(row.data);
      let valor = row.valor || 0;
      
      // Sanitização de valor para garantir que débitos sejam negativos e créditos positivos
      if (importMode === 'saida') valor = -Math.abs(valor);
      else if (importMode === 'entrada') valor = Math.abs(valor);
      
      const desc = (row.descricao || 'Sem descrição').substring(0, 255);
      const doc = (row.documento || '').substring(0, 50);
      const hash = `${contaBancariaId}-${dataIso}-${valor}-${desc}-${doc}`;

      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        transacoes.push({
          conta_bancaria_id: contaBancariaId,
          data_transacao: dataIso,
          valor: valor,
          descricao_banco: desc,
          numero_documento: doc,
          tipo_movimento: valor < 0 ? 'debito' : 'credito',
          hash_transacao: hash,
          status_conciliacao: false
        });
      }
    });

    if (transacoes.length === 0) return true;

    const { error } = await supabase.from('transacoes_banco').upsert(transacoes, { onConflict: 'hash_transacao' });
    
    if (error) {
      throw new Error(`[Erro de Banco] ${error.message}`);
    }
    return true;
  },

  // Nova função para limpar transações importadas que não foram utilizadas
  cleanupUnreconciled: async (contaId: string): Promise<void> => {
    const { error } = await supabase
      .from('transacoes_banco')
      .delete()
      .eq('conta_bancaria_id', contaId)
      .eq('status_conciliacao', false);
    
    if (error) throw error;
  },

  linkConciliacao: async (lancamentoId: string, transacaoBancoId: string, usuarioId: string, isMaster: boolean = true): Promise<Conciliacao> => {
    const { data, error } = await supabase.from('conciliacoes').insert([{ lancamento_id: lancamentoId, transacao_banco_id: transacaoBancoId, usuario_conciliador_id: usuarioId, data_conciliacao: new Date().toISOString() }]).select().single();
    if (error) throw error;
    
    const finalStatus = isMaster ? 'pago' : 'quitação_pendente';
    
    // Capturamos a data da transação para usar como data de pagamento real
    const { data: tx } = await supabase.from('transacoes_banco').select('data_transacao, valor').eq('id', transacaoBancoId).single();

    await supabase.from('lancamentos_financeiros').update({ 
      status_pagamento: finalStatus,
      data_pagamento: tx?.data_transacao || new Date().toISOString().split('T')[0],
      valor_recebido: Math.abs(tx?.valor || 0)
    }).eq('id', lancamentoId);

    await supabase.from('transacoes_banco').update({ status_conciliacao: true }).eq('id', transacaoBancoId);
    return data as Conciliacao;
  },

  unlinkConciliacao: async (conciliacaoId: string): Promise<boolean> => {
    const { data: con } = await supabase.from('conciliacoes').select('*').eq('id', conciliacaoId).single();
    if (con) {
      await supabase.from('lancamentos_financeiros').update({ status_pagamento: 'aberto', data_pagamento: null, valor_recebido: 0 }).eq('id', con.lancamento_id);
      await supabase.from('transacoes_banco').update({ status_conciliacao: false }).eq('id', con.transacao_banco_id);
      await supabase.from('conciliacoes').delete().eq('id', conciliacaoId);
    }
    return true;
  },

  classifyDifference: async (conciliacaoId: string, tipo: TipoDiferenca, valor: number, obs: string): Promise<DiferencaFinanceira> => {
    const { data, error } = await supabase.from('diferencas_financeiras').insert([{ conciliacao_id: conciliacaoId, tipo_diferenca: tipo, valor_diferenca: valor, observacao_justificativa: obs }]).select().single();
    if (error) throw error;
    return data as DiferencaFinanceira;
  }
};