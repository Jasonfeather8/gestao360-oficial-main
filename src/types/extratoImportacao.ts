export type ImportFileType = 'csv' | 'xlsx' | 'pdf';
export type ImportMode = 'entrada' | 'saida' | 'ambos';

export interface ImportTransaction {
  data_transacao: string;
  data_original?: string;
  valor: number;
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
  firstRows: Array<Record<string, string>>;
  sourceRows?: Array<Record<string, string>>;
  sourceHeaders?: string[];
  bankIdentified?: string;
  parserTotals?: { entries?: number; exits?: number };
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
  bankIdentified?: string;
  transactions: Array<{
    date: string;
    description: string;
    credit?: number;
    debit?: number;
    document?: string;
  }>;
}
