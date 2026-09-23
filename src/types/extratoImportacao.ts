export type ImportFileType = 'csv' | 'xlsx' | 'pdf';
export type ImportMode = 'entrada' | 'saida' | 'ambos';

export interface ImportTransaction {
  data_transacao: string;
  valor: number;
  descricao_banco: string;
  numero_documento?: string;
  tipo_movimento: 'credito' | 'debito';
  hash_transacao: string;
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

export interface ImportLotDraft {
  id: string;
  contaBancariaId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  storagePath: string;
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
