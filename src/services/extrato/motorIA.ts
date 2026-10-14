import type {
  ConferenciaExtrato,
  ConfiancaLinha,
  ExtratoLido,
  LinhaExtrato,
  LinhaIgnorada,
  LinhaNaoInterpretada,
  MetaExtrato,
  MotivoLinhaIgnorada,
  MotivoNaoInterpretada,
  ProgressoLeituraExtrato,
} from '../../types';
import { supabase } from '@/integrations/supabase/client';
import { contarPaginas } from './pdfDocumento';

const LIMITE_ARQUIVO = 20 * 1024 * 1024;
const PAGINAS_POR_LOTE = 10;
const PREFIXO = '[motorIA]';

interface RespostaLinha {
  data?: unknown;
  descricao?: unknown;
  valor?: unknown;
  direcao?: unknown;
  documento?: unknown;
  saldoApos?: unknown;
  pagina?: unknown;
  textoOriginal?: unknown;
  confianca?: unknown;
}

interface RespostaExtrato {
  paginas?: { inicio?: unknown; fim?: unknown; total?: unknown };
  meta?: Partial<MetaExtrato> | null;
  linhas?: unknown;
  linhasIgnoradas?: unknown;
  linhasDuvidosas?: unknown;
  uso?: { tokensEntrada?: unknown; tokensSaida?: unknown };
}

interface ContextoLote {
  banco: string | null;
  conta: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
}

function valorTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor : null;
}

function valorNumero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function mapearMeta(meta: RespostaExtrato['meta']): MetaExtrato {
  return {
    banco: valorTexto(meta?.banco),
    agencia: valorTexto(meta?.agencia),
    conta: valorTexto(meta?.conta),
    periodoInicio: valorTexto(meta?.periodoInicio),
    periodoFim: valorTexto(meta?.periodoFim),
    saldoInicial: valorNumero(meta?.saldoInicial),
    saldoFinal: valorNumero(meta?.saldoFinal),
  };
}

function dataValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function paginaValida(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : null;
}

function mapearLinhas(linhas: unknown, indiceLote: number): LinhaExtrato[] {
  if (!Array.isArray(linhas)) throw new Error(`A resposta do lote ${indiceLote} não contém uma lista válida de linhas.`);

  const resultado: LinhaExtrato[] = [];
  linhas.forEach((item: RespostaLinha, indice) => {
    if (
      !dataValida(item?.data) ||
      typeof item?.valor !== 'number' ||
      !Number.isFinite(item.valor) ||
      item.valor < 0 ||
      (item.direcao !== 'entrada' && item.direcao !== 'saida')
    ) return;

    const pagina = paginaValida(item.pagina);
    const confianca: ConfiancaLinha | undefined =
      item.confianca === 'alta' || item.confianca === 'media' || item.confianca === 'baixa'
        ? item.confianca
        : undefined;

    resultado.push({
      id: `ia-${pagina ?? `lote${indiceLote}`}-${indice}`,
      data: item.data,
      descricao: valorTexto(item.descricao) ?? valorTexto(item.textoOriginal) ?? 'Lançamento sem descrição',
      valor: item.valor,
      direcao: item.direcao,
      pagina,
      textoOriginal: valorTexto(item.textoOriginal) ?? '',
      ...(confianca ? { confianca } : {}),
      ...(valorTexto(item.documento) ? { documento: valorTexto(item.documento)! } : {}),
    });
  });
  return resultado;
}

function motivoNaoInterpretada(valor: unknown): MotivoNaoInterpretada {
  const validos: MotivoNaoInterpretada[] = [
    'sem_data', 'direcao_indefinida', 'sem_valor', 'valor_ilegivel', 'data_impossivel',
  ];
  return validos.includes(valor as MotivoNaoInterpretada)
    ? (valor as MotivoNaoInterpretada)
    : 'sem_data';
}

