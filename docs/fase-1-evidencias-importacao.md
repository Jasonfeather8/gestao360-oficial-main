# Fase 1 — evidências dos arquivos de importação

## Escopo e método

Este documento registra somente a inspeção dos anexos e a comparação documental com o código atual do importador. Os três arquivos abaixo foram copiados para `tests/fixtures/fase-1/` com `copy_file`, sem reserialização ou edição do conteúdo.

Não houve importação no Supabase, execução do parser PDF, execução de teste automatizado, cálculo de SHA-256 ou alteração de código da aplicação. Portanto, os itens que dependem dessas operações estão marcados como **pendentes/não executados**, e não como aprovados.

As contagens e os valores dos CSVs foram obtidos pela leitura do conteúdo dos arquivos anexados. Os tamanhos são os registrados no manifesto de anexos (`.dyad/media/attachments-manifest.json`).

## Fontes e fixtures

| Evidência | Nome original da fonte | Arquivo anexado armazenado | Fixture versionada | MIME | Tamanho conhecido |
|---|---|---|---|---|---:|
| CSV de saídas | `Saídas-21_09_2026 18_37_22.csv` | `8b8d068321a6d3790a3626c4152f521c69c4ee2bd9ef8df575246ae2a35eda44.csv` | [`tests/fixtures/fase-1/saidas-2026-09-21.csv`](../tests/fixtures/fase-1/saidas-2026-09-21.csv) | `text/csv` | 2.866 bytes |
| CSV de entradas | `Entradas-21_09_2026 18_28_15.csv` | `b4504bb239a4b37f17cdfbdfda7fd04c7d4c73e725f4411b28d5d4fa97e75ecc.csv` | [`tests/fixtures/fase-1/entradas-2026-09-21.csv`](../tests/fixtures/fase-1/entradas-2026-09-21.csv) | `text/csv` | 2.072 bytes |
| PDF do Cora | `mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf` | `10169f1d30b1dc902a382a80aaabb6a28a46080ca1754d802c17ac827431df7e.pdf` | [`tests/fixtures/fase-1/cora-mesquita-administracoes-14092026-a-22092026.pdf`](../tests/fixtures/fase-1/cora-mesquita-administracoes-14092026-a-22092026.pdf) | `application/pdf` | 219.326 bytes |

O PDF é o arquivo binário real do Cora fornecido para a evidência. O período `14/09/2026 a 22/09/2026` é **inferido exclusivamente do nome original**; o conteúdo binário não foi extraído nesta análise. O identificador `2d1a141c` também é apenas o sufixo presente no nome original.

## Análise observada dos CSVs

### Estrutura comum observada

- Delimitador observado: `;` (ponto e vírgula).
- Codificação/leitura: conteúdo textual com finais de linha CRLF visíveis na fonte anexada; não foi feita conversão do arquivo da fixture.
- Cabeçalho exato do CSV de saídas: `Pago;Data;Data de Competência;Data de Vencimento;Descrição;Fornecedor;Conta;Categoria;Centro de Custo;Ref.;Anotações;Valor`.
- Cabeçalho exato do CSV de entradas: `Recebido;Data;Data de Competência;Data de Vencimento;Descrição;Cliente;Conta;Categoria;Centro de Custo;Ref.;Anotações;Valor`.
- Não há coluna chamada `Documento`. As colunas `Ref.` e `Anotações` estão vazias em todas as linhas observadas.
- Os valores estão no formato brasileiro com `R$`, ponto de milhar quando aplicável e vírgula decimal.

### Matriz de evidência observada

| Arquivo | Linhas físicas | Transações (linhas após cabeçalho) | Datas em `Data` | Datas de competência | Vencimentos | Conta | Direção evidenciada pela fonte | Documentos | Total observado |
|---|---:|---:|---|---|---|---|---|---|---:|
| `saidas-2026-09-21.csv` | 16 | 15 | todas `10/06/2026 00:00` | todas `10/01/2026 00:00` | 6 em `30/12/2025`, 8 em `03/01/2026`, 1 em `10/01/2026` | `STONE PAGAMENTOS S.A` | saídas/débitos pelo nome original `Saídas` e pelos valores listados; os valores não têm sinal negativo | ausentes: sem coluna de documento; `Ref.` e `Anotações` vazias | **R$ 6.412,74** |
| `entradas-2026-09-21.csv` | 10 | 9 | todas `10/06/2026 00:00` | 7 em `10/02/2026`, 2 em `10/01/2026` | 7 em `09/01/2026`, 2 em `12/02/2026` | `BANCO CORA` | entradas/créditos pelo nome original `Entradas` e pelos valores listados; os valores não têm sinal positivo explícito | ausentes: sem coluna de documento; `Ref.` e `Anotações` vazias | **R$ 22.757,25** |
| **Soma conjunta** | **26** | **24** | — | — | — | duas contas/fontes | 15 saídas + 9 entradas | nenhum documento observado nos CSVs | **R$ 29.169,99** |

