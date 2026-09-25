# Fases 9 e 10 — contrato OFX futuro e matriz de testes

## 1. Contrato de importação

O contrato separa quatro camadas que não devem ser misturadas:

- `formato_arquivo`: `pdf`, `csv`, `xlsx` ou `ofx`. `ofx` está presente no contrato futuro, mas não pertence ao conjunto aceito pelo upload atual.
- `origem_extracao`: `texto` (PDF textual), `ocr` (PDF encaminhado ao OCR) ou `estruturado` (fonte tabular/estruturada, incluindo OFX quando houver parser).
- Dados bancários normalizados: data normalizada, valor com sinal, valor em centavos, tipo de movimento, descrição bancária normalizada, documento, hash da transação, localização no arquivo, confiança, alerta, formato, fonte e vínculo ao lote.
- Dados comerciais: entidade, categoria, centro de custo, condição, recorrência, descontos/acréscimos e demais campos de `lancamentos_financeiros`. Eles continuam fora de `transacoes_banco` e são criados pelos RPCs comerciais próprios.

`origem_arquivo` continua sendo a proveniência legada/compatível (`pdf_texto`, `pdf_ocr`, `csv`, `xlsx` e `ofx_estruturado` futuro). Os campos explícitos `formato_arquivo` e `origem_extracao` são a fonte de verdade do novo contrato; o campo combinado não deve ser usado para transportar dados comerciais.

O upload atual continua aceitando somente PDF, CSV e XLSX. Um nome `.ofx`, inclusive com MIME conhecido ou `application/octet-stream`, é rejeitado antes do upload, preview ou chamada da Edge Function. Não há parser OFX nem fluxo de confirmação OFX nesta fase.

Para compatibilidade com payloads antigos, as RPCs podem derivar o formato ausente somente de uma combinação MIME/extensão já validada: `application/pdf` + `.pdf`, `text/csv` + `.csv` e o MIME oficial de XLSX + `.xlsx`. Nenhum MIME desconhecido deve ser convertido em OFX ou em formato aceito.

## 2. Alteração de schema/RPC a aplicar via `execute_sql`

A alteração remota foi aplicada diretamente via `execute_sql`, sem criar arquivo de migration:

1. Adicionadas as colunas `formato_arquivo` e `origem_extracao` a `extratos_bancarios` e `transacoes_banco`.
2. Adicionados checks para `pdf/csv/xlsx/ofx`, `texto/ocr/estruturado` e `pdf_texto/pdf_ocr/csv/xlsx/ofx_estruturado`.
3. Lotes e transações existentes com MIME/proveniência reconhecidos receberam backfill seguro; registros legados sem origem persistida permanecem nulos e não são reinterpretados.
4. `preparar_importacao_extrato(jsonb)` agora valida/grava formato e fonte, deriva formato ausente por MIME/extensão e deixa OFX preparado server-side sem liberar o upload atual.
5. `confirmar_importacao_extrato(jsonb,jsonb,jsonb)` compara lote, formato, fonte e transações, valida a origem coerente e grava os quatro campos explícitos.
6. `protect_transacao_banco_immutable` passou a proteger também formato e fonte da extração.
7. RLS, grants, auditoria, ausência de `UPDATE` direto pelo cliente e `GRANT EXECUTE` das RPCs existentes foram preservados.

Foram verificadas as colunas, constraints, políticas RLS, triggers e grants após a aplicação. Não houve DML de negócio nem alteração de dados comerciais.

## 3. Matriz obrigatória e rastreável

Legenda: **A** = automatizado em `npm test`; **I** = integração em Supabase isolado; **M** = validação manual/fixture real; **P** = pendente, não alegar como aprovado.

