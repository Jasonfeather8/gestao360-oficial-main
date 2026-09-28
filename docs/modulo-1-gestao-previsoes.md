# Módulo 1 — Gestão de previsões

## 1. Escopo e regra operacional

Este documento descreve o contrato atual do módulo de lançamentos financeiros, com foco nas previsões manuais e na passagem para conciliação. O cadastro manual continua sendo o ponto de criação de contas a pagar e a receber; a marcação de que um evento já aconteceu é apenas uma sinalização da previsão.

Regras do módulo:

- lançamento manual sem sinalização continua com `status_pagamento = aberto`;
- “Já foi pago?” (saída) e “Já foi recebido?” (entrada) persiste em `ja_recebido = true`, mas mantém o lançamento como previsão (`status_pagamento = aberto`);
- `valor_recebido` e `data_pagamento` podem preservar a informação digitada no cadastro/edição, sem representar baixa enquanto o status permanecer aberto;
- somente a conciliação bancária pode levar o lançamento para `status_pagamento = quitação_pendente` e `status_aprovacao = digital`;
- somente a aprovação Master posterior pode levar o lançamento a `status_aprovacao = confirmado_master` e `status_pagamento = pago` (para entrada, o mesmo status de pagamento representa recebimento confirmado);
- não existem `data_recebimento` nem `valor_pago` no modelo atual. Para ambos os tipos, os campos de data/valor de pagamento são `data_pagamento` e `valor_recebido`.

A sinalização de previsão não é baixa, não é pagamento parcial e não deve alterar saldo operacional, saldo confirmado ou saldo contábil.

## 2. Modelo real de `lancamentos_financeiros`

A tabela pública possui os campos abaixo. Esta lista é baseada no schema vigente, não em um modelo fictício:

| Campo | Tipo/forma atual | Papel |
|---|---|---|
| `id` | `uuid` | Identificador do lançamento. |
| `user_id` | `uuid`, nullable | Usuário proprietário da criação. |
| `tipo` | enum `entrada` / `saida` | Natureza do lançamento. |
| `valor_previsto` | `numeric(12,2)` | Valor previsto da parcela/título. |
| `data_vencimento` | `date` | Vencimento. |
| `data_emissao` | `date` | Emissão. |
| `entidade_id` | `uuid`, nullable | Cliente/fornecedor relacionado. |
| `centro_custo_id` | `uuid`, nullable | Centro de custo. |
| `categoria_id` | `uuid`, nullable | Categoria financeira. |
| `conta_bancaria_id` | `uuid`, nullable | Conta bancária do lançamento. |
| `comprovante_url` | `text`, nullable | Comprovante. |
| `observacoes` | `text`, nullable | Observações contábeis e histórico textual. |
| `status_aprovacao` | enum `pendente_digital`, `digital`, `confirmado_master`, `reprovado` | Estado de aprovação. |
| `status_pagamento` | enum `aberto`, `pago`, `pago_parcial`, `bpi`, `quitação_pendente` | Estado de pagamento/recebimento. |
| `usuario_criador_id` | `uuid`, nullable | Usuário que criou o registro. |
| `created_at` / `updated_at` | `timestamptz` | Auditoria temporal. |
| `recorrencia_id` | `uuid`, nullable | Agrupador das parcelas recorrentes. |
| `numero_parcela` | `integer`, nullable | Número da parcela. |
| `condicao` | `text`, default `a_prazo` | Condição comercial. |
| `ja_recebido` | `boolean`, default `false` | Sinalização da previsão; não é baixa. |
| `data_competencia` | `date`, nullable | Competência contábil. |
| `desconto_valor` | `numeric`, default `0` | Valor informado do desconto. |
| `desconto_tipo` | `text`, default `valor` | Tipo declarado do desconto (`valor` ou `porcentagem`). |
| `acrescimo_valor` | `numeric`, default `0` | Valor informado do acréscimo. |
| `acrescimo_tipo` | `text`, default `valor` | Tipo declarado do acréscimo (`valor` ou `porcentagem`). |
| `valor_recebido` | `numeric`, default `0` | Valor informado/recebido usado tanto para entradas quanto para saídas. |
| `data_pagamento` | `date`, nullable | Data informada ou data bancária efetiva, conforme o fluxo. |
| `quantidade_total_parcelas` | `integer`, nullable | Total de parcelas. |
| `tipo_baixa` | `text`, default `financeira` | Origem/tipo da baixa (`financeira`, `avr` ou `bpi`). |
| `motivo_ajuste` | `text`, nullable | Motivo textual de ajuste. |
| `vinculo_residuo_id` | `uuid`, nullable | Vínculo a resíduo de pagamento parcial. |
| `motivo_desconto_id` / `motivo_acrescimo_id` | `uuid`, nullable | Motivos cadastrados de ajuste. |
| `data_aprovacao` | `timestamptz`, nullable | Momento da aprovação. |
| `usuario_aprovador_id` | `uuid`, nullable | Master aprovador. |
| `hora_pagamento` | `time`, nullable | Hora da baixa efetiva. |
| `valor_original` | `numeric(12,2)`, nullable | Valor original, especialmente em ajustes/parcelas. |
| `juros_previstos` / `multa_prevista` / `desconto_previsto` | `numeric(12,2)`, default `0` | Valores previstos auxiliares. |
| `documento_numero` | `text`, nullable | Número documental. |
| `bpi_em` | `timestamptz`, nullable | Momento de BPI. |
| `codigo_sequencial` | `integer`, nullable | Código operacional. |
| `descricao_bancaria_original` | `text`, nullable | Texto original do extrato; protegido contra alteração. |
| `transferencia_id` | `uuid`, nullable | Transferência bancária relacionada. |
| `transferencia_lado` | `text`, nullable | `origem`, `destino` ou `tarifa`. |
| `transferencia_cofre_id` | `uuid`, nullable | Transferência banco/cofre relacionada. |
| `transferencia_cofre_lado` | `text`, nullable | Espelho bancário de banco/cofre. |
| `cofre_id` | `uuid`, nullable | Cofre relacionado. |

