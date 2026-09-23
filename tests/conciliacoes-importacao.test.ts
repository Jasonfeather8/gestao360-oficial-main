import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildCsvTransactions, getImportFileType, parseCsv } from '../src/services/conciliacoesService';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(here, 'fixtures/fase-1', name), 'utf8');

const sum = (values: number[]) => Number(values.reduce((total, value) => total + value, 0).toFixed(2));

test('parseCsv preserva aspas, delimitador, datas BR e valores BRL', async () => {
  const parsed = parseCsv('"Data";"Descrição";"Valor"\r\n"21/09/2026";"PIX; cliente";"R$ 1.234,56"');
  assert.deepEqual(parsed.headers, ['Data', 'Descrição', 'Valor']);
  assert.deepEqual(parsed.rows[0], { Data: '21/09/2026', Descrição: 'PIX; cliente', Valor: 'R$ 1.234,56' });

  const transactions = await buildCsvTransactions('conta-teste', parsed.rows, {
    data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: '',
  }, 'ambos');
  assert.equal(transactions[0].data_transacao, '2026-09-21');
  assert.equal(transactions[0].valor, 1234.56);
  assert.equal(transactions[0].tipo_movimento, 'credito');
  assert.match(transactions[0].hash_transacao, /^[a-f0-9]{64}$/);
});

test('fixtures reais de entradas e saídas mantêm contagem, totais e direção', async () => {
  const entradas = parseCsv(fixture('entradas-2026-09-21.csv'));
  const saidas = parseCsv(fixture('saidas-2026-09-21.csv'));
  const mapping = { data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: '' };

  const entradaTransactions = await buildCsvTransactions('conta-teste', entradas.rows, mapping, 'entrada');
  const saidaTransactions = await buildCsvTransactions('conta-teste', saidas.rows, mapping, 'saida');

  assert.equal(entradaTransactions.length, 9);
  assert.equal(saidaTransactions.length, 15);
  assert.equal(sum(entradaTransactions.map(transaction => transaction.valor)), 22757.25);
  assert.equal(sum(saidaTransactions.map(transaction => Math.abs(transaction.valor))), 6412.74);
  assert.ok(entradaTransactions.every(transaction => transaction.tipo_movimento === 'credito' && transaction.valor > 0));
  assert.ok(saidaTransactions.every(transaction => transaction.tipo_movimento === 'debito' && transaction.valor < 0));
});

test('modo de importação aplica direção explicitamente às linhas CSV', async () => {
  const parsed = parseCsv(fixture('saidas-2026-09-21.csv'));
  const mapping = { data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: '' };
  const entradas = await buildCsvTransactions('conta-teste', parsed.rows, mapping, 'entrada');
  const saidas = await buildCsvTransactions('conta-teste', parsed.rows, mapping, 'saida');
  assert.ok(entradas.every(transaction => transaction.valor > 0 && transaction.tipo_movimento === 'credito'));
  assert.ok(saidas.every(transaction => transaction.valor < 0 && transaction.tipo_movimento === 'debito'));
});

test('contrato de extensão e MIME para XLSX, sem aceitar formatos de planilha não suportados', () => {
  assert.equal(getImportFileType('extrato.XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
  assert.equal(getImportFileType('extrato.xlsx', ''), 'xlsx');
  assert.throws(() => getImportFileType('extrato.xlsx', 'application/pdf'), /MIME inválido/);
  assert.throws(() => getImportFileType('extrato.xlsx', 'application/octet-stream'), /MIME inválido/);
  assert.throws(() => getImportFileType('extrato.xls', 'application/vnd.ms-excel'), /Formato não suportado/);
});

test('contratos verificáveis dos fixtures PDF e XLSX permanecem na Edge Function', () => {
  const pdf = readFileSync(resolve(here, 'fixtures/fase-1/cora-mesquita-administracoes-14092026-a-22092026.pdf'));
  const parserSource = readFileSync(resolve(here, '../supabase/functions/parse-bank-statement/index.ts'), 'utf8');
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.match(parserSource, /PDF escaneado\/OCR não é suportado nesta versão/);
  assert.match(parserSource, /npm:xlsx@0\.18\.5/);
  assert.match(parserSource, /sheet_to_json/);
  assert.match(parserSource, /file_type === 'xlsx'/);
  assert.match(parserSource, /rows/);
});