| Ordem | Cenário | Cobertura/critério | Classe | Estado esperado |
|---:|---|---|:---:|---|
| 1 | Contrato de formatos e fontes | tipos incluem OFX futuro e fonte `estruturado`; upload continua rejeitando `.ofx`; MIME/extensão incompatíveis continuam rejeitados | A | Automatizado; confirmar resultado no `npm test` |
| 2 | Normalização/classificação CSV/XLSX | data BR/ISO, valores BRL, sinal, centavos, crédito/débito, documento opcional e hash determinístico | A | Automatizado; confirmar resultado no `npm test` |
| 3 | Negativos e marcadores CR/DB | CSV preserva negativo/parenteses; parser PDF mantém reconhecimento textual/layout de CR/DB sem habilitar OFX | A + M | A parcial; classificação PDF real requer fixture bancária |
| 4 | Descrição multilinha | campo CSV entre aspas preserva quebras de linha; no PDF, linhas contínuas devem ser unidas sem perder proveniência | A + M | CSV A; PDF M/P sem nova fixture artificial |
| 5 | Duplicidade | hash/fingerprint duplicado no arquivo e transação já importada por hash são bloqueados | A + I | A para contrato; reimportação I/P |
| 6 | Páginas, totais e saldos | páginas contínuas, contagem, totais de entradas/saídas e equação saldo inicial + entradas - saídas = saldo final | A + M | A com objetos contratuais; valores reais PDF M/P |
| 7 | Falhas e cancelamento | erro de parser/confirmar chama cancelamento e remoção do temporário; lote confirmado não é removido | A + I | A estático/serviço; execução real I/P |
| 8 | Reimportação | mesmo `arquivo_hash` não cria novo lote; storage original permanece vinculado ao lote confirmado | I | P até Supabase isolado |
| 9 | Segurança e imutabilidade | cliente não edita formato, fonte, arquivo original ou dados normalizados; INSERT/UPDATE ocorre por RPC/server-side; RLS, grants e auditoria permanecem | A + I | A verifica contrato; I/P verifica banco remoto isolado |
| 10 | Separação comercial | transação contém somente dados bancários/proveniência; dados comerciais permanecem nos payloads/RPCs de `lancamentos_financeiros` | A + I | A por tipos/payload; I/P por schema/RPC |
| 11 | PDF textual de vários bancos | fixtures reais de bancos distintos, sem reserialização, com identificação, contagem e classificação preservadas | M | P; depende de extratos reais controlados |
| 12 | PDF com tabela tradicional | colunas de data, descrição, documento, crédito/débito e valor são reconstruídas sem deslocamento | M | P; depende de fixture real |
| 13 | PDF com crédito e débito em colunas diferentes | crédito e débito em colunas distintas convertem para sinal e `tipo_movimento` corretos | M | P; depende de fixture real |
| 14 | PDF com valores negativos | sinal negativo, débito e centavos permanecem consistentes | A + M | A cobre contrato CSV; PDF real permanece P |
| 15 | PDF com CR e DB | marcadores CR/DB são reconhecidos sem confundir direção | A + M | A verifica o contrato do parser; PDF real permanece P |
| 16 | PDF com descrições em múltiplas linhas | descrição original preservada, normalização sem perda e hash baseado nos dados bancários | A + M | CSV A; PDF real permanece P |
| 17 | PDF com várias páginas | páginas contínuas, localização de origem e contagem são compatíveis | A + M | A cobre a regra; PDF real permanece P |
| 18 | PDF escaneado | detecção encaminha para OCR backend-only, sem credencial no navegador | M + I | P; depende de fixture escaneada e OCR isolado |
| 19 | PDF com OCR imperfeito | confiança/alerta/revisão são sinalizados e não confirmados silenciosamente | M + I | P; depende de fixture OCR real |
| 20 | PDF com saldo e totais | entradas, saídas e equação de saldo são compatíveis ou explicitamente sinalizadas | A + M | A cobre a regra; PDF real permanece P |
| 21 | PDF sem saldo | importação não inventa saldo; ausência é aceita ou alertada conforme o contrato | M | P; depende de fixture real |
| 22 | PDF com cabeçalho e rodapé repetidos | elementos repetidos não viram transações nem alteram totais | M | P; depende de fixture real |
| 23 | PDF com transação duplicada | duplicidade por assinatura/hash bloqueia confirmação | A + I | A cobre contrato; reimportação real permanece P |
| 24 | PDF parcialmente ilegível | item ambíguo vira pendência/alerta e impede confirmação silenciosa | M + I | P; depende de fixture real |
| 25 | PDF textual real | fixture PDF real, sem reserialização, com contagem, páginas, descrições, direção, documentos, totais e saldos confirmados | M | P; depende de execução controlada e evidência do banco |
| 26 | PDF OCR real | fixture PDF escaneada real e infraestrutura OCR isolada; validar fonte `ocr`, confiança, alertas e revisão | M + I | P; não há fixture artificial nem credencial nesta suíte |
| 27 | Usuário não autenticado | upload, preparação, confirmação e consultas protegidas rejeitam a operação | I | P; Supabase isolado |
| 28 | Usuário tentando usar caminho de outro usuário | storage path, proprietário e lote devem corresponder à sessão autenticada | A + I | A por contrato do código; I/P remoto |
| 29 | Alteração direta da data | trigger rejeita alteração da data normalizada/original | I | P; mutação somente em ambiente isolado |
| 30 | Alteração direta do valor | trigger/constraints rejeitam valor ou centavos divergentes | A + I | A por contrato; I/P remoto |
| 31 | Alteração direta da descrição | trigger rejeita alteração da descrição original/normalizada | I | P; mutação somente em ambiente isolado |
| 32 | Exclusão de transação conciliada | trigger rejeita exclusão de transação confirmada ou conciliada | I | P; mutação somente em ambiente isolado |
| 33 | Reimportação | hash do arquivo e hash da transação impedem duplicidade | A + I | A cobre contrato; I/P remoto |
| 34 | Falha no processamento após upload | erro limpa lote temporário e objeto sem remover lote confirmado | A + I | A cobre contrato; I/P remoto |
| 35 | Cancelamento da importação | cancelamento autorizado encerra lote temporário e remove arquivo temporário | A + I | A cobre contrato; I/P remoto |
| 36 | Divergência entre totais | confirmação bloqueia divergência crítica ou registra alerta explícito conforme o contrato | A + M/I | A cobre regra; PDF/Supabase real permanece P |
| 37 | OFX futuro | parser, upload/preview/confirm e persistência OFX somente após implementação própria | M/I futuro | P por definição; não faz parte da aprovação desta fase |

