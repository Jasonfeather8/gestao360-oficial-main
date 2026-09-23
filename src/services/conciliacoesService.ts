import { supabase } from '@/integrations/supabase/client';
import { Conciliacao, TransacaoBanco, ConciliacaoAtomicaPayload, ConciliacaoAtomicaResult } from '../types';
import {
  CsvParseResult,
  ImportConfirmationMetadata,
  ImportFileType,
  ImportLotDraft,
  ImportMode,
  ImportPreview,
  ImportTransaction,
  PdfParseResult,
} from '../types/extratoImportacao';

const MAX_IMPORT_SIZE = 20 * 1024 * 1024;

const friendlyError = (message: string) => new Error(message);

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
      valor: roundedValue,
      descricao_banco: description,
      numero_documento: (row[mapping.documento] || '').trim() || undefined,
      tipo_movimento: value > 0 ? 'credito' as const : 'debito' as const,
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

  prepareImportFile: async (file: File, contaBancariaId: string, userId: string): Promise<{ lot: ImportLotDraft; preview: ImportPreview }> => {
    if (!contaBancariaId) throw friendlyError('Selecione a conta bancária antes de importar.');
    if (file.size > MAX_IMPORT_SIZE) throw friendlyError('O arquivo excede o limite de 20 MB.');
    const fileType: ImportFileType | null = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.csv') ? 'csv' : null;
    if (!fileType) throw friendlyError('Formato não suportado. Selecione um arquivo PDF ou CSV.');
    const fileHash = await sha256(await file.arrayBuffer());
    const { data: existing, error: existingError } = await supabase.from('extratos_bancarios').select('id').eq('arquivo_hash', fileHash).maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw friendlyError('Este arquivo já foi importado. Selecione outro extrato.');

    const id = crypto.randomUUID();
    const storagePath = `${userId}/${id}/${sanitizeFileName(file.name)}`;
    const lot: ImportLotDraft = {
      id,
      contaBancariaId,
      userId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: fileType === 'pdf' ? 'application/pdf' : 'text/csv',
      fileHash,
      storagePath,
    };

    try {
      const { error: uploadError } = await supabase.storage.from('bank-statements').upload(storagePath, file, { contentType: lot.mimeType, upsert: false });
      if (uploadError) throw friendlyError(`Não foi possível enviar o arquivo: ${uploadError.message}`);

      if (fileType === 'csv') {
        const parsed = parseCsv(await file.text());
        const mapping = { data: parsed.headers.find(header => /dat/i.test(header)) || '', valor: parsed.headers.find(header => /val/i.test(header)) || '', descricao: parsed.headers.find(header => /desc/i.test(header)) || '', documento: parsed.headers.find(header => /doc/i.test(header)) || '' };
        const transactions = mapping.data && mapping.valor && mapping.descricao
          ? await buildCsvTransactions(contaBancariaId, parsed.rows, mapping, 'ambos')
          : [];
        const summary = transactions.length ? summarize(transactions) : { periodStart: undefined, periodEnd: undefined, totalEntries: 0, totalExits: 0 };
        return { lot, preview: { fileName: file.name, fileType, mimeType: lot.mimeType, ...summary, size: file.size, transactions, firstRows: parsed.rows.slice(0, 5) } };
      }

      const { data, error: functionError } = await supabase.functions.invoke('parse-bank-statement', { body: { storage_path: storagePath } });
      if (functionError) throw friendlyError(`Não foi possível extrair o PDF: ${functionError.message}`);
      const result = data as PdfParseResult;
      const parserNumbers = [result.openingBalance, result.closingBalance, result.totalEntries, result.totalExits].filter((value): value is number => value !== undefined);
      if (parserNumbers.some(value => !Number.isFinite(value))) throw friendlyError('O PDF contém totais ou saldos inválidos.');
      const transactions = await Promise.all(result.transactions.map(async transaction => {
        const credit = transaction.credit ?? 0;
        const debit = transaction.debit ?? 0;
        if ((credit > 0 && debit > 0) || (credit === 0 && debit === 0) || !Number.isFinite(credit) || !Number.isFinite(debit)) {
          throw friendlyError('O PDF contém uma transação com direção ou valor inválido.');
        }
        const value = credit > 0 ? credit : -Math.abs(debit);
        const base = { data_transacao: normalizeDate(transaction.date), valor: Number(value.toFixed(2)), descricao_banco: transaction.description.trim(), numero_documento: transaction.document?.trim() || undefined, tipo_movimento: value > 0 ? 'credito' as const : 'debito' as const };
        if (!base.descricao_banco || !Number.isFinite(base.valor) || base.valor === 0) throw friendlyError('O PDF contém uma transação sem data, valor ou descrição válida.');
        return { ...base, hash_transacao: await buildHash(contaBancariaId, base) };
      }));
      const hashes = new Set<string>();
      transactions.forEach(transaction => { if (hashes.has(transaction.hash_transacao)) throw friendlyError('O PDF contém transações duplicadas.'); hashes.add(transaction.hash_transacao); });
      if (!transactions.length) throw friendlyError('Não foi possível encontrar transações no PDF.');
      const summary = summarize(transactions);
      if (result.totalEntries !== undefined && Math.abs(result.totalEntries - summary.totalEntries) > 0.01) throw friendlyError('O total de entradas do PDF não bate com as transações extraídas.');
      if (result.totalExits !== undefined && Math.abs(result.totalExits - summary.totalExits) > 0.01) throw friendlyError('O total de saídas do PDF não bate com as transações extraídas.');
      if (result.openingBalance !== undefined && result.closingBalance !== undefined && result.totalEntries !== undefined && result.totalExits !== undefined) {
        const expectedClosing = result.openingBalance + result.totalEntries - result.totalExits;
        if (Math.abs(expectedClosing - result.closingBalance) > 0.02) throw friendlyError('O saldo final do PDF não é compatível com o saldo inicial e os totais extraídos.');
      }
      return { lot, preview: { fileName: file.name, fileType, mimeType: lot.mimeType, size: file.size, pages: result.pages, periodStart: result.periodStart || summary.periodStart, periodEnd: result.periodEnd || summary.periodEnd, openingBalance: result.openingBalance, closingBalance: result.closingBalance, totalEntries: result.totalEntries ?? summary.totalEntries, totalExits: result.totalExits ?? summary.totalExits, transactions, firstRows: transactions.slice(0, 5).map(transaction => ({ data: transaction.data_transacao, descrição: transaction.descricao_banco, valor: transaction.valor.toFixed(2) })), bankIdentified: result.bankIdentified, parserTotals: { entries: result.totalEntries, exits: result.totalExits } } };
    } catch (error) {
      await conciliacoesService.cleanupImport(lot);
      throw error;
    }
  },

  confirmImport: async (lot: ImportLotDraft, transactions: ImportTransaction[], metadata: ImportConfirmationMetadata = {}) => {
    if (!lot.id || transactions.length === 0) throw friendlyError('O lote precisa conter ao menos uma transação.');
    const hashes = new Set<string>();
    transactions.forEach((transaction, index) => {
      if (!validateDate(transaction.data_transacao) || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.data_transacao)) throw friendlyError(`Data inválida na transação ${index + 1}.`);
      if (!Number.isFinite(transaction.valor) || transaction.valor === 0) throw friendlyError(`Valor inválido na transação ${index + 1}.`);
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
      p_metadata: metadata,
    });
    if (error) {
      const { data: persistedLot } = await supabase.from('extratos_bancarios').select('id').eq('id', lot.id).maybeSingle();
      if (!persistedLot) await conciliacoesService.cleanupImport(lot);
      throw error;
    }
    return data;
  },

  cleanupImport: async (lot: ImportLotDraft): Promise<void> => {
    const { error } = await supabase.storage.from('bank-statements').remove([lot.storagePath]);
    if (error) throw error;
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
