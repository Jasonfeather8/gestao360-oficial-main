export type UserPerfil = 'master' | 'gerente' | 'colaborador';

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  perfil: UserPerfil;
  status: boolean;
  created_at: string;
}

export type EntidadeTipo = 'cliente' | 'fornecedor' | 'ambos';

export interface EntidadeNegocio {
  id: string;
  codigo_sequencial?: number;
  tipo: EntidadeTipo;
  nome_razao_social: string;
  documento: string; // CPF or CNPJ
  status_sincronizacao: boolean;
  created_at: string;
  email?: string;
  telefone?: string;
  data_nascimento?: string;
  status_base?: 'ativo' | 'inativo' | 'bpi';
}

export interface CentroCusto {
  id: string;
  nome: string;
  descricao: string;
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida';
}

export interface CategoriaAjuste {
  id: string;
  nome: string;
  tipo: 'desconto' | 'acrescimo';
  status: 'ativo' | 'inativo';
}

export interface ContaBancaria {
  id: string;
  nome: string;
  nome_banco: string;
  agencia: string;
  conta: string;
  saldo_inicial: number;
  data_abertura: string;
  logo_url?: string;
}

export type StatusAprovacao = 'pendente_digital' | 'digital' | 'confirmado_master' | 'reprovado';
export type StatusPagamento = 'aberto' | 'pago' | 'pago_parcial' | 'bpi' | 'quitação_pendente';
export type TipoAjuste = 'valor' | 'porcentagem';

export interface AjusteFinanceiro {
  valor?: number;
  tipo?: TipoAjuste | null;
}

export interface LancamentoFinanceiro {
  id: string;
  codigo_sequencial?: number;
  tipo: 'entrada' | 'saida';
  valor_previsto: number;
  valor_recebido?: number;
  ja_recebido?: boolean;
  data_vencimento: string;
  data_emissao: string;
  data_competencia?: string;
  data_pagamento?: string;
  hora_pagamento?: string;
  condicao?: 'a_vista' | 'a_prazo';
  entidade_id: string;
  centro_custo_id: string;
  categoria_id: string;
  conta_bancaria_id: string;
  comprovante_url?: string;
  descricao_bancaria_original?: string | null;
  observacoes: string;
  transferencia_id?: string | null;
  transferencia_lado?: 'origem' | 'destino' | 'tarifa' | null;
  transferencia_cofre_id?: string | null;
  transferencia_cofre_lado?: 'banco' | null;
  recorrencia_id?: string; // Null if single parcel
  numero_parcela?: number; // parcel number if recurring
  quantidade_total_parcelas?: number;
  status_aprovacao: StatusAprovacao;
  status_pagamento: StatusPagamento;
  usuario_criador_id: string;
  status_sincronizacao?: boolean;
 valor_original?: number;
 juros_previstos?: number;
 multa_prevista?: number;
 desconto_previsto?: number;
 documento_numero?: string;
 bpi_em?: string;
 desconto_valor?: AjusteFinanceiro['valor'];
 desconto_tipo?: AjusteFinanceiro['tipo'];
  acrescimo_valor?: AjusteFinanceiro['valor'];
  acrescimo_tipo?: AjusteFinanceiro['tipo'];
  motivo_desconto_id?: string;
  motivo_acrescimo_id?: string;
  motivo_ajuste?: string;
  created_at: string;
  updated_at: string;
}

export interface TransacaoBanco {
  id: string;
  conta_bancaria_id: string;
  data_transacao: string;
  data_original?: string | null;
  valor: number;
  valor_centavos?: number | null;
  descricao_banco: string;
  descricao_original?: string | null;
  tipo_movimento: 'debito' | 'credito';
  hash_transacao: string; // duplicate prevention
  status_conciliacao: boolean;
  extrato_lote_id?: string;
  numero_documento?: string | null;
  pagina_origem?: number | null;
  linha_origem?: number | null;
  arquivo_nome?: string | null;
  arquivo_hash?: string | null;
  confianca_extracao?: number | null;
  motivo_alerta?: string | null;
  formato_arquivo?: 'pdf' | 'csv' | 'xlsx' | 'ofx' | null;
  origem_extracao?: 'texto' | 'ocr' | 'estruturado' | null;
  origem_arquivo?: 'pdf_texto' | 'pdf_ocr' | 'csv' | 'xlsx' | 'ofx_estruturado' | null;
  created_at?: string;
}

export type TransferenciaStatus = 'aberta' | 'aguardando_destino' | 'conciliada_pendente_master' | 'conciliada' | 'estornada';

export interface TransferenciaBancaria {
  id: string;
  conta_origem_id: string;
  conta_destino_id: string;
  valor: number;
  data_transferencia: string;
  status: TransferenciaStatus;
  lancamento_saida_id: string;
  lancamento_entrada_id: string;
  tarifa_lancamento_id?: string | null;
  transacao_origem_id?: string | null;
  transacao_destino_id?: string | null;
  criado_por: string;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  reprovado_por?: string | null;
  reprovado_em?: string | null;
  motivo_reprovacao?: string | null;
  created_at: string;
  updated_at: string;
  estornado_em?: string | null;
  estornado_por?: string | null;
  motivo_estorno?: string | null;
}

export interface TransferenciaDestinoSugestao extends TransferenciaBancaria {
  conta_origem_nome?: string | null;
  conta_destino_nome?: string | null;
  diferenca_dias?: number;
}

