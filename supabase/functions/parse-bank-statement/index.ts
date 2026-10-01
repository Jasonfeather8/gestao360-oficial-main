declare const Deno: {
  env: { get(name: string): string | undefined }
}

// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
// @ts-expect-error Deno resolves this npm module in the Edge Function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
// @ts-expect-error Deno resolves this npm module in the Edge Function runtime.
import pdfParse from 'npm:pdf-parse@1.1.1'
// @ts-expect-error Deno resolves this npm module in the Edge Function runtime.
import * as XLSX from 'npm:xlsx@0.18.5'

type SourceOrigin = 'texto' | 'ocr'
type FileOrigin = 'pdf_texto' | 'pdf_ocr' | 'csv' | 'xlsx'
type LayoutToken = { text: string; x: number; y: number; width: number }
type LayoutPage = { page: number; lines: Array<{ text: string; tokens: LayoutToken[] }> }
type PendingReview = {
  data_original?: string
  data_transacao?: string
  valor?: number
  tipo_movimento?: 'credito' | 'debito'
  descricao?: string
  pagina_origem?: number
  linha_origem?: number
  origem_extracao: SourceOrigin
  confianca_extracao: number
  motivos: string[]
  trecho: string
}
type ParsedTransaction = {
  date: string
  description: string
  credit?: number
  debit?: number
  document?: string
  pagina?: number
  linha?: number
  confidence: number
  alert?: string | null
  origem: SourceOrigin
  origem_arquivo: FileOrigin
}

type ExtractedResult = {
  openingBalance?: number
  closingBalance?: number
  totalEntries?: number
  totalExits?: number
  reportedTransactionCount?: number
  transactions: ParsedTransaction[]
  pendingReviews: PendingReview[]
  sourceOrigin: SourceOrigin
}

