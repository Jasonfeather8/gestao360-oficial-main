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

export interface LancamentoFinanceiro {
  id: string;
  codigo_sequencial?: number;
  tipo: 'entrada' | 'saida';
  valor_previsto: number;
  valor_recebido?: number;
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
  observacoes: string;
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
 desconto_valor?: number;
 desconto_tipo?: string;
  acrescimo_valor?: number;
  acrescimo_tipo?: string;
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
  valor: number;
  descricao_banco: string;
  tipo_movimento: 'debito' | 'credito';
  hash_transacao: string; // duplicate prevention
  status_conciliacao: boolean;
}

export interface Conciliacao {
  id: string;
  lancamento_id: string;
  transacao_banco_id: string;
  usuario_conciliador_id: string;
  data_conciliacao: string;
}

export type TipoDiferenca = 'juros' | 'multa' | 'desconto' | 'tarifa' | 'pagamento_parcial' | 'ajuste_manual';

export interface DiferencaFinanceira {
  id: string;
  conciliacao_id: string;
  tipo_diferenca: TipoDiferenca;
  valor_diferenca: number;
  observacao_justificativa: string;
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
