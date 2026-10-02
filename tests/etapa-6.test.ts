import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { supabase } from '../src/integrations/supabase/client';
import { extratoImportacaoService } from '../src/services/extratoImportacaoService';
import { conciliacoesService } from '../src/services/conciliacoesService';
import { masterApprovalService } from '../src/services/masterApprovalService';
import { transferenciasService } from '../src/services/transferenciasService';
import { lancamentosService } from '../src/services/lancamentosService';
import { validateImportConsistency } from '../src/services/extratoImportacaoService';
import type { ImportLotDraft, ImportReviewItem, ImportTransaction } from '../src/types/extratoImportacao';

type RpcCall = { name: string; args: Record<string, unknown> | undefined };

const here = dirname(fileURLToPath(import.meta.url));
const readProjectFile = (path: string) => readFileSync(resolve(here, '..', path), 'utf8');

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

const lot: ImportLotDraft = {
  id: '00000000-0000-0000-0000-000000000006',
  contaBancariaId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  fileName: 'cora-mesquita-administracoes-14092026-a-22092026.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  fileHash: 'b'.repeat(64),
  storagePath: '00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000006/extrato.pdf',
  formatoArquivo: 'pdf',
  origemExtracao: 'texto',
  status: 'em_validacao',
};

const transaction = (overrides: Partial<ImportTransaction> = {}): ImportTransaction => ({
  data_transacao: '2026-09-21',
  data_original: '21/09/2026',
  valor: 123.45,
  valor_centavos: 12345,
  descricao_banco: 'Crédito bancário de teste',
  descricao_original: 'Crédito bancário de teste',
  tipo_movimento: 'credito',
  hash_transacao: 'a'.repeat(64),
  pagina_origem: 1,
  linha_origem: 1,
  confianca_extracao: 0.99,
  formato_arquivo: 'pdf',
  origem_extracao: 'texto',
  origem_arquivo: 'pdf_texto',
  estado_revisao: 'valida',
  ...overrides,
});

test('Etapa 6 — fixture PDF versionado e lote válido sem pendências passam a validação pura', () => {
  const pdfPath = resolve(here, 'fixtures/fase-1/cora-mesquita-administracoes-14092026-a-22092026.pdf');
  const pdf = readFileSync(pdfPath);
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 0);

  const mirroredPdfPath = resolve(here, '../.dyad/media/10169f1d30b1dc902a382a80aaabb6a28a46080ca1754d802c17ac827431df7e.pdf');
  if (existsSync(mirroredPdfPath)) assert.deepEqual(pdf, readFileSync(mirroredPdfPath));

  const result = validateImportConsistency([transaction()], {
    pages: 1,
    parserTotals: { entries: 123.45, exits: 0 },
    sourceOrigin: 'texto',
    pendingReviewCount: 0,
    reviewState: 'validated',
  });
  assert.deepEqual(result.criticalErrors, []);
  assert.equal(result.extractedCount, 1);
  assert.equal(result.computedEntries, 123.45);
});

test('Etapa 6 — descrição ambígua representada como pendência bloqueia a validação do lote', () => {
  const pendingReview: ImportReviewItem = {
    descricao: 'PIX sem identificação suficiente',
    origem_extracao: 'texto',
    confianca_extracao: 0.55,
    motivos: ['descricao_ambigua'],
    trecho: 'PIX TRANSFERÊNCIA',
  };
  assert.equal(pendingReview.motivos.includes('descricao_ambigua'), true);

  const result = validateImportConsistency([transaction()], {
    sourceOrigin: 'texto',
    pendingReviewCount: 1,
    reviewState: 'has_pending_reviews',
  });
  assert.ok(result.criticalErrors.some(issue => issue.code === 'pending_review'));
});

test('Etapa 6 — divergência entre total do parser e transações é erro crítico', () => {
  const result = validateImportConsistency([transaction()], {
    parserTotals: { entries: 120, exits: 0 },
    sourceOrigin: 'texto',
  });
  assert.ok(result.criticalErrors.some(issue => issue.code === 'entries_total_mismatch'));
  assert.equal(result.totalsDifferenceCents?.entries, 345);
});

test('Etapa 6 — criação de lançamento a partir de transação envia dados comerciais ao RPC atômico', async () => {
  await withMockRpc({ id: 'lancamento-etapa-6' }, async calls => {
    await lancamentosService.criarAPartirDeTransacao('transacao-banco-6', {
      valor_previsto: 123.45,
      categoria_id: 'categoria-6',
      entidade_id: 'entidade-6',
      observacoes: 'Lançamento comercial criado a partir da conciliação',
    });
    assert.deepEqual(calls, [{
      name: 'criar_lancamento_a_partir_transacao_atomico',
      args: {
        p_transacao_id: 'transacao-banco-6',
        p_dados_comerciais: {
          valor_previsto: 123.45,
          categoria_id: 'categoria-6',
          entidade_id: 'entidade-6',
          observacoes: 'Lançamento comercial criado a partir da conciliação',
        },
      },
    }]);
  });
});

