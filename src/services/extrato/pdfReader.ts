import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  DirecaoExtrato,
  ExtratoLido,
  LinhaExtrato,
  LinhaNaoInterpretada,
  MotivoNaoInterpretada,
  OrigemDirecao,
} from '../../types';

// ---------------------------------------------------------------------------
// Worker do pdf.js (precisa ser definido antes do primeiro getDocument)
// ---------------------------------------------------------------------------
let workerConfigurado = false;

function configurarWorker() {
  if (workerConfigurado) return;
  GlobalWorkerOptions.workerSrc = workerSrc;
  workerConfigurado = true;
}

// ---------------------------------------------------------------------------
// Extração bruta: transforma as páginas do PDF em linhas visuais de texto
// ---------------------------------------------------------------------------
interface ItemTextoPdf {
  str: string;
  transform: number[];
  width?: number;
}

interface LinhaBruta {
  pagina: number;
  linha: number;
  texto: string;
}

function agruparItensEmLinhas(itens: ItemTextoPdf[]): string[] {
  const grupos = new Map<number, ItemTextoPdf[]>();

  for (const item of itens) {
    // O eixo Y do PDF cresce para cima: arredondamos para tolerar pequenas
    // diferenças de baseline entre colunas da mesma linha visual.
    const chave = Math.round(item.transform[5] / 3) * 3;
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(item);
    else grupos.set(chave, [item]);
  }

  return Array.from(grupos.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, grupo]) => {
      const ordenado = [...grupo].sort((a, b) => a.transform[4] - b.transform[4]);
      let texto = '';
      let fimAnterior: number | null = null;

      for (const item of ordenado) {
        const inicio = item.transform[4];
        if (fimAnterior !== null && inicio - fimAnterior > 1.5) texto += ' ';
        texto += item.str;
        fimAnterior = inicio + (item.width ?? 0);
      }

      return texto.replace(/\s+/g, ' ').trim();
    })
    .filter((texto) => texto !== '');
}

async function extrairLinhasBrutas(
  arquivo: File,
): Promise<{ paginas: number; linhas: LinhaBruta[]; caracteres: number }> {
  configurarWorker();

  const buffer = await arquivo.arrayBuffer();
  const tarefa = getDocument({ data: new Uint8Array(buffer) });
  const linhas: LinhaBruta[] = [];
  let caracteres = 0;

  try {
    const documento = await tarefa.promise;
    const paginas = documento.numPages;

    for (let numeroPagina = 1; numeroPagina <= paginas; numeroPagina++) {
      const pagina = await documento.getPage(numeroPagina);
      const conteudo = await pagina.getTextContent();
      const itens = (conteudo.items as unknown as ItemTextoPdf[]).filter(
        (item) => typeof item?.str === 'string' && item.str.trim() !== '',
      );

      agruparItensEmLinhas(itens).forEach((texto, indice) => {
        caracteres += texto.length;
        linhas.push({ pagina: numeroPagina, linha: indice + 1, texto });
      });

      pagina.cleanup();
    }

    return { paginas, linhas, caracteres };
  } finally {
    await tarefa.destroy();
  }
}

// ---------------------------------------------------------------------------
// Valores monetários
// ---------------------------------------------------------------------------
const REGEX_VALOR_BR = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
const REGEX_VALOR_US = /\d+\.\d{2}/g;

interface TokenValor {
  valor: number; // absoluto
  sinal: 'positivo' | 'negativo' | null;
  marcador: 'D' | 'C' | null;
  inicio: number;
  fim: number;
}

