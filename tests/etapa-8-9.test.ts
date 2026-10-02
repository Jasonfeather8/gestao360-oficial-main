import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { supabase } from '../src/integrations/supabase/client';
import {
  attachImportLotMetadata,
  buildCsvTransactions,
  extratoImportacaoService,
  validateImportConsistency,
} from '../src/services/extratoImportacaoService';
import type {
  ImportConfirmationMetadata,
  ImportLotDraft,
  ImportReviewSubmissionMetadata,
  ImportTransaction,
} from '../src/types/extratoImportacao';

type RpcCall = { name: string; args: Record<string, unknown> | undefined };

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const syntheticLot: ImportLotDraft = {
  id: '00000000-0000-0000-0000-000000000089',
  contaBancariaId: '00000000-0000-0000-0000-000000000091',
  userId: '00000000-0000-0000-0000-000000000092',
  fileName: 'extrato-sintetico.csv',
  fileSize: 256,
  mimeType: 'text/csv',
  fileHash: 'b'.repeat(64),
  storagePath: '00000000-0000-0000-0000-000000000092/00000000-0000-0000-0000-000000000089/extrato-sintetico.csv',
  formatoArquivo: 'csv',
  origemExtracao: 'estruturado',
  status: 'em_validacao',
};

const syntheticTransactions = async (): Promise<ImportTransaction[]> => {
  const parsed = [
    { Data: '21/09/2026', Valor: '120,00', Descrição: 'Crédito sintético', Documento: 'DOC-SYN-1' },
    { Data: '21/09/2026', Valor: '-20,00', Descrição: 'Débito sintético', Documento: 'DOC-SYN-2' },
  ];
  const built = await buildCsvTransactions(syntheticLot.contaBancariaId, parsed, {
    data: 'Data', valor: 'Valor', descricao: 'Descrição', documento: 'Documento',
  }, 'ambos');
  return attachImportLotMetadata(built, syntheticLot);
};

const validMetadata = (transactions: ImportTransaction[]): ImportConfirmationMetadata => ({
  pages: 1,
  periodStart: '2026-09-21',
  periodEnd: '2026-09-21',
  openingBalance: 1000,
  closingBalance: 1100,
  parserTotals: { entries: 120, exits: 20 },
  totalEntries: 120,
  totalExits: 20,
  reportedTransactionCount: transactions.length,
  extractedCount: transactions.length,
  sourceOrigin: 'estruturado',
  pendingReviewCount: 0,
  reviewState: 'validated',
});

const withMockRpc = async <T>(
  respond: (name: string, args: Record<string, unknown> | undefined) => unknown,
  callback: (calls: RpcCall[]) => Promise<T>,
): Promise<T> => {
  const calls: RpcCall[] = [];
  const originalRpc = supabase.rpc;
  (supabase as unknown as { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }> }).rpc = async (name, args) => {
    calls.push({ name, args });
    return { data: respond(name, args), error: null };
  };
  try {
    return await callback(calls);
  } finally {
    (supabase as unknown as { rpc: typeof originalRpc }).rpc = originalRpc;
  }
};

test('Etapas 8–9 — lote sintético válido passa pela validação de consistência sem erros', async () => {
  const transactions = await syntheticTransactions();
  const result = validateImportConsistency(transactions, validMetadata(transactions));

  assert.deepEqual(result.criticalErrors, []);
  assert.equal(result.extractedCount, 2);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.computedEntries, 120);
  assert.equal(result.computedExits, 20);
  assert.equal(result.balanceDifferenceCents, 0);
  assert.equal(result.continuityMatches, null);
  assert.ok(transactions.every(transaction =>
    transaction.arquivo_nome === syntheticLot.fileName
    && transaction.arquivo_hash === syntheticLot.fileHash
    && transaction.extrato_lote_id === syntheticLot.id
    && transaction.pagina_origem === 1
    && Number.isInteger(transaction.linha_origem)
    && transaction.confianca_extracao === 1
    && transaction.estado_revisao === 'valida'
    && transaction.origem_extracao === 'estruturado'
    && transaction.origem_arquivo === 'csv'
    && /^[a-f0-9]{64}$/.test(transaction.hash_transacao),
  ));
  assert.equal(validMetadata(transactions).reviewState, 'validated');
  assert.equal(validMetadata(transactions).pendingReviewCount, 0);
});

test('Etapas 8–9 — duplicidade de hash/fingerprint no lote sintético é sinalizada', async () => {
  const [transaction] = await syntheticTransactions();
  const duplicate = { ...transaction };
  const result = validateImportConsistency([transaction, duplicate], {
    ...validMetadata([transaction, duplicate]),
    parserTotals: undefined,
    totalEntries: undefined,
    totalExits: undefined,
    openingBalance: undefined,
    closingBalance: undefined,
  });

  assert.equal(result.duplicateCount, 1);
  assert.ok(result.criticalErrors.some(issue => issue.code === 'duplicate_transaction'));
});