Não foram adicionadas colunas de pagamento/recebimento. Em particular, `data_recebimento` e `valor_pago` não existem.

## 3. Ajustes financeiros

O modelo possui `desconto_valor` + `desconto_tipo`, `acrescimo_valor` + `acrescimo_tipo` e os respectivos motivos. Os tipos aceitos pela aplicação são `valor` e `porcentagem`. A correção detalhada da interpretação R$ versus % não faz parte deste módulo; nesta etapa os campos apenas são preservados e usados pelo fluxo existente, sem alteração de cálculo além do necessário para não transformar uma previsão sinalizada em baixa.

Tarifa bancária aparece no fluxo de baixa/conciliação como diferença financeira e não como coluna própria de `lancamentos_financeiros`. Os tipos de diferença da conciliação incluem `juros`, `multa`, `desconto`, `tarifa`, `pagamento_parcial` e `ajuste_manual`.

## 4. Vínculos do domínio

- **`conciliacoes`**: liga `lancamento_id` a `transacao_banco_id`, com `grupo_conciliacao_id`, usuário conciliador e data. A tabela possui proteção para transferências e vínculo de auditoria.
- **`transacoes_banco`**: fonte bancária imutável, vinculada à conta e ao extrato importado. `data_transacao` é a data bancária que deve prevalecer quando a conciliação for realizada.
- **`contas_bancarias`**: conta do lançamento e base dos saldos. Os cálculos de saldo confirmado consideram apenas `pago` + `confirmado_master`; os cálculos operacionais consideram `pago`/`quitação_pendente`. Uma previsão sinalizada permanece `aberto` e, portanto, fica fora de ambos os efeitos de baixa.
- **`diferencas_financeiras`**: registra diferenças justificadas ligadas a uma conciliação.
- **`recorrencias`**: agrupa parcelas. A sinalização manual se aplica somente à parcela informada; as demais permanecem abertas e sem valor recebido.

### RLS e autoridade sobre o lançamento

