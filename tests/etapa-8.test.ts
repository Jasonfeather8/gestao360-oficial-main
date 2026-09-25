import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { supabase } from '../src/integrations/supabase/client';
import { cofreService } from '../src/services/cofreService';
import { buildCsvTransactions, conciliacoesService, parseCsv } from '../src/services/conciliacoesService';
import { transferenciasService } from '../src/services/transferenciasService';
import { isFinancialReportItem } from '../src/utils/financialItems';
import type { ImportLotDraft, ImportTransaction } from '../src/types/extratoImportacao';
import type { TipoDiferenca } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => resolve(here, 'fixtures/fase-1', name);
const source = (path: string) => readFileSync(resolve(here, '..', path), 'utf8');
const mapping = { data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: 'Documento' };

const etapa8Transaction = (overrides: Partial<ImportTransaction> = {}): ImportTransaction => ({
  data_transacao: '2026-09-21',
  data_original: '21/09/2026',
  valor: 123.45,
  valor_original: 123.45,
  valor_centavos: 12345,
  descricao_banco: 'Transação de teste contratual',
  descricao_original: 'Transação de teste contratual',
  tipo_movimento: 'credito',
  hash_transacao: 'a'.repeat(64),
  ...overrides,
});

const etapa8Lot: ImportLotDraft = {
  id: '00000000-0000-0000-0000-000000000008',
  contaBancariaId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  fileName: 'extrato-contrato.csv',
  fileSize: 128,
  mimeType: 'text/csv',
  fileHash: 'b'.repeat(64),
  storagePath: '00000000-0000-0000-0000-000000000002/lote/extrato-contrato.csv',
};

type RpcCall = { name: string; args: Record<string, unknown> | undefined };

const withMockRpc = async <T>(
  response: unknown,
  callback: (calls: RpcCall[]) => Promise<T>,
): Promise<T> => {
  const calls: RpcCall[] = [];
  const originalRpc = supabase.rpc;
  (supabase as unknown as { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }> }).rpc = async (name, args) => {
    calls.push({ name, args });
    return { data: response, error: null };
  };
  try {
    return await callback(calls);
  } finally {
    (supabase as unknown as { rpc: typeof originalRpc }).rpc = originalRpc;
  }
};

