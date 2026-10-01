# Extrato inteligente — compatibilidade técnica e auditoria

**Natureza:** especificação normativa e registro da auditoria do fluxo implementado. O código e o schema remoto devem continuar sendo tratados como fontes de verdade; qualquer correção SQL pendente deve ser aplicada diretamente no ambiente pelo responsável pelo banco, sem migration.

## 1. Baseline observado

### 1.1 Supabase remoto

- As tabelas centrais são `extratos_bancarios`, `transacoes_banco`, `conciliacoes`, `diferencas_financeiras` e `contas_bancarias`. `extratos_bancarios` possui `metadata` (`jsonb`), `arquivo_hash` único, `storage_path` único, `status`, `formato_arquivo` e `origem_extracao`; **não possui `updated_at`**.
- `transacoes_banco` possui `data_transacao`, `data_original`, `valor`, `valor_centavos`, `descricao_banco`, `descricao_original`, `numero_documento`, `tipo_movimento`, `hash_transacao` único, `pagina_origem`, `linha_origem`, `arquivo_nome`, `arquivo_hash`, `extrato_lote_id`, `confianca_extracao`, `motivo_alerta`, `origem_arquivo`, `formato_arquivo`, `origem_extracao` e `estado_revisao` (`valida`/`pendente_revisao`).
- `transacoes_banco` tem RLS, leitura/remoção autorizadas para `authenticated` conforme as policies existentes e não deve receber `INSERT`/`UPDATE` direto do cliente. A gravação de transações continua exclusivamente por `confirmar_importacao_extrato` server-side.
- As assinaturas relevantes observadas são:
  - `preparar_importacao_extrato(jsonb) RETURNS extratos_bancarios`;
  - `revalidar_preview_extrato(uuid,jsonb) RETURNS jsonb`;
  - `confirmar_importacao_extrato(jsonb,jsonb,jsonb DEFAULT '{}'::jsonb) RETURNS extratos_bancarios`;
  - `marcar_importacao_erro(uuid,jsonb) RETURNS void`;
  - `cancelar_importacao_extrato(uuid) RETURNS extratos_bancarios`.
- `confirmar_importacao_extrato` recebe o lote como objeto JSON (`p_lote`), não como UUID isolado; busca o lote real por `id`, trava-o, confere os campos contra o registro persistido e só aceita `status = 'em_validacao'`. O schema não possui `updated_at` em `extratos_bancarios`; `estado_revisao` existe em `transacoes_banco` e é validado no fluxo de confirmação.
- O inventário atual contém `openai_cleanup_queue`, com identificador remoto único, tentativas, próxima tentativa, status e timestamps. Seu acesso deve permanecer restrito ao backend/service role.

### 1.2 Código atual

- O upload usa o bucket privado `bank-statements`, caminho `<user_id>/<lote_id>/<nome-sanitizado>`, limite de 20 MiB (`20 * 1024 * 1024`) e SHA-256 dos bytes do arquivo no navegador. A Edge Function `parse-bank-statement` repete validações de proprietário, MIME, tamanho, bytes e hash.
- O fluxo atual aceita PDF, CSV e XLSX; OFX permanece apenas previsto no tipo, sem upload/parser de OFX. A Edge Function usa OpenAI Files (`purpose: user_data`) e Responses (`gpt-4o` com Structured Outputs) somente no backend para PDF.
- O frontend chama `preparar_importacao_extrato`, `revalidar_preview_extrato` antes da confirmação e `confirmar_importacao_extrato`; o preview é editável no cliente e não grava `transacoes_banco`.
- O código calcula `hash_transacao` com a serialização canônica `v1`, incluindo valor em centavos, texto NFC normalizado, comprimento UTF-8, conta e página/linha; a RPC PostgreSQL `calcular_hash_transacao` usa o mesmo template.
- O código mantém `estado_revisao`, proveniência, confiança e página/linha no preview e envia esses campos à confirmação; a persistência das transações continua exclusiva da RPC de confirmação.