## 4. Critérios de aprovação da solicitação

A solicitação só deve ser aprovada quando: (a) PDF textual, CSV e XLSX permanecerem funcionando; (b) OFX continuar rejeitado no fluxo atual; (c) formato, fonte, hash, storage, lote, proveniência e imutabilidade forem validados no server-side; (d) transações bancárias não receberem campos comerciais; (e) RLS, grants e auditoria forem verificados sem bypass de autenticação; (f) `npm test`, type check e build passarem; e (g) os itens PDF/OCR real, integração Supabase e OFX futuro permanecerem identificados como pendentes, nunca como testes aprovados.

## 5. Ordem recomendada de execução

1. Aplicar o schema/RPC acima via `execute_sql` e fazer as verificações read-only.
2. Rodar `npm test`, type check e build.
3. Em projeto Supabase isolado, executar somente a integração explicitamente habilitada e limpar o lote temporário por RPC.
4. Fazer a validação manual do PDF real textual; registrar contagens/totais/saldos somente se observados.
5. Fazer OCR real somente com fixture fornecida e infraestrutura isolada.
6. Deixar OFX para uma fase posterior com parser e testes próprios.

Nenhuma fixture nova nesta matriz afirma representar banco real. As fixtures existentes continuam sendo evidências reais já versionadas; os cenários sem fixture ou sem ambiente isolado permanecem pendentes.

## 6. Limitações desta entrega

- Nenhuma mutação de negócio foi executada por teste contra produção.
- Nenhum teste depende de segredo ou credencial.
- Nenhum parser OFX foi criado.
- PDF/OCR real e reimportação em Supabase isolado não são mascarados como aprovados.
- O schema remoto foi atualizado, mas os cenários de integração isolada e validação manual com extratos reais continuam pendentes.
