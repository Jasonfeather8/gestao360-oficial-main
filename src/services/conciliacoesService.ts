import { supabase } from '@/integrations/supabase/client';
import { Conciliacao, FechamentoConciliacao, TransacaoBanco, ConciliacaoAtomicaPayload, ConciliacaoAtomicaResult } from '../types';
import { cleanupImport, confirmImport, prepareImportFile } from './extratoImportacaoService';
export { attachImportLotMetadata, buildCsvTransactions, buildHash, convertApprovedReviewsToTransactions, getImportFileType, normalizeIsoDate, parseCsv, validateImportConsistency } from './extratoImportacaoService';

const friendlyError = (message: string) => new Error(message);
const WORKSPACE_PAGE_SIZE = 500;

const fetchAllRows = async <T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown | null }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += WORKSPACE_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + WORKSPACE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < WORKSPACE_PAGE_SIZE) return rows;
  }
};

const getExistingConciliacaoResult = async (
  transacaoBancoId: string,
  lancamentoIds: string[],
): Promise<ConciliacaoAtomicaResult> => {
  const { data, error } = await supabase
    .from('conciliacoes')
    .select('*')
    .eq('transacao_banco_id', transacaoBancoId);
  if (error) throw error;

  const existing = (data || []) as Conciliacao[];
  if (existing.length === 0) throw friendlyError('A conciliação repetida não foi localizada.');
  const existingIds = new Set(existing.map(item => item.lancamento_id));
  const requestedIds = new Set(lancamentoIds);
  if (existing.length !== requestedIds.size || existingIds.size !== requestedIds.size || [...requestedIds].some(id => !existingIds.has(id))) {
    throw friendlyError('A transação bancária já possui uma conciliação com outro conjunto de lançamentos.');
  }

  const conciliacaoIds = existing.map(item => item.id);
  const { data: differences, error: differencesError } = await supabase
    .from('diferencas_financeiras')
    .select('valor_diferenca')
    .in('conciliacao_id', conciliacaoIds);
  if (differencesError) throw differencesError;

  return {
    grupo_conciliacao_id: existing[0]?.grupo_conciliacao_id || '',
    conciliacoes: existing,
    diferenca_centavos: Math.round((differences || []).reduce((total, item) => total + Number(item.valor_diferenca || 0), 0) * 100),
    status_pagamento: 'quitação_pendente',
    status_aprovacao: 'digital',
  };
};

export const conciliacoesService = {
  getConciliacoes: async (): Promise<Conciliacao[]> => fetchAllRows<Conciliacao>(async (from, to) => {
    const { data, error } = await supabase.from('conciliacoes').select('*').range(from, to);
    return { data: data as Conciliacao[] | null, error };
  }),

  getAllTransacoes: async (): Promise<TransacaoBanco[]> => fetchAllRows<TransacaoBanco>(async (from, to) => {
    const { data, error } = await supabase
      .from('transacoes_banco')
      .select('*')
      .order('data_transacao', { ascending: false })
      .range(from, to);
    return { data: data as TransacaoBanco[] | null, error };
  }),

  getDiferencas: async (): Promise<Array<Pick<import('../types').DiferencaFinanceira, 'id' | 'conciliacao_id' | 'tipo_diferenca' | 'valor_diferenca' | 'observacao_justificativa'>>> => fetchAllRows(async (from, to) => {
    const { data, error } = await supabase
      .from('diferencas_financeiras')
      .select('id, conciliacao_id, tipo_diferenca, valor_diferenca, observacao_justificativa')
      .range(from, to);
    return { data: data as Array<Pick<import('../types').DiferencaFinanceira, 'id' | 'conciliacao_id' | 'tipo_diferenca' | 'valor_diferenca' | 'observacao_justificativa'>> | null, error };
  }),

  getFechamentos: async (): Promise<FechamentoConciliacao[]> => fetchAllRows<FechamentoConciliacao>(async (from, to) => {
    const { data, error } = await supabase
      .from('fechamentos_conciliacao')
      .select('*')
      .order('periodo_inicio', { ascending: false })
      .range(from, to);
    return { data: data as FechamentoConciliacao[] | null, error };
  }),

  fecharPeriodo: async (contaId: string, periodoInicio: string, periodoFim: string): Promise<FechamentoConciliacao> => {
    const { data, error } = await supabase.rpc('fechar_periodo_conciliacao', {
      p_conta_id: contaId,
      p_periodo_inicio: periodoInicio,
      p_periodo_fim: periodoFim,
    });
    if (error) throw error;
    return data as FechamentoConciliacao;
  },

  decidirFechamento: async (fechamentoId: string, aprovado: boolean, justificativa?: string | null): Promise<FechamentoConciliacao> => {
    const { data, error } = await supabase.rpc('decidir_fechamento_conciliacao', {
      p_fechamento_id: fechamentoId,
      p_aprovado: aprovado,
      p_justificativa: justificativa || null,
    });
    if (error) throw error;
    return data as FechamentoConciliacao;
  },

  prepareImportFile,
  confirmImport,
  cleanupImport,

  cleanupUnreconciled: async (contaId: string): Promise<void> => {
    const { error } = await supabase.from('transacoes_banco').delete().eq('conta_bancaria_id', contaId).eq('status_conciliacao', false).is('extrato_lote_id', null);
    if (error) throw error;
  },

  linkConciliacao: async (payload: ConciliacaoAtomicaPayload): Promise<ConciliacaoAtomicaResult> => {
    if (!payload.transacaoBancoId) throw friendlyError('Transação bancária é obrigatória.');
    if (payload.lancamentoIds.length === 0) throw friendlyError('Selecione ao menos um lançamento.');
    if (new Set(payload.lancamentoIds).size !== payload.lancamentoIds.length) throw friendlyError('A lista de lançamentos contém duplicidades.');

    const { data, error } = await supabase.rpc('conciliar_transacao_atomica', {
      p_transacao_id: payload.transacaoBancoId,
      p_lancamento_ids: payload.lancamentoIds,
      p_tipo_diferenca: payload.tipoDiferenca || null,
      p_justificativa: payload.justificativa || null,
    });

    let result: ConciliacaoAtomicaResult;
    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/já está conciliada|já possui vínculo|duplicate key/i.test(message)) {
        result = await getExistingConciliacaoResult(payload.transacaoBancoId, payload.lancamentoIds);
      } else {
        throw error;
      }
    } else {
      result = data as ConciliacaoAtomicaResult;
    }

    if (
      (result.status_pagamento && result.status_pagamento !== 'quitação_pendente') ||
      (result.status_aprovacao && result.status_aprovacao !== 'digital')
    ) {
      throw friendlyError('A conciliação retornou um estado incompatível; a aprovação Master deve ocorrer depois.');
    }
    return result;
  },

  unlinkConciliacao: async (conciliacaoId: string): Promise<boolean> => {
    const { error } = await supabase.rpc('desvincular_conciliacao_atomica', {
      p_conciliacao_id: conciliacaoId,
    });
    if (error) throw error;
    return true;
  },
};