## 2. Decisões e contrato implementado

### 2.1 OpenAI Files + Responses

A Edge Function `parse-bank-statement` é o único componente autorizado a usar `OPENAI_API_KEY`. O navegador nunca recebe a chave, o service role ou o arquivo remoto da OpenAI.

1. Fazer upload dos bytes do PDF na Files API com `purpose: "user_data"`. Guardar apenas o `file_id` transitório em memória.
2. Chamar a Responses API usando um item de conteúdo `{ "type": "input_file", "file_id": "..." }` e um item `input_text` com as instruções de extração. Não usar `choices[0].message.content` nem `response_format` de Chat Completions.
3. Solicitar Structured Outputs em `text.format`, com `type: "json_schema"`, nome fixo do schema, `strict: true`, propriedades obrigatórias e `additionalProperties: false`. O schema da IA deve representar dados de extração; campos derivados, hash, `valor_centavos`, proveniência final e estado de revisão serão validados/produzidos server-side.
4. Percorrer `response.output[]` e, em cada item, `content[]`. Consumir somente conteúdo `type: "output_text"`; localizar e tratar explicitamente conteúdo `type: "refusal"` como falha não confirmável. Não presumir que `output_text` exista nem que Structured Outputs elimine recusas.
5. Aplicar timeout de 45 segundos por tentativa. O backoff e a segunda tentativa ficam restritos a respostas 429 ou 5xx; timeout, erro de transporte, erro 4xx permanente, schema inválido, JSON inválido, `refusal`, arquivo incompatível e falha de validação determinística encerram a tentativa sem retry. O limite de duas tentativas não autoriza repetir indiscriminadamente falhas não transitórias.
6. Em qualquer término, tentar apagar o `file_id` na Files API. Se a exclusão falhar, registrar somente o identificador e dados operacionais mínimos em `openai_cleanup_queue`; nunca registrar PDF, base64, prompt, resposta completa ou dados financeiros no log/metadata.

**Estado auditado:** Edge Function OpenAI, schema Structured Outputs, timeout de 45 segundos por tentativa, no máximo duas tentativas, secret apenas no backend e cleanup imediato com fila de contingência estão presentes no código. A configuração/deploy dos secrets e a rotina consumidora da fila permanecem operações de ambiente.

### 2.2 Contrato canônico de bytes e hash

A decisão única para a assinatura `hash_transacao` é SHA-256 em hexadecimal minúsculo dos bytes UTF-8 da serialização canônica versão `v1`. O template de bytes é `v1|<conta_bancaria_id>|<data_transacao>|<valor_centavos>|<len_descricao>:<descricao>|<len_documento>:<documento>|<pagina_origem>|<linha_origem>`, sem espaços adicionais: os campos textuais usam o comprimento em bytes UTF-8 e os demais têm formatos fechados (`uuid`, `YYYY-MM-DD`, inteiro decimal e inteiro positivo). A versão (`v1`) também é parte dos bytes.

Regras normativas, sem alternativas:

- texto: Unicode **NFC**;
- caixa: **maiúsculas** (`toUpperCase`/`upper` conforme a implementação homologada);
- espaços: remover espaços externos e colapsar qualquer sequência de whitespace em um único espaço ASCII;
- diacríticos: **preservar**; não usar NFD/NFKD nem remover acentos;
- números: nunca serializar float; `valor_centavos` é inteiro decimal com sinal (`-` quando débito), sem separador de milhar, zeros artificiais ou notação científica; `valor` é derivado de `valor_centavos / 100`;
- data: `YYYY-MM-DD`; documento ausente: campo textual vazio após normalização;
- `pagina_origem` e `linha_origem`: inteiros positivos e sempre presentes na serialização; no PDF inteligente são a localização extraída e verificada, e em CSV/XLSX a implementação deve usar página lógica `1` e a linha física do registro. Não usar `null`, zero ou índice artificial para esconder proveniência ausente.

