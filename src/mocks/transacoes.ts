import { TransacaoBanco } from '../types';

export const mockTransacoes: TransacaoBanco[] = [
  {
    id: 'tx_exact_1',
    conta_bancaria_id: 'conta_itau',
    data_transacao: '2026-10-24',
    valor: -1500.00,
    descricao_banco: 'PIX TRANSF ELETRONICA',
    tipo_movimento: 'debito',
    hash_transacao: 'itau_20261024_pix_transf_1500_hash',
    status_conciliacao: false,
  },
  {
    id: 'tx_exact_2',
    conta_bancaria_id: 'conta_itau',
    data_transacao: '2026-10-24',
    valor: 12450.00,
    descricao_banco: 'TED RECEBIDA',
    tipo_movimento: 'credito',
    hash_transacao: 'itau_20261024_ted_recebida_12450_hash',
    status_conciliacao: false,
  },
  {
    id: 'tx_exact_3',
    conta_bancaria_id: 'conta_itau',
    data_transacao: '2026-10-23',
    valor: -480.50,
    descricao_banco: 'PAG BOLETO LUZ',
    tipo_movimento: 'debito',
    hash_transacao: 'itau_20261023_boleto_luz_hash',
    status_conciliacao: false,
  },
  {
    id: 'tx_exact_4',
    conta_bancaria_id: 'conta_itau',
    data_transacao: '2026-10-22',
    valor: -89.90,
    descricao_banco: 'TARIFA MANUT CONTA',
    tipo_movimento: 'debito',
    hash_transacao: 'itau_20261022_tarifa_manut_hash',
    status_conciliacao: true, // Already reconciled
  },
  {
    id: 'tx_banco_diferenca',
    conta_bancaria_id: 'conta_itau',
    data_transacao: '2026-10-21',
    valor: -12545.50, // creates a difference of 45.50 versus a 12500 forecast, matching the screenshot diff!
    descricao_banco: 'PGTO FORNECEDOR TECH SERVICES LTDA',
    tipo_movimento: 'debito',
    hash_transacao: 'itau_20261021_tech_services_hash',
    status_conciliacao: false,
  },
  {
    id: 'tx_banco_bradesco_1',
    conta_bancaria_id: 'conta_bradesco',
    data_transacao: '2026-10-24',
    valor: -1500.00,
    descricao_banco: 'EMISSAO TED FORNECEDOR BR',
    tipo_movimento: 'debito',
    hash_transacao: 'bradesco_20261024_ted_forn_hash',
    status_conciliacao: false,
  }
];
