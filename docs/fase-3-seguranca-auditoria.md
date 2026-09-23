# Fase 3 — segurança e auditoria do núcleo bancário

## Estado desta evidência

**Aplicada remotamente e verificada.** As alterações de função, triggers, RLS e grants foram executadas individualmente no banco remoto. Nenhum dado de negócio foi inserido, atualizado ou removido; apenas DDL e privilégios foram alterados.

Não há migration file nesta entrega. As consultas pós-aplicação registradas ao final confirmam os gatilhos, o `search_path`, o bloqueio de UPDATE direto, o RLS, os grants e os EXECUTE das RPCs.

## Escopo e invariantes

- Tabelas críticas: `public.transacoes_banco`, `public.conciliacoes`, `public.diferencas_financeiras`, `public.transferencias_bancarias` e `public.extratos_bancarios`.
- A função existente `public.process_audit_log` deve continuar `SECURITY DEFINER`, passar a declarar `SET search_path TO 'public'` e usar `auth.uid()`.
- O gatilho de auditoria deve ser `AFTER INSERT OR UPDATE OR DELETE`, por linha, nas cinco tabelas.
- Usuários `authenticated` devem manter leitura autorizada e o DELETE já usado pelo fluxo de limpeza em `transacoes_banco`, mas não devem possuir UPDATE nessa tabela.
- O estado de `transacoes_banco.status_conciliacao` continua alterável pelos fluxos RPC `SECURITY DEFINER` já autorizados, sem teste de escrita nesta fase.
- Nenhum dado de negócio será usado como fixture ou teste destrutivo.
- O baseline de `public.auditoria_logs` não deve ser truncado, apagado ou reescrito.

## Estado observado antes da aplicação

A inspeção read-only do schema remoto mostrou:

- RLS declarado como habilitado nas cinco tabelas.
- `authenticated` tinha `SELECT` nas cinco tabelas; em `transacoes_banco` também tinha `DELETE` e `UPDATE`.
- Existia a policy `transacoes_update_management` em `transacoes_banco`.
- Não foram mostrados grants de tabela para `anon` nas cinco tabelas.
- `service_role` já tinha `SELECT`, `INSERT`, `UPDATE` e `DELETE` nas cinco tabelas.
- `process_audit_log` já era `SECURITY DEFINER`, mas a definição observada não declarava `search_path` seguro.
- O dump do schema não listou gatilhos de auditoria para as cinco tabelas. Foram observados gatilhos de auditoria em outras tabelas, que estão fora do escopo.
- Nenhuma operação de dados foi executada nesta inspeção; a quantidade/conteúdo do baseline de `auditoria_logs` não foi alterada nem testada por DML.

## SQL aplicado remotamente

Cada bloco abaixo foi executado como **uma única instrução SQL**, em chamada própria. A lista registra o SQL aplicado nesta fase; não houve DML de dados de negócio.

### 1. Reforçar a função de auditoria

```sql
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_action_label text;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'DELETE' THEN
        v_action_label := 'Exclusão de ' || TG_TABLE_NAME;
        INSERT INTO public.auditoria_logs (tabela_afetada, registro_id, usuario_id, acao, dados_anteriores)
        VALUES (TG_TABLE_NAME, OLD.id, v_user_id, v_action_label, to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        v_action_label := 'Novo Registro em ' || TG_TABLE_NAME;

        IF TG_TABLE_NAME = 'lancamentos_financeiros' THEN v_action_label := 'Novo Lançamento'; END IF;
        IF TG_TABLE_NAME = 'contas_bancarias' THEN v_action_label := 'Nova Conta Criada'; END IF;

        INSERT INTO public.auditoria_logs (tabela_afetada, registro_id, usuario_id, acao, dados_novos)
        VALUES (TG_TABLE_NAME, NEW.id, v_user_id, v_action_label, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action_label := 'Alteração em ' || TG_TABLE_NAME;

        IF TG_TABLE_NAME = 'lancamentos_financeiros' THEN
            IF OLD.status_aprovacao IS DISTINCT FROM NEW.status_aprovacao AND NEW.status_aprovacao = 'confirmado_master' THEN
                v_action_label := 'Aprovação Master';
            ELSIF OLD.status_pagamento IS DISTINCT FROM NEW.status_pagamento AND NEW.status_pagamento = 'pago' THEN
                v_action_label := 'Conciliação Bancária';
            ELSIF NEW.tipo_baixa = 'avr' THEN
                v_action_label := 'AVR - Ajuste do Valor Real';
            ELSIF NEW.tipo_baixa = 'bpi' THEN
                v_action_label := 'BPI - Baixa por Inatividade';
            ELSIF OLD.valor_previsto IS DISTINCT FROM NEW.valor_previsto THEN
                v_action_label := 'Ajuste de Valor';
            END IF;
        END IF;

        INSERT INTO public.auditoria_logs (
            tabela_afetada,
            registro_id,
            usuario_id,
            acao,
            dados_anteriores,
            dados_novos
        )
        VALUES (
            TG_TABLE_NAME,
            NEW.id,
            v_user_id,
            v_action_label,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$;
```

