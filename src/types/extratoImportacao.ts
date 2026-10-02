export type ImportFileFormat = 'csv' | 'xlsx' | 'pdf' | 'ofx';
// OFX permanece somente como contrato de extensão futura; o upload aceita apenas ImportFileType.
export type ImportFileType = Exclude<ImportFileFormat, 'ofx'>;
export type ImportMode = 'entrada' | 'saida' | 'ambos';
export type ImportSourceOrigin = 'texto' | 'ocr' | 'estruturado';
export type ImportFileOrigin = 'pdf_texto' | 'pdf_ocr' | 'csv' | 'xlsx' | 'ofx_estruturado';
export type ImportReviewStatus = 'valida' | 'pendente_revisao';
export type ImportBatchReviewState = 'validated' | 'has_pending_reviews' | 'in_review';
export type ImportReviewCategory = 'revisao_tecnica' | 'conciliavel';
export type ImportReviewDecision = 'aprovar' | 'rejeitar';
export type ImportAlertSeverity = 'critical' | 'warning' | 'info';
export type ImportConfidence = number;

export interface ImportReviewDecisionItem {
  hash_transacao?: string;
  pendencia_index?: number;
  categoria: ImportReviewCategory;
  decisao: ImportReviewDecision;
  justificativa: string;
}

export interface ImportReviewSubmissionMetadata {
  reviewState: 'in_review';
  pendingReviews: ImportReviewItem[];
  reviewReasons: ImportReviewCategory[];
  reviewDecisions?: ImportReviewDecisionItem[];
}

export interface ImportParserTotals {
  entries?: number;
  exits?: number;
}

export interface ImportParserBalances {
  opening?: number;
  closing?: number;
}

export interface ImportParserAlert {
  code: string;
  message: string;
  severity: ImportAlertSeverity;
}

export interface ImportParserMetadata {
  pages?: number;
  periodStart?: string;
  periodEnd?: string;
  balances?: ImportParserBalances;
  totals?: ImportParserTotals;
  reportedTransactionCount?: number;
  bankIdentified?: string;
  sourceOrigin: ImportSourceOrigin;
  sourceFileOrigin?: ImportFileOrigin;
  confidence?: ImportConfidence;
  alerts?: ImportParserAlert[];
  pendingReviews?: ImportReviewItem[];
}

export interface ImportTransaction {
  data_transacao: string;
  data_original?: string;
  valor: number;
  valor_original?: number;
  valor_centavos?: number;
  descricao_banco: string;
  descricao_original?: string;
  numero_documento?: string;
  tipo_movimento: 'credito' | 'debito';
  hash_transacao: string;
  pagina_origem?: number;
  linha_origem?: number;
  arquivo_nome?: string;
  arquivo_hash?: string;
  confianca_extracao?: ImportConfidence;
  motivo_alerta?: string | null;
  extrato_lote_id?: string;
  formato_arquivo?: ImportFileFormat;
  origem_extracao?: ImportSourceOrigin;
  origem_arquivo?: ImportFileOrigin;
  estado_revisao?: ImportReviewStatus;
  alertas_extracao?: ImportParserAlert[];
}

export interface ImportReviewItem {
  data_original?: string;
  data_transacao?: string;
  valor?: number;
  tipo_movimento?: 'credito' | 'debito';
  descricao?: string;
  pagina_origem?: number;
  linha_origem?: number;
  origem_extracao: ImportSourceOrigin;
  confianca_extracao: ImportConfidence;
  categoria?: ImportReviewCategory;
  motivos: string[];
  trecho: string;
}

export interface ImportConsistencyIssue {
  code: string;
  message: string;
  transactionIndex?: number;
  severity: 'critical' | 'warning';
}

export interface ImportConsistencyState {
  criticalErrors: ImportConsistencyIssue[];
  alerts: ImportConsistencyIssue[];
  extractedCount: number;
  ocrCount: number;
  duplicateCount: number;
  computedEntries: number;
  computedExits: number;
  computedNet: number;
  totalsDifferenceCents?: { entries?: number; exits?: number };
  balanceDifferenceCents?: number;
  periodMatches: boolean | null;
  continuityMatches: boolean | null;
}

export interface ImportPreview {
  fileName: string;
  fileType: ImportFileType;
  mimeType: string;
  size: number;
  pages?: number;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalEntries: number;
  totalExits: number;
  transactions: ImportTransaction[];
  pendingReviews?: ImportReviewItem[];
  sourceOrigin?: ImportSourceOrigin;
  firstRows: Array<Record<string, string>>;
  sourceRows?: Array<Record<string, string>>;
  sourceHeaders?: string[];
  bankIdentified?: string;
  parserTotals?: ImportParserTotals;
  parserMetadata?: ImportParserMetadata;
  reportedTransactionCount?: number;
  consistency: ImportConsistencyState;
}

export type ImportLotStatus = 'em_validacao' | 'em_revisao' | 'confirmado' | 'cancelado' | 'erro';

export interface ImportLotDraft {
  id: string;
  contaBancariaId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  storagePath: string;
  formatoArquivo?: ImportFileFormat;
  origemExtracao?: ImportSourceOrigin;
  status?: ImportLotStatus;
}

export interface ImportConfirmationMetadata {
  pages?: number;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  bankIdentified?: string;
  totalEntries?: number;
  totalExits?: number;
  parserTotals?: ImportParserTotals;
  parserMetadata?: ImportParserMetadata;
  reportedTransactionCount?: number;
  extractedCount?: number;
  ocrCount?: number;
  consistency?: ImportConsistencyState;
  rawTransactions?: Array<Pick<ImportTransaction, 'data_original' | 'descricao_original' | 'valor_original' | 'valor_centavos' | 'data_transacao' | 'descricao_banco' | 'numero_documento' | 'valor' | 'tipo_movimento' | 'hash_transacao' | 'pagina_origem' | 'linha_origem' | 'formato_arquivo' | 'origem_extracao' | 'origem_arquivo' | 'confianca_extracao' | 'estado_revisao' | 'motivo_alerta'>>;
  sourceOrigin?: ImportSourceOrigin;
  alerts?: ImportParserAlert[];
  pendingReviewCount?: number;
  reviewState?: ImportBatchReviewState;
  reviewReasons?: ImportReviewCategory[];
  reviewDecisions?: ImportReviewDecisionItem[];
}

export interface CsvParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface PdfParseResult {
  pages: number;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalEntries?: number;
  totalExits?: number;
  reportedTransactionCount?: number;
  bankIdentified?: string;
  sourceOrigin: ImportSourceOrigin;
  transactions: Array<{
    date: string;
    description: string;
    credit?: number;
    debit?: number;
    document?: string;
    pagina?: number;
    linha?: number;
    confidence: number;
    alert?: string | null;
    origem: ImportSourceOrigin;
    origem_arquivo?: ImportFileOrigin;
    }>;
    parserMetadata?: ImportParserMetadata;
    pendingReviews: ImportReviewItem[];
  }