`lancamentos_financeiros` está com RLS habilitado. A política de atualização permite alterações em lançamentos ainda não confirmados e exige `current_user_role() = 'master'` quando o lançamento já está em `status_aprovacao = confirmado_master`; a política de inserção exige que `user_id` e `usuario_criador_id` sejam o usuário autenticado. A aprovação Master não é concedida pelo formulário: a role e as funções autorizadas continuam sendo a autoridade do banco.

Na edição, o formulário pode enviar o estado visual do cadastro, mas o serviço deve preservar `status_aprovacao = confirmado_master` junto com `status_pagamento = pago` ou `pago_parcial` quando esse for o estado persistido. Editar dados cadastrais de um lançamento confirmado não é uma reabertura nem uma nova baixa; a RLS continua impedindo que usuários não Master alterem esse registro.

## 5. Fluxos de criação, edição e baixa

### Criação manual

`NovoLancamentoDrawer` mantém o mesmo controle e posição visual. O texto é contextualizado pelo tipo: `Já foi pago?` para saída e `Já foi recebido?` para entrada. A UI envia `ja_recebido`, `valor_recebido` e, se informada, `data_pagamento`, mas envia o pagamento como `aberto`. `lancamentosService.create` repete a regra no limite do serviço, evitando confiança exclusiva no estado visual.

Criação sem sinalização continua seguindo o cadastro manual, incluindo entidade, conta, categoria, centro de custo, recorrência e parcelas. Em recorrência, quando a primeira parcela é sinalizada, somente a primeira recebe `ja_recebido = true`, preserva o valor/data digitados e continua `aberto`; as demais recebem `ja_recebido = false`, `valor_recebido = 0`, `data_pagamento = null` e `status_pagamento = aberto`.

### Edição

A edição reidrata `ja_recebido`, `valor_recebido` e `data_pagamento`. Para uma previsão sinalizada que ainda não foi confirmada pelo Master, o serviço rejeita tentativa de editar diretamente para `pago` ou `pago_parcial` e mantém `status_pagamento = aberto`. A data/valor informados não são apagados apenas por serem uma previsão; a conciliação pode substituí-los pela data bancária e pelo valor efetivo quando ocorrer.

Se o registro já estiver em `status_aprovacao = confirmado_master` e `status_pagamento = pago` ou `pago_parcial`, a edição de campos cadastrais preserva ambos os estados; não envia o título de volta para `aberto`. Essa preservação é compatível com a política RLS `lancamentos_update_unconfirmed_or_master`: somente o Master pode editar o registro confirmado, e a edição não equivale a uma nova aprovação ou baixa.

### Baixa manual

A baixa financeira manual continua disponível para títulos não sinalizados, incluindo os fluxos existentes de AVR/BPI, sem alteração de seus cálculos e validações específicas. `baixaLancamento` rejeita uma baixa direta quando o título está sinalizado como já pago/recebido. A função `confirmarQuitacao` não constitui caminho alternativo: a quitação deve ser feita pela conciliação e pela decisão posterior prevista no domínio.

### Conciliação e aprovação

A conciliação cria os vínculos, registra a data bancária e coloca o lançamento em `quitação_pendente` + `digital`. Isso vale também quando o usuário conciliador é Master. A decisão/aprovação Master posterior é o ponto único que define `confirmado_master` e `pago`/`recebido`. Desvinculação ou reprovação retorna o lançamento operacionalmente para `aberto`; a sinalização `ja_recebido` de uma previsão manual não deve ser apagada indevidamente.

## 6. RPCs relevantes