const MAX_FILE_SIZE = 20 * 1024 * 1024
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PDF_MIME_TYPE = 'application/pdf'
const CSV_MIME_TYPE = 'text/csv'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const log = (...args: unknown[]) => console.log('[parse-bank-statement]', ...args)
const fail = (message: string): never => { throw new Error(message) }
const clean = (value: string) => value.replace(/\s+/g, ' ').trim()
const safeDiagnosticText = (value: string) => value
  .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redigido]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[redigido]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redigido]')
  .replace(/(?:[A-Za-z0-9._-]+\/)+[^\s"'`]+/g, '[caminho redigido]')
  .replace(/\b[\w.-]+\.(?:pdf|xlsx|csv)\b/gi, '[arquivo redigido]')
  .replace(/["'`][^"'`]{1,120}["'`]/g, '[valor redigido]')
  .replace(/\d{4,}/g, '[número redigido]')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 300)
const safeDiagnostic = (error: unknown) => {
  if (!isRecord(error)) return { message: safeDiagnosticText(String(error)) }
  const message = typeof error.message === 'string' ? safeDiagnosticText(error.message) : 'Erro sem mensagem técnica'
  const code = typeof error.code === 'string' ? safeDiagnosticText(error.code) : undefined
  const status = typeof error.status === 'number' || typeof error.status === 'string' ? safeDiagnosticText(String(error.status)) : undefined
  return { message, ...(code ? { code } : {}), ...(status ? { status } : {}) }
}

const sha256 = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const parseMoney = (raw: string): number => {
  let source = raw.trim().replace(/R\$/ig, '').replace(/\s/g, '')
  if (!source) return Number.NaN
  const negative = source.includes('-') || /^\(.*\)$/.test(source)
  source = source.replace(/[()+-]/g, '')
  if (!/^\d[\d.,]*$/.test(source)) return Number.NaN
  const comma = source.lastIndexOf(',')
  const dot = source.lastIndexOf('.')
  let normalized = source
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? source.replace(/\./g, '').replace(',', '.') : source.replace(/,/g, '')
  } else if (comma >= 0) {
    normalized = source.slice(comma + 1).length === 2 ? source.replace(',', '.') : source.replace(/,/g, '')
  } else if (dot >= 0) {
    normalized = source.slice(dot + 1).length === 2 ? source : source.replace(/\./g, '')
  }
  const value = Number(normalized)
  return Number.isFinite(value) ? (negative ? -Math.abs(value) : value) : Number.NaN
}

const amountPattern = /(?:[+-]?\s*(?:R\$\s*)?\(?\d[\d.,\s]*[.,]\d{2}\)?|R\$\s*[+-]?\s*\(?\d[\d.,\s]*[.,]\d{2}\)?)/g
const datePattern = /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}\.\d{1,2}\.\d{2,4})\b/g
const documentPattern = /\b(?:[A-Z]{1,5}[- ]?\d{4,}|\d{8,})\b/i
const directionPattern = /\b(CR|DB|C|D|credito|crédito|debito|débito|entrada|sa[ií]da|recebimento|pagamento|credit|debit|deposit|withdrawal|receipt)\b/i
const ignoredLinePattern = /^(?:extrato|statement|per[ií]odo|period|data\b|date\b|descri[cç][aã]o\b|description\b|hist[oó]rico\b|history\b|lan[cç]amento\b|transaction\b|ag[eê]ncia\b|agency\b|conta\b|account\b|cliente\b|customer\b|p[aá]gina\b|page\b|total\b|saldo\b|balance\b|\d+\s*(?:de|\/)\s*\d+$)/i
const ignoredContentPattern = /(?:saldo\s+(?:anterior|inicial|final|atual|do dia)|balance\s+(?:forward|opening|closing|available)|total\s+(?:de\s+)?(?:entradas?|sa[ií]das?|cr[eé]ditos?|d[eé]bitos?)|total\s+(?:credits?|debits?|deposits?|withdrawals?)|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*(?:a|até|-|–)\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i

const toIsoDate = (raw: string, preferredDayFirst = false): { iso?: string; ambiguous?: boolean } => {
  const value = raw.trim().replace(/\./g, '/').replace(/-/g, '/')
  const parts = value.split('/')
  let year: number
  let month: number
  let day: number
  if (parts[0].length === 4) {
    year = Number(parts[0]); month = Number(parts[1]); day = Number(parts[2])
  } else {
    const first = Number(parts[0])
    const second = Number(parts[1])
    year = Number(parts[2].length === 2 ? `20${parts[2]}` : parts[2])
    if (first > 12 && second <= 12) {
      day = first; month = second
    } else if (second > 12 && first <= 12) {
      day = second; month = first
    } else {
      day = first; month = second
    }
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return {}
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return {}
  if (parts[0].length !== 4 && day <= 12 && month <= 12) {
    const iso = preferredDayFirst
      ? `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      : `${year.toString().padStart(4, '0')}-${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}`
    return { iso, ambiguous: !preferredDayFirst }
  }
  return { iso: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}` }
}

const findLabeledMoney = (text: string, label: RegExp): number | undefined => {
  const match = text.match(new RegExp(`${label.source}[^\\d-+]{0,80}(${amountPattern.source})`, 'i'))
  if (!match) return undefined
  const value = parseMoney(match[1])
  return Number.isFinite(value) ? Math.abs(value) : undefined
}

const findLabeledCount = (text: string): number | undefined => {
  const match = text.match(/(?:quantidade|qtd\.?)\s*(?:de\s*)?(?:transa[cç][oõ]es|lan[cç]amentos|registros)\s*[:=-]?\s*(\d{1,7})(?![\d/])/i)
    || text.match(/total\s+(?:de\s+)?(?:transa[cç][oõ]es|lan[cç]amentos|registros)\s*:\s*(\d{1,7})(?![\d/])/i)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

const classifyBankName = (text: string): string | undefined => {
  const match = text.match(/\b(Banco do Brasil|Bradesco|Ita[uú]|Santander|Nubank|Inter|Cora|Caixa Econ[oô]mica Federal|Mercado Pago)\b/i)
  return match?.[1]
}

const buildLayoutPages = async (bytes: ArrayBuffer): Promise<{ text: string; pages: number; layouts: LayoutPage[] }> => {
  const layouts: LayoutPage[] = []
  const parsed = await pdfParse(new Uint8Array(bytes), {
    pagerender: async (pageData: any) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
      const tokens = (content.items || []).map((item: any) => ({
        text: String(item.str || ''),
        x: Number(item.transform?.[4] || 0),
        y: Number(item.transform?.[5] || 0),
        width: Number(item.width || 0),
      })).filter((item: LayoutToken) => item.text.trim())
      const grouped: Array<{ text: string; tokens: LayoutToken[]; y: number }> = []
      for (const token of tokens.sort((a: LayoutToken, b: LayoutToken) => b.y - a.y || a.x - b.x)) {
        const line = grouped.find(candidate => Math.abs(candidate.y - token.y) <= 2.5)
        if (line) line.tokens.push(token)
        else grouped.push({ text: '', tokens: [token], y: token.y })
      }
      const lines = grouped.sort((a, b) => b.y - a.y).map(line => ({
        tokens: line.tokens.sort((a, b) => a.x - b.x),
        text: clean(line.tokens.sort((a, b) => a.x - b.x).map(token => token.text).join(' ')),
      }))
      const page = Number(pageData.pageIndex || layouts.length) + 1
      layouts.push({ page, lines })
      return lines.map(line => line.text).join('\n')
    },
  })
  layouts.sort((a, b) => a.page - b.page)
  return { text: parsed.text || '', pages: Number(parsed.numpages) || layouts.length || 1, layouts }
}

const layoutHeaders = (pages: LayoutPage[]) => pages.flatMap(page => page.lines.flatMap(line => {
  const normalizedLine = line.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const isHeader = /credito|debito|entrada|saida|credit|debit|deposit|withdrawal|\bcr\b|\bdb\b|\bc\b|\bd\b/.test(normalizedLine) && (/data|date|desc|histor|history|valor|amount/.test(normalizedLine) || line.tokens.length >= 3)
  return isHeader ? line.tokens.map(token => ({
    label: token.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[():;|]/g, ''), x: token.x,
  })) : []
}))

const directionFromLayout = (amountX: number, headers: Array<{ label: string; x: number }>): 'credito' | 'debito' | undefined => {
  const candidates = headers.filter(header => /^(credito|debito|entrada|saida|credit|debit|deposit|withdrawal|cr|db|c|d)$/.test(header.label))
  if (!candidates.length) return undefined
  const nearest = candidates.reduce((best, current) => Math.abs(current.x - amountX) < Math.abs(best.x - amountX) ? current : best)
  if (Math.abs(nearest.x - amountX) > 160) return undefined
  return /credito|entrada|credit|deposit|^cr$|^c$/.test(nearest.label) ? 'credito' : /debito|saida|debit|withdrawal|^db$|^d$/.test(nearest.label) ? 'debito' : undefined
}

const directionFromText = (text: string, rawAmount: string): 'credito' | 'debito' | undefined => {
  const sign = rawAmount.trim().startsWith('-') || rawAmount.includes('(') ? 'debito' : rawAmount.trim().startsWith('+') ? 'credito' : undefined
  if (sign) return sign
  const indicators = Array.from(text.matchAll(new RegExp(directionPattern.source, 'gi'))).map(match => match[1])
  if (!indicators.length) return undefined
  const hasDebit = indicators.some(indicator => /DB|^D$|debito|débito|sa[ií]da|pagamento|debit|withdrawal/i.test(indicator))
  const hasCredit = indicators.some(indicator => /CR|^C$|credito|crédito|entrada|recebimento|credit|deposit|receipt/i.test(indicator))
  if (hasDebit === hasCredit) return undefined
  return hasDebit ? 'debito' : 'credito'
}

const descriptionFromLine = (line: string, dateRaw: string, amountRaw: string): string => {
  const withoutDate = line.replace(dateRaw, ' ')
  const withoutAmount = withoutDate.replace(amountRaw, ' ')
  return clean(withoutAmount
    .replace(/\b(?:CR|DB|C|D|credito|crédito|debito|débito|entrada|sa[ií]da|recebimento|pagamento|credit|debit|deposit|withdrawal|receipt)\b/ig, ' ')
    .replace(/[|;]/g, ' '))
}

const extractText = (text: string, sourceOrigin: SourceOrigin, pages: number, layoutPages: LayoutPage[] = []): ExtractedResult => {
  const transactions: ParsedTransaction[] = []
  const pendingReviews: PendingReview[] = []
  const headers = layoutHeaders(layoutPages)
  const headersByPage = new Map(layoutPages.map(page => [page.page, layoutHeaders([page])]))
  const normalizedDocumentText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const preferredDayFirst = /extrato|periodo|saldo|descricao|credito|debito/.test(normalizedDocumentText) && !/statement|period|balance|description|credit|debit/.test(normalizedDocumentText)
  const lines = layoutPages.length
    ? layoutPages.flatMap(page => page.lines.map((line, index) => ({ text: line.text, tokens: line.tokens, page: page.page, line: index + 1 })))
    : text.split(/\f/).flatMap((pageText, pageIndex) => pageText.split(/\r?\n/).map((value, lineIndex) => ({ text: clean(value), tokens: [], page: pageIndex + 1, line: lineIndex + 1 })))
  let current: { dateRaw?: string; date?: string; ambiguousDate?: boolean; description: string; page: number; line: number; raw: string; amount?: number; amountRaw?: string; direction?: 'credito' | 'debito'; directionEvidence?: 'layout' | 'sign' | 'indicator'; x?: number } | null = null

  const emit = (row: typeof current) => {
    if (!row) return
    const reasons: string[] = []
    if (!row.date) reasons.push('data não identificada ou inválida')
    if (row.ambiguousDate) reasons.push('data ambígua; confirme o formato')
    if (row.amount === undefined || !Number.isFinite(row.amount) || row.amount === 0) reasons.push('valor ausente, inválido ou igual a zero')
    if (!row.direction) reasons.push('direção crédito/débito não determinada por coluna, sinal ou indicador')
    const description = clean(row.description)
    if (!description) reasons.push('descrição ausente após unir as linhas')
    if (reasons.length) {
      pendingReviews.push({
        data_original: row.dateRaw,
        data_transacao: row.date,
        valor: row.amount,
        tipo_movimento: row.direction,
        descricao: description || undefined,
        pagina_origem: row.page,
        linha_origem: row.line,
        origem_extracao: sourceOrigin,
        confianca_extracao: sourceOrigin === 'ocr' ? 0.45 : 0.55,
        motivos: reasons,
        trecho: row.raw.slice(0, 500),
      })
      return
    }
    const document = description.match(documentPattern)?.[0]
    const cleanDescription = clean(description.replace(document || '', ' '))
    const confidence = sourceOrigin === 'ocr' ? 0.7 : row.directionEvidence === 'layout' ? 0.96 : row.directionEvidence === 'sign' ? 0.93 : row.directionEvidence === 'indicator' ? 0.86 : 0.55
    const alert = sourceOrigin === 'ocr' ? 'Origem OCR: valide data, valor, direção e descrição.' : confidence < 0.9 ? 'Classificação por indicador textual; confira excepcionalmente.' : null
    transactions.push({
      date: row.date!, description: cleanDescription, document, pagina: row.page, linha: row.line,
      credit: row.direction === 'credito' ? Math.abs(row.amount!) : undefined,
      debit: row.direction === 'debito' ? Math.abs(row.amount!) : undefined,
      confidence, alert, origem: sourceOrigin,
      origem_arquivo: sourceOrigin === 'ocr' ? 'pdf_ocr' : 'pdf_texto',
    })
  }

  for (const entry of lines) {
    const line = clean(entry.text)
    if (!line) continue
    const dateMatch = line.match(datePattern)?.[0]
    const dateResult = dateMatch ? toIsoDate(dateMatch, preferredDayFirst) : undefined
    const isIgnored = ignoredLinePattern.test(line) || ignoredContentPattern.test(line)
    if (dateMatch && isIgnored) continue
    if (dateMatch) {
      emit(current)
      current = { dateRaw: dateMatch, date: dateResult?.iso, ambiguousDate: dateResult?.ambiguous, description: '', page: entry.page, line: entry.line, raw: line }
    } else if (!current) {
      const hasAmountOrDirection = amountPattern.test(line) || directionPattern.test(line)
      amountPattern.lastIndex = 0
      if (hasAmountOrDirection && !isIgnored) {
        pendingReviews.push({
          pagina_origem: entry.page,
          linha_origem: entry.line,
          origem_extracao: sourceOrigin,
          confianca_extracao: sourceOrigin === 'ocr' ? 0.35 : 0.45,
          motivos: [amountPattern.test(line) ? 'valor ou direção sem data identificada' : 'indicador de direção sem data/valor identificados'],
          trecho: line.slice(0, 500),
        })
        amountPattern.lastIndex = 0
      }
      continue
    } else if (isIgnored) {
      continue
    }

    if (!current) continue
    const amountMatches = Array.from(line.matchAll(amountPattern))
    if (amountMatches.length > 0) {
      if (current.amount !== undefined) {
        current.description = clean(`${current.description} ${descriptionFromLine(line, '', amountMatches[0][0])}`)
        current.raw = clean(`${current.raw} ${line}`)
        continue
      }
      if (amountMatches.length > 1) {
        const candidates = amountMatches.map(match => {
          const token = entry.tokens.find(item => item.text.includes(match[0]))
          return {
            raw: match[0],
            value: parseMoney(match[0]),
            direction: token ? directionFromLayout(token.x, headersByPage.get(entry.page) || headers) : undefined,
          }
        })
        const usable = candidates.filter(candidate => Number.isFinite(candidate.value) && candidate.value !== 0)
        const explicitlyDirected = usable.filter(candidate => candidate.direction)
        const selected = usable.length === 1 && explicitlyDirected.length === 1
          ? explicitlyDirected[0]
          : usable.length === 2 && explicitlyDirected.length === 1
            ? explicitlyDirected[0]
            : undefined
        if (selected) {
          current.amount = selected.value
          current.amountRaw = selected.raw
          current.direction = selected.direction
          current.directionEvidence = 'layout'
        } else {
          current.amount = Number.NaN
          current.amountRaw = amountMatches.map(match => match[0]).join(' ')
        }
      } else {
        const match = amountMatches[0]
        current.amount = parseMoney(match[0])
        current.amountRaw = match[0]
        current.x = entry.tokens.find(token => token.text.includes(match[0]))?.x
        const layoutDirection = current.x === undefined ? undefined : directionFromLayout(current.x, headersByPage.get(entry.page) || headers)
        const signDirection = match[0].trim().startsWith('-') || match[0].includes('(') ? 'debito' : match[0].trim().startsWith('+') ? 'credito' : undefined
        const textDirection = directionFromText(line, match[0])
        current.direction = layoutDirection || signDirection || textDirection
        current.directionEvidence = layoutDirection ? 'layout' : signDirection ? 'sign' : textDirection ? 'indicator' : undefined
      }
      current.description = clean(`${current.description} ${descriptionFromLine(line, current.dateRaw || '', current.amountRaw || '')}`)
    } else if (!isIgnored) {
      current.description = clean(`${current.description} ${line.replace(current.dateRaw || '', '')}`)
      current.raw = clean(`${current.raw} ${line}`)
    }
  }
  emit(current)

  const allText = text || lines.map(line => line.text).join('\n')
  return {
    openingBalance: findLabeledMoney(allText, /saldo\s+(?:inicial|anterior)/i),
    closingBalance: findLabeledMoney(allText, /saldo\s+(?:final|atual)/i),
    totalEntries: findLabeledMoney(allText, /total\s+(?:de\s+)?(?:entradas?|cr[eé]ditos?|credits?|deposits?)/i),
    totalExits: findLabeledMoney(allText, /total\s+(?:de\s+)?(?:sa[ií]das?|d[eé]bitos?|debits?|withdrawals?)/i),
    reportedTransactionCount: findLabeledCount(allText),
    transactions, pendingReviews, sourceOrigin,
  }
}

const parseXlsx = (bytes: ArrayBuffer) => {
  const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) fail('A planilha XLSX não possui uma aba.')
  const worksheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '', blankrows: true }) as unknown[][]
  if (rawRows.length < 2) fail('A planilha XLSX precisa conter cabeçalho e ao menos uma linha.')
  const headers = rawRows[0].map(value => String(value ?? '').trim())
  if (headers.some(header => !header)) fail('O cabeçalho do XLSX possui uma coluna sem nome.')
  if (new Set(headers).size !== headers.length) fail('O cabeçalho do XLSX possui colunas duplicadas.')
  const rows = rawRows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length) fail(`A linha ${rowIndex + 2} do XLSX possui mais campos que o cabeçalho.`)
    return Object.fromEntries(headers.map((header, index) => [header, String(cells[index] ?? '').trim()]))
  })
  return { headers, rows, sheetName: firstSheetName }
}

const normalizedPeriod = (text: string): [string, string] | undefined => {
  const matches = Array.from(text.matchAll(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*(?:a|até|-|–)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/gi))
  const first = matches[0]
  if (!first) return undefined
  const start = toIsoDate(first[1]).iso
  const end = toIsoDate(first[2]).iso
  return start && end ? [start, end] : undefined
}

const MAX_PDF_PAGES = 15
const OPENAI_TIMEOUT_MS = 45_000
const OPENAI_MAX_ATTEMPTS = 2
const OPENAI_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['openingBalance', 'closingBalance', 'totalEntries', 'totalExits', 'reportedTransactionCount', 'periodStart', 'periodEnd', 'bankIdentified', 'sourceOrigin', 'transactions', 'pendingReviews'],
  properties: {
    openingBalance: { type: ['number', 'null'] },
    closingBalance: { type: ['number', 'null'] },
    totalEntries: { type: ['number', 'null'] },
    totalExits: { type: ['number', 'null'] },
    reportedTransactionCount: { type: ['integer', 'null'] },
    periodStart: { type: ['string', 'null'] },
    periodEnd: { type: ['string', 'null'] },
    bankIdentified: { type: ['string', 'null'] },
    sourceOrigin: { type: 'string', enum: ['texto', 'ocr'] },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'description', 'credit', 'debit', 'document', 'pagina', 'linha', 'confidence', 'alert', 'origem'],
        properties: {
          date: { type: 'string' },
          description: { type: 'string' },
          credit: { type: ['number', 'null'] },
          debit: { type: ['number', 'null'] },
          document: { type: ['string', 'null'] },
          pagina: { type: 'integer' },
          linha: { type: 'integer' },
          confidence: { type: 'number' },
          alert: { type: ['string', 'null'] },
          origem: { type: 'string', enum: ['texto', 'ocr'] },
        },
      },
    },
    pendingReviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['data_original', 'data_transacao', 'valor', 'tipo_movimento', 'descricao', 'pagina_origem', 'linha_origem', 'origem_extracao', 'confianca_extracao', 'motivos', 'trecho'],
        properties: {
          data_original: { type: ['string', 'null'] },
          data_transacao: { type: ['string', 'null'] },
          valor: { type: ['number', 'null'] },
          tipo_movimento: { type: ['string', 'null'], enum: ['credito', 'debito', null] },
          descricao: { type: ['string', 'null'] },
          pagina_origem: { type: ['integer', 'null'] },
          linha_origem: { type: ['integer', 'null'] },
          origem_extracao: { type: 'string', enum: ['texto', 'ocr'] },
          confianca_extracao: { type: 'number' },
          motivos: { type: 'array', items: { type: 'string' } },
          trecho: { type: 'string' },
        },
      },
    },
  },
} as const

type OpenAiPreview = {
  openingBalance: number | null
  closingBalance: number | null
  totalEntries: number | null
  totalExits: number | null
  reportedTransactionCount: number | null
  periodStart: string | null
  periodEnd: string | null
  bankIdentified: string | null
  sourceOrigin: SourceOrigin
  transactions: Array<{
    date: string
    description: string
    credit: number | null
    debit: number | null
    document: string | null
    pagina: number
    linha: number
    confidence: number
    alert: string | null
    origem: SourceOrigin
  }>
  pendingReviews: PendingReview[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isValidIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(toIsoDate(value).iso)
const optionalNumber = (value: number | null): number | undefined => value === null ? undefined : value
const optionalString = (value: string | null): string | undefined => value === null ? undefined : value

const validatePdfBytes = async (bytes: ArrayBuffer): Promise<number> => {
  const signature = new TextDecoder().decode(bytes.slice(0, 5))
  if (signature !== '%PDF-') fail('A assinatura real do PDF é inválida')
  let parsed: any
  try {
    parsed = await pdfParse(new Uint8Array(bytes))
  } catch {
    fail('O conteúdo do PDF é inválido ou não pôde ser lido')
  }
  const pages = Number(parsed?.numpages)
  if (!Number.isInteger(pages) || pages < 1) fail('O PDF não informa uma quantidade válida de páginas')
  if (pages > MAX_PDF_PAGES) fail('O PDF excede o limite de 15 páginas')
  return pages
}

const openAiRequest = async (
  apiKey: string,
  url: string,
  request: () => RequestInit,
  timeoutMs = OPENAI_TIMEOUT_MS,
): Promise<Response> => {
  for (let attempt = 0; attempt < OPENAI_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      const init = request()
      response = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> || {}), Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') fail(`Tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido`)
      const diagnostic = safeDiagnostic(error)
      throw new Error(`Falha de comunicação com o provedor de extração: ${diagnostic.message}`)
    } finally {
      clearTimeout(timer)
    }
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === OPENAI_MAX_ATTEMPTS - 1) return response
    await response.body?.cancel()
    await new Promise<void>(resolve => setTimeout(resolve, 250 * (2 ** attempt)))
  }
  fail('Falha de comunicação com o provedor de extração')
}

const readOpenAiJson = async (response: Response, phase: string): Promise<unknown> => {
  if (!response.ok) {
    let providerError: unknown
    try {
      providerError = await response.json()
    } catch {
      providerError = undefined
    }
    const errorRecord = isRecord(providerError) && isRecord(providerError.error) ? providerError.error : undefined
    const providerCode = typeof errorRecord?.code === 'string' ? safeDiagnosticText(errorRecord.code) : undefined
    const providerType = typeof errorRecord?.type === 'string' ? safeDiagnosticText(errorRecord.type) : undefined
    const providerMessage = typeof errorRecord?.message === 'string' ? safeDiagnosticText(errorRecord.message) : undefined
    log('Erro HTTP do provedor', {
      fase: phase,
      status: response.status,
      ...(providerCode ? { provider_code: providerCode } : {}),
      ...(providerType ? { provider_type: providerType } : {}),
      ...(providerMessage ? { provider_message: providerMessage } : {}),
    })
    fail(`Falha do provedor de extração na fase ${phase} (${response.status})`)
  }
  try {
    return await response.json()
  } catch (error) {
    const diagnostic = safeDiagnostic(error)
    log('Resposta JSON inválida do provedor', { fase: phase, erro: diagnostic.message })
    fail(`Resposta inválida do provedor de extração na fase ${phase}`)
  }
}

const extractResponseText = (payload: unknown): string => {
  if (!isRecord(payload)) fail('Resposta estruturada do provedor é inválida')
  const response = payload as Record<string, unknown>
  const status = response.status
  if (status === 'incomplete' || status === 'failed' || status === 'cancelled' || status === 'canceled') fail(`Resposta do provedor não concluída: ${status}`)
  if (status !== 'completed') fail('Resposta do provedor não foi concluída')
  if (!Array.isArray(response.output)) fail('Resposta do provedor não possui saída')
  const output = response.output as unknown[]
  const textParts: string[] = []
  for (const outputItem of output) {
    if (!isRecord(outputItem)) continue
    if (['refusal', 'incomplete', 'failed', 'cancelled', 'canceled'].includes(String(outputItem.status)) || outputItem.type === 'refusal') fail('O provedor recusou ou interrompeu a extração')
    if (!Array.isArray(outputItem.content)) continue
    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) continue
      if (contentItem.type === 'refusal' || typeof contentItem.refusal === 'string') fail('O provedor recusou a extração')
      if (contentItem.type === 'output_text' && typeof contentItem.text === 'string') textParts.push(contentItem.text)
    }
  }
  const text = textParts.join('').trim()
  if (!text) fail('A saída estruturada do provedor está vazia')
  return text
}

const validateOpenAiPreview = (value: unknown, pages: number): OpenAiPreview => {
  if (!isRecord(value)) fail('O JSON estruturado do provedor não possui contrato válido')
  const preview = value as Partial<OpenAiPreview>
  for (const field of ['openingBalance', 'closingBalance', 'totalEntries', 'totalExits']) {
    const fieldValue = preview[field as keyof OpenAiPreview]
    if (fieldValue !== null && !isFiniteNumber(fieldValue)) fail(`Campo numérico inválido na saída do provedor: ${field}`)
  }
  if (preview.reportedTransactionCount === undefined || (preview.reportedTransactionCount !== null && (!Number.isInteger(preview.reportedTransactionCount) || preview.reportedTransactionCount < 0))) fail('Quantidade informada inválida na saída do provedor')
  if (preview.periodStart === undefined || (preview.periodStart !== null && !isValidIsoDate(preview.periodStart))) fail('Período inicial inválido na saída do provedor')
  if (preview.periodEnd === undefined || (preview.periodEnd !== null && !isValidIsoDate(preview.periodEnd))) fail('Período final inválido na saída do provedor')
  if (preview.bankIdentified === undefined || (preview.bankIdentified !== null && typeof preview.bankIdentified !== 'string')) fail('Banco identificado inválido na saída do provedor')
  if (!['texto', 'ocr'].includes(String(preview.sourceOrigin)) || !Array.isArray(preview.transactions) || !Array.isArray(preview.pendingReviews)) fail('Contrato de preview inválido na saída do provedor')
  const transactions = preview.transactions
  for (const [index, transaction] of transactions.entries()) {
    if (!isRecord(transaction) || !isValidIsoDate(transaction.date) || typeof transaction.description !== 'string' || !transaction.description.trim() || !Number.isInteger(transaction.pagina) || transaction.pagina < 1 || transaction.pagina > pages || !Number.isInteger(transaction.linha) || transaction.linha < 1 || !isFiniteNumber(transaction.confidence) || transaction.confidence < 0.85 || transaction.confidence > 1 || !['texto', 'ocr'].includes(String(transaction.origem))) fail(`Transação ${index + 1} inválida na saída do provedor`)
    const credit = transaction.credit
    const debit = transaction.debit
    if ((credit !== null && !isFiniteNumber(credit)) || (debit !== null && !isFiniteNumber(debit)) || (credit !== null && credit <= 0) || (debit !== null && debit <= 0) || (credit !== null) === (debit !== null) || transaction.origem !== preview.sourceOrigin) fail(`Direção ou origem inválida na transação ${index + 1}`)
    if (transaction.alert !== null && typeof transaction.alert !== 'string') fail(`Alerta inválido na transação ${index + 1}`)
    if (transaction.document !== null && typeof transaction.document !== 'string') fail(`Documento inválido na transação ${index + 1}`)
  }
  for (const [index, review] of preview.pendingReviews.entries()) {
    if (!isRecord(review) || !['texto', 'ocr'].includes(String(review.origem_extracao)) || review.origem_extracao !== preview.sourceOrigin || !isFiniteNumber(review.confianca_extracao) || review.confianca_extracao < 0 || review.confianca_extracao > 1 || !Array.isArray(review.motivos) || review.motivos.length === 0 || review.motivos.some(reason => typeof reason !== 'string' || !reason.trim()) || typeof review.trecho !== 'string' || !review.trecho.trim() || review.trecho.length > 500) fail(`Pendência ${index + 1} inválida na saída do provedor`)
    if (review.data_original === undefined || (review.data_original !== null && typeof review.data_original !== 'string')) fail(`Data original inválida na pendência ${index + 1}`)
    if (review.valor === undefined || (review.valor !== null && !isFiniteNumber(review.valor))) fail(`Valor inválido na pendência ${index + 1}`)
    if (review.tipo_movimento === undefined || (review.tipo_movimento !== null && !['credito', 'debito'].includes(review.tipo_movimento))) fail(`Tipo inválido na pendência ${index + 1}`)
    if (review.descricao === undefined || (review.descricao !== null && typeof review.descricao !== 'string')) fail(`Descrição inválida na pendência ${index + 1}`)
    if (review.data_transacao === undefined || (review.data_transacao !== null && !isValidIsoDate(review.data_transacao))) fail(`Data inválida na pendência ${index + 1}`)
    if (review.pagina_origem === undefined || (review.pagina_origem !== null && (!Number.isInteger(review.pagina_origem) || review.pagina_origem < 1 || review.pagina_origem > pages))) fail(`Página inválida na pendência ${index + 1}`)
    if (review.linha_origem === undefined || (review.linha_origem !== null && (!Number.isInteger(review.linha_origem) || review.linha_origem < 1))) fail(`Linha inválida na pendência ${index + 1}`)
  }
  return preview as OpenAiPreview
}

const toExtractedResult = (preview: OpenAiPreview): ExtractedResult => ({
  openingBalance: optionalNumber(preview.openingBalance),
  closingBalance: optionalNumber(preview.closingBalance),
  totalEntries: optionalNumber(preview.totalEntries),
  totalExits: optionalNumber(preview.totalExits),
  reportedTransactionCount: optionalNumber(preview.reportedTransactionCount),
  transactions: preview.transactions.map(transaction => ({
    date: transaction.date,
    description: transaction.description.trim(),
    credit: transaction.credit === null ? undefined : transaction.credit,
    debit: transaction.debit === null ? undefined : transaction.debit,
    document: optionalString(transaction.document),
    pagina: transaction.pagina,
    linha: transaction.linha,
    confidence: transaction.confidence,
    alert: transaction.alert,
    origem: transaction.origem,
    origem_arquivo: transaction.origem === 'ocr' ? 'pdf_ocr' : 'pdf_texto',
  })),
  pendingReviews: preview.pendingReviews.map(review => ({
    ...review,
    data_original: optionalString(review.data_original),
    data_transacao: optionalString(review.data_transacao),
    valor: optionalNumber(review.valor),
    tipo_movimento: review.tipo_movimento === null ? undefined : review.tipo_movimento,
    descricao: optionalString(review.descricao),
    pagina_origem: review.pagina_origem === null ? undefined : review.pagina_origem,
    linha_origem: review.linha_origem === null ? undefined : review.linha_origem,
  })),
  sourceOrigin: preview.sourceOrigin,
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  let supabaseAdmin: any = null
  let authenticatedClient: any = null
  let lotId: string | undefined
  let openAiFileId: string | undefined
  let failurePhase = 'autenticacao'
  try {
    const authorization = req.headers.get('Authorization') || ''
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)
    if (!tokenMatch) fail('Token de autenticação ausente ou inválido')
    supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(tokenMatch[1])
    if (authError) log('Falha técnica na autenticação', { fase: failurePhase, erro: safeDiagnostic(authError) })
    if (authError || !authData.user) fail('Token de autenticação inválido')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (anonKey) authenticatedClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', anonKey, { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } })
    failurePhase = 'autorizacao'
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
    if (profileError) log('Falha técnica na autorização', { fase: failurePhase, erro: safeDiagnostic(profileError) })
    if (profileError || !profile || !['master', 'gerente'].includes(profile.role)) fail('Usuário não autorizado a processar extratos')

    failurePhase = 'validacao_do_lote'
    const body = await req.json() as { lot_id?: string; storage_path?: string; file_type?: 'pdf' | 'xlsx' | 'csv'; file_hash?: string; mime_type?: string }
    lotId = body.lot_id
    if (!body.lot_id || !/^[0-9a-f-]{36}$/i.test(body.lot_id)) fail('Lote de importação inválido')
    if (!body.storage_path || !/^[0-9a-f-]{36}\/[^/]+\/[^/]+$/i.test(body.storage_path) || body.storage_path.includes('..')) fail('Caminho do arquivo é inválido')
    if (!body.file_hash || !/^[a-f0-9]{64}$/.test(body.file_hash)) fail('Hash SHA-256 do arquivo é obrigatório')
    const extension = body.storage_path.toLowerCase().split('.').pop()
    const fileType = body.file_type || (extension === 'xlsx' ? 'xlsx' : extension === 'pdf' ? 'pdf' : extension === 'csv' ? 'csv' : undefined)
    if (!fileType || (fileType === 'xlsx' && extension !== 'xlsx') || (fileType === 'pdf' && extension !== 'pdf') || (fileType === 'csv' && extension !== 'csv')) fail('Extensão do arquivo incompatível com o formato informado')
    const expectedMime = fileType === 'pdf' ? PDF_MIME_TYPE : fileType === 'xlsx' ? XLSX_MIME_TYPE : CSV_MIME_TYPE
    if (body.mime_type !== expectedMime) fail('MIME informado incompatível com a extensão do arquivo')
    const { data: lot, error: lotError } = await supabaseAdmin.from('extratos_bancarios').select('id, conta_bancaria_id, arquivo_nome, arquivo_tamanho, arquivo_mime_type, arquivo_hash, storage_path, importado_por, status').eq('id', body.lot_id).maybeSingle()
    if (lotError) log('Falha técnica na consulta do lote', { fase: failurePhase, erro: safeDiagnostic(lotError) })
    if (lotError || !lot) fail('Lote de importação não encontrado')
    if (lot.status !== 'em_validacao' || (lot.importado_por !== authData.user.id && !['master', 'gerente'].includes(profile.role))) fail('Lote de importação não está disponível para processamento')
    if (lot.storage_path !== body.storage_path || lot.arquivo_hash !== body.file_hash || lot.arquivo_mime_type !== expectedMime) fail('Os metadados do lote não correspondem ao arquivo')
    if (lot.arquivo_tamanho <= 0 || lot.arquivo_tamanho > MAX_FILE_SIZE) fail('O tamanho do arquivo é inválido')

    failurePhase = 'consulta_storage'
    const { data: storageObject, error: objectError } = await supabaseAdmin.schema('storage').from('objects').select('name, bucket_id, owner_id, metadata').eq('bucket_id', 'bank-statements').eq('name', body.storage_path).maybeSingle()
    if (objectError) log('Falha técnica na consulta do Storage', { fase: failurePhase, erro: safeDiagnostic(objectError) })
    if (objectError || !storageObject || storageObject.owner_id !== lot.importado_por) fail('Arquivo privado não encontrado')
    const objectMime = typeof storageObject.metadata?.mimetype === 'string' ? storageObject.metadata.mimetype.toLowerCase() : ''
    if (objectMime !== expectedMime) fail('MIME armazenado incompatível com a extensão do arquivo')
    failurePhase = 'download_storage'
    const { data: file, error: fileError } = await supabaseAdmin.storage.from('bank-statements').download(body.storage_path)
    if (fileError) log('Falha técnica no download do Storage', { fase: failurePhase, erro: safeDiagnostic(fileError) })
    if (fileError || !file) fail('Arquivo privado não encontrado')
    failurePhase = 'integridade_do_arquivo'
    const fileBytes = await file.arrayBuffer()
    if (fileBytes.byteLength <= 0 || fileBytes.byteLength > MAX_FILE_SIZE) fail('O arquivo excede o limite de 20 MB')
    if (fileBytes.byteLength !== Number(lot.arquivo_tamanho)) fail('O tamanho do arquivo não confere com o lote')
    if (await sha256(fileBytes) !== body.file_hash) fail('O hash SHA-256 do arquivo não confere')

    log('Extração autorizada', { user_id: authData.user.id, file_type: fileType })
    if (fileType === 'csv') {
      log('Verificação do arquivo concluída', { user_id: authData.user.id, file_type: fileType })
      return new Response(JSON.stringify({ verified: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (fileType === 'xlsx') {
      failurePhase = 'validacao_xlsx'
      const result = parseXlsx(fileBytes)
      log('Extração concluída', { user_id: authData.user.id, file_type: fileType, rows: result.rows.length })
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    failurePhase = 'validacao_pdf'
    const pages = await validatePdfBytes(fileBytes)
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) fail('Provedor de extração não configurado')
    failurePhase = 'upload_openai'
    const uploadResponse = await openAiRequest(openAiKey, 'https://api.openai.com/v1/files', () => {
      const form = new FormData()
      form.append('purpose', 'user_data')
      form.append('file', new File([new Uint8Array(fileBytes)], lot.arquivo_nome, { type: PDF_MIME_TYPE }))
      return { method: 'POST', body: form }
    })
    const uploadPayload = await readOpenAiJson(uploadResponse, 'upload')
    if (!isRecord(uploadPayload) || typeof uploadPayload.id !== 'string' || !uploadPayload.id) fail('O provedor não retornou o identificador do arquivo')
    const uploadRecord = uploadPayload as Record<string, unknown>
    openAiFileId = uploadRecord.id as string

    failurePhase = 'respostas_openai'
    const prompt = `Analise exclusivamente o PDF bancário anexado e produza a prévia estruturada solicitada. O arquivo possui ${pages} página(s). Preserve o contrato: valores de crédito e débito devem ser positivos e mutuamente exclusivos; use data ISO YYYY-MM-DD; registre página e linha de origem; use origem texto para conteúdo selecionável e ocr somente quando a página for imagem; só inclua em transactions registros com confiança de pelo menos 0.85; mova qualquer registro ambíguo para pendingReviews em vez de inventar dados. Ignore cabeçalhos, rodapés, saldos e totais que não sejam transações. Identifique totais, saldos, período e banco somente quando estiverem claramente presentes no PDF. Não inclua explicações fora do JSON.`
    const responseResponse = await openAiRequest(openAiKey, 'https://api.openai.com/v1/responses', () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: [{ role: 'user', content: [{ type: 'input_file', file_id: openAiFileId }, { type: 'input_text', text: prompt }] }],
        text: { format: { type: 'json_schema', name: 'bank_statement_preview', strict: true, schema: OPENAI_RESPONSE_SCHEMA } },
      }),
    }))
    const responsePayload = await readOpenAiJson(responseResponse, 'responses')
    failurePhase = 'contrato_responses'
    const responseText = extractResponseText(responsePayload)
    let parsedPayload: unknown
    try {
      parsedPayload = JSON.parse(responseText)
    } catch {
      fail('A saída do provedor não contém JSON válido')
    }
    const preview = validateOpenAiPreview(parsedPayload, pages)
    const result = toExtractedResult(preview)
    const dates = result.transactions.map(transaction => transaction.date).sort()
    const periodStart = optionalString(preview.periodStart) || dates[0]
    const periodEnd = optionalString(preview.periodEnd) || dates[dates.length - 1]
    const bankIdentified = optionalString(preview.bankIdentified)
    log('Extração concluída', { user_id: authData.user.id, pages, transactions: result.transactions.length, pending_reviews: result.pendingReviews.length, origin: result.sourceOrigin })
    return new Response(JSON.stringify({
      ...result,
      pages,
      periodStart,
      periodEnd,
      bankIdentified,
      parserMetadata: {
        pages,
        periodStart,
        periodEnd,
        balances: { opening: result.openingBalance, closing: result.closingBalance },
        totals: { entries: result.totalEntries, exits: result.totalExits },
        reportedTransactionCount: result.reportedTransactionCount,
        bankIdentified,
        sourceOrigin: result.sourceOrigin,
        sourceFileOrigin: result.sourceOrigin === 'ocr' ? 'pdf_ocr' : 'pdf_texto',
        alerts: result.sourceOrigin === 'ocr' ? [{ code: 'ocr_origin', message: 'Origem OCR: valide os dados normalizados antes da confirmação.', severity: 'warning' }] : [],
        pendingReviews: result.pendingReviews,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const diagnostic = safeDiagnostic(error)
    if (authenticatedClient && lotId && /^[0-9a-f-]{36}$/i.test(lotId)) {
      try {
        const { error: rpcError } = await authenticatedClient.rpc('marcar_importacao_erro', {
          p_lote_id: lotId,
          p_metadata_erro: { codigo_erro: 'processing_error', mensagem: 'Falha ao processar o extrato.', fase: failurePhase, tentativa: 1 },
        })
        if (rpcError) log('Falha ao registrar erro do lote', { fase: failurePhase, erro: safeDiagnostic(rpcError) })
      } catch (rpcError) {
        log('Falha ao registrar erro do lote', { fase: failurePhase, erro: safeDiagnostic(rpcError) })
      }
    }
    log('Falha no processamento', { fase: failurePhase, erro: diagnostic })
    return new Response(JSON.stringify({ error: 'Falha ao processar o extrato.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } finally {
    if (openAiFileId) {
      let cleanupSucceeded = false
      let cleanupDiagnostic: Record<string, unknown> = {}
      try {
        const cleanupKey = Deno.env.get('OPENAI_API_KEY')
        if (!cleanupKey) fail('Provedor de extração não configurado')
        const cleanupResponse = await openAiRequest(cleanupKey, `https://api.openai.com/v1/files/${encodeURIComponent(openAiFileId)}`, () => ({ method: 'DELETE' }), 5_000)
        cleanupSucceeded = cleanupResponse.ok || cleanupResponse.status === 404
        if (!cleanupSucceeded) {
          cleanupDiagnostic = { status: cleanupResponse.status }
          await cleanupResponse.body?.cancel()
        }
      } catch (error) {
        cleanupSucceeded = false
        cleanupDiagnostic = { erro: safeDiagnostic(error) }
      }
      if (cleanupSucceeded) {
        log('Arquivo temporário do provedor removido', { status: 'concluido' })
      } else {
        log('Falha ao remover arquivo temporário do provedor', { fase: 'cleanup_openai', ...cleanupDiagnostic })
        try {
          if (supabaseAdmin) {
            const { error: queueError } = await supabaseAdmin.from('openai_cleanup_queue').insert({ openai_file_id: openAiFileId })
            if (queueError) log('Falha ao registrar limpeza pendente', { fase: 'cleanup_queue', erro: safeDiagnostic(queueError) })
          }
        } catch (error) {
          log('Falha ao registrar limpeza pendente', { fase: 'cleanup_queue', erro: safeDiagnostic(error) })
        }
      }
    }
  }
})