function converterValor(bruto: string): number | null {
  const temPonto = bruto.includes('.');
  const temVirgula = bruto.includes(',');

  let normalizado = bruto;
  if (temPonto && temVirgula) {
    normalizado = bruto.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    normalizado = bruto.replace(',', '.');
  } else if (temPonto) {
    const partes = bruto.split('.');
    const ultima = partes[partes.length - 1];
    // "1.234" e "1.234.567" são separadores de milhar; "12.34" é decimal.
    if (partes.length > 2 || ultima.length === 3) normalizado = bruto.replace(/\./g, '');
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

function lerSinalEMarcador(
  texto: string,
  inicio: number,
  fim: number,
): { sinal: TokenValor['sinal']; marcador: TokenValor['marcador'] } {
  const antes = texto.slice(Math.max(0, inicio - 4), inicio);
  const depois = texto.slice(fim, Math.min(texto.length, fim + 4));

  let sinal: TokenValor['sinal'] = null;
  if (/[-\u2013\u2014]\s*(?:R\$\s*)?$/.test(antes) || /^\s*[-\u2013\u2014]/.test(depois)) {
    sinal = 'negativo';
  } else if (/\(\s*(?:R\$\s*)?$/.test(antes)) {
    sinal = 'negativo';
  } else if (/\+\s*(?:R\$\s*)?$/.test(antes)) {
    sinal = 'positivo';
  }

  let marcador: TokenValor['marcador'] = null;
  const encontrado = /^\s*([DC])(?![A-Za-z\u00C0-\u00FF])/.exec(depois);
  if (encontrado) marcador = encontrado[1] as 'D' | 'C';

  return { sinal, marcador };
}

function extrairValores(texto: string): TokenValor[] {
  const tokens: TokenValor[] = [];
  const intervalosBr: Array<{ inicio: number; fim: number }> = [];

  for (const encontrado of texto.matchAll(REGEX_VALOR_BR)) {
    const bruto = encontrado[0];
    const inicio = encontrado.index ?? 0;
    const fim = inicio + bruto.length;
    intervalosBr.push({ inicio, fim });

    const valor = converterValor(bruto);
    if (valor === null) continue;
    tokens.push({ valor: Math.abs(valor), ...lerSinalEMarcador(texto, inicio, fim), inicio, fim });
  }

  for (const encontrado of texto.matchAll(REGEX_VALOR_US)) {
    const inicio = encontrado.index ?? 0;
    if (intervalosBr.some((faixa) => inicio >= faixa.inicio && inicio < faixa.fim)) continue;

    const bruto = encontrado[0];
    const fim = inicio + bruto.length;
    const valor = converterValor(bruto);
    if (valor === null) continue;
    tokens.push({ valor: Math.abs(valor), ...lerSinalEMarcador(texto, inicio, fim), inicio, fim });
  }

  return tokens.sort((a, b) => a.inicio - b.inicio);
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
const REGEX_DATA_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const REGEX_DATA_COMPLETA = /\b(\d{2})[/\-.](\d{2})[/\-.](\d{2,4})\b/;
const REGEX_DATA_CURTA = /\b(\d{2})[/\-.](\d{2})\b/;

interface DataEncontrada {
  iso: string;
  inicio: number;
  fim: number;
}

function montarDataIso(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function anoCompleto(bruto: string): number {
  const ano = Number(bruto);
  return bruto.length === 2 ? 2000 + ano : ano;
}

function extrairData(texto: string, anoReferencia: number): DataEncontrada | null {
  const iso = REGEX_DATA_ISO.exec(texto);
  if (iso) {
    const resultado = montarDataIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (resultado) return { iso: resultado, inicio: iso.index, fim: iso.index + iso[0].length };
  }

  const completa = REGEX_DATA_COMPLETA.exec(texto);
  if (completa) {
    const resultado = montarDataIso(
      anoCompleto(completa[3]),
      Number(completa[2]),
      Number(completa[1]),
    );
    if (resultado) {
      return {
        iso: resultado,
        inicio: completa.index,
        fim: completa.index + completa[0].length,
      };
    }
  }

  const curta = REGEX_DATA_CURTA.exec(texto);
  if (curta) {
    const resultado = montarDataIso(anoReferencia, Number(curta[2]), Number(curta[1]));
    if (resultado) return { iso: resultado, inicio: curta.index, fim: curta.index + curta[0].length };
  }

  return null;
}

function anoPredominante(textos: string[]): number {
  const contagem = new Map<number, number>();

  for (const texto of textos) {
    for (const encontrado of texto.matchAll(new RegExp(REGEX_DATA_ISO.source, 'g'))) {
      const ano = Number(encontrado[1]);
      contagem.set(ano, (contagem.get(ano) ?? 0) + 1);
    }
    for (const encontrado of texto.matchAll(new RegExp(REGEX_DATA_COMPLETA.source, 'g'))) {
      if (encontrado[3].length !== 4) continue;
      const ano = Number(encontrado[3]);
      contagem.set(ano, (contagem.get(ano) ?? 0) + 1);
    }
  }

  let melhor: number | null = null;
  let melhorContagem = 0;
  for (const [ano, total] of contagem.entries()) {
    if (total > melhorContagem) {
      melhor = ano;
      melhorContagem = total;
    }
  }

  return melhor ?? new Date().getFullYear();
}

// ---------------------------------------------------------------------------
// Interpretação das linhas
// ---------------------------------------------------------------------------
const PALAVRAS_IGNORADAS = [
  'SALDO',
  'TOTAL',
  'SUBTOTAL',
  'RESUMO',
  'EXTRATO',
  'PERIODO',
  'AGENCIA',
  'CONTA',
  'CNPJ',
  'CPF',
  'PAGINA',
  'LIMITE',
  'APLICACAO',
  'APLICACOES',
  'INVESTIMENTO',
  'BLOQUEADO',
  'DISPONIVEL',
  'VENCIMENTO',
  'EMISSAO',
  'VALOR',
  'ENTRADAS',
  'SAIDAS',
  'CREDITOS',
  'DEBITOS',
  'DATA',
  'HISTORICO',
  'DESCRICAO',
];

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function direcaoDoToken(token: TokenValor): { direcao: DirecaoExtrato; origem: OrigemDirecao } | null {
  if (token.marcador === 'D') return { direcao: 'saida', origem: 'marcador' };
  if (token.marcador === 'C') return { direcao: 'entrada', origem: 'marcador' };
  if (token.sinal === 'negativo') return { direcao: 'saida', origem: 'sinal' };
  if (token.sinal === 'positivo') return { direcao: 'entrada', origem: 'sinal' };
  return null;
}

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Amplia a faixa de remoção para engolir também os sinais/marcadores colados
 * ao valor (ex.: "-75,50", "1.234,56 C", "R$ 10,00").
 */
function faixaRemocao(texto: string, token: TokenValor): { inicio: number; fim: number } {
  let inicio = token.inicio;
  while (inicio > 0 && /[\s\-+(R$]/.test(texto[inicio - 1])) inicio--;

  let fim = token.fim;
  while (fim < texto.length && /[\s\-\u2013\u2014)]/.test(texto[fim])) fim++;
  if (fim < texto.length && /[DC]/.test(texto[fim])) fim++;

  return { inicio, fim };
}

function montarDescricao(texto: string, remocoes: Array<{ inicio: number; fim: number }>): string {
  const caracteres = texto.split('');
  for (const faixa of remocoes) {
    for (let i = faixa.inicio; i < faixa.fim && i < caracteres.length; i++) caracteres[i] = ' ';
  }
  return caracteres
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-|;:.,]+|[\s\-|;:.,]+$/g, '')
    .trim();
}

interface Contexto {
  anoReferencia: number;
  dataCorrente: string | null;
  saldoAnterior: number | null;
}

type ResultadoLinha =
  | { tipo: 'ignorada' }
  | { tipo: 'transacao'; linha: LinhaExtrato }
  | { tipo: 'nao_interpretada'; motivo: MotivoNaoInterpretada };

function interpretarLinha(texto: string, pagina: number, linha: number, ctx: Contexto): ResultadoLinha {
  const tokens = extrairValores(texto);
  if (tokens.length === 0) return { tipo: 'ignorada' };

  const normalizado = normalizar(texto);

  // Linha de saldo: serve apenas como âncora para inferir a direção seguinte.
  if (/\bSALDO\b/.test(normalizado)) {
    ctx.saldoAnterior = tokens[tokens.length - 1].valor;
    return { tipo: 'ignorada' };
  }

  const textoLimpo = montarDescricao(texto, tokens);
  const dataEncontrada = extrairData(textoLimpo, ctx.anoReferencia);
  const inicioComPalavraIgnorada = PALAVRAS_IGNORADAS.some((palavra) => normalizado.startsWith(palavra));

  if (!dataEncontrada && inicioComPalavraIgnorada) return { tipo: 'ignorada' };

  const data = dataEncontrada?.iso ?? ctx.dataCorrente;
  if (!data) return { tipo: 'nao_interpretada', motivo: 'sem_data' };

  // Último valor da linha costuma ser o saldo acumulado.
  const temSaldo = tokens.length >= 2;
  const saldoLinha = temSaldo ? tokens[tokens.length - 1].valor : null;
  const candidatos = temSaldo ? tokens.slice(0, -1) : tokens;

  const delta =
    saldoLinha !== null && ctx.saldoAnterior !== null
      ? Math.round((saldoLinha - ctx.saldoAnterior) * 100) / 100
      : null;

  let tokenEscolhido = candidatos[0];
  if (delta !== null && centavos(delta) !== 0) {
    const porSaldo = candidatos.find((token) => centavos(token.valor) === centavos(Math.abs(delta)));
    if (porSaldo) tokenEscolhido = porSaldo;
  }

  let direcao = direcaoDoToken(tokenEscolhido);
  if (!direcao && delta !== null && centavos(delta) !== 0) {
    direcao = { direcao: delta < 0 ? 'saida' : 'entrada', origem: 'saldo' };
  }
  if (!direcao) return { tipo: 'nao_interpretada', motivo: 'direcao_indefinida' };

  if (centavos(tokenEscolhido.valor) === 0) return { tipo: 'ignorada' };

  ctx.dataCorrente = data;
  if (saldoLinha !== null) ctx.saldoAnterior = saldoLinha;

  // Remove da descrição a data, o valor e o saldo da linha (com os sinais colados).
  const remocoes = [
    ...(dataEncontrada ? [{ inicio: dataEncontrada.inicio, fim: dataEncontrada.fim }] : []),
    ...tokens.map((token) => faixaRemocao(texto, token)),
  ];

  return {
    tipo: 'transacao',
    linha: {
      id: `L${pagina}-${linha}`,
      data,
      descricao: montarDescricao(texto, remocoes) || 'Lançamento sem descrição',
      valor: tokenEscolhido.valor,
      direcao: direcao.direcao,
      origemDirecao: direcao.origem,
      pagina,
      linha,
      textoOriginal: texto,
    },
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export async function lerExtratoPdf(arquivo: File): Promise<ExtratoLido> {
  const { paginas, linhas, caracteres } = await extrairLinhasBrutas(arquivo);
  const ctx: Contexto = {
    anoReferencia: anoPredominante(linhas.map((linha) => linha.texto)),
    dataCorrente: null,
    saldoAnterior: null,
  };

  const transacoes: LinhaExtrato[] = [];
  const naoInterpretadas: LinhaNaoInterpretada[] = [];

  for (const linha of linhas) {
    const resultado = interpretarLinha(linha.texto, linha.pagina, linha.linha, ctx);
    if (resultado.tipo === 'transacao') transacoes.push(resultado.linha);
    else if (resultado.tipo === 'nao_interpretada') {
      naoInterpretadas.push({
        pagina: linha.pagina,
        linha: linha.linha,
        texto: linha.texto,
        motivo: resultado.motivo,
      });
    }
  }

  transacoes.sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    if (a.pagina !== b.pagina) return a.pagina - b.pagina;
    return a.linha - b.linha;
  });

  return {
    arquivoNome: arquivo.name,
    temTexto: caracteres > 40,
    paginas,
    dataInicio: transacoes.length > 0 ? transacoes[0].data : null,
    dataFim: transacoes.length > 0 ? transacoes[transacoes.length - 1].data : null,
    linhas: transacoes,
    naoInterpretadas,
  };
}