test('Etapa 6 — fluxo de transferência bancária usa os RPCs atômicos existentes', async () => {
  await withMockRpc({ id: 'transferencia-etapa-6', status: 'conciliada_pendente_master' }, async calls => {
    await transferenciasService.criar({
      contaOrigemId: 'conta-origem',
      contaDestinoId: 'conta-destino',
      valor: 84.27,
      dataTransferencia: '2026-09-21',
    });
    await transferenciasService.conciliar('transferencia-etapa-6', 'transacao-destino-6', 'destino');
    assert.deepEqual(calls, [
      {
        name: 'criar_transferencia_atomica',
        args: {
          p_conta_origem_id: 'conta-origem',
          p_conta_destino_id: 'conta-destino',
          p_valor_centavos: 8427,
          p_data_transferencia: '2026-09-21',
          p_tarifa_centavos: 0,
          p_tarifa_categoria_id: null,
          p_tarifa_centro_custo_id: null,
        },
      },
      {
        name: 'conciliar_transferencia_atomica',
        args: { p_transferencia_id: 'transferencia-etapa-6', p_transacao_id: 'transacao-destino-6', p_lado: 'destino' },
      },
    ]);
  });
});

test('Etapa 6 — reenvio para revisão usa RPC e cancelamento permanece sem execução local', async () => {
  const review = {
    reviewState: 'in_review' as const,
    pendingReviews: [{ descricao: 'PIX sem identificação suficiente', origem_extracao: 'texto' as const, confianca_extracao: 0.55, motivos: ['descricao_ambigua'], trecho: 'PIX TRANSFERÊNCIA' }],
    reviewReasons: ['revisao_tecnica' as const],
    reviewDecisions: [{ pendencia_index: 0, categoria: 'revisao_tecnica' as const, decisao: 'aprovar' as const, justificativa: 'Descrição revisada manualmente' }],
  };
  await withMockRpc({ id: lot.id, status: 'em_revisao' }, async calls => {
    await extratoImportacaoService.submitImportForReview(lot, review);
    assert.deepEqual(calls, [{
      name: 'enviar_importacao_para_revisao',
      args: { p_lote_id: lot.id, p_metadata_revisao: review },
    }]);
  });

  const serviceSource = readProjectFile('src/services/extratoImportacaoService.ts');
  assert.match(serviceSource, /supabase\.rpc\('cancelar_importacao_extrato', \{ p_lote_id: lot\.id \}\)/);
  assert.match(serviceSource, /supabase\.storage\.from\('bank-statements'\)\.remove\(\[lot\.storagePath\]\)/);
});

test('Etapa 6 — lote em revisão não pode ser confirmado pelo contrato local', async () => {
  await withMockRpc([], async calls => {
    await assert.rejects(
      extratoImportacaoService.confirmImport({ ...lot, status: 'em_revisao' }, [transaction()], {
        sourceOrigin: 'texto',
        pendingReviewCount: 1,
        reviewState: 'has_pending_reviews',
      }),
      /Somente lotes em validação podem ser confirmados/,
    );
    assert.deepEqual(calls, []);
  });

  const closeService = readProjectFile('src/services/conciliacoesService.ts');
  assert.match(closeService, /supabase\.rpc\('fechar_periodo_conciliacao'/);
  const result = validateImportConsistency([transaction()], { pendingReviewCount: 1, reviewState: 'has_pending_reviews' });
  assert.ok(result.criticalErrors.some(issue => issue.code === 'pending_review'));
});

test('Etapa 6 — decisão Master usa RPC e a documentação mantém a autoridade no banco', async () => {
  await withMockRpc({ id: 'aprovacao-etapa-6', aprovado: true }, async calls => {
    await masterApprovalService.decide({ itemId: 'fechamento-6', tipo: 'fechamento_conciliacao', aprovado: true });
    assert.deepEqual(calls, [{
      name: 'decidir_aprovacao_master',
      args: { p_item_id: 'fechamento-6', p_tipo: 'fechamento_conciliacao', p_aprovado: true, p_justificativa: null },
    }]);
  });
  assert.match(readProjectFile('docs/modulo-1-gestao-previsoes.md'), /A aprovação Master não é concedida pelo formulário: a role e as funções autorizadas continuam sendo a autoridade do banco/);
});

test('Etapa 6 — transações bancárias permanecem imutáveis e campos comerciais ficam no payload de lançamento', () => {
  const securityEvidence = readProjectFile('docs/fase-3-seguranca-auditoria.md');
  const launchService = readProjectFile('src/services/lancamentosService.ts');
  const types = readProjectFile('src/types/index.ts');
  assert.match(securityEvidence, /REVOKE UPDATE ON TABLE public\.transacoes_banco FROM authenticated/);
  assert.match(securityEvidence, /protect_transacao_banco_immutable/);
  assert.match(launchService, /p_dados_comerciais: dadosComerciais/);
  assert.match(launchService, /criar_lancamento_a_partir_transacao_atomico/);
  assert.match(types, /interface TransacaoBanco[\s\S]*descricao_banco/);
  assert.doesNotMatch(types.match(/interface TransacaoBanco[\s\S]*?\n\}/)?.[0] || '', /categoria_id|entidade_id|centro_custo_id|observacoes/);
});
