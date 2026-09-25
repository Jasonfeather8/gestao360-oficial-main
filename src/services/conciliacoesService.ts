import { supabase } from '@/integrations/supabase/client';
import { Conciliacao, FechamentoConciliacao, TransacaoBanco, ConciliacaoAtomicaPayload, ConciliacaoAtomicaResult } from '../types';
import {
  CsvParseResult,
  ImportConfirmationMetadata,
  ImportConsistencyIssue,
  ImportConsistencyState,
  ImportFileType,
  ImportLotDraft,
  ImportMode,
  ImportPreview,
  ImportTransaction,
  PdfParseResult,
} from '../types/extratoImportacao';

type XlsxParseResult = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv']);
const PDF_MIME_TYPE = 'application/pdf';

const friendlyError = (message: string) => new Error(message);

const functionErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  const context = (error as { context?: Response } | null)?.context;
  if (context) {
    try {
      const payload = await context.clone().json() as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      // Keep the SDK message when the function response is not JSON.
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

export const getImportFileType = (fileName: string, mimeType = ''): ImportFileType => {
  const normalizedName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase().split(';', 1)[0].trim();
  if (normalizedName.endsWith('.xlsx')) {
    if (normalizedMime && normalizedMime !== XLSX_MIME_TYPE) throw friendlyError('O arquivo XLSX possui um tipo MIME inválido.');
    return 'xlsx';
  }
  if (normalizedName.endsWith('.pdf')) {
    if (normalizedMime && normalizedMime !== PDF_MIME_TYPE) throw friendlyError('O arquivo PDF possui um tipo MIME inválido.');
    return 'pdf';
  }
  if (normalizedName.endsWith('.csv')) {
    if (normalizedMime && !CSV_MIME_TYPES.has(normalizedMime)) throw friendlyError('O arquivo CSV possui um tipo MIME inválido.');
    return 'csv';
  }
  throw friendlyError('Formato não suportado. Selecione um arquivo PDF, CSV ou XLSX.');
};

const normalizeDate = (value: string): string => {
  const clean = value.trim().split(/[ T]/)[0];
  const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (brMatch) {
    const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
    return `${year}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
  }
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return clean;
  throw friendlyError(`Data inválida no extrato: ${value}`);
};

const parseMoney = (raw: string): number => {
  const source = raw.trim();
  if (!source) return Number.NaN;
  const negative = source.includes('-') || /\(.*\)/.test(source);
  const digits = source.replace(/\s/g, '').replace(/[R$]/gi, '').replace(/[()]/g, '').replace(/^-/, '').replace(/-$/, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(digits)) return Number.NaN;
  const normalized = digits.includes(',')
    ? digits.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(digits)
      ? digits.replace(/\./g, '')
      : digits;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return Number.NaN;
  return negative ? -Math.abs(value) : value;
};

const parseDelimitedRecords = (content: string, delimiter: string): string[][] => {
  const text = content.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(cell => cell.trim() !== '')) records.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some(cell => cell.trim() !== '')) records.push(row);
  }
  if (quoted) throw friendlyError('O CSV possui aspas não fechadas.');
  return records;
};

const countOutsideQuotes = (value: string, delimiter: string): number => {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (value[index] === delimiter && !quoted) {
      count += 1;
    }
  }
  return count;
};

const detectDelimiter = (content: string): string => {
  const firstRecord = content.replace(/^\uFEFF/, '').split(/\r?\n/).find(line => line.trim()) || '';
  return countOutsideQuotes(firstRecord, ';') > countOutsideQuotes(firstRecord, ',') ? ';' : ',';
};

const sanitizeFileName = (name: string): string => {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150);
  return safe || 'extrato';
};

const sha256 = async (value: string | ArrayBuffer): Promise<string> => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const validateDate = (date: string): boolean => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
};

const buildHash = async (accountId: string, transaction: Omit<ImportTransaction, 'hash_transacao'>): Promise<string> =>
  sha256(JSON.stringify([
    accountId,
    transaction.data_transacao,
    transaction.valor.toFixed(2),
    transaction.descricao_banco,
    transaction.numero_documento || '',
  ]));

export const parseCsv = (content: string): CsvParseResult => {
  const records = parseDelimitedRecords(content, detectDelimiter(content));
  if (records.length < 2) throw friendlyError('O CSV precisa conter cabeçalho e ao menos uma linha.');
  const headers = records[0].map(header => header.trim());
  if (headers.some(header => !header)) throw friendlyError('O cabeçalho do CSV possui uma coluna sem nome.');
  if (new Set(headers).size !== headers.length) throw friendlyError('O cabeçalho do CSV possui colunas duplicadas.');
  if (records.slice(1).some(cells => cells.length > headers.length)) throw friendlyError('O CSV possui linhas com mais campos que o cabeçalho.');
  const rows = records.slice(1).map(cells => Object.fromEntries(headers.map((header, index) => [header, (cells[index] || '').trim()])));
  return { headers, rows };
};

export const buildCsvTransactions = async (
  accountId: string,
  rows: Array<Record<string, string>>,
  mapping: { data: string; valor: string; descricao: string; documento: string },
  importMode: ImportMode,
): Promise<ImportTransaction[]> => {
  if (!mapping.data || !mapping.valor || !mapping.descricao) {
    throw friendlyError('Selecione data, valor e descrição para continuar.');
  }
  const hashes = new Set<string>();
  const transactions: ImportTransaction[] = [];

  for (const [index, row] of rows.entries()) {
    const rawDate = row[mapping.data] || '';
    const description = (row[mapping.descricao] || '').trim();
    if (!rawDate && !description && !(row[mapping.valor] || '').trim()) continue;
    const date = normalizeDate(rawDate);
    const parsedValue = parseMoney(row[mapping.valor] || '');
    if (!validateDate(date)) throw friendlyError(`Data inválida na linha ${index + 2}.`);
    if (!Number.isFinite(parsedValue) || parsedValue === 0) throw friendlyError(`Valor inválido na linha ${index + 2}.`);
    if (!description) throw friendlyError(`A descrição da linha ${index + 2} não pode ficar vazia.`);
    const value = importMode === 'entrada' ? Math.abs(parsedValue) : importMode === 'saida' ? -Math.abs(parsedValue) : parsedValue;
    const roundedValue = Number(value.toFixed(2));
    if (!Number.isFinite(roundedValue) || roundedValue === 0) throw friendlyError(`Valor inválido na linha ${index + 2}.`);
    const base = {
      data_transacao: date,
      data_original: rawDate.trim(),
      valor: roundedValue,
      valor_original: parsedValue,
      valor_centavos: Math.round(roundedValue * 100),
      descricao_banco: description,
      descricao_original: description,
      numero_documento: (row[mapping.documento] || '').trim() || undefined,
      tipo_movimento: value > 0 ? 'credito' as const : 'debito' as const,
      linha_origem: index + 2,
      confianca_extracao: 1,
      motivo_alerta: null,
    };
    const hash = await buildHash(accountId, base);
    if (hashes.has(hash)) throw friendlyError(`A linha ${index + 2} é duplicada dentro do arquivo.`);
    hashes.add(hash);
    transactions.push({ ...base, hash_transacao: hash });
  }
  if (transactions.length === 0) throw friendlyError('O arquivo precisa conter ao menos uma transação válida.');
  return transactions;
};


const summarize = (transactions: ImportTransaction[]) => {
  const dates = transactions.map(transaction => transaction.data_transacao).sort();
  return {
    periodStart: dates[0],
    periodEnd: dates[dates.length - 1],
    totalEntries: transactions.filter(transaction => transaction.valor > 0).reduce((sum, transaction) => sum + transaction.valor, 0),
    totalExits: transactions.filter(transaction => transaction.valor < 0).reduce((sum, transaction) => sum + Math.abs(transaction.valor), 0),
  };
};

const cents = (value: number): number => Math.round(value * 100);

const addConsistencyIssue = (issues: ImportConsistencyIssue[], code: string, message: string, transactionIndex?: number) => {
  if (!issues.some(issue => issue.code === code && issue.transactionIndex === transactionIndex)) {
    issues.push({ code, message, transactionIndex, severity: 'critical' });
  }
};

export const validateImportConsistency = (
  transactions: ImportTransaction[],
  metadata: ImportConfirmationMetadata,
): ImportConsistencyState => {
  const criticalErrors: ImportConsistencyIssue[] = [];
  const alerts: ImportConsistencyIssue[] = [];
  const dates = transactions.map(transaction => transaction.data_transacao).filter(Boolean).sort();
  const computedEntries = transactions.filter(transaction => transaction.valor > 0).reduce((sum, transaction) => sum + transaction.valor, 0);
  const computedExits = transactions.filter(transaction => transaction.valor < 0).reduce((sum, transaction) => sum + Math.abs(transaction.valor), 0);
  const hashes = new Set<string>();
  const fingerprints = new Set<string>();
  let duplicateCount = 0;
  if (transactions.length === 0) addConsistencyIssue(criticalErrors, 'empty_batch', 'O lote não possui registros extraídos.');

  transactions.forEach((transaction, index) => {
    const valueCents = cents(transaction.valor);
    const fingerprint = [transaction.data_transacao, valueCents, transaction.descricao_banco.trim().toLocaleLowerCase(), transaction.numero_documento || ''].join('|');
    if (!validateDate(transaction.data_transacao)) addConsistencyIssue(criticalErrors, 'invalid_date', `Data inválida na transação ${index + 1}.`, index);
    if (!transaction.descricao_banco.trim()) addConsistencyIssue(criticalErrors, 'missing_description', `Descrição ausente na transação ${index + 1}.`, index);
    if (!Number.isFinite(transaction.valor) || valueCents === 0 || !Number.isInteger(transaction.valor_centavos) || transaction.valor_centavos !== valueCents) addConsistencyIssue(criticalErrors, 'invalid_value', `Valor inválido ou inconsistente em centavos na transação ${index + 1}.`, index);
    if (transaction.data_original !== undefined && !transaction.data_original.trim()) addConsistencyIssue(criticalErrors, 'invalid_original_date', `Data bruta ausente na transação ${index + 1}.`, index);
    if (transaction.descricao_original !== undefined && !transaction.descricao_original.trim()) addConsistencyIssue(criticalErrors, 'invalid_original_description', `Descrição bruta ausente na transação ${index + 1}.`, index);
    if ((transaction.valor > 0 && transaction.tipo_movimento !== 'credito') || (transaction.valor < 0 && transaction.tipo_movimento !== 'debito')) addConsistencyIssue(criticalErrors, 'direction_mismatch', `Direção incompatível com o sinal na transação ${index + 1}.`, index);
    if (!/^[a-f0-9]{64}$/.test(transaction.hash_transacao)) addConsistencyIssue(criticalErrors, 'invalid_hash', `Hash inválido na transação ${index + 1}.`, index);
    if (transaction.confianca_extracao !== undefined && (!Number.isFinite(transaction.confianca_extracao) || transaction.confianca_extracao < 0 || transaction.confianca_extracao > 1)) addConsistencyIssue(criticalErrors, 'invalid_confidence', `Confiança de extração inválida na transação ${index + 1}.`, index);
    if (metadata.sourceOrigin && transaction.origem_extracao !== metadata.sourceOrigin) addConsistencyIssue(criticalErrors, 'origin_mismatch', `Origem de extração incompatível na transação ${index + 1}.`, index);
    if (hashes.has(transaction.hash_transacao) || fingerprints.has(fingerprint)) {
      duplicateCount += 1;
      addConsistencyIssue(criticalErrors, 'duplicate_transaction', `Transação duplicada na posição ${index + 1}.`, index);
    }
    hashes.add(transaction.hash_transacao);
    fingerprints.add(fingerprint);
    if (metadata.pages !== undefined && (!Number.isInteger(transaction.pagina_origem) || !Number.isInteger(transaction.linha_origem) || transaction.pagina_origem! < 1 || transaction.linha_origem! < 1 || transaction.pagina_origem! > metadata.pages)) {
      addConsistencyIssue(criticalErrors, 'missing_origin', `Origem página/linha ausente ou inválida na transação ${index + 1}.`, index);
    }
  });

  const totalsDifferenceCents: { entries?: number; exits?: number } = {};
  if (metadata.parserTotals?.entries !== undefined) {
    const difference = cents(computedEntries) - cents(metadata.parserTotals.entries);
    totalsDifferenceCents.entries = difference;
    if (Math.abs(difference) > 1) addConsistencyIssue(criticalErrors, 'entries_total_mismatch', `Divergência crítica no total de entradas: ${Math.abs(difference)} centavo(s).`);
    else if (difference !== 0) alerts.push({ code: 'entries_total_tolerance', message: 'Total de entradas dentro da tolerância de 1 centavo.', severity: 'warning' });
  }
  if (metadata.parserTotals?.exits !== undefined) {
    const difference = cents(computedExits) - cents(metadata.parserTotals.exits);
    totalsDifferenceCents.exits = difference;
    if (Math.abs(difference) > 1) addConsistencyIssue(criticalErrors, 'exits_total_mismatch', `Divergência crítica no total de saídas: ${Math.abs(difference)} centavo(s).`);
    else if (difference !== 0) alerts.push({ code: 'exits_total_tolerance', message: 'Total de saídas dentro da tolerância de 1 centavo.', severity: 'warning' });
  }

  let balanceDifferenceCents: number | undefined;
  if (metadata.openingBalance !== undefined && metadata.closingBalance !== undefined) {
    balanceDifferenceCents = cents(metadata.openingBalance) + cents(computedEntries) - cents(computedExits) - cents(metadata.closingBalance);
    if (Math.abs(balanceDifferenceCents) > 1) addConsistencyIssue(criticalErrors, 'balance_mismatch', `Saldo inconsistente: saldo inicial + entradas - saídas difere do saldo final em ${Math.abs(balanceDifferenceCents)} centavo(s).`);
    else if (balanceDifferenceCents !== 0) alerts.push({ code: 'balance_tolerance', message: 'Saldo dentro da tolerância de 1 centavo.', severity: 'warning' });
  }

  const periodMatches = metadata.periodStart && metadata.periodEnd
    ? Boolean(dates.length && dates[0] >= metadata.periodStart && dates[dates.length - 1] <= metadata.periodEnd)
    : null;
  if (periodMatches === false) addConsistencyIssue(criticalErrors, 'period_mismatch', 'Há transações fora do período informado pelo banco.');

  let continuityMatches: boolean | null = null;
  if (metadata.pages && metadata.pages > 1) {
    const pages = new Set(transactions.map(transaction => transaction.pagina_origem).filter((page): page is number => Number.isInteger(page)));
    continuityMatches = pages.size === metadata.pages && Array.from({ length: metadata.pages }, (_, index) => pages.has(index + 1)).every(Boolean);
    if (!continuityMatches) addConsistencyIssue(criticalErrors, 'page_continuity', 'A sequência de páginas do lote não é contínua ou possui páginas sem origem verificável.');
  }

  if (metadata.reportedTransactionCount !== undefined && metadata.reportedTransactionCount !== transactions.length) addConsistencyIssue(criticalErrors, 'count_mismatch', `Quantidade divergente: banco informou ${metadata.reportedTransactionCount} registro(s), mas ${transactions.length} foi(ram) extraído(s).`);
  if ((metadata.pendingReviewCount || 0) > 0 || metadata.reviewState === 'has_pending_reviews') addConsistencyIssue(criticalErrors, 'pending_review', 'Existem pendências de revisão no lote.');
  if (metadata.sourceOrigin === 'ocr') alerts.push({ code: 'ocr_origin', message: `${transactions.filter(transaction => transaction.origem_extracao === 'ocr').length} transação(ões) extraída(s) via OCR; confira os dados normalizados.`, severity: 'warning' });

  return {
    criticalErrors,
    alerts,
    extractedCount: transactions.length,
    ocrCount: transactions.filter(transaction => transaction.origem_extracao === 'ocr').length,
    duplicateCount,
    computedEntries,
    computedExits,
    computedNet: computedEntries - computedExits,
    totalsDifferenceCents: Object.keys(totalsDifferenceCents).length ? totalsDifferenceCents : undefined,
    balanceDifferenceCents,
    periodMatches,
    continuityMatches,
  };
};

const attachLotMetadata = (transactions: ImportTransaction[], lot: ImportLotDraft): ImportTransaction[] =>
  transactions.map(transaction => ({
    ...transaction,
    arquivo_nome: lot.fileName,
    arquivo_hash: lot.fileHash,
    extrato_lote_id: lot.id,
  }));

export const conciliacoesService = {
  getConciliacoes: async (): Promise<Conciliacao[]> => {
    const { data, error } = await supabase.from('conciliacoes').select('*');
    if (error) throw error;
    return data as Conciliacao[];
  },

  getAllTransacoes: async (): Promise<TransacaoBanco[]> => {
    const { data, error } = await supabase.from('transacoes_banco').select('*').order('data_transacao', { ascending: false });
    if (error) throw error;
    return data as TransacaoBanco[];
  },

  getFechamentos: async (): Promise<FechamentoConciliacao[]> => {
    const { data, error } = await supabase.from('fechamentos_conciliacao').select('*').order('periodo_inicio', { ascending: false });
    if (error) throw error;
    return data as FechamentoConciliacao[];
  },

  fecharPeriodo: async (contaId: string, periodoInicio: string, periodoFim: string): Promise<FechamentoConciliacao> => {
    const { data, error } = await supabase.rpc('fechar_periodo_conciliacao', {
      p_conta_id: contaId,
      p_periodo_inicio: periodoInicio,
      p_periodo_fim: periodoFim,
    });
    if (error) throw error;
    return data as FechamentoConciliacao;
  },

  decidirFechamento: async (fechamentoId: string, aprovado: boolean, justificativa?: string | null): Promise<FechamentoConciliacao> => {
    const { data, error } = await supabase.rpc('decidir_fechamento_conciliacao', {
      p_fechamento_id: fechamentoId,
      p_aprovado: aprovado,
      p_justificativa: justificativa || null,
    });
    if (error) throw error;
    return data as FechamentoConciliacao;
  },

  prepareImportFile: async (file: File, contaBancariaId: string, userId: string): Promise<{ lot: ImportLotDraft; preview: ImportPreview }> => {
    if (!contaBancariaId) throw friendlyError('Selecione a conta bancária antes de importar.');
    if (file.size <= 0 || file.size > MAX_IMPORT_SIZE) throw friendlyError('O arquivo deve ter até 20 MB.');
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw friendlyError('Usuário não autenticado.');
    if (userId && userId !== authData.user.id) throw friendlyError('O usuário informado não corresponde à sessão autenticada.');
    const ownerId = authData.user.id;
    const fileType = getImportFileType(file.name, file.type);
    const fileHash = await sha256(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const storagePath = `${ownerId}/${id}/${sanitizeFileName(file.name)}`;
    const lot: ImportLotDraft = {
      id,
      contaBancariaId,
      userId: ownerId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: fileType === 'pdf' ? PDF_MIME_TYPE : fileType === 'xlsx' ? XLSX_MIME_TYPE : 'text/csv',
      fileHash,
      storagePath,
      status: 'em_validacao',
    };

    try {
      const { error: uploadError } = await supabase.storage.from('bank-statements').upload(storagePath, file, { contentType: lot.mimeType, upsert: false });
      if (uploadError) throw friendlyError(`Não foi possível enviar o arquivo: ${uploadError.message}`);

      const { error: lotError } = await supabase.rpc('preparar_importacao_extrato', {
        p_lote: {
          id: lot.id,
          conta_bancaria_id: lot.contaBancariaId,
          arquivo_nome: lot.fileName,
          arquivo_tamanho: lot.fileSize,
          arquivo_mime_type: lot.mimeType,
          arquivo_hash: lot.fileHash,
          storage_path: lot.storagePath,
          importado_por: lot.userId,
        },
      });
      if (lotError) throw lotError;

      if (fileType === 'csv' || fileType === 'xlsx') {
        const parsed: XlsxParseResult = fileType === 'csv'
          ? await (async () => {
              const { error: functionError } = await supabase.functions.invoke('parse-bank-statement', { body: { lot_id: lot.id, storage_path: storagePath, file_type: 'csv', file_hash: lot.fileHash, mime_type: lot.mimeType } });
              if (functionError) throw friendlyError(`Não foi possível verificar o CSV: ${await functionErrorMessage(functionError, 'Falha ao verificar o arquivo')}`);
              return parseCsv(await file.text());
            })()
          : await (async () => {
              const { data, error: functionError } = await supabase.functions.invoke('parse-bank-statement', { body: { lot_id: lot.id, storage_path: storagePath, file_type: 'xlsx', file_hash: lot.fileHash, mime_type: lot.mimeType } });
              if (functionError) throw friendlyError(`Não foi possível extrair a planilha: ${await functionErrorMessage(functionError, 'Falha ao processar a planilha')}`);
              return data as XlsxParseResult;
            })();
        const mapping = { data: parsed.headers.find(header => /dat/i.test(header)) || '', valor: parsed.headers.find(header => /val/i.test(header)) || '', descricao: parsed.headers.find(header => /desc/i.test(header)) || '', documento: parsed.headers.find(header => /doc/i.test(header)) || '' };
        const transactions = mapping.data && mapping.valor && mapping.descricao
          ? attachLotMetadata(await buildCsvTransactions(contaBancariaId, parsed.rows, mapping, 'ambos'), lot)
          : [];
        const summary = transactions.length ? summarize(transactions) : { periodStart: undefined, periodEnd: undefined, totalEntries: 0, totalExits: 0 };
        const consistencyMetadata: ImportConfirmationMetadata = {
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          extractedCount: transactions.length,
          sourceOrigin: undefined,
          reviewState: 'validated',
        };
        return { lot, preview: { fileName: file.name, fileType, mimeType: lot.mimeType, ...summary, size: file.size, transactions, firstRows: parsed.rows.slice(0, 5), sourceRows: parsed.rows, sourceHeaders: parsed.headers, consistency: validateImportConsistency(transactions, consistencyMetadata) } };
      }

      const { data, error: functionError } = await supabase.functions.invoke('parse-bank-statement', { body: { lot_id: lot.id, storage_path: storagePath, file_type: 'pdf', file_hash: lot.fileHash, mime_type: lot.mimeType } });
      if (functionError) throw friendlyError(`Não foi possível extrair o PDF: ${await functionErrorMessage(functionError, 'Falha ao processar o PDF')}`);
      const result = data as PdfParseResult;
      if (!result || !Array.isArray(result.transactions) || !Array.isArray(result.pendingReviews) || !['texto', 'ocr'].includes(result.sourceOrigin)) {
        throw friendlyError('O parser PDF retornou uma prévia inválida.');
      }
      const parserNumbers = [result.openingBalance, result.closingBalance, result.totalEntries, result.totalExits].filter((value): value is number => value !== undefined);
      if (parserNumbers.some(value => !Number.isFinite(value))) throw friendlyError('O PDF contém totais ou saldos inválidos.');
      const parsedTransactions = await Promise.all(result.transactions.map(async (transaction) => {
        const credit = transaction.credit ?? 0;
        const debit = transaction.debit ?? 0;
        if ((credit > 0 && debit > 0) || (credit <= 0 && debit <= 0) || !Number.isFinite(credit) || !Number.isFinite(debit)) {
          throw friendlyError('O parser retornou uma transação PDF válida sem direção exclusiva.');
        }
        const value = credit > 0 ? Math.abs(credit) : -Math.abs(debit);
        const base = {
          data_transacao: normalizeDate(transaction.date),
          data_original: transaction.date,
          valor: Number(value.toFixed(2)),
          valor_original: credit > 0 ? credit : -Math.abs(debit),
          valor_centavos: Math.round(value * 100),
          descricao_banco: transaction.description.trim(),
          descricao_original: transaction.description.trim(),
          numero_documento: transaction.document?.trim() || undefined,
          tipo_movimento: value > 0 ? 'credito' as const : 'debito' as const,
          pagina_origem: transaction.pagina,
          linha_origem: transaction.linha,
          confianca_extracao: transaction.confidence,
          motivo_alerta: [`origem_${transaction.origem}`, transaction.alert].filter(Boolean).join('; ') || null,
          origem_extracao: transaction.origem,
          estado_revisao: 'valida' as const,
        };
        if (!base.descricao_banco || !Number.isFinite(base.valor) || base.valor === 0) throw friendlyError('O parser retornou uma transação PDF sem data, valor ou descrição válida.');
        return { ...base, hash_transacao: await buildHash(contaBancariaId, base) };
      }));
      const transactions = attachLotMetadata(parsedTransactions, lot);
      const hashes = new Set<string>();
      transactions.forEach(transaction => { if (hashes.has(transaction.hash_transacao)) throw friendlyError('O PDF contém transações duplicadas.'); hashes.add(transaction.hash_transacao); });
      const summary = transactions.length ? summarize(transactions) : { periodStart: undefined, periodEnd: undefined, totalEntries: 0, totalExits: 0 };
      const pendingReviews = result.pendingReviews || [];
      const previewMetadata: ImportConfirmationMetadata = {
        pages: result.pages,
        periodStart: result.periodStart || summary.periodStart,
        periodEnd: result.periodEnd || summary.periodEnd,
        openingBalance: result.openingBalance,
        closingBalance: result.closingBalance,
        parserTotals: { entries: result.totalEntries, exits: result.totalExits },
        reportedTransactionCount: result.reportedTransactionCount,
        sourceOrigin: result.sourceOrigin,
        pendingReviewCount: pendingReviews.length,
        reviewState: pendingReviews.length ? 'has_pending_reviews' : 'validated',
      };
      return { lot, preview: { fileName: file.name, fileType, mimeType: lot.mimeType, size: file.size, pages: result.pages, periodStart: result.periodStart || summary.periodStart, periodEnd: result.periodEnd || summary.periodEnd, openingBalance: result.openingBalance, closingBalance: result.closingBalance, totalEntries: result.totalEntries ?? summary.totalEntries, totalExits: result.totalExits ?? summary.totalExits, transactions, pendingReviews, sourceOrigin: result.sourceOrigin, firstRows: transactions.slice(0, 5).map(transaction => ({ data: transaction.data_transacao, descrição: transaction.descricao_banco, valor: transaction.valor.toFixed(2), origem: transaction.origem_extracao || 'texto' })), bankIdentified: result.bankIdentified, parserTotals: { entries: result.totalEntries, exits: result.totalExits }, reportedTransactionCount: result.reportedTransactionCount, consistency: validateImportConsistency(transactions, previewMetadata) } };
    } catch (error) {
      await conciliacoesService.cleanupImport(lot);
      throw error;
    }
  },

  confirmImport: async (lot: ImportLotDraft, transactions: ImportTransaction[], metadata: ImportConfirmationMetadata = {}) => {
    if (!lot.id || transactions.length === 0) throw friendlyError('O lote precisa conter ao menos uma transação.');
    if (transactions.some(transaction => transaction.estado_revisao === 'pendente_revisao')) throw friendlyError('Resolva explicitamente todas as transações pendentes antes de confirmar o lote.');
    if (metadata.reviewState === 'has_pending_reviews' || (metadata.pendingReviewCount || 0) > 0) throw friendlyError('O lote possui pendências de revisão que não podem ser importadas silenciosamente.');
    const consistency = validateImportConsistency(transactions, metadata);
    if (consistency.criticalErrors.length > 0) throw friendlyError(`A confirmação foi bloqueada: ${consistency.criticalErrors.map(issue => issue.message).join(' ')}`);
    if (lot.fileSize <= 0 || lot.fileSize > MAX_IMPORT_SIZE || !/^[a-f0-9]{64}$/.test(lot.fileHash)) throw friendlyError('Os metadados do arquivo são inválidos.');
    if (lot.storagePath.split('/')[0] !== lot.userId || lot.storagePath.split('/').length < 3) throw friendlyError('O caminho do arquivo não pertence ao lote.');
    getImportFileType(lot.fileName, lot.mimeType);
    const hashes = new Set<string>();
    transactions.forEach((transaction, index) => {
      if (!validateDate(transaction.data_transacao) || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.data_transacao)) throw friendlyError(`Data inválida na transação ${index + 1}.`);
      if (transaction.data_original !== undefined && !transaction.data_original.trim()) throw friendlyError(`A data original da transação ${index + 1} não pode ficar vazia.`);
      if (transaction.descricao_original !== undefined && !transaction.descricao_original.trim()) throw friendlyError(`A descrição original da transação ${index + 1} não pode ficar vazia.`);
      if (!Number.isFinite(transaction.valor) || transaction.valor === 0) throw friendlyError(`Valor inválido na transação ${index + 1}.`);
      if (!Number.isInteger(transaction.valor_centavos) || transaction.valor_centavos !== Math.round(transaction.valor * 100) || transaction.valor_centavos === 0) throw friendlyError(`Valor em centavos inválido na transação ${index + 1}.`);
      if (transaction.confianca_extracao !== undefined && (!Number.isFinite(transaction.confianca_extracao) || transaction.confianca_extracao < 0 || transaction.confianca_extracao > 1)) throw friendlyError(`Confiança de extração inválida na transação ${index + 1}.`);
      if (transaction.arquivo_nome !== undefined && (transaction.arquivo_nome !== lot.fileName || transaction.arquivo_hash !== lot.fileHash || transaction.extrato_lote_id !== lot.id)) throw friendlyError(`A origem do arquivo da transação ${index + 1} não corresponde ao lote.`);
      if (!transaction.descricao_banco.trim()) throw friendlyError(`A descrição da transação ${index + 1} não pode ficar vazia.`);
      if ((transaction.valor > 0 && transaction.tipo_movimento !== 'credito') || (transaction.valor < 0 && transaction.tipo_movimento !== 'debito')) throw friendlyError(`A direção da transação ${index + 1} não corresponde ao valor.`);
      if (!/^[a-f0-9]{64}$/.test(transaction.hash_transacao) || hashes.has(transaction.hash_transacao)) throw friendlyError(`A transação ${index + 1} possui hash inválido ou duplicado.`);
      hashes.add(transaction.hash_transacao);
    });
    const { data, error } = await supabase.rpc('confirmar_importacao_extrato', {
      p_lote: {
        id: lot.id,
        conta_bancaria_id: lot.contaBancariaId,
        arquivo_nome: lot.fileName,
        arquivo_tamanho: lot.fileSize,
        arquivo_mime_type: lot.mimeType,
        arquivo_hash: lot.fileHash,
        storage_path: lot.storagePath,
        importado_por: lot.userId,
      },
      p_transacoes: transactions,
      p_metadata: {
        ...metadata,
        consistency,
        rawTransactions: transactions.map(({ data_original, descricao_original, valor_original, data_transacao, descricao_banco, valor, tipo_movimento, pagina_origem, linha_origem, origem_extracao }) => ({ data_original, descricao_original, valor_original, data_transacao, descricao_banco, valor, tipo_movimento, pagina_origem, linha_origem, origem_extracao })),
      },
    });
    if (error) {
      const { data: persistedLot } = await supabase.from('extratos_bancarios').select('status').eq('id', lot.id).maybeSingle();
      if (!persistedLot || persistedLot.status !== 'confirmado') await conciliacoesService.cleanupImport(lot);
      throw error;
    }
    return data;
  },

  cleanupImport: async (lot: ImportLotDraft): Promise<void> => {
    if (lot.status === 'confirmado') return;
    const { data: persistedLot, error: statusLookupError } = await supabase
      .from('extratos_bancarios')
      .select('status')
      .eq('id', lot.id)
      .maybeSingle();
    if (!statusLookupError && persistedLot?.status === 'confirmado') return;

    let cancelError: unknown = statusLookupError;
    try {
      const { error } = await supabase.rpc('cancelar_importacao_extrato', { p_lote_id: lot.id });
      cancelError = error;
    } catch (error) {
      cancelError = error;
    }

    let storageError: unknown = null;
    try {
      const { error } = await supabase.storage.from('bank-statements').remove([lot.storagePath]);
      storageError = error;
    } catch (error) {
      storageError = error;
    }

    const errors = [cancelError, storageError]
      .filter((error): error is Error => Boolean(error) && !/lote não encontrado/i.test(error instanceof Error ? error.message : String(error)));
    if (errors.length > 0) {
      const details = errors.map(error => error instanceof Error ? error.message : String(error)).join('; ');
      throw friendlyError(`Não foi possível cancelar a importação e remover o arquivo temporário: ${details}`);
    }
  },


  cleanupUnreconciled: async (contaId: string): Promise<void> => {
    const { error } = await supabase.from('transacoes_banco').delete().eq('conta_bancaria_id', contaId).eq('status_conciliacao', false).is('extrato_lote_id', null);
    if (error) throw error;
  },

  linkConciliacao: async (payload: ConciliacaoAtomicaPayload): Promise<ConciliacaoAtomicaResult> => {
    const { data, error } = await supabase.rpc('conciliar_transacao_atomica', {
      p_transacao_id: payload.transacaoBancoId,
      p_lancamento_ids: payload.lancamentoIds,
      p_tipo_diferenca: payload.tipoDiferenca || null,
      p_justificativa: payload.justificativa || null,
    });
    if (error) throw error;
    return data as ConciliacaoAtomicaResult;
  },

  unlinkConciliacao: async (conciliacaoId: string): Promise<boolean> => {
    const { error } = await supabase.rpc('desvincular_conciliacao_atomica', {
      p_conciliacao_id: conciliacaoId,
    });
    if (error) throw error;
    return true;
  },
};