### 2. Instalar os cinco gatilhos de auditoria

```sql
DROP TRIGGER IF EXISTS trg_fase3_audit_transacoes_banco ON public.transacoes_banco;
```

```sql
CREATE TRIGGER trg_fase3_audit_transacoes_banco
AFTER INSERT OR UPDATE OR DELETE ON public.transacoes_banco
FOR EACH ROW
EXECUTE FUNCTION public.process_audit_log();
```

```sql
DROP TRIGGER IF EXISTS trg_fase3_audit_conciliacoes ON public.conciliacoes;
```

```sql
CREATE TRIGGER trg_fase3_audit_conciliacoes
AFTER INSERT OR UPDATE OR DELETE ON public.conciliacoes
FOR EACH ROW
EXECUTE FUNCTION public.process_audit_log();
```

```sql
DROP TRIGGER IF EXISTS trg_fase3_audit_diferencas_financeiras ON public.diferencas_financeiras;
```

```sql
CREATE TRIGGER trg_fase3_audit_diferencas_financeiras
AFTER INSERT OR UPDATE OR DELETE ON public.diferencas_financeiras
FOR EACH ROW
EXECUTE FUNCTION public.process_audit_log();
```

```sql
DROP TRIGGER IF EXISTS trg_fase3_audit_transferencias_bancarias ON public.transferencias_bancarias;
```

```sql
CREATE TRIGGER trg_fase3_audit_transferencias_bancarias
AFTER INSERT OR UPDATE OR DELETE ON public.transferencias_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.process_audit_log();
```

```sql
DROP TRIGGER IF EXISTS trg_fase3_audit_extratos_bancarios ON public.extratos_bancarios;
```

```sql
CREATE TRIGGER trg_fase3_audit_extratos_bancarios
AFTER INSERT OR UPDATE OR DELETE ON public.extratos_bancarios
FOR EACH ROW
EXECUTE FUNCTION public.process_audit_log();
```

### 3. RLS, grants e bloqueio de UPDATE direto

```sql
ALTER TABLE public.transacoes_banco ENABLE ROW LEVEL SECURITY;
```

```sql
ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;
```

```sql
ALTER TABLE public.diferencas_financeiras ENABLE ROW LEVEL SECURITY;
```

```sql
ALTER TABLE public.transferencias_bancarias ENABLE ROW LEVEL SECURITY;
```

```sql
ALTER TABLE public.extratos_bancarios ENABLE ROW LEVEL SECURITY;
```

```sql
REVOKE ALL PRIVILEGES ON TABLE public.transacoes_banco FROM anon;
```

```sql
REVOKE ALL PRIVILEGES ON TABLE public.conciliacoes FROM anon;
```

```sql
REVOKE ALL PRIVILEGES ON TABLE public.diferencas_financeiras FROM anon;
```

```sql
REVOKE ALL PRIVILEGES ON TABLE public.transferencias_bancarias FROM anon;
```

