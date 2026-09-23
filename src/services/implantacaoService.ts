import { supabase } from '@/integrations/supabase/client';
import type { ImplantacaoValidationEvidence } from '../types';

type ReadResult<T> = { data: T[] | null; error: unknown };

async function readTable<T>(read: () => PromiseLike<ReadResult<T>>): Promise<T[] | null> {
  const { data, error } = await read();
  return error ? null : data || [];
}

export const implantacaoService = {
  consultarEvidencias: async (): Promise<ImplantacaoValidationEvidence> => {
    const [transactions, differences, reconciliations, bankTransfers, cashTransfers, profiles, closings, statements] = await Promise.all([
      readTable(() => supabase.from('transacoes_banco').select('hash_transacao')),
      readTable(() => supabase.from('diferencas_financeiras').select('tipo_diferenca, observacao_justificativa')),
      readTable(() => supabase.from('conciliacoes').select('transacao_banco_id, lancamento_id')),
      readTable(() => supabase.from('transferencias_bancarias').select('status')),
      readTable(() => supabase.from('transferencias_cofre').select('status')),
      readTable(() => supabase.from('profiles').select('id, role, status')),
      readTable(() => supabase.from('fechamentos_conciliacao').select('id, status')),
      readTable(() => supabase.from('extratos_bancarios').select('id, status')),
    ]);

    const unavailableSources: string[] = [];
    if (transactions === null) unavailableSources.push('hashes das transações bancárias');
    if (differences === null) unavailableSources.push('diferenças financeiras');
    if (reconciliations === null) unavailableSources.push('conciliações');
    if (bankTransfers === null) unavailableSources.push('transferências bancárias');
    if (cashTransfers === null) unavailableSources.push('transferências do Cofre');
    if (profiles === null) unavailableSources.push('perfis disponíveis');
    if (closings === null) unavailableSources.push('fechamentos disponíveis');
    if (statements === null) unavailableSources.push('extratos importados');

    const hashCounts = new Map<string, number>();
    (transactions || []).forEach(transaction => {
      const hash = String((transaction as { hash_transacao?: string | null }).hash_transacao || '').trim();
      if (hash) hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
    });

    const reconciliationCounts = new Map<string, number>();
    (reconciliations || []).forEach(reconciliation => {
      const transactionId = (reconciliation as { transacao_banco_id?: string | null }).transacao_banco_id;
      if (transactionId) reconciliationCounts.set(transactionId, (reconciliationCounts.get(transactionId) || 0) + 1);
    });

    return {
      duplicate_transaction_hashes: transactions === null ? null : [...hashCounts.values()].filter(count => count > 1).length,
      unclassified_differences: differences === null ? null : differences.filter(difference => {
        const row = difference as { tipo_diferenca?: string | null; observacao_justificativa?: string | null };
        return !String(row.tipo_diferenca || '').trim() || !String(row.observacao_justificativa || '').trim();
      }).length,
      multiple_entry_conciliations: reconciliations === null ? null : [...reconciliationCounts.values()].filter(count => count > 1).length,
      reversed_bank_transfers: bankTransfers === null ? null : bankTransfers.filter(transfer => (transfer as { status?: string }).status === 'estornada').length,
      pending_bank_transfers: bankTransfers === null ? null : bankTransfers.filter(transfer => ['aberta', 'aguardando_destino'].includes((transfer as { status?: string }).status || '')).length,
      reversed_cash_transfers: cashTransfers === null ? null : cashTransfers.filter(transfer => (transfer as { status?: string }).status === 'estornada').length,
      pending_cash_transfers: cashTransfers === null ? null : cashTransfers.filter(transfer => ['aguardando_recebimento', 'aguardando_master'].includes((transfer as { status?: string }).status || '')).length,
      profile_count: profiles === null ? null : profiles.length,
      closing_count: closings === null ? null : closings.length,
      imported_statement_count: statements === null ? null : statements.length,
      unavailable_sources: unavailableSources,
    };
  },
};

export default implantacaoService;