function mapearDuvidosas(duvidosas: unknown): LinhaNaoInterpretada[] {
  if (!Array.isArray(duvidosas)) return [];
  return duvidosas.map((item) => ({
    pagina: paginaValida(item?.pagina),
    texto: valorTexto(item?.textoOriginal) ?? '',
    motivo: motivoNaoInterpretada(item?.motivo),
  }));
}

function motivoIgnorada(valor: unknown): MotivoLinhaIgnorada {
  const validos: MotivoLinhaIgnorada[] = ['saldo', 'totalizador', 'cabecalho', 'rodape', 'outro'];
  return validos.includes(valor as MotivoLinhaIgnorada)
    ? (valor as MotivoLinhaIgnorada)
    : 'outro';
}

function mapearIgnoradas(ignoradas: unknown): LinhaIgnorada[] {
  if (!Array.isArray(ignoradas)) return [];
  return ignoradas.map((item) => ({
    pagina: paginaValida(item?.pagina),
    texto: valorTexto(item?.textoOriginal) ?? '',
    motivo: motivoIgnorada(item?.motivo),
  }));
}

function conferir(linhas: LinhaExtrato[], meta: MetaExtrato): ConferenciaExtrato {
  const entradas = linhas
    .filter((linha) => linha.direcao === 'entrada')
    .reduce((total, linha) => total + linha.valor, 0);
  const saidas = linhas
    .filter((linha) => linha.direcao === 'saida')
    .reduce((total, linha) => total + linha.valor, 0);

  if (meta.saldoInicial === null || meta.saldoFinal === null) {
    return { status: 'nao_verificavel', entradas, saidas, saldoInicial: meta.saldoInicial, saldoFinal: meta.saldoFinal, diferenca: null };
  }

  const diferenca = meta.saldoFinal - (meta.saldoInicial + entradas - saidas);
  return {
    status: Math.abs(diferenca) <= 0.05 ? 'ok' : 'divergente',
    entradas,
    saidas,
    saldoInicial: meta.saldoInicial,
    saldoFinal: meta.saldoFinal,
    diferenca,
  };
}

async function limparTemporariosAntigos(uid: string): Promise<void> {
  const pasta = `extratos/${uid}`;
  try {
    const { data, error } = await supabase.storage.from('extratos').list(pasta, { limit: 100 });
    if (error) throw error;

    const limite = Date.now() - 60 * 60 * 1000;
    const antigos = (data ?? [])
      .filter((item) => item.name && item.created_at && Date.parse(item.created_at) < limite)
      .map((item) => `${pasta}/${item.name}`);
    if (antigos.length) {
      const { error: erroRemocao } = await supabase.storage.from('extratos').remove(antigos);
      if (erroRemocao) throw erroRemocao;
    }
  } catch (error) {
    console.warn(`${PREFIXO} Falha na limpeza preventiva dos arquivos temporários.`, error);
  }
}

async function mensagemErroFuncao(error: { context?: unknown }, inicio: number, fim: number): Promise<string> {
  const contexto = error.context;
  if (contexto instanceof Response) {
    try {
      const corpo = await contexto.json();
      if (typeof corpo?.error === 'string' && corpo.error.trim()) return corpo.error;
    } catch {
      // O corpo não era JSON legível; será usada a mensagem genérica do lote.
    }
  }
  return `Não foi possível ler as páginas ${inicio} a ${fim} do extrato.`;
}

