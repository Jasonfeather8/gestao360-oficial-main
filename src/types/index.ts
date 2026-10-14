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

// ===========================================================================
// Módulo de Extrato — leitura do arquivo e comparação (somente leitura)
// Nada aqui é persistido: a comparação existe apenas na memória da tela.
// ===========================================================================

export type DirecaoExtrato = 'entrada' | 'saida';

/** Como a direção (entrada/saída) de uma linha do extrato foi determinada. */
export type OrigemDirecao = 'sinal' | 'marcador' | 'saldo';

export type ConfiancaLinha = 'alta' | 'media' | 'baixa';

export interface MetaExtrato {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
}

export type StatusConferencia = 'ok' | 'divergente' | 'nao_verificavel';

export interface ConferenciaExtrato {
  status: StatusConferencia;
  entradas: number;
  saidas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
  diferenca: number | null;
}

export type MotivoLinhaIgnorada = 'saldo' | 'totalizador' | 'cabecalho' | 'rodape' | 'outro';

export interface LinhaIgnorada {
  pagina: number | null;
  texto: string;
  motivo: MotivoLinhaIgnorada;
}

export interface ProgressoLeituraExtrato {
  etapa: 'preparando' | 'enviando' | 'lendo';
  loteAtual: number;
  totalLotes: number;
  paginaInicio: number | null;
  paginaFim: number | null;
  totalPaginas: number | null;
}

export interface LinhaExtrato {
  id: string;
  /** Data da transação no formato ISO (yyyy-mm-dd). */
  data: string;
  descricao: string;
  /** Valor absoluto, em reais. */
  valor: number;
  direcao: DirecaoExtrato;
  origemDirecao?: OrigemDirecao;
  pagina: number | null;
  linha?: number;
  textoOriginal: string;
  confianca?: ConfiancaLinha;
  documento?: string;
}

export type MotivoNaoInterpretada =
  | 'sem_data'
  | 'direcao_indefinida'
  | 'sem_valor'
  | 'valor_ilegivel'
  | 'data_impossivel';

export interface LinhaNaoInterpretada {
  pagina: number | null;
  linha?: number;
  texto: string;
  motivo: MotivoNaoInterpretada;
}

export interface ExtratoLido {
  arquivoNome: string;
  /** Falso quando o PDF não possui camada de texto (extrato digitalizado). */
  temTexto: boolean;
  paginas: number;
  dataInicio: string | null;
  dataFim: string | null;
  linhas: LinhaExtrato[];
  naoInterpretadas: LinhaNaoInterpretada[];
  meta?: MetaExtrato;
  conferencia?: ConferenciaExtrato;
  linhasIgnoradas?: LinhaIgnorada[];
}

export type StatusItemComparacao =
  | 'conciliado'
  | 'pendente_banco'
  | 'pendente_erp'
  | 'divergente';

export interface ItemComparacao {
  id: string;
  status: StatusItemComparacao;
  data: string;
  direcao: DirecaoExtrato;
  descricao: string;
  valorExtrato: number | null;
  valorErp: number | null;
  linhaExtrato: LinhaExtrato | null;
  lancamento: LancamentoFinanceiro | null;
}

export interface DiaComparacao {
  data: string;
  entradas: ItemComparacao[];
  saidas: ItemComparacao[];
  totalEntradas: number;
  totalSaidas: number;
  conciliados: number;
  pendentes: number;
  divergentes: number;
}

export interface ResumoComparacao {
  totalEntradas: number;
  totalSaidas: number;
  conciliados: number;
  pendentesBanco: number;
  pendentesErp: number;
  divergentes: number;
}

export interface ResultadoComparacao {
  dataInicio: string | null;
  dataFim: string | null;
  dias: DiaComparacao[];
  resumo: ResumoComparacao;
}