| RPC | Uso | Contrato de estado |
|---|---|---|
| `conciliar_transacao_atomica` | Conciliação de um extrato com um ou mais títulos. | Vincula atomicamente e deve terminar em `quitação_pendente` + `digital`, independentemente da role. Preserva validações, diferenças e imutabilidade. |
| `criar_lancamento_a_partir_transacao_atomico` | Criação de lançamento originado de transação bancária e vínculo automático. | Deve criar o título como `quitação_pendente` + `digital`, nunca como pago/confirmado mesmo para Master. Usa a data bancária e o valor do extrato. |
| `desvincular_conciliacao_atomica` | Desvinculação de vínculo de conciliação. | Retorna o `status_pagamento` do lançamento ao estado operacional `aberto`, limpa `data_pagamento`/`valor_recebido` derivados da conciliação e preserva `ja_recebido`; a função não deve apagar a sinalização manual nem conceder aprovação. |
| `conciliar_transferencia_atomica` | Conciliação específica de um lado de transferência bancária. | Mantém o espelho em `quitação_pendente` durante a conciliação e conserva o vínculo específico; não deve ser substituída pela conciliação genérica. A aprovação da transferência permanece separada. |
| `fechar_periodo_conciliacao` | Fechamento do período bancário. | Mantém os lançamentos digitais/pendentes até a decisão do Master; a própria função atualiza a aprovação para `digital` sem definir pagamento definitivo. |
| `decidir_fechamento_conciliacao` | Aprovação/reprovação do fechamento pelo Master. | Aprovação define `confirmado_master` + `pago` (preservando `pago_parcial` quando aplicável); reprovação retorna a `aberto` e remove os efeitos bancários da decisão, sem apagar a sinalização de previsão sem necessidade. |
| `decidir_transferencia_bancaria` | Decisão de transferência bancária conciliada. | Aprovação Master é o ponto que define os espelhos como `confirmado_master` + `pago`; reprovação remove os vínculos, retorna os espelhos para `aberto` e reabre a transferência. |

### Inventário complementar de mutações financeiras

Além das RPCs centrais acima, o schema vigente contém os seguintes caminhos que inserem ou alteram campos de pagamento/aprovação em `lancamentos_financeiros`:

- `batch_full_payment`: rotina legada que define `pago`, `valor_recebido` e `data_pagamento` em lote; não é chamada pelo código atual e permanece registrada como ponto de atenção fora desta implementação.
- `criar_transferencia_atomica`: insere os espelhos de transferência com status inicial `aberto`; pertence ao fluxo de transferências bancárias.
- `conciliar_transferencia_atomica`: concilia um lado da transferência e coloca o espelho em `quitação_pendente`; pertence ao módulo de transferências.
- `decidir_transferencia_bancaria`: aprovação/reprovação Master dos espelhos de transferência.
- `estornar_transferencia_atomica`: remove vínculos e espelhos por estorno autorizado.
- `criar_transferencia_cofre`: insere o lançamento bancário da transferência banco/cofre como `aberto`/`digital`; pertence ao módulo Cofre Local.
- `decidir_transferencia_cofre`: aprovação/reprovação Master do lançamento bancário da transferência banco/cofre.
- `estornar_transferencia_cofre`: estorno autorizado do lançamento bancário do cofre.
- `criar_movimentacao_cofre`: em baixa direta vinculada, move o lançamento para o cofre e aplica os estados próprios da operação.
- `decidir_movimentacao_cofre`: aprovação/reprovação Master de baixa direta do cofre.
- `estornar_movimentacao_cofre`: estorno autorizado de movimentação vinculada ao lançamento.

Esses caminhos foram mapeados para a Etapa 1, mas não foram refatorados nesta entrega porque pertencem aos módulos de Transferências e Cofre Local. `confirmarQuitacao` é um método de service, não uma RPC; foi neutralizado para não oferecer atalho de alteração de status. O trigger `trg_proteger_previsao_sinalizada` protege especificamente previsões com `ja_recebido = true` sem alterar os contratos dos módulos fora deste escopo.

As funções de conciliação vigentes são `SECURITY DEFINER`, usam `search_path` controlado e mantêm autenticação, validação de role, locks e atomicidade. O schema remoto auditado também possui o trigger `trg_proteger_previsao_sinalizada`, que bloqueia a baixa direta de previsões sinalizadas fora dos contextos autorizados.

## 7. Matriz de transições

