export type ImportFileType = 'csv' | 'xlsx' | 'pdf';
export type ImportMode = 'entrada' | 'saida' | 'ambos';
export type ImportSourceOrigin = 'texto' | 'ocr';
export type ImportReviewStatus = 'valida' | 'pendente_revisao';

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
  confianca_extracao?: number;
  motivo_alerta?: string | null;
  extrato_lote_id?: string;
  origem_extracao?: ImportSourceOrigin;
  estado_revisao?: ImportReviewStatus;
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
  confianca_extracao: number;
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
  parserTotals?: { entries?: number; exits?: number };
  reportedTransactionCount?: number;
  consistency: ImportConsistencyState;
}

export type ImportLotStatus = 'em_validacao' | 'confirmado' | 'cancelado' | 'erro';

export interface ImportLotDraft {
  id: string;
  contaBancariaId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  storagePath: string;
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
  parserTotals?: { entries?: number; exits?: number };
  reportedTransactionCount?: number;
  extractedCount?: number;
  ocrCount?: number;
  consistency?: ImportConsistencyState;
  rawTransactions?: Array<Pick<ImportTransaction, 'data_original' | 'descricao_original' | 'valor_original' | 'data_transacao' | 'descricao_banco' | 'valor' | 'tipo_movimento' | 'pagina_origem' | 'linha_origem' | 'origem_extracao'>>;
  sourceOrigin?: ImportSourceOrigin;
  pendingReviewCount?: number;
  reviewState?: 'validated' | 'has_pending_reviews';
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
  }>;
  pendingReviews: ImportReviewItem[];
}
