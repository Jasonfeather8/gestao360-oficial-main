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
import { runBankStatementOcr } from '../_shared/ocrBankStatement.ts'

type SourceOrigin = 'texto' | 'ocr'
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
}

type ExtractedResult = {
  openingBalance?: number
  closingBalance?: number
  totalEntries?: number
  totalExits?: number
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
  const match = text.match(directionPattern)
  if (!match) return undefined
  return /DB|^D$|debito|débito|sa[ií]da|pagamento|debit|withdrawal/i.test(match[1]) ? 'debito' : 'credito'
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
    : text.split(/\f|\r?\n/).flatMap((pageText, pageIndex) => pageText.split(/\r?\n/).map((value, lineIndex) => ({ text: clean(value), tokens: [], page: pageIndex + 1, line: lineIndex + 1 })))
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
    totalEntries: findLabeledMoney(allText, /total\s+(?:de\s+)?entradas?/i),
    totalExits: findLabeledMoney(allText, /total\s+(?:de\s+)?sa[ií]das?/i),
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  try {
    const authorization = req.headers.get('Authorization') || ''
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)
    if (!tokenMatch) fail('Token de autenticação ausente ou inválido')
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(tokenMatch[1])
    if (authError || !authData.user) fail('Token de autenticação inválido')
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
    if (profileError || !profile || !['master', 'gerente'].includes(profile.role)) fail('Usuário não autorizado a processar extratos')

    const body = await req.json() as { lot_id?: string; storage_path?: string; file_type?: 'pdf' | 'xlsx' | 'csv'; file_hash?: string; mime_type?: string }
    if (!body.lot_id || !/^[0-9a-f-]{36}$/i.test(body.lot_id)) fail('Lote de importação inválido')
    if (!body.storage_path || body.storage_path.split('/')[0] !== authData.user.id) fail('Caminho do arquivo não pertence ao usuário autenticado')
    if (!body.file_hash || !/^[a-f0-9]{64}$/.test(body.file_hash)) fail('Hash SHA-256 do arquivo é obrigatório')
    const extension = body.storage_path.toLowerCase().split('.').pop()
    const fileType = body.file_type || (extension === 'xlsx' ? 'xlsx' : extension === 'pdf' ? 'pdf' : extension === 'csv' ? 'csv' : undefined)
    if (!fileType || (fileType === 'xlsx' && extension !== 'xlsx') || (fileType === 'pdf' && extension !== 'pdf') || (fileType === 'csv' && extension !== 'csv')) fail('Extensão do arquivo incompatível com o formato informado')
    const expectedMime = fileType === 'pdf' ? PDF_MIME_TYPE : fileType === 'xlsx' ? XLSX_MIME_TYPE : CSV_MIME_TYPE
    if (body.mime_type !== expectedMime) fail('MIME informado incompatível com a extensão do arquivo')
    const { data: lot, error: lotError } = await supabaseAdmin.from('extratos_bancarios').select('id, conta_bancaria_id, arquivo_nome, arquivo_tamanho, arquivo_mime_type, arquivo_hash, storage_path, importado_por, status').eq('id', body.lot_id).maybeSingle()
    if (lotError || !lot) fail('Lote de importação não encontrado')
    if (lot.status !== 'em_validacao' || lot.importado_por !== authData.user.id) fail('Lote de importação não está disponível para processamento')
    if (lot.storage_path !== body.storage_path || lot.arquivo_hash !== body.file_hash || lot.arquivo_mime_type !== expectedMime) fail('Os metadados do lote não correspondem ao arquivo')
    if (lot.arquivo_tamanho <= 0 || lot.arquivo_tamanho > MAX_FILE_SIZE) fail('O tamanho do arquivo é inválido')

    const { data: storageObject, error: objectError } = await supabaseAdmin.schema('storage').from('objects').select('name, bucket_id, owner_id, metadata').eq('bucket_id', 'bank-statements').eq('name', body.storage_path).maybeSingle()
    if (objectError || !storageObject || storageObject.owner_id !== authData.user.id) fail('Arquivo privado não encontrado')
    const objectMime = typeof storageObject.metadata?.mimetype === 'string' ? storageObject.metadata.mimetype.toLowerCase() : ''
    if (objectMime !== expectedMime) fail('MIME armazenado incompatível com a extensão do arquivo')
    const { data: file, error: fileError } = await supabaseAdmin.storage.from('bank-statements').download(body.storage_path)
    if (fileError || !file) fail('Arquivo privado não encontrado')
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
      const result = parseXlsx(fileBytes)
      log('Extração concluída', { user_id: authData.user.id, file_type: fileType, rows: result.rows.length })
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let sourceOrigin: SourceOrigin = 'texto'
    let pdfData: { text: string; pages: number; layouts: LayoutPage[] }
    try {
      pdfData = await buildLayoutPages(fileBytes)
    } catch (error) {
      log('Falha no leitor textual/layout; encaminhando para OCR', { error: error instanceof Error ? error.message : String(error) })
      pdfData = { text: '', pages: 1, layouts: [] }
    }
    if (!pdfData.text.trim()) {
      const ocr = await runBankStatementOcr(fileBytes, PDF_MIME_TYPE)
      sourceOrigin = 'ocr'
      pdfData = { text: ocr.text, pages: ocr.pages || 1, layouts: [] }
    }
    const result = extractText(pdfData.text, sourceOrigin, pdfData.pages, sourceOrigin === 'texto' ? pdfData.layouts : [])
    const dates = result.transactions.map(transaction => transaction.date).sort()
    const period = normalizedPeriod(pdfData.text)
    log('Extração concluída', { user_id: authData.user.id, pages: pdfData.pages, transactions: result.transactions.length, pending_reviews: result.pendingReviews.length, origin: sourceOrigin })
    return new Response(JSON.stringify({
      ...result,
      pages: pdfData.pages,
      periodStart: period?.[0] || dates[0],
      periodEnd: period?.[1] || dates[dates.length - 1],
      bankIdentified: classifyBankName(pdfData.text),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar o extrato'
    console.error('[parse-bank-statement]', message)
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