test('Etapas 8–9 — divergência no total de entradas é crítica', async () => {
  const transactions = await syntheticTransactions();
  const result = validateImportConsistency(transactions, {
    ...validMetadata(transactions),
    parserTotals: { entries: 100, exits: 20 },
  });

  assert.ok(result.criticalErrors.some(issue => issue.code === 'entries_total_mismatch'));
  assert.equal(result.totalsDifferenceCents?.entries, 2000);
});

test('Etapas 8–9 — saldo inicial, movimentos e saldo final incompatíveis são rejeitados', async () => {
  const transactions = await syntheticTransactions();
  const result = validateImportConsistency(transactions, {
    ...validMetadata(transactions),
    closingBalance: 1099.9,
  });

  assert.equal(result.balanceDifferenceCents, 10);
  assert.ok(result.criticalErrors.some(issue => issue.code === 'balance_mismatch'));
});

test('Etapas 8–9 — ausência de página na sequência é crítica', async () => {
  const [transaction] = await syntheticTransactions();
  const result = validateImportConsistency([transaction], {
    ...validMetadata([transaction]),
    pages: 2,
  });

  assert.equal(result.continuityMatches, false);
  assert.ok(result.criticalErrors.some(issue => issue.code === 'page_continuity'));
});

test('Etapas 8–9 — envio para revisão técnica preserva estado e decisão sem escrita real', async () => {
  const reviewItem = {
    data_original: '21/09/2026',
    data_transacao: '2026-09-21',
    valor: 120,
    tipo_movimento: 'credito' as const,
    descricao: 'Crédito sintético com confiança baixa',
    pagina_origem: 1,
    linha_origem: 2,
    origem_extracao: 'ocr' as const,
    confianca_extracao: 0.7,
    categoria: 'revisao_tecnica' as const,
    motivos: ['confianca_baixa'],
    trecho: 'TRECHO SINTÉTICO — nenhum dado bancário real',
  };
  const reviewMetadata: ImportReviewSubmissionMetadata = {
    reviewState: 'in_review',
    pendingReviews: [reviewItem],
    reviewReasons: ['revisao_tecnica'],
    reviewDecisions: [{
      pendencia_index: 0,
      categoria: 'revisao_tecnica',
      decisao: 'aprovar',
      justificativa: 'Conferência simulada da fixture em memória',
    }],
  };

  await withMockRpc((name, args) => {
    assert.equal(name, 'enviar_importacao_para_revisao');
    assert.equal(args?.p_lote_id, syntheticLot.id);
    return { status: 'em_revisao' };
  }, async calls => {
    const result = await extratoImportacaoService.submitImportForReview(syntheticLot, reviewMetadata);
    assert.deepEqual(result, { status: 'em_revisao' });
    assert.equal(calls.length, 1);
    const submitted = calls[0].args?.p_metadata_revisao as ImportReviewSubmissionMetadata;
    assert.equal(submitted.reviewState, 'in_review');
    assert.equal(submitted.pendingReviews.length, 1);
    assert.equal(submitted.reviewReasons[0], 'revisao_tecnica');
    assert.equal(submitted.reviewDecisions?.[0].justificativa, 'Conferência simulada da fixture em memória');
  });
});

test('Etapas 8–9 — ações técnicas cobrem página ausente e substituição de arquivo com justificativa', async () => {
  await withMockRpc((name, args) => {
    assert.equal(name, 'registrar_revisao_tecnica_importacao');
    assert.equal(args?.p_lote_id, syntheticLot.id);
    return { registrada: true };
  }, async calls => {
    await extratoImportacaoService.registerTechnicalReviewDecision(syntheticLot.id, {
      acao: 'registrar_pagina_ausente',
      pagina: 2,
      justificativa: 'Página 2 ausente na fixture sintética',
    });
    await extratoImportacaoService.registerTechnicalReviewDecision(syntheticLot.id, {
      acao: 'substituir_arquivo',
      justificativa: 'Substituição simulada por arquivo de fixture em memória',
    });
    assert.equal(calls.length, 2);
    assert.deepEqual((calls[0].args?.p_decisao), {
      acao: 'registrar_pagina_ausente',
      justificativa: 'Página 2 ausente na fixture sintética',
      pagina: 2,
    });
    assert.deepEqual((calls[1].args?.p_decisao), {
      acao: 'substituir_arquivo',
      justificativa: 'Substituição simulada por arquivo de fixture em memória',
    });
  });
});

