# Etapas 0 e 1 — inventário e máquina de estados da importação

**Data/hora do inventário remoto:** `2026-10-02 18:19:18.281106+00`

## Escopo e garantia de preservação

Este registro foi produzido com consultas somente leitura. Nesta etapa:

- nenhum lote foi excluído ou atualizado;
- nenhuma transação de `transacoes_banco` foi inserida, atualizada ou removida;
- nenhum arquivo do Storage foi removido ou alterado;
- nenhuma RPC de transição foi chamada;
- não houve mudança de layout, hooks, lógica de negócio ou funcionalidades.

Este documento é a fotografia de referência para a etapa seguinte. Os IDs, hashes, caminhos e contagens permitem identificar o estado original antes de qualquer futura mudança autorizada.

## Etapa 0 — fotografia do estado atual

### 1. Lotes por status

| Status | Quantidade | Primeiro criado em | Último criado em |
|---|---:|---|---|
| `em_validacao` | 0 | — | — |
| `em_revisao` | 0 | — | — |
| `erro` | 0 | — | — |
| `cancelado` | 3 | 2026-10-02 01:09:31.934434+00 | 2026-10-02 17:53:27.507817+00 |
| `confirmado` | 2 | 2026-09-25 00:40:38.893240+00 | 2026-09-25 01:05:53.968435+00 |

### 2. Lotes preservados

| Lote | Status | Arquivo | Hash SHA-256 | Tamanho | Transações vinculadas | Objeto temporário presente |
|---|---|---|---|---:|---:|---|
| `942b4aab-0448-4ae8-b30a-2c9614609c4e` | `cancelado` | `mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf` | `10169f1d30b1dc902a382a80aaabb6a28a46080ca1754d802c17ac827431df7e` | 219326 | 0 | não |
| `8cf07166-e83b-4b0b-9940-b17b5a68b903` | `cancelado` | `mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf` | `10169f1d30b1dc902a382a80aaabb6a28a46080ca1754d802c17ac827431df7e` | 219326 | 0 | não |
| `b3f59395-af4a-4e2e-aa45-b0fb024742b1` | `cancelado` | `mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf` | `10169f1d30b1dc902a382a80aaabb6a28a46080ca1754d802c17ac827431df7e` | 219326 | 0 | não |
| `63f67c64-5fcf-499d-b6dc-1d1cc8dcc3d9` | `confirmado` | `Saídas-21_09_2026 18_37_22.csv` | `8b8d068321a6d3790a3626c4152f521c69c4ee2bd9ef8df575246ae2a35eda44` | 2866 | 15 | sim |
| `4ca89789-79b9-4e85-ba0e-58a24cc0878a` | `confirmado` | `Entradas-21_09_2026 18_28_15.csv` | `b4504bb239a4b37f17cdfbdfda7fd04c7d4c73e725f4411b28d5d4fa97e75ecc` | 2072 | 9 | sim |

Os três lotes cancelados não possuem objeto correspondente no bucket `bank-statements`. Os dois objetos encontrados no bucket estão vinculados aos respectivos lotes confirmados. Não foi encontrado objeto órfão no bucket consultado.

### 3. Arquivos existentes no Storage

Bucket consultado: `bank-statements`.

| Objeto | Lote associado | Status do lote | MIME | Tamanho |
|---|---|---|---|---:|
| `5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/63f67c64-5fcf-499d-b6dc-1d1cc8dcc3d9/Saidas-21_09_2026-18_37_22.csv` | `63f67c64-5fcf-499d-b6dc-1d1cc8dcc3d9` | `confirmado` | `text/csv` | 2866 |
| `5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/4ca89789-79b9-4e85-ba0e-58a24cc0878a/Entradas-21_09_2026-18_28_15.csv` | `4ca89789-79b9-4e85-ba0e-58a24cc0878a` | `confirmado` | `text/csv` | 2072 |

**Conclusão sobre temporários:** não existem arquivos temporários associados a lotes em `em_validacao`, `em_revisao` ou `erro`, pois não há lotes nesses estados no momento da fotografia. Os arquivos presentes são originais de lotes confirmados e foram preservados.

### 4. Transações bancárias