export interface Conciliacao {
  id: string;
  lancamento_id: string;
  transacao_banco_id: string;
  grupo_conciliacao_id?: string | null;
  usuario_conciliador_id: string;
  data_conciliacao: string;
}

export type StatusFechamentoConciliacao = 'aberto' | 'aguardando_master' | 'aprovado' | 'reprovado';

export interface FechamentoConciliacao {
  id: string;
  conta_bancaria_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  status: StatusFechamentoConciliacao;
  total_extrato: number;
  total_conciliado: number;
  total_diferencas: number;
  total_transacoes: number;
  transacoes_conciliadas: number;
  fechado_por?: string | null;
  fechado_em?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  motivo_reprovacao?: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoDiferenca = 'juros' | 'multa' | 'desconto' | 'tarifa' | 'pagamento_parcial' | 'ajuste_manual';

export interface ConciliacaoAtomicaPayload {
  transacaoBancoId: string;
  lancamentoIds: string[];
  tipoDiferenca?: TipoDiferenca | null;
  justificativa?: string | null;
}

export interface ConciliacaoAtomicaResult {
  grupo_conciliacao_id: string;
  conciliacoes: Conciliacao[];
  diferenca_centavos: number;
  status_pagamento?: StatusPagamento;
  status_aprovacao?: StatusAprovacao;
}

export interface DiferencaFinanceira {
  id: string;
  conciliacao_id: string;
  tipo_diferenca: TipoDiferenca | null;
  valor_diferenca: number;
  observacao_justificativa: string | null;
}

export interface Recorrencia {
  id: string;
  periodicidade: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'personalizado';
  periodicidade_customizada_dias?: number;
  quantidade_total_parcelas: number;
  data_inicio: string;
}

export interface AuditoriaLog {
  id: string;
  tabela_afetada: string;
  registro_id: string;
  usuario_id: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  dados_anteriores?: Record<string, any>;
  dados_novos?: Record<string, any>;
  data_hora: string;
}

export interface ResumoSaldo {
  conta_bancaria_id: string;
  saldo_consolidado: number;
  saldo_simulado: number;
  ultima_atualizacao: string;
}

export type CofreStatus = 'ativo' | 'inativo';
export type TipoMovimentacaoCofre = 'entrada' | 'saida';
export type OrigemMovimentacaoCofre = 'manual' | 'baixa_direta' | 'transferencia';
export type StatusMovimentacaoCofre = 'aguardando_master' | 'aprovado' | 'reprovado' | 'estornado';
export type DirecaoTransferenciaCofre = 'banco_para_cofre' | 'cofre_para_banco';
export type StatusTransferenciaCofre = 'aguardando_recebimento' | 'aguardando_master' | 'aprovada' | 'reprovada' | 'estornada';

export interface CofreLocal {
  id: string;
  nome: string;
  saldo_inicial: number;
  status: CofreStatus;
  criado_por: string;
  created_at: string;
  updated_at: string;
}

export interface MovimentacaoCofre {
  id: string;
  cofre_id: string;
  tipo: TipoMovimentacaoCofre;
  valor: number;
  data_movimentacao: string;
  descricao: string;
  origem: OrigemMovimentacaoCofre;
  lancamento_id?: string | null;
  transferencia_cofre_id?: string | null;
  responsavel_id: string;
  status: StatusMovimentacaoCofre;
  confirmado_recebimento_por?: string | null;
  confirmado_recebimento_em?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  motivo_reprovacao?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferenciaCofre {
  id: string;
  direcao: DirecaoTransferenciaCofre;
  conta_bancaria_id: string;
  cofre_id: string;
  valor: number;
  data_transferencia: string;
  status: StatusTransferenciaCofre;
  lancamento_bancario_id: string;
  movimentacao_cofre_id: string;
  criado_por: string;
  recebido_por?: string | null;
  recebido_em?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  motivo_reprovacao?: string | null;
  motivo_estorno?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CofreSaldo {
  cofre_id: string;
  saldo_fisico: number;
  saldo_pendente: number;
  movimentos_pendentes: number;
  transferencias_pendentes: number;
}

export interface ConsolidatedFinancialSummary {
  bank_confirmed: number;
  bank_operational: number;
  bank_simulated: number;
  cash_approved: number;
  cash_operational: number;
  cash_pending: number;
  pending_cash_movements: number;
  pending_cash_transfers: number;
  pending_cash_transfer_value: number;
  pending_bank_out_value: number;
  pending_bank_out_count: number;
  pending_bank_in_value: number;
  pending_bank_in_count: number;
  consolidated_confirmed: number;
  consolidated_operational: number;
  consolidated_simulated: number;
}

export interface ImplantacaoValidationEvidence {
  duplicate_transaction_hashes: number | null;
  unclassified_differences: number | null;
  multiple_entry_conciliations: number | null;
  reversed_bank_transfers: number | null;
  pending_bank_transfers: number | null;
  reversed_cash_transfers: number | null;
  pending_cash_transfers: number | null;
  profile_count: number | null;
  closing_count: number | null;
  imported_statement_count: number | null;
  unavailable_sources: string[];
}

export interface CriarMovimentacaoCofrePayload {
  cofreId: string;
  tipo: TipoMovimentacaoCofre;
  valor: number;
  dataMovimentacao: string;
  descricao: string;
  origem: OrigemMovimentacaoCofre;
  lancamentoId?: string | null;
}

export interface CriarTransferenciaCofrePayload {
  direcao: DirecaoTransferenciaCofre;
  contaBancariaId: string;
  cofreId: string;
  valor: number;
  dataTransferencia: string;
}