A soma conjunta acima é a soma aritmética dos valores transcritos dos dois CSVs, sem atribuí-la a saldo bancário.

### Descrições e valores transcritos

**Saídas — 15 transações, total R$ 6.412,74**

| # | Descrição observada | Valor |
|---:|---|---:|
| 1 | `SETHAC - SINDICATO MOC (6/12)` | R$ 54,00 |
| 2 | `PREPOSTA IF (6/12)` | R$ 200,00 |
| 3 | `MOBPONTO ASAAS GESTÃO FINANCEIRA S A (6/12)` | R$ 85,00 |
| 4 | `GCI CAIXA - HABITAÇÃO (6/12)` | R$ 2.189,75 |
| 5 | `MICRONET - MESQUITA (6/12)` | R$ 146,71 |
| 6 | `INTERNET AP (6/12)` | R$ 70,00 |
| 7 | `COELBA BAHIA - PORTTINARI (6/12)` | R$ 130,00 |
| 8 | `COELBA LOTE RUA PM (6/12)` | R$ 70,00 |
| 9 | `VIVO - 7798845-6500, 7799911-8383 (6/12)` | R$ 196,58 |
| 10 | `VIVO  - 7799990-0767 (6/12)` | R$ 60,55 |
| 11 | `VIVO - 7799904-8383 (6/12)` | R$ 51,20 |
| 12 | `VIVO - 7799912-8383 (6/12)` | R$ 51,20 |
| 13 | `VIVO - 77 99906-8383 (6/12)` | R$ 58,75 |
| 14 | `PEDIDO IF (6/12)` | R$ 3.000,00 |
| 15 | `VIVO 77 99930-8383  (6/12)` | R$ 49,00 |

**Entradas — 9 transações, total R$ 22.757,25**

| # | Descrição observada | Valor |
|---:|---|---:|
| 1 | `ALUGUEL DA SALA COMERCIAL DO TERMINAL RODOVIARIO DE SAMAVI (5/12)` | R$ 3.508,13 |
| 2 | `ALUGUEL DA SALA COMERCIAL DO TERMINAL RODOVIARIO DE SAMAVI (5/12)` | R$ 2.929,92 |
| 3 | `ALUGUEL DA SALA COMERCIAL DO TERMINAL RODOVIARIO DE SAMAVI (5/12)` | R$ 2.426,53 |
| 4 | `ALUGUEL DA SALA COMERCIAL DO TERMINAL RODOVIARIO DE SAMAVI (5/12)` | R$ 1.213,27 |
| 5 | `ALUGUEL DA SALA COMERCIAL DO TERMINAL RODOVIARIO DE SAMAVI (5/12)` | R$ 5.224,87 |
| 6 | `ALUGUEL DORMITORIO/MOTORISTAS TERMINAL RODOVIARIO DE SAMAVI (6/12)` | R$ 1.096,31 |
| 7 | `ALUGUEL QUIOSQUE DO TERMINAL RODOVIARIO DE SAMAVI (6/12)` | R$ 557,42 |
| 8 | `ALUGUEL DE SALA COMERCIAL (5/12)` | R$ 1.963,78 |
| 9 | `ALUGUEL DE SALA COMERCIAL (5/12)` | R$ 3.837,02 |

## PDF: evidência disponível e limitação

| Item | Situação |
|---|---|
| Presença do arquivo | Observada: o anexo existe, é `application/pdf` no manifesto e tem 219.326 bytes conhecidos. |
| Natureza | Registrado como PDF binário real do Cora no escopo desta fase; não houve alteração no conteúdo ao copiá-lo. |
| Período | Inferido do nome original: `14/09/2026` a `22/09/2026`. Não confirmado por extração do conteúdo. |
| Conta | Não confirmada por leitura do PDF. O nome contém `mesquita-administracoes`, mas isso não é tratado como conta bancária observada. |
| Transações, descrições, créditos/débitos e documentos | Não extraídos; quantidade e valores não são afirmados. |
| Saldos inicial/final e totais de entradas/saídas | Não extraídos; não há valores afirmados. |
| Presença/ausência de documentos | Não verificável sem leitura do PDF. |
| Execução do parser | Não realizada nesta evidência. |

## Comparação com as validações previstas no código atual