| Origem | Ação | Resultado permitido | Observação |
|---|---|---|---|
| Novo manual sem sinalização | Salvar | `aberto` + `ja_recebido = false` | Previsão normal. |
| Novo manual sinalizado | Salvar | `aberto` + `ja_recebido = true` | `valor_recebido`/`data_pagamento` podem ser preservados; não há baixa. |
| Edição manual sinalizada | Salvar | `aberto` + `ja_recebido = true` | Não pode virar `pago`/`pago_parcial`. |
| Edição de lançamento já confirmado | Salvar dados cadastrais | Preserva `confirmado_master` + `pago`/`pago_parcial` | A edição não reabre o título; a RLS exige role Master. |
| Parcela recorrente sinalizada | Salvar | Apenas a parcela indicada sinalizada e `aberto` | Demais parcelas permanecem `aberto`, sem valor/data de baixa. |
| Baixa direta de título sinalizado | Tentar baixa | **Rejeitada** | Serviço e trigger `trg_proteger_previsao_sinalizada` bloqueiam o atalho fora da conciliação. |
| Conciliação por usuário colaborador/gerente | Conciliar | `quitação_pendente` + `digital` | Não paga imediatamente. |
| Conciliação por usuário Master | Conciliar | `quitação_pendente` + `digital` | Master não encurta a máquina de estados. |
| Aprovação Master posterior | Aprovar | `confirmado_master` + `pago` | Para entrada, representa recebimento confirmado. |
| Reprovação/desvinculação da conciliação | Reprovar/desvincular | `aberto` operacional | Não apagar `ja_recebido` de previsão manual sem regra explícita. |
| AVR/BPI existente | Executar fluxo próprio | Estados próprios do fluxo | Fora da regra de previsão sinalizada; cálculos não foram refatorados. |

## 8. Pontos de contorno auditados e regra corrigida

1. O formulário construía `status_pagamento = pago` ou `pago_parcial` a partir do checkbox. Corrigido: o checkbox agora só persiste `ja_recebido`; o status enviado e o status garantido pelo serviço permanecem `aberto`.
2. O formulário mostrava “Já foi recebido / pago?” para os dois tipos. Corrigido: o texto agora diferencia saída e entrada sem mudar a posição do controle.
3. `lancamentosService.create` aceitava o status vindo da UI e ainda consultava saldo para um valor que era apenas sinalização. Corrigido: sinalização fica aberta e não participa da validação de saldo operacional.
4. A criação recorrente podia propagar status/valor de pagamento para todas as parcelas. Corrigido: somente a primeira parcela sinalizada preserva a informação digitada; as demais são abertas e zeradas.
5. `lancamentosService.update` aceitava estados definitivos enviados diretamente e não tinha a mesma regra da UI. Corrigido: tentativa de editar para `pago`/`pago_parcial` é rejeitada e previsão sinalizada é mantida aberta.
6. `baixaLancamento` não diferenciava uma baixa direta de um título previamente sinalizado. Corrigido no serviço: a tentativa é rejeitada e a conciliação permanece como caminho permitido.
7. A tela de pré-visualização e mensagens auxiliares apresentavam uma sinalização como pagamento operacional. Corrigido para manter o status visual como previsão aberta e informar que não há efeito de saldo.
8. A RPC `conciliar_transacao_atomica` tinha ramificação que pagava imediatamente quando a role era Master, e `criar_lancamento_a_partir_transacao_atomico` fazia o mesmo. No schema remoto auditado, ambas já terminam em `quitação_pendente` + `digital` e a aplicação cliente rejeita retorno incompatível. A proteção de banco vigente é `proteger_previsao_sinalizada`, acionada por `trg_proteger_previsao_sinalizada`.
9. O formulário enviava `status_pagamento = aberto` indiscriminadamente durante edição, o que poderia reabrir uma baixa já confirmada. Corrigido no contrato de edição: previsão sinalizada não confirmada continua aberta; lançamento com `confirmado_master` e `pago`/`pago_parcial` preserva os estados persistidos, sujeito à RLS e à role Master.

## 9. Limites desta etapa

Não foram criadas colunas, migrations, painéis Master, conciliação bancária completa, Cofre Local, transferências novas ou migração de dados históricos. A correção detalhada de R$ versus % de desconto/acréscimo/tarifa permanece fora do escopo.

A auditoria do schema remoto confirmou as funções de conciliação com a máquina de estados corrigida e o trigger de proteção da previsão sinalizada. Nenhum dado existente foi atualizado em massa; as funções mantêm `SECURITY DEFINER`, `search_path`, autenticação, roles, atomicidade, locks e validações existentes.