Deno e PostgreSQL devem produzir exatamente os mesmos bytes e o mesmo hash para os vetores de fixture. A implementação fica bloqueada até fixtures vetoriais cobrirem, no mínimo, NFC pré-composto/decomposto, maiúsculas, whitespace, acentos preservados, documento vazio, débito/crédito e números negativos. **A homologação da serialização entre Deno/PostgreSQL ainda deve ocorrer; não há fixtures reais aprovadas neste documento.** O hash calculado no cliente é apenas prévia e nunca autoridade.

Política de colisões: reimportação do mesmo arquivo é bloqueada pelo `extratos_bancarios.arquivo_hash`; uma assinatura `hash_transacao` já existente bloqueia a confirmação. Transações legítimas com os mesmos dados econômicos, mas linhas diferentes, distinguem-se por página/linha. Não se adiciona sal aleatório ao hash. Se ainda houver colisão na mesma página/linha, o lote fica não confirmável e exige decisão de produto/schema/RPC futura; não será contornada por inserção direta.

### 2.3 Lote, preview, revalidação e confirmação

1. **Preparação:** somente `master` ou `gerente` inicia. O upload e `preparar_importacao_extrato(p_lote)` criam um lote `em_validacao`. A conta deve ser ativa e o usuário autenticado deve ser o proprietário.
2. **Processamento/preview:** a função recebe um identificador de lote e `storage_path`, mas a conta, o proprietário, o nome, tamanho, MIME, hash e formato canônicos são lidos do lote real no banco e do objeto Storage. Payload do cliente é locator/eco, nunca autoridade. O preview não grava `transacoes_banco`.
3. **Revisão:** cada transação precisa manter `data_original`, `descricao_original`, localização, origem, confiança e alertas. Qualquer edição exige `revalidar_preview_extrato` server-side; a RPC recalcula valor, direção, normalização, centavos e `hash_transacao` a partir do lote real, sem alterar transações confirmadas.
4. **Confirmação:** antes de chamar `confirmar_importacao_extrato`, o cliente bloqueia erros para UX e a RPC repete as validações. Ela trava o lote, confere `status = 'em_validacao'`, conta/lote/Storage, contagem, páginas, totais, duplicidade, origem, hashes e vínculos. Só então uma única operação autorizada insere transações.
5. **Revisão obrigatória:** todo item de `p_transacoes` deve chegar com `estado_revisao = 'valida'`; qualquer ausência, `pendente_revisao`, baixa confiança, página/linha inválida ou erro crítico bloqueia a confirmação. A coluna existe no schema real e a confirmação não aceita estado inválido.
6. O escopo permanece `master`/`gerente` para importar e confirmar lote. `colaborador` não ganha permissão por este documento. Nenhum cliente grava diretamente em `transacoes_banco`; conciliação e demais efeitos continuam nos RPCs existentes e na aprovação Master quando aplicável.
7. `revalidar_preview_extrato(uuid, jsonb) RETURNS jsonb` recebe apenas o `p_lote_id` e o array editado, busca o lote real, autoriza o proprietário ou `master`/`gerente`, recalcula normalização, valor em centavos, hash e estado de revisão, e não altera transações confirmadas. A confirmação consome o resultado revalidado e repete integralmente as regras.
8. `marcar_importacao_erro(uuid, jsonb) RETURNS void` bloqueia o lote com `FOR UPDATE`, exige usuário autenticado autorizado, aceita somente lote `em_validacao`, limita código, fase, mensagem e tentativa, e não referencia `updated_at`. A alteração é transacional e não pode sobrescrever lote confirmado.

### 2.4 Proveniência e campos de transação