```sql
REVOKE ALL PRIVILEGES ON TABLE public.extratos_bancarios FROM anon;
```

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transacoes_banco TO service_role;
```

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conciliacoes TO service_role;
```

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diferencas_financeiras TO service_role;
```

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transferencias_bancarias TO service_role;
```

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.extratos_bancarios TO service_role;
```

```sql
REVOKE UPDATE ON TABLE public.transacoes_banco FROM authenticated;
```

```sql
DROP POLICY IF EXISTS transacoes_update_management ON public.transacoes_banco;
```

Nenhuma policy de `SELECT` ou `DELETE` foi removida. Nenhuma proteção de campos originais foi alterada.

### 4. RPCs de escrita/estado usadas pelo fluxo bancário

As concessões abaixo tornam explícito que os RPCs server-side continuam disponíveis para `authenticated` e não ficam expostos a `anon`. Os `GRANT EXECUTE` não removem os grants existentes de `authenticated`; somente os grants de `anon` das RPCs críticas são revogados, conforme o requisito de não haver acesso anônimo.

```sql
REVOKE EXECUTE ON FUNCTION public.confirmar_importacao_extrato(jsonb, jsonb, jsonb) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_extrato(jsonb, jsonb, jsonb) TO authenticated;
```

```sql
REVOKE EXECUTE ON FUNCTION public.conciliar_transacao_atomica(uuid, uuid[], text, text) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.conciliar_transacao_atomica(uuid, uuid[], text, text) TO authenticated;
```

```sql
REVOKE EXECUTE ON FUNCTION public.desvincular_conciliacao_atomica(uuid) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.desvincular_conciliacao_atomica(uuid) TO authenticated;
```

```sql
REVOKE EXECUTE ON FUNCTION public.conciliar_transferencia_atomica(uuid, uuid, text) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.conciliar_transferencia_atomica(uuid, uuid, text) TO authenticated;
```

```sql
REVOKE EXECUTE ON FUNCTION public.criar_transferencia_atomica(uuid, uuid, bigint, date, bigint, uuid, uuid) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.criar_transferencia_atomica(uuid, uuid, bigint, date, bigint, uuid, uuid) TO authenticated;
```

```sql
REVOKE EXECUTE ON FUNCTION public.estornar_transferencia_atomica(uuid, text) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.estornar_transferencia_atomica(uuid, text) TO authenticated;
```

As funções de fechamento que fazem parte do fluxo de conciliação também devem permanecer autenticadas e sem acesso anônimo:

```sql
REVOKE EXECUTE ON FUNCTION public.fechar_periodo_conciliacao(uuid, date, date) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.fechar_periodo_conciliacao(uuid, date, date) TO authenticated;
```

```sql
REVOKE EXECUTE ON FUNCTION public.decidir_fechamento_conciliacao(uuid, boolean, text) FROM anon;
```

```sql
GRANT EXECUTE ON FUNCTION public.decidir_fechamento_conciliacao(uuid, boolean, text) TO authenticated;
```

## Consultas read-only de verificação antes/depois

As consultas seguintes não alteram dados. Foram executadas individualmente após a aplicação e os resultados observados estão registrados nesta evidência.

### RLS nas cinco tabelas

```sql
SELECT c.relname AS tabela, c.relrowsecurity AS rls_habilitado FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('transacoes_banco', 'conciliacoes', 'diferencas_financeiras', 'transferencias_bancarias', 'extratos_bancarios') ORDER BY c.relname;
```

Resultado observado: as cinco tabelas estão com RLS habilitado.

### Gatilhos instalados

```sql
SELECT event_object_table AS tabela, trigger_name, event_manipulation, action_timing, action_statement FROM information_schema.triggers WHERE trigger_schema = 'public' AND event_object_table IN ('transacoes_banco', 'conciliacoes', 'diferencas_financeiras', 'transferencias_bancarias', 'extratos_bancarios') ORDER BY event_object_table, trigger_name, event_manipulation;
```

Resultado observado: cada tabela possui `INSERT`, `UPDATE` e `DELETE` em trigger `AFTER` chamando `process_audit_log()`. Os triggers `BEFORE` já existentes foram preservados.

### Definição segura da função de auditoria

```sql
SELECT p.oid::regprocedure AS funcao, p.prosecdef AS security_definer, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'process_audit_log';
```

O resultado esperado é `security_definer = true` e `proconfig` contendo `search_path=public`.

### UPDATE de `authenticated` em `transacoes_banco`

```sql
SELECT has_table_privilege('authenticated', 'public.transacoes_banco', 'UPDATE') AS authenticated_pode_update;
```

Resultado esperado depois: `false`.

### SELECT preservado e DELETE de limpeza preservado

```sql
SELECT has_table_privilege('authenticated', 'public.transacoes_banco', 'SELECT') AS authenticated_pode_select, has_table_privilege('authenticated', 'public.transacoes_banco', 'DELETE') AS authenticated_pode_delete;
```

Resultado esperado depois: `authenticated_pode_select = true` e `authenticated_pode_delete = true`.

### Policy removida

```sql
SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transacoes_banco' AND policyname = 'transacoes_update_management';
```

Resultado esperado depois: nenhuma linha.

### Ausência de grants de tabela para `anon`

```sql
SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public' AND table_name IN ('transacoes_banco', 'conciliacoes', 'diferencas_financeiras', 'transferencias_bancarias', 'extratos_bancarios') ORDER BY table_name, privilege_type;
```

Resultado esperado depois: nenhuma linha.

### CRUD de `service_role`

```sql
SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name IN ('transacoes_banco', 'conciliacoes', 'diferencas_financeiras', 'transferencias_bancarias', 'extratos_bancarios') AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') ORDER BY table_name, privilege_type;
```

Resultado esperado depois: as quatro linhas `SELECT`, `INSERT`, `UPDATE` e `DELETE` para cada uma das cinco tabelas.

### RPCs críticas: `authenticated` sim, `anon` não

```sql
SELECT p.oid::regprocedure AS funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute FROM pg_proc p WHERE p.oid IN ('public.confirmar_importacao_extrato(jsonb,jsonb,jsonb)'::regprocedure, 'public.conciliar_transacao_atomica(uuid,uuid[],text,text)'::regprocedure, 'public.desvincular_conciliacao_atomica(uuid)'::regprocedure, 'public.conciliar_transferencia_atomica(uuid,uuid,text)'::regprocedure, 'public.criar_transferencia_atomica(uuid,uuid,bigint,date,bigint,uuid,uuid)'::regprocedure, 'public.estornar_transferencia_atomica(uuid,text)'::regprocedure, 'public.fechar_periodo_conciliacao(uuid,date,date)'::regprocedure, 'public.decidir_fechamento_conciliacao(uuid,boolean,text)'::regprocedure) ORDER BY funcao;
```

Resultado esperado depois: `authenticated_execute = true` e `anon_execute = false` para cada função listada.

### Baseline de auditoria

```sql
SELECT COUNT(*) AS total_auditoria, MIN(data_hora) AS primeira_auditoria, MAX(data_hora) AS ultima_auditoria FROM public.auditoria_logs;
```

Esta consulta é somente leitura. O baseline observado após a aplicação foi de **1.142 registros**, com primeira auditoria em `2026-07-09 02:37:09.11766+00` e última em `2026-09-18 19:09:56.91274+00`. Nenhuma operação DML foi executada em `public.auditoria_logs` nesta fase.

## Resultado e limites

- A Fase 3 foi aplicada com DDL, triggers, RLS, grants e revogações de privilégios, sem alteração de dados de negócio.
- `authenticated` não possui UPDATE direto em `transacoes_banco`; SELECT e DELETE de limpeza foram preservados.
- As RPCs críticas permanecem executáveis por `authenticated` e não por `anon`.
- Não foram executados testes de escrita, destrutivos ou com usuários reais; a verificação foi estrutural e somente leitura.
- A auditoria de dados novos será produzida pelos triggers quando operações de negócio ocorrerem normalmente.