test('Etapas 8–9 — confirmação com revisão resolvida aceita lote válido e envia estado validado', async () => {
  const transactions = await syntheticTransactions();
  const metadata = validMetadata(transactions);

  await withMockRpc((name, args) => {
    if (name === 'revalidar_preview_extrato') return args?.p_transacoes;
    if (name === 'confirmar_importacao_extrato') return { id: syntheticLot.id, status: 'confirmado' };
    throw new Error(`RPC inesperada no teste isolado: ${name}`);
  }, async calls => {
    const result = await extratoImportacaoService.confirmImport(syntheticLot, transactions, metadata);
    assert.deepEqual(result, { id: syntheticLot.id, status: 'confirmado' });
    assert.deepEqual(calls.map(call => call.name), ['revalidar_preview_extrato', 'confirmar_importacao_extrato']);
    const confirmation = calls[1].args?.p_metadata as ImportConfirmationMetadata;
    assert.equal(confirmation.reviewState, 'validated');
    assert.equal(confirmation.pendingReviewCount, 0);
    assert.equal(confirmation.rawTransactions?.length, transactions.length);
  });
});

test('Etapas 8–9 — confirmação bloqueia lote ainda pendente de revisão', async () => {
  const transactions = await syntheticTransactions();
  await withMockRpc((name, args) => {
    assert.equal(name, 'revalidar_preview_extrato');
    return args?.p_transacoes;
  }, async calls => {
    await assert.rejects(
      extratoImportacaoService.confirmImport(syntheticLot, transactions, {
        ...validMetadata(transactions),
        pendingReviewCount: 1,
        reviewState: 'has_pending_reviews',
      }),
      /não está validado ou possui pendências/,
    );
    assert.deepEqual(calls.map(call => call.name), ['revalidar_preview_extrato']);
  });
});

test('Etapas 8–9 — contrato de reprocessamento preserva origem, tentativa e comparação', () => {
  const service = source('src/services/extratoImportacaoService.ts');
  assert.match(service, /Somente lotes em revisão podem ser reprocessados/);
  assert.match(service, /storage\.from\('bank-statements'\)\.download\(previousData\.storage_path\)/);
  assert.match(service, /preparar_reprocessamento_importacao/);
  assert.match(service, /registrar_preview_reprocessamento_importacao/);
  assert.match(service, /buildReprocessComparison\(previousData, result\.preview/);
  assert.match(service, /previousAttempt:[\s\S]*?currentAttempt:/);
  assert.match(service, /addedHashes:[\s\S]*?removedHashes:/);
  assert.match(service, /errosAnteriores/);
  assert.match(service, /decisoesAnteriores/);
  assert.match(service, /metadataAnterior/);
});

test('Etapas 8–9 — cancelamento bloqueia remoção de lote confirmado e registra cancelamento por RPC', () => {
  const service = source('src/services/extratoImportacaoService.ts');
  assert.match(service, /if \(lot\.status === 'confirmado'\) return/);
  assert.match(service, /cancelar_importacao_extrato/);
  assert.match(service, /persistedLot\?\.status === 'em_validacao' \|\| persistedLot\?\.status === 'em_revisao'/);
  assert.match(service, /storage\.from\('bank-statements'\)\.remove\(\[lot\.storagePath\]\)/);
});

test('Etapas 8–9 — contratos documentados bloqueiam não-Master e mantêm conciliação antes da fila Master', () => {
  const master = source('docs/aprovacao-master-fila.md');
  const approvals = source('src/services/masterApprovalService.ts');
  const reconciliation = source('src/services/conciliacoesService.ts');

  assert.match(master, /Transações importadas que ainda não possuem conciliação não entram na fila/);
  assert.match(master, /A consulta da fila e a decisão dependem de usuário Master autenticado/);
  assert.match(master, /A fila sem itens é um resultado válido/);
  assert.match(reconciliation, /status_aprovacao: 'digital'/);
  assert.match(reconciliation, /A aprovação Master deve ocorrer depois/);
  assert.match(approvals, /get_master_approval_queue/);
  assert.match(approvals, /decidir_aprovacao_master/);
});

test('Etapas 8–9 — trilha de auditoria e imutabilidade permanecem contratos estáticos, não prova de banco', () => {
  const audit = source('docs/fase-3-seguranca-auditoria.md');

  assert.match(audit, /REVOKE UPDATE ON TABLE public\.transacoes_banco FROM authenticated/);
  assert.match(audit, /protect_transacao_banco_immutable/);
  assert.match(audit, /trg_fase3_audit_transacoes_banco/);
  assert.match(audit, /AFTER INSERT OR UPDATE OR DELETE ON public\.extratos_bancarios/);
  assert.match(audit, /Nenhum dado de negócio será usado como fixture ou teste destrutivo/);
});
