declare const Deno: {
  env: { get(name: string): string | undefined }
}

// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
// @ts-expect-error Deno resolves this npm module in the Edge Function runtime.
import pdfParse from 'npm:pdf-parse@1.1.1'

type ParsedTransaction = {
  date: string
  description: string
  credit?: number
  debit?: number
  document?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const log = (...args: unknown[]) => console.log('[parse-bank-statement]', ...args)
const fail = (message: string): never => { throw new Error(message) }

const parseBrl = (raw: string): number => {
  const normalized = raw.replace(/\s/g, '').replace(/R\$/i, '').replace(/[+-]/g, '')
  const value = Number(normalized.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(value) ? value : Number.NaN
}

const parseSignedBrl = (raw: string): number => {
  const value = parseBrl(raw)
  return raw.includes('-') ? -value : value
}

const toIsoDate = (value: string): string => {
  const [day, month, year] = value.split('/')
  return `${year}-${month}-${day}`
}

const amountPattern = /([+-])\s*R\$\s*([\d.]+,\d{2})|R\$\s*([+-])\s*([\d.]+,\d{2})/i
const documentPattern = /\b(?:\d{2,3}[.\d/-]{6,}|\d{8,})\b/

const labeledAmount = (text: string, label: RegExp): number | undefined => {
  const match = text.match(new RegExp(`${label.source}[^\\d]{0,100}([+-]?\\s*R\\$?\\s*[\\d.]+,\\d{2})`, 'i'))
  if (!match) return undefined
  const value = parseSignedBrl(match[1])
  return Number.isFinite(value) ? value : undefined
}

const extractText = (text: string) => {
  const transactions: ParsedTransaction[] = []
  let pendingDate: string | null = null
  let pendingDescription = ''
  let openingBalance: number | undefined
  let closingBalance: number | undefined
  let totalEntries: number | undefined
  let totalExits: number | undefined

  const normalizedText = text.replace(/\s+/g, ' ').trim()
  openingBalance = labeledAmount(normalizedText, /saldo\s+(?:inicial|anterior)/)
  closingBalance = labeledAmount(normalizedText, /saldo\s+(?:final|atual)/)
  totalEntries = labeledAmount(normalizedText, /total\s+(?:de\s+)?entradas?/)
  totalExits = labeledAmount(normalizedText, /total\s+(?:de\s+)?sa[ií]das?/)

  const appendTransaction = (line: string, date: string, amountMatch: RegExpMatchArray) => {
    const sign = amountMatch[1] || amountMatch[3]
    const amount = parseBrl(amountMatch[2] || amountMatch[4])
    if (!sign || !Number.isFinite(amount) || amount === 0) return

    const amountStart = amountMatch.index ?? 0
    const beforeAmount = line.slice(0, amountStart).replace(/^[-|]+\s*/, '').trim()
    const afterAmount = line.slice(amountStart + amountMatch[0].length).replace(/^[-|]+\s*/, '').trim()
    const combined = [pendingDescription, beforeAmount, afterAmount].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const document = combined.match(documentPattern)?.[0]
    const description = combined.replace(document || '', '').replace(/\s+/g, ' ').trim()
    if (!description) return

    if (sign === '+') transactions.push({ date, description, credit: amount, document })
    else transactions.push({ date, description, debit: amount, document })
  }

  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    const dailyBalance = line.match(/saldo\s+do\s+dia.*?([+-]?\s*R\$\s*[\d.]+,\d{2})/i)
    if (dailyBalance) {
      const value = parseSignedBrl(dailyBalance[1])
      if (Number.isFinite(value) && closingBalance === undefined) closingBalance = value
      continue
    }
    if (/^(?:total|extrato|per[ií]odo|data\b|descri[cç][aã]o\b)/i.test(line)) continue

    const dateMatch = line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)
    let transactionLine = line
    if (dateMatch) {
      pendingDate = toIsoDate(dateMatch[1])
      transactionLine = line.replace(dateMatch[0], '').trim()
      pendingDescription = ''
    }

    const amountMatch = transactionLine.match(amountPattern)
    if (pendingDate && amountMatch) {
      appendTransaction(transactionLine, pendingDate, amountMatch)
      pendingDate = null
      pendingDescription = ''
      continue
    }

    if (!pendingDate) continue
    if (amountMatch) {
      appendTransaction(transactionLine, pendingDate, amountMatch)
      pendingDate = null
      pendingDescription = ''
      continue
    }
    pendingDescription = `${pendingDescription} ${transactionLine}`.trim()
  }

  return { openingBalance, closingBalance, totalEntries, totalExits, transactions }
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

    const body = await req.json() as { storage_path?: string }
    if (!body.storage_path || body.storage_path.split('/')[0] !== authData.user.id) fail('Caminho do arquivo não pertence ao usuário autenticado')

    log('Iniciando extração', { user_id: authData.user.id })
    const { data: file, error: fileError } = await supabaseAdmin.storage.from('bank-statements').download(body.storage_path)
    if (fileError || !file) fail('Arquivo privado não encontrado')
    const parsed = await pdfParse(new Uint8Array(await file.arrayBuffer()))
    const result = extractText(parsed.text || '')
    result.transactions.forEach(transaction => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date) || !transaction.description.trim()) fail('O PDF contém uma transação inválida')
    })
    log('Extração concluída', { user_id: authData.user.id, pages: Number(parsed.numpages) || 1, transactions: result.transactions.length })

    const transactionDates = result.transactions.map(transaction => transaction.date).sort()
    const periodMatch = normalizedPeriod(parsed.text || '')
    return new Response(JSON.stringify({
      ...result,
      pages: Number(parsed.numpages) || 1,
      periodStart: periodMatch?.[0] || transactionDates[0],
      periodEnd: periodMatch?.[1] || transactionDates[transactionDates.length - 1],
      bankIdentified: /cora/i.test(parsed.text || '') ? 'Cora' : undefined,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar o extrato'
    console.error('[parse-bank-statement]', message)
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function normalizedPeriod(text: string): [string, string] | undefined {
  const match = text.replace(/\s+/g, ' ').match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-|–)\s*(\d{2}\/\d{2}\/\d{4})/i)
  return match ? [toIsoDate(match[1]), toIsoDate(match[2])] : undefined
}
