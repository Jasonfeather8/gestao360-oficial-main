declare const Deno: { env: { get(name: string): string | undefined } }

type OcrResult = { text: string; pages?: number }

const log = (...args: unknown[]) => console.log('[ocr-bank-statement]', ...args)

export const runBankStatementOcr = async (bytes: ArrayBuffer, mimeType: string): Promise<OcrResult> => {
  const endpoint = Deno.env.get('OCR_BANK_STATEMENT_URL')
  const apiKey = Deno.env.get('OCR_BANK_STATEMENT_API_KEY')
  if (!endpoint || !apiKey) {
    throw new Error('OCR não configurado no backend: defina OCR_BANK_STATEMENT_URL e OCR_BANK_STATEMENT_API_KEY.')
  }

  log('Iniciando etapa OCR backend-only', { mime_type: mimeType, bytes: bytes.byteLength })
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': mimeType,
      Accept: 'application/json',
    },
    body: bytes,
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`Falha na infraestrutura OCR (${response.status}): ${detail || 'resposta sem detalhes'}`)
  }
  const payload = await response.json() as { text?: unknown; pages?: unknown }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('A infraestrutura OCR não retornou texto utilizável.')
  }
  const pages = typeof payload.pages === 'number' && Number.isInteger(payload.pages) && payload.pages > 0 ? payload.pages : undefined
  log('Etapa OCR concluída', { pages: pages ?? 1, characters: payload.text.length })
  return { text: payload.text, pages }
}
