import type { LancamentoFinanceiro } from '../types';

type FinancialItemTransferFields = Pick<LancamentoFinanceiro, 'transferencia_cofre_id' | 'transferencia_id' | 'transferencia_lado'>;

export const isFinancialReportItem = (lancamento: FinancialItemTransferFields) =>
  !(lancamento.transferencia_cofre_id || (lancamento.transferencia_id && ['origem', 'destino'].includes(lancamento.transferencia_lado || '')));
