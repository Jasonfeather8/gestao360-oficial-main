import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildCsvTransactions, getImportFileType, parseCsv, validateImportConsistency } from '../src/services/conciliacoesService';
import type { ImportFileFormat, ImportTransaction } from '../src/types/extratoImportacao';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const transaction = (overrides: Partial<ImportTransaction> = {}): ImportTransaction => ({
  data_transacao: '2026-09-21',
  data_original: '21/09/2026',
  valor: 100,
  valor_original: 100,
  valor_centavos: 10000,
  descricao_banco: 'Crédito contratual',
  descricao_original: 'Crédito contratual',
  tipo_movimento: 'credito',
  hash_transacao: 'a'.repeat(64),
  pagina_origem: 1,
  linha_origem: 1,
  formato_arquivo: 'pdf',
  origem_extracao: 'texto',
  origem_arquivo: 'pdf_texto',
  estado_revisao: 'valida',
  ...overrides,
});

test('Fase 9 — OFX existe no contrato futuro, mas o upload atual continua rejeitando-o', () => {
  const futureFormat: ImportFileFormat = 'ofx';
  assert.equal(futureFormat, 'ofx');
  assert.throws(() => getImportFileType('extrato.ofx', 'application/x-ofx'), /Formato não suportado/);
  assert.throws(() => getImportFileType('extrato.ofx', 'application/octet-stream'), /Formato não suportado/);
  assert.equal(getImportFileType('extrato.csv', 'text/csv'), 'csv');
  assert.equal(getImportFileType('extrato.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
  assert.equal(getImportFileType('extrato.pdf', 'application/pdf'), 'pdf');
});

test('Fase 9 — fonte estruturada e campos normalizados são distintos de dados comerciais', async () => {
  const parsed = parseCsv('Data;Descrição;Valor;Ref.\n21/09/2026;"Linha 1\nLinha 2";R$ 100,00;DOC-1');
  const [result] = await buildCsvTransactions('conta-fase-9', parsed.rows, {
    data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: 'Ref.',
  }, 'entrada');

  assert.equal(result.formato_arquivo, 'csv');
  assert.equal(result.origem_extracao, 'estruturado');
  assert.equal(result.origem_arquivo, 'csv');
  assert.equal(result.valor, 100);
  assert.equal(result.valor_centavos, 10000);
  assert.equal(result.tipo_movimento, 'credito');
  assert.equal(result.descricao_banco, 'Linha 1\nLinha 2');
  assert.equal(result.numero_documento, 'DOC-1');
  assert.equal(result.data_original, '21/09/2026');
  assert.equal(result.descricao_original, 'Linha 1\nLinha 2');
  assert.equal('categoria_id' in result, false);
  assert.equal('entidade_id' in result, false);
  assert.equal('centro_custo_id' in result, false);
  assert.equal('observacoes' in result, false);
});

test('Fase 9 — valores negativos preservam sinal e direção normalizada', async () => {
  const parsed = parseCsv('Data,Descrição,Valor\n2026-09-21,DB bancário,"(R$ 42,10)"');
  const [result] = await buildCsvTransactions('conta-fase-9', parsed.rows, {
    data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: '',
  }, 'ambos');
  assert.equal(result.valor, -42.1);
  assert.equal(result.valor_centavos, -4210);
  assert.equal(result.tipo_movimento, 'debito');

  const parserSource = source('supabase/functions/parse-bank-statement/index.ts');
  assert.match(parserSource, /directionPattern =.*CR\|DB/);
  assert.match(parserSource, /directionFromText/);
});

test('Fase 9 — consistência cobre duplicidade, páginas, totais, saldos e período', () => {
  const transactions = [
    transaction(),
    transaction({
      valor: -25,
      valor_original: -25,
      valor_centavos: -2500,
      descricao_banco: 'Débito contratual',
      descricao_original: 'Débito contratual',
      tipo_movimento: 'debito',
      hash_transacao: 'b'.repeat(64),
      pagina_origem: 2,
      linha_origem: 3,
    }),
  ];
  const result = validateImportConsistency(transactions, {
    pages: 2,
    periodStart: '2026-09-21',
    periodEnd: '2026-09-21',
    openingBalance: 1000,
    closingBalance: 1075,
    parserTotals: { entries: 100, exits: 25 },
    reportedTransactionCount: 2,
    sourceOrigin: 'texto',
  });
  assert.deepEqual(result.criticalErrors, []);
  assert.equal(result.computedEntries, 100);
  assert.equal(result.computedExits, 25);
  assert.equal(result.balanceDifferenceCents, 0);
  assert.equal(result.continuityMatches, true);

  const duplicate = validateImportConsistency([transactions[0], transaction()], { sourceOrigin: 'texto' });
  assert.ok(duplicate.criticalErrors.some(issue => issue.code === 'duplicate_transaction'));
  const mismatch = validateImportConsistency(transactions, { parserTotals: { entries: 99 }, sourceOrigin: 'texto' });
  assert.ok(mismatch.criticalErrors.some(issue => issue.code === 'entries_total_mismatch'));
});

test('Fase 10 — falhas, cancelamento, reimportação e RPC server-side permanecem rastreáveis', () => {
  const serviceSource = source('src/services/conciliacoesService.ts');
  const parserSource = source('supabase/functions/parse-bank-statement/index.ts');
  assert.match(serviceSource, /cleanupImport\(lot\)/);
  assert.match(serviceSource, /cancelar_importacao_extrato/);
  assert.match(serviceSource, /storage\.from\('bank-statements'\)\.remove/);
  assert.match(serviceSource, /confirmar_importacao_extrato/);
  assert.match(serviceSource, /formato_arquivo/);
  assert.match(serviceSource, /origem_extracao/);
  assert.match(parserSource, /Este arquivo já foi importado|arquivo_hash/);
});

test('Fase 10 — imutabilidade, RLS/auditoria e ausência de campos comerciais são contratos explícitos', () => {
  const schemaEvidence = source('docs/fase-3-seguranca-auditoria.md');
  const matrix = source('docs/fase-9-10-contrato-e-matriz.md');
  const typesSource = source('src/types/index.ts');
  assert.match(schemaEvidence, /REVOKE UPDATE ON TABLE public\.transacoes_banco FROM authenticated/);
  assert.match(schemaEvidence, /protect_transacao_banco_immutable/);
  assert.match(schemaEvidence, /trg_fase3_audit_transacoes_banco/);
  assert.match(matrix, /Nenhum parser OFX foi criado/);
  assert.match(matrix, /PDF\/OCR real e reimportação em Supabase isolado não são mascarados como aprovados/);
  assert.match(typesSource, /origem_extracao\?: 'texto' \| 'ocr' \| 'estruturado'/);
  assert.match(typesSource, /formato_arquivo\?: 'pdf' \| 'csv' \| 'xlsx' \| 'ofx'/);
});

test('Fase 10 — cenários sem fixture real ou Supabase isolado não são executados silenciosamente', () => {
  const matrix = source('docs/fase-9-10-contrato-e-matriz.md');
  const requiredScenarios = [
    'PDF textual de vários bancos',
    'PDF com tabela tradicional',
    'PDF com crédito e débito em colunas diferentes',
    'PDF com valores negativos',
    'PDF com CR e DB',
    'PDF com descrições em múltiplas linhas',
    'PDF com várias páginas',
    'PDF escaneado',
    'PDF com OCR imperfeito',
    'PDF com saldo e totais',
    'PDF sem saldo',
    'PDF com cabeçalho e rodapé repetidos',
    'PDF com transação duplicada',
    'PDF parcialmente ilegível',
    'Usuário não autenticado',
    'Usuário tentando usar caminho de outro usuário',
    'Alteração direta da data',
    'Alteração direta do valor',
    'Alteração direta da descrição',
    'Exclusão de transação conciliada',
    'Reimportação',
    'Falha no processamento após upload',
    'Cancelamento da importação',
    'Divergência entre totais',
  ];
  requiredScenarios.forEach(scenario => assert.ok(matrix.includes(scenario), `Cenário ausente da matriz: ${scenario}`));
  assert.match(matrix, /PDF textual real/);
  assert.match(matrix, /PDF OCR real/);
  assert.match(matrix, /OFX futuro/);
  assert.match(matrix, /P até Supabase isolado/);
  assert.match(matrix, /P; não há fixture artificial/);
});