export async function lerExtratoIA(
  arquivo: File,
  onProgress?: (progresso: ProgressoLeituraExtrato) => void,
): Promise<ExtratoLido> {
  onProgress?.({ etapa: 'preparando', loteAtual: 0, totalLotes: 0, paginaInicio: null, paginaFim: null, totalPaginas: null });

  if (arquivo.size > LIMITE_ARQUIVO) throw new Error('O arquivo excede o limite de 20 MB.');

  const { data: { user }, error: erroUsuario } = await supabase.auth.getUser();
  if (erroUsuario || !user) throw new Error('Sessão expirada. Entre novamente.');

  const totalPaginas = await contarPaginas(arquivo);
  if (totalPaginas === 0) throw new Error('Não foi possível ler o PDF (arquivo vazio ou corrompido).');

  await limparTemporariosAntigos(user.id);

  const nomeSanitizado = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 60) || 'extrato.pdf';
  const caminho = `extratos/${user.id}/${Date.now()}-${nomeSanitizado}.pdf`;
  const totalLotes = Math.ceil(totalPaginas / PAGINAS_POR_LOTE);
  const linhas: LinhaExtrato[] = [];
  const naoInterpretadas: LinhaNaoInterpretada[] = [];
  const linhasIgnoradas: LinhaIgnorada[] = [];
  let meta: MetaExtrato = mapearMeta(null);
  let contexto: ContextoLote | undefined;
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let uploaded = false;

  try {
    onProgress?.({ etapa: 'enviando', loteAtual: 0, totalLotes, paginaInicio: null, paginaFim: null, totalPaginas });
    const { error: erroUpload } = await supabase.storage.from('extratos').upload(caminho, arquivo, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (erroUpload) throw new Error(`Não foi possível enviar o PDF temporário: ${erroUpload.message}`);
    uploaded = true;

    for (let lote = 0; lote < totalLotes; lote++) {
      const paginaInicio = lote * PAGINAS_POR_LOTE + 1;
      const paginaFim = Math.min((lote + 1) * PAGINAS_POR_LOTE, totalPaginas);
      const loteAtual = lote + 1;
      onProgress?.({ etapa: 'lendo', loteAtual, totalLotes, paginaInicio, paginaFim, totalPaginas });

      const { data, error } = await supabase.functions.invoke<RespostaExtrato>('ler-extrato', {
        body: {
          caminho,
          paginaInicio,
          paginaFim,
          totalPaginas,
          ...(contexto ? { contexto } : {}),
        },
      });

      if (error) throw new Error(await mensagemErroFuncao(error, paginaInicio, paginaFim));
      if (!data || !Array.isArray(data.linhas)) {
        throw new Error(`A resposta do lote das páginas ${paginaInicio} a ${paginaFim} é inválida.`);
      }

      if (lote === 0) {
        meta = mapearMeta(data.meta);
        contexto = {
          banco: meta.banco,
          conta: meta.conta,
          periodoInicio: meta.periodoInicio,
          periodoFim: meta.periodoFim,
        };
      }

      linhas.push(...mapearLinhas(data.linhas, loteAtual));
      naoInterpretadas.push(...mapearDuvidosas(data.linhasDuvidosas));
      linhasIgnoradas.push(...mapearIgnoradas(data.linhasIgnoradas));
      tokensEntrada += valorNumero(data.uso?.tokensEntrada) ?? 0;
      tokensSaida += valorNumero(data.uso?.tokensSaida) ?? 0;
    }

    const datas = linhas.map((linha) => linha.data).sort();
    const resultado: ExtratoLido = {
      arquivoNome: arquivo.name,
      temTexto: linhas.length > 0,
      paginas: totalPaginas,
      dataInicio: datas[0] ?? null,
      dataFim: datas[datas.length - 1] ?? null,
      linhas,
      naoInterpretadas,
      linhasIgnoradas,
      meta,
      conferencia: conferir(linhas, meta),
    };

    console.info(`${PREFIXO} Leitura concluída: ${totalPaginas} páginas, ${linhas.length} linhas, ${tokensEntrada} tokens de entrada e ${tokensSaida} tokens de saída.`);
    return resultado;
  } finally {
    if (uploaded) {
      try {
        const { error } = await supabase.storage.from('extratos').remove([caminho]);
        if (error) console.warn(`${PREFIXO} Falha ao excluir o arquivo temporário.`, error);
      } catch (error) {
        console.warn(`${PREFIXO} Falha ao excluir o arquivo temporário.`, error);
      }
    }
  }
}