O payload `p_transacoes` deve usar os nomes do schema observado: `data_transacao`, `data_original`, `valor`, `valor_centavos`, `descricao_banco`, `descricao_original`, `numero_documento`, `tipo_movimento`, `hash_transacao`, `pagina_origem`, `linha_origem`, `arquivo_nome`, `arquivo_hash`, `extrato_lote_id`, `formato_arquivo`, `origem_extracao`, `origem_arquivo`, `confianca_extracao`, `motivo_alerta` e `estado_revisao`. `estado_revisao` existe como coluna no schema real e é protegido pela trigger de imutabilidade. Dados comerciais não entram neste payload; permanecem nos fluxos de `lancamentos_financeiros`.

Para PDF: `formato_arquivo = 'pdf'`, `origem_extracao` é `texto` ou `ocr`, e `origem_arquivo` é respectivamente `pdf_texto` ou `pdf_ocr`. Para CSV/XLSX estruturado, usar `origem_extracao = 'estruturado'` e `origem_arquivo` igual a `csv` ou `xlsx`. OFX não é liberado pelo fluxo atual.

## 3. Metadata fechado da confirmação

`p_metadata` é metadata **do lote**, não campo de `transacoes_banco`. A implementação futura deve enviar somente os nomes abaixo; o registro completo será salvo em `extratos_bancarios.metadata`, mas a decisão da RPC usa explicitamente estes campos:

| Nome exato | Regra de uso pela RPC atual/futura |
|---|---|
| `reviewState` | obrigatório; `validated` somente quando não houver pendência |
| `pendingReviewCount` | obrigatório; deve ser `0` para confirmar |
| `consistency.criticalErrors` | obrigatório; array vazio para confirmar |
| `sourceOrigin` | obrigatório; `texto`, `ocr` ou `estruturado`, compatível com o lote |
| `extractedCount` | obrigatório; igual a `jsonb_array_length(p_transacoes)` |
| `reportedTransactionCount` | opcional; se presente, igual à quantidade extraída |
| `pages` | obrigatório para PDF; inteiro não negativo, sequência de páginas validada |
| `periodStart`, `periodEnd` | opcionais; quando ambos presentes, todas as datas devem estar no intervalo |
| `parserTotals.entries`, `parserTotals.exits` | opcionais; quando presentes, conferidos em centavos com tolerância de 1 centavo |
| `openingBalance`, `closingBalance` | opcionais; quando ambos presentes, conferidos pela equação do saldo com tolerância de 1 centavo |
| `bankIdentified` | opcional; apenas identificação textual do banco |

`totalEntries`, `totalExits`, `ocrCount`, `alerts`, `parserMetadata`, `consistency` além de `criticalErrors` e `rawTransactions` são atualmente enviados/armazenados pelo serviço, mas não substituem os campos acima nem devem ser tratados como autorização. Não serão inventados novos nomes camelCase para contornar a RPC. Metadata de provedor OpenAI não deve conter conteúdo bruto; se for necessário persistir modelo/request id, isso exige extensão explícita do contrato e verificação de tamanho/segurança antes de aplicação.

O objeto `p_lote` deve conter os nomes existentes `id`, `conta_bancaria_id`, `arquivo_nome`, `arquivo_tamanho`, `arquivo_mime_type`, `arquivo_hash`, `storage_path`, `importado_por`, `formato_arquivo` e `origem_extracao`. Mesmo recebendo esses campos, a confirmação usa o lote e a conta reais do banco e rejeita divergência.

## 4. Storage e `openai_cleanup_queue`

