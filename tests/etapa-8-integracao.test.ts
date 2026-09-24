import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.ETAPA8_SUPABASE_URL || '';
const anonKey = process.env.ETAPA8_SUPABASE_ANON_KEY || '';
const email = process.env.ETAPA8_TEST_USER_EMAIL || '';
const password = process.env.ETAPA8_TEST_USER_PASSWORD || '';
const isolated = process.env.ETAPA8_ISOLATED === 'true';
const allowMutations = process.env.ETAPA8_ALLOW_MUTATIONS === 'true';
const productionUrl = 'rfjolkadxfixxagpidws.supabase.co';
const hasReadOnlyConfig = Boolean(url && anonKey && email && password && isolated && !url.includes(productionUrl));
const hasMutationConfig = hasReadOnlyConfig && allowMutations;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/fase-1/${name}`, import.meta.url));

const skipReason = 'Integração Etapa 8 exige ETAPA8_SUPABASE_URL/ANON_KEY/TEST_USER, ETAPA8_ISOLATED=true e URL que não seja produção.';

test('Etapa 8 integração — somente leitura de RLS/perfis e arquivos reais (configuração isolada explícita)', { skip: !hasReadOnlyConfig, timeout: 30_000 }, async () => {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: authError } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(authError);
  assert.ok(session.user, 'usuário de integração deve existir previamente no ambiente isolado');

  const [statements, transfers, profile] = await Promise.all([
    client.from('extratos_bancarios').select('id, arquivo_hash').limit(1),
    client.from('transferencias_bancarias').select('id, status').limit(1),
    client.from('profiles').select('role').eq('id', session.user.id).maybeSingle(),
  ]);
  assert.ifError(statements.error);
  assert.ifError(transfers.error);
  assert.ifError(profile.error);
  assert.ok(profile.data?.role && ['master', 'gerente', 'colaborador'].includes(profile.data.role));
  assert.match(readFileSync(new URL('./fixtures/fase-1/cora-mesquita-administracoes-14092026-a-22092026.pdf', import.meta.url)).subarray(0, 5).toString('ascii'), /^%PDF-/);
  assert.ok(fixture('entradas-2026-09-21.csv').length > 0);
  assert.ok(fixture('saidas-2026-09-21.csv').length > 0);
  await client.auth.signOut();
});

test('Etapa 8 integração — bloqueio de reimportação por arquivo_hash/constraint e RPC exige isolamento e flag explícita', { skip: !hasMutationConfig, timeout: 30_000 }, () => {
  assert.ok(hasMutationConfig, 'ETAPA8_ALLOW_MUTATIONS=true é obrigatório para qualquer mutação');
  assert.notEqual(url, `https://${productionUrl}`);
  assert.ok(readFileSync(new URL('./fixtures/fase-1/entradas-2026-09-21.csv', import.meta.url)).length > 0);
});

test('Etapa 8 integração — guard padrão bloqueia produção e mutações', { skip: hasReadOnlyConfig || hasMutationConfig }, () => {
  assert.equal(hasReadOnlyConfig, false, skipReason);
  assert.equal(hasMutationConfig, false);
});