Esta seção diferencia inspeção estática do código de execução real.

| Item solicitado | Evidência observada nos anexos | Regra/código existente (inspeção estática) | Estado desta evidência |
|---|---|---|---|
| Quantidade | 15 transações no CSV de saídas, 9 no de entradas; 24 no conjunto. PDF não contado. | `parseCsv` exige cabeçalho e ao menos uma linha; o parser PDF rejeita resultado sem transações. | CSV observado; PDF pendente de extração/execução. |
| Datas | CSVs têm `Data` preenchida em todas as linhas (`10/06/2026 00:00`); competências e vencimentos foram registrados acima. | `normalizeDate` aceita datas brasileiras e `buildCsvTransactions` valida a data normalizada. O PDF exige data ISO no retorno da Edge Function e depois normaliza/valida. | Compatibilidade inferida por inspeção; não executado. |
| Descrições | Todas as 24 linhas dos CSVs têm descrição não vazia; listadas acima. | `buildCsvTransactions` rejeita descrição vazia; o caminho PDF também rejeita descrição vazia. | Evidência CSV observada; regra apenas inspecionada. |
| Delimitador e cabeçalhos | Delimitador `;`; cabeçalho de 12 colunas, sem repetição ou coluna vazia. | `detectDelimiter` compara `;` e `,`; `parseCsv` rejeita cabeçalho vazio/duplicado e linhas com campos além do cabeçalho. | Compatibilidade inferida; não executado. |
| Documentos | CSVs não têm coluna `Documento`; `Ref.`/`Anotações` vazias. PDF não lido. | CSV usa coluna de documento somente se ela for mapeada; o PDF aceita `document` opcional. | Ausência observada somente nos CSVs; PDF pendente. |
| Créditos/débitos | Os arquivos são nomeados `Entradas` e `Saídas`; seus valores são positivos e sem sinal explícito. | `buildCsvTransactions` define a direção a partir de `importMode` (`entrada`, `saida` ou `ambos`), não a partir do nome do arquivo. O preparo inicial usa `ambos`; a confirmação da tela fornece o modo selecionado. | Direção da fonte observada; comportamento do código inferido; nenhuma importação executada. |
| Valores totais | Saídas R$ 6.412,74; entradas R$ 22.757,25; soma conjunta R$ 29.169,99. | O resumo soma valores positivos como entradas e negativos como saídas; no PDF, totais retornados são comparados com a soma das transações quando presentes. | Totais dos CSVs observados/calculados; validação do parser não executada. |
| Saldos | CSVs não possuem coluna de saldo nem saldo afirmado. PDF não lido. | O parser PDF pode extrair `saldo inicial/anterior` e `saldo final/atual` e verifica a equação saldo inicial + entradas − saídas = saldo final quando todos os números existem. | Não há saldo real a registrar; regra apenas inferida do código. |
| Hash SHA-256 | Nenhum hash foi calculado nesta tarefa. | O código usa SHA-256 para os bytes do arquivo (`arquivo_hash`) e para a tupla canônica da transação (`hash_transacao`); a confirmação exige hash de 64 caracteres hexadecimais. | **Não executado; nenhum hash comprovado.** |
| Rejeição de reimportação | Nenhuma tentativa de importação/reimportação foi feita. | Antes do upload, `prepareImportFile` consulta `extratos_bancarios.arquivo_hash` e, se encontrar o mesmo hash, lança `Este arquivo já foi importado`. | **Não testado; regra/código existente apenas apontado.** |
| PDF real do Cora e período | Arquivo binário e tamanho são evidências do anexo; o período vem do nome. Texto, transações e totais não foram lidos. | A Edge Function baixa o PDF, usa `pdf-parse`, procura `Cora`, período, saldos, totais e transações; exige autenticação válida. | Identificação/período não confirmados por execução; parser pendente. |

## Conclusão e pendências

- As três fixtures estão versionadas em `tests/fixtures/fase-1/` com nomes claros e os nomes originais estão registrados acima.
- Os CSVs fornecem 24 transações: 15 saídas na conta `STONE PAGAMENTOS S.A` e 9 entradas na conta `BANCO CORA`, com soma conjunta observada/calculada de R$ 29.169,99.
- Não foram observados documentos nos CSVs; o PDF não permite concluir sobre documentos sem extração.
- Não há evidência nesta fase para hashes SHA-256, saldos do PDF, totais do PDF, resultado do parser ou rejeição real de reimportação.
- Qualquer confirmação desses itens exige, em etapa posterior e separada, leitura/execução verificável do PDF e execução controlada do fluxo de importação; isso não foi feito aqui.