- O arquivo original permanece no bucket privado `bank-statements`; o caminho deve ser restrito ao usuário autenticado e ao `id` do lote, sem `..`, sem caminho de outro usuário e com MIME/tamanho/hash conferidos no Storage e na tabela.
- O limite fechado do arquivo é `1..20 MiB` (20.971.520 bytes). PDF inteligente deve rejeitar arquivo vazio, MIME/extensão incompatíveis e bytes cujo SHA-256 não corresponda a `arquivo_hash`. Não criar bucket de imagens intermediárias para esta fase; processar em memória ou não prosseguir.
- Upload, leitura, remoção de temporário e acesso ao objeto conservam o escopo `master`/`gerente`; lote `confirmado` não deve ser removido pelo cleanup automático. O processamento de lote de outro usuário autorizado usa o owner persistido do lote, nunca o caminho fornecido pelo cliente como autoridade.
- `public.openai_cleanup_queue` existe no schema auditado, com identificador remoto único, tentativas, próxima tentativa, status e timestamps, RLS sem acesso de `authenticated` e grants de backend. A fila só recebe IDs quando `files.delete` falhar; não é fila de transações nem substitui a exclusão imediata.
- O worker consumidor da fila deve processar com lock/idempotência, backoff e limite de tentativas, sem expor o `openai_file_id` ao navegador; sua implantação permanece operação de ambiente.

## 5. Paginação e limites estritos

A leitura inteligente de PDF tem limite de **15 páginas**, além do limite de 20 MiB. A função conta as páginas nos bytes efetivamente processados, rejeita contagem ausente/zero/maior que 15 e exige `pagina_origem` entre 1 e `pages` e `linha_origem >= 1` em cada transação. Para `pages > 1`, toda página de `1..pages` deve aparecer na proveniência; página faltante, página repetida sem linhas verificáveis ou linha inventada bloqueia preview/confirm. O número de página do modelo é evidência, não autorização: a confirmação SQL confronta seus limites com `pages`.

O código atual valida 20 MiB, assinatura real do PDF, conta páginas nos bytes processados e rejeita mais de 15 páginas; também propaga páginas e exige proveniência verificável. As consultas de leitura da aplicação permanecem paginadas estritamente por `.range(from,to)`; o helper usa páginas de 500 registros e não deve ser trocado por `select('*')` sem paginação.

## 6. Matriz de pré-requisitos e ordem de implementação

| Ordem | Pré-requisito/verificação | Estado neste documento |
|---:|---|---|
| 1 | Auditar schema/RPC real, inclusive ausência de `updated_at` em `extratos_bancarios` e presença de `estado_revisao` | concluído; verificação remota realizada |
| 2 | Homologar fixtures vetoriais de bytes/hash entre Deno e PostgreSQL | pendente; requer execução de vetores no ambiente |
| 3 | Verificar revalidação, `estado_revisao`, limite de páginas, fila e policies necessárias | revalidação, imutabilidade, autorização, fila, limites e policies efetivas verificadas |
| 4 | Implementar Edge Function com Files `user_data`, Responses `input_file`, `text.format`, parsing de `output[].content[]`, `refusal`, retry/timeout e cleanup | concluído no código; limite de duas tentativas e timeout de 45 segundos por tentativa |
| 5 | Verificar Storage privado, owner, MIME, tamanho, bytes e retenção do lote em todas as transições | validações de código/RPC e policies efetivas verificadas |
| 6 | Implementar preview sem escrita, revalidação server-side e confirmação atômica via RPC | concluído no código/RPC; confirmação permanece a única escrita de transações |
| 7 | Executar typecheck/testes de contrato, integração Supabase isolada e fixtures PDF controladas; registrar resultados sem promover pendências a aprovadas | typecheck focado executado; integração/fixtures reais permanecem pendentes |
| 8 | Adaptar cliente/serviços sem alterar CSV/XLSX, sem mudar layout/hooks e sem INSERT direto em `transacoes_banco` | concluído no escopo desta correção |

Esta entrega não altera `Conciliacao.tsx`, hooks, dependências ou o fluxo CSV/XLSX. O código editado cobre a Edge Function PDF, o serviço/tipos de importação e este documento. A auditoria remota confirmou as tabelas, RPCs, trigger de imutabilidade, grants e policies observáveis; as correções SQL foram aplicadas diretamente no ambiente, sem migration. Permanecem apenas a homologação dos vetores de hash e a verificação operacional do worker de cleanup.