- Total de registros em `transacoes_banco`: **68**.
- Com `extrato_lote_id` preenchido: **24**.
- Sem `extrato_lote_id`: **44**.
- Os lotes confirmados da fotografia respondem por 9 + 15 = **24 transações importadas**.

Essa contagem é apenas informativa. Nenhuma transação foi alterada.

## Etapa 1 — máquina de estados definida

### Estados

| Estado | Semântica | Terminal nesta máquina |
|---|---|---|
| `em_validacao` | Lote recém-processado, ainda aguardando resolução das pendências e validação de consistência. | não |
| `em_revisao` | Lote com pendências técnicas visíveis para Master/Gerente, aguardando decisão ou reprocessamento. | não |
| `confirmado` | Lote consistente, sem pendências de revisão e apto a disponibilizar suas transações para o fluxo normal de conciliação. | sim |
| `cancelado` | Lote descartado explicitamente pelo usuário. | sim |
| `erro` | Falha técnica não resolvida durante o processamento. | sim nesta definição; qualquer reprocessamento futuro exige uma transição autorizada explicitamente |

### Transições permitidas

```text
em_validacao
    ├──> em_revisao
    │       ├──> em_validacao  (após reprocessamento autorizado)
    │       └──> cancelado
    ├──> confirmado             (somente se consistente)
    ├──> cancelado
    └──> erro                   (falha técnica não resolvida)
```

Regras de saída:

1. `em_validacao -> em_revisao`: somente quando houver pendência técnica ou revisão que precise de decisão de Master/Gerente.
2. `em_revisao -> em_validacao`: somente depois de reprocessamento autorizado e de uma nova validação do preview; o lote volta a aguardar a mesma verificação de consistência, não é confirmado automaticamente.
3. `em_validacao -> confirmado`: somente com `reviewState = validated`, `pendingReviewCount = 0`, erros críticos zerados, proveniência íntegra, hashes válidos e demais validações do contrato de confirmação satisfeitas.
4. `em_validacao -> cancelado` e `em_revisao -> cancelado`: descarte explícito pelo usuário autorizado, preservando o registro do lote e sem apagar transações bancárias já confirmadas.
5. `em_validacao -> erro`: falha técnica não resolvida, registrada com metadata de erro; não representa decisão financeira.
6. Nenhum estado de lote de importação (`em_validacao`, `em_revisao`, `erro`, `cancelado` ou `confirmado`) envia diretamente o lote para a fila de aprovação Master. A fila Master recebe apenas operações financeiras elegíveis após conciliação e seus pré-requisitos próprios.
7. A confirmação do lote não equivale à aprovação Master: ela encerra a importação consistente; as transações seguem separadamente para o fluxo de conciliação/aprovação aplicável.

### Comparação com o comportamento observado

O código e o schema já reconhecem os cinco valores de `status`. A preparação cria `em_validacao`; `enviar_importacao_para_revisao` grava `em_revisao`; `marcar_importacao_erro` permite `em_validacao -> erro`; e `cancelar_importacao_extrato` permite o cancelamento de lotes temporários ou em revisão. A confirmação aceita apenas lote `em_validacao` e exige consistência.

A transição persistida `em_revisao -> em_validacao` após reprocessamento ainda não está implementada no comportamento observado: `revalidar_preview_extrato` exige que o lote já esteja em `em_validacao`, e a solicitação atual de reprocessamento envia o lote para revisão sem concluir uma transição de retorno. Essa lacuna fica registrada para etapa posterior; não foi alterada aqui para manter esta etapa estritamente preservativa.

Também foi verificado no contrato da fila Master que o lote de importação não é uma entrada direta: a fila consulta lançamentos conciliados, fechamentos e transferências que cumpriram seus pré-requisitos, não `extratos_bancarios.status`.

## Critério de encerramento das Etapas 0 e 1

A fotografia foi registrada sem mutações e a máquina de estados foi formalizada sem alterar código operacional, dados financeiros, transações bancárias, arquivos originais, layout, hooks ou funcionalidades. Qualquer implementação da transição de reprocessamento, exposição dos estados faltantes ou mudança de UX deve ser autorizada em etapa posterior.