test('Etapa 8 — fixtures reais disponíveis e contrato do PDF textual/OCR', () => {
  const entradasPath = fixturePath('entradas-2026-09-21.csv');
  const saidasPath = fixturePath('saidas-2026-09-21.csv');
  const pdfPath = fixturePath('cora-mesquita-administracoes-14092026-a-22092026.pdf');
  const entradas = parseCsv(readFileSync(entradasPath, 'utf8'));
  const saidas = parseCsv(readFileSync(saidasPath, 'utf8'));
  const pdf = readFileSync(pdfPath);
  const parserSource = source('supabase/functions/parse-bank-statement/index.ts');

  assert.equal(entradas.rows.length, 9);
  assert.equal(saidas.rows.length, 15);
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 0);
  assert.match(parserSource, /serve\(async \(req\)/);
  assert.match(parserSource, /pdfParse\(new Uint8Array\(bytes\)/);
  assert.match(parserSource, /runBankStatementOcr/);
  assert.match(parserSource, /Token de autenticação ausente ou inválido/);
  assert.match(parserSource, /body\.storage_path[\s\S]*Caminho do arquivo não pertence ao usuário autenticado/);
});

test('Etapa 8 — parser CSV cobre delimitadores, aspas, datas e valores BRL', async () => {
  const semicolon = parseCsv('Data;Descrição;Valor;Documento\r\n21/09/2026;"PIX; cliente";R$ 1.234,56;DOC-1');
  const comma = parseCsv('Data,Descrição,Valor\n2026-09-22,"TED, fornecedor","(R$ 42,10)"');

  assert.deepEqual(semicolon.headers, ['Data', 'Descrição', 'Valor', 'Documento']);
  assert.equal(semicolon.rows[0].Descrição, 'PIX; cliente');
  assert.equal(comma.rows[0].Descrição, 'TED, fornecedor');

  const credit = await buildCsvTransactions('conta-8', semicolon.rows, mapping, 'ambos');
  const debit = await buildCsvTransactions('conta-8', comma.rows, { ...mapping, documento: '' }, 'ambos');
  assert.equal(credit[0].data_transacao, '2026-09-21');
  assert.equal(credit[0].valor, 1234.56);
  assert.equal(debit[0].data_transacao, '2026-09-22');
  assert.equal(debit[0].valor, -42.1);
  assert.equal(debit[0].tipo_movimento, 'debito');
});

test('Etapa 8 — parser rejeita erros de entrada com mensagens contratuais', async () => {
  assert.throws(() => parseCsv('Data,Data,Valor\n21/09/2026,outra,1'), /colunas duplicadas/);
  assert.throws(() => parseCsv('Data,Valor\n"21/09/2026,1'), /aspas não fechadas/);
  assert.throws(() => parseCsv('Data,Valor\n21/09/2026,1,extra'), /mais campos/);
  await assert.rejects(
    buildCsvTransactions('conta-8', [{ Data: '31/02/2026', Valor: '10,00', Descrição: 'Data impossível', Documento: '' }], mapping, 'ambos'),
    /Data inválida/,
  );
  await assert.rejects(
    buildCsvTransactions('conta-8', [{ Data: '21/09/2026', Valor: 'R$ 0,00', Descrição: 'Zero', Documento: '' }], mapping, 'ambos'),
    /Valor inválido/,
  );
  await assert.rejects(
    buildCsvTransactions('conta-8', [{ Data: '21/09/2026', Valor: '10,00', Descrição: '', Documento: '' }], mapping, 'ambos'),
    /descrição.*vazia/,
  );
});

test('Etapa 8 — hash de transação é determinístico e duplicidade no mesmo arquivo é rejeitada', async () => {
  const row = { Data: '21/09/2026', Valor: '123,45', Descrição: 'Mesmo lançamento', Documento: '' };
  const first = await buildCsvTransactions('conta-8', [row], mapping, 'ambos');
  const second = await buildCsvTransactions('conta-8', [row], mapping, 'ambos');
  const expected = createHash('sha256')
    .update(JSON.stringify(['conta-8', '2026-09-21', '123.45', 'Mesmo lançamento', '']))
    .digest('hex');

  assert.equal(first[0].hash_transacao, second[0].hash_transacao);
  assert.equal(first[0].hash_transacao, expected);
  assert.match(first[0].hash_transacao, /^[a-f0-9]{64}$/);
  await assert.rejects(
    buildCsvTransactions('conta-8', [row, row], mapping, 'ambos'),
    /duplicada dentro do arquivo/,
  );
  const otherAccount = await buildCsvTransactions('outra-conta', [row], mapping, 'ambos');
  assert.notEqual(first[0].hash_transacao, otherAccount[0].hash_transacao);
});

test('Etapa 8 — confirmação de importação usa RPC server-side e preserva o contrato do lote', async () => {
  const transaction = etapa8Transaction();
  await withMockRpc({ id: etapa8Lot.id }, async calls => {
    await conciliacoesService.confirmImport(etapa8Lot, [transaction], {
      periodStart: '2026-09-21',
      periodEnd: '2026-09-21',
      totalEntries: 123.45,
      totalExits: 0,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'confirmar_importacao_extrato');
    const args = calls[0].args as { p_lote: Record<string, unknown>; p_transacoes: ImportTransaction[]; p_metadata: Record<string, unknown> };
    assert.deepEqual(args.p_lote, {
      id: etapa8Lot.id,
      conta_bancaria_id: etapa8Lot.contaBancariaId,
      arquivo_nome: etapa8Lot.fileName,
      arquivo_tamanho: etapa8Lot.fileSize,
      arquivo_mime_type: etapa8Lot.mimeType,
      arquivo_hash: etapa8Lot.fileHash,
      storage_path: etapa8Lot.storagePath,
      importado_por: etapa8Lot.userId,
    });
    assert.deepEqual(args.p_transacoes, [transaction]);
    assert.equal(args.p_metadata.periodStart, '2026-09-21');
    assert.equal(args.p_metadata.periodEnd, '2026-09-21');
    assert.equal(args.p_metadata.totalEntries, 123.45);
    assert.equal(args.p_metadata.totalExits, 0);
    assert.deepEqual((args.p_metadata.rawTransactions as unknown[]).length, 1);
  });
});

test('Etapa 8 — cancelamento/limpeza permanece um contrato seguro sem mock que muta Storage', () => {
  const serviceSource = source('src/services/conciliacoesService.ts');
  assert.match(serviceSource, /catch \(error\) \{[\s\S]*?cleanupImport\(lot\)/);
  assert.match(serviceSource, /cleanupImport: async \(lot: ImportLotDraft\)/);
  assert.match(serviceSource, /storage\.from\('bank-statements'\)\.remove\(\[lot\.storagePath\]\)/);
  assert.match(serviceSource, /if \(!persistedLot\) await conciliacoesService\.cleanupImport\(lot\)/);
});

test('Etapa 8 — diferenças aceitam tipos válidos, justificativa e múltiplos lançamentos no payload atômico', async () => {
  const tipos: TipoDiferenca[] = ['juros', 'multa', 'desconto', 'tarifa', 'pagamento_parcial', 'ajuste_manual'];
  const conciliationResult = { grupo_conciliacao_id: 'grupo-8', conciliacoes: [], diferenca_centavos: 10 };
  await withMockRpc(conciliationResult, async calls => {
    const result = await conciliacoesService.linkConciliacao({
      transacaoBancoId: 'tx-8',
      lancamentoIds: ['lancamento-1', 'lancamento-2', 'lancamento-3'],
      tipoDiferenca: 'ajuste_manual',
      justificativa: 'Diferença explicada pelo arredondamento bancário',
    });
    await conciliacoesService.unlinkConciliacao('conciliacao-8');
    assert.deepEqual(result, conciliationResult);
    assert.deepEqual(calls, [{
      name: 'conciliar_transacao_atomica',
      args: {
        p_transacao_id: 'tx-8',
        p_lancamento_ids: ['lancamento-1', 'lancamento-2', 'lancamento-3'],
        p_tipo_diferenca: 'ajuste_manual',
        p_justificativa: 'Diferença explicada pelo arredondamento bancário',
      },
    }, {
      name: 'desvincular_conciliacao_atomica',
      args: { p_conciliacao_id: 'conciliacao-8' },
    }]);
  });
  assert.equal(new Set(tipos).size, tipos.length);
  const typesSource = source('src/types/index.ts');
  assert.match(typesSource, /export type TipoDiferenca = 'juros' \| 'multa' \| 'desconto' \| 'tarifa' \| 'pagamento_parcial' \| 'ajuste_manual'/);
  assert.match(typesSource, /interface DiferencaFinanceira[\s\S]*observacao_justificativa/);
});

test('Etapa 8 — fechamento e aprovação chamam RPCs com estado e justificativa server-side', async () => {
  const response = { id: 'fechamento-8', status: 'aguardando_master' };
  await withMockRpc(response, async calls => {
    await conciliacoesService.fecharPeriodo('conta-8', '2026-09-01', '2026-09-30');
    await conciliacoesService.decidirFechamento('fechamento-8', false, 'Conferir diferença antes da aprovação');
    assert.deepEqual(calls, [
      {
        name: 'fechar_periodo_conciliacao',
        args: { p_conta_id: 'conta-8', p_periodo_inicio: '2026-09-01', p_periodo_fim: '2026-09-30' },
      },
      {
        name: 'decidir_fechamento_conciliacao',
        args: { p_fechamento_id: 'fechamento-8', p_aprovado: false, p_justificativa: 'Conferir diferença antes da aprovação' },
      },
    ]);
  });
  assert.match(source('src/types/index.ts'), /StatusFechamentoConciliacao = 'aberto' \| 'aguardando_master' \| 'aprovado' \| 'reprovado'/);
});

test('Etapa 8 — transferência bancária converte valores em centavos e valida decisão server-side', async () => {
  const response = { id: 'transferencia-8', status: 'conciliada_pendente_master' };
  await withMockRpc(response, async calls => {
    const created = await transferenciasService.criar({
      contaOrigemId: 'conta-origem',
      contaDestinoId: 'conta-destino',
      valor: 10.23,
      dataTransferencia: '2026-09-21',
      tarifa: 1.5,
      tarifaCategoriaId: 'categoria-tarifa',
      tarifaCentroCustoId: 'centro-tarifa',
    });
    assert.equal(created.status, 'conciliada_pendente_master');
    await transferenciasService.conciliar('transferencia-8', 'tx-8', 'destino');
    await transferenciasService.decidir('transferencia-8', false, 'Conta destino ainda não conferida');
    await transferenciasService.estornar('transferencia-8', 'Estorno contratual');
    assert.deepEqual(calls, [
      {
        name: 'criar_transferencia_atomica',
        args: {
          p_conta_origem_id: 'conta-origem',
          p_conta_destino_id: 'conta-destino',
          p_valor_centavos: 1023,
          p_data_transferencia: '2026-09-21',
          p_tarifa_centavos: 150,
          p_tarifa_categoria_id: 'categoria-tarifa',
          p_tarifa_centro_custo_id: 'centro-tarifa',
        },
      },
      { name: 'conciliar_transferencia_atomica', args: { p_transferencia_id: 'transferencia-8', p_transacao_id: 'tx-8', p_lado: 'destino' } },
      { name: 'decidir_transferencia_bancaria', args: { p_transferencia_id: 'transferencia-8', p_aprovado: false, p_justificativa: 'Conta destino ainda não conferida' } },
      { name: 'estornar_transferencia_atomica', args: { p_transferencia_id: 'transferencia-8', p_motivo: 'Estorno contratual' } },
    ]);
  });
  await assert.rejects(
    transferenciasService.criar({ contaOrigemId: 'mesma', contaDestinoId: 'mesma', valor: 10, dataTransferencia: '2026-09-21' }),
    /diferentes/,
  );
  await assert.rejects(transferenciasService.decidir('transferencia-8', false), /justificativa.*obrigatória/);
  assert.match(source('src/services/transferenciasService.ts'), /eq\('status', 'conciliada_pendente_master'\)/);
});

test('Etapa 8 — Cofre mantém contratos de aprovação, recebimento e estorno por RPC', async () => {
  await withMockRpc({ id: 'cofre-transfer-8', status: 'aguardando_master' }, async calls => {
    await cofreService.criarTransferencia({ direcao: 'banco_para_cofre', contaBancariaId: 'conta-8', cofreId: 'cofre-8', valor: 20.5, dataTransferencia: '2026-09-21' });
    await cofreService.confirmarRecebimento('cofre-transfer-8');
    await cofreService.decidirTransferencia({ id: 'cofre-transfer-8', aprovado: true });
    await cofreService.estornarTransferencia('cofre-transfer-8', 'Correção de conferência');
    assert.deepEqual(calls.map(call => call.name), [
      'criar_transferencia_cofre',
      'confirmar_recebimento_cofre',
      'decidir_transferencia_cofre',
      'estornar_transferencia_cofre',
    ]);
    assert.deepEqual(calls[0].args, {
      p_direcao: 'banco_para_cofre',
      p_conta_bancaria_id: 'conta-8',
      p_cofre_id: 'cofre-8',
      p_valor_centavos: 2050,
      p_data_transferencia: '2026-09-21',
    });
  });
  await assert.rejects(cofreService.decidirTransferencia({ id: 'cofre-transfer-8', aprovado: false }), /justificativa.*obrigatória/);
});

test('Etapa 8 — relatórios excluem espelhos de transferências e o dashboard usa o resumo consolidado', () => {
  assert.equal(isFinancialReportItem({ transferencia_id: null, transferencia_lado: null, transferencia_cofre_id: null }), true);
  assert.equal(isFinancialReportItem({ transferencia_id: 'transferencia-8', transferencia_lado: 'origem', transferencia_cofre_id: null }), false);
  assert.equal(isFinancialReportItem({ transferencia_id: 'transferencia-8', transferencia_lado: 'destino', transferencia_cofre_id: null }), false);
  assert.equal(isFinancialReportItem({ transferencia_id: 'transferencia-8', transferencia_lado: null, transferencia_cofre_id: null }), true);
  assert.equal(isFinancialReportItem({ transferencia_id: null, transferencia_lado: null, transferencia_cofre_id: 'cofre-transfer-8' }), false);

  const hookSource = source('src/hooks/useData.ts');
  const dashboardSource = source('src/pages/Dashboard.tsx');
  const reportsSource = source('src/pages/Relatorios.tsx');
  assert.match(hookSource, /supabase\.rpc\('get_consolidated_dashboard_summary'\)/);
  assert.match(hookSource, /enabled: !!user\?\.id/);
  assert.match(dashboardSource, /import \{ isFinancialReportItem \} from ['"]\.\.\/utils\/financialItems['"]/);
  assert.match(dashboardSource, /isFinancialReportItem\(l\) && l\.status_pagamento === 'pago'/);
  assert.match(reportsSource, /import \{ isFinancialReportItem \} from ['"]\.\.\/utils\/financialItems['"]/);
  assert.match(reportsSource, /isFinancialReportItem\(l\)/);
  assert.match(reportsSource, /const realizedIn = periodItems\.filter\(l => l\.tipo === 'entrada' && l\.status_pagamento === 'pago' && l\.status_aprovacao === 'confirmado_master'\)\.reduce\(\(acc, curr\) => acc \+ \(curr\.valor_recebido \?\? curr\.valor_previsto\), 0\);/);
});

test('Etapa 8 — perfis Master/Gerente/Colaborador, RLS, grants e guard da Edge Function são contratos verificáveis', () => {
  const typesSource = source('src/types/index.ts');
  const createUserSource = source('supabase/functions/create-user/index.ts');
  const securityEvidence = source('docs/fase-3-seguranca-auditoria.md');

  assert.match(typesSource, /UserPerfil = 'master' \| 'gerente' \| 'colaborador'/);
  assert.match(createUserSource, /user\.app_metadata\?\.role !== 'master'/);
  assert.match(createUserSource, /Apenas usuários Master podem criar novas contas/);
  assert.match(securityEvidence, /as cinco tabelas estão com RLS habilitado/);
  assert.match(securityEvidence, /Resultado esperado depois: `authenticated_execute = true` e `anon_execute = false` para cada função listada\./);
  assert.match(securityEvidence, /Nenhuma policy de `SELECT` ou `DELETE` foi removida/);
  assert.match(securityEvidence, /GRANT EXECUTE ON FUNCTION public\.confirmar_importacao_extrato/);
  assert.match(securityEvidence, /GRANT EXECUTE ON FUNCTION public\.conciliar_transacao_atomica/);
});

test('Etapa 8 — contratos críticos permanecem no código e a suíte não executa piloto/PDF-OCR', () => {
  const serviceSource = source('src/services/conciliacoesService.ts');
  const parserSource = source('supabase/functions/parse-bank-statement/index.ts');
  assert.match(serviceSource, /confirmar_importacao_extrato/);
  assert.match(serviceSource, /conciliar_transacao_atomica/);
  assert.match(serviceSource, /desvincular_conciliacao_atomica/);
  assert.match(serviceSource, /fechar_periodo_conciliacao/);
  assert.match(serviceSource, /decidir_fechamento_conciliacao/);
  assert.match(parserSource, /runBankStatementOcr/);
  assert.doesNotMatch(source('tests/etapa-8.test.ts'), /supabase\.storage\.[a-z]+\(/);
});