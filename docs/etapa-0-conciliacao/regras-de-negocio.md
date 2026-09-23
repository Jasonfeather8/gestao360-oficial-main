# Etapa 0 — Regras de negócio da conciliação

## Status e finalidade

- **Status:** regras aprovadas pelo cliente.
- **Finalidade:** estabelecer o critério de aceite documental da Etapa 0 do módulo de conciliação.
- **Escopo deste documento:** registrar as regras aprovadas e separar sua aprovação das evidências de aplicação.

A aprovação das regras não constitui evidência de que a implementação, a execução ou a validação operacional já tenha sido realizada. As evidências correspondentes permanecem pendentes.

## Regras aprovadas

As nove regras abaixo foram aprovadas pelo cliente para a Etapa 0.

### 1. Fechamento por conta e período

**Regra aprovada:** o fechamento da conciliação deve ser considerado por conta e por período.

**Critério de aceite:** o fechamento deve ser verificável com a conta e o período aos quais se refere.

**Evidência pendente:** comprovação do fechamento identificado por conta e período.

### 2. Múltiplos lançamentos por transação

**Regra aprovada:** uma transação pode ter múltiplos lançamentos associados.

**Critério de aceite:** o tratamento da conciliação deve considerar a possibilidade de múltiplos lançamentos em uma mesma transação.

**Evidência pendente:** comprovação de uma conciliação com múltiplos lançamentos associados à mesma transação.

### 3. Tolerâncias de R$ 0,01 e R$ 0,02

**Regra aprovada:** os valores de tolerância aprovados para a Etapa 0 são **R$ 0,01** e **R$ 0,02**.

**Critério de aceite:** o aceite deve reconhecer os dois valores de tolerância aprovados, sem substituí-los por valores não registrados neste documento.

**Evidência pendente:** comprovação da aplicação das tolerâncias de R$ 0,01 e R$ 0,02.

### 4. Tratamento de diferenças

**Regra aprovada:** as diferenças identificadas na conciliação devem ser tratadas no processo da Etapa 0.

**Critério de aceite:** diferenças encontradas devem ser consideradas no processo de conciliação, sem serem omitidas do aceite.

**Evidência pendente:** comprovação do tratamento das diferenças identificadas.

> A aprovação registrada nesta regra não detalha, por si só, um fluxo ou resultado específico para cada tipo de diferença. Este documento não acrescenta esse detalhamento.

### 5. Aprovação Master

**Regra aprovada:** a aprovação Master faz parte das regras de aprovação da conciliação na Etapa 0.

**Critério de aceite:** o aceite deve considerar a aprovação Master como parte do processo aprovado.

**Evidência pendente:** comprovação da aprovação Master.

### 6. Transferências

**Regra aprovada:** transferências devem ser consideradas no escopo das regras de conciliação da Etapa 0.

**Critério de aceite:** o aceite deve contemplar a presença de transferências no processo de conciliação.

**Evidência pendente:** comprovação do tratamento de transferências.

### 7. Cofres inativos

**Regra aprovada:** cofres inativos devem ser considerados no tratamento previsto para a conciliação da Etapa 0.

**Critério de aceite:** o aceite deve contemplar cofres inativos.

**Evidência pendente:** comprovação do tratamento de cofres inativos.

### 8. Formatos PDF, CSV e XLSX

**Regra aprovada:** os formatos considerados nas regras aprovadas são **PDF**, **CSV** e **XLSX**.

**Critério de aceite:** o registro do requisito deve identificar explicitamente os três formatos: PDF, CSV e XLSX.

**Evidência pendente:** comprovação correspondente aos formatos considerados. A implementação dos formatos é tratada nas fases técnicas próprias, sem alterar a aprovação desta regra de negócio.

### 9. PDF escaneado e OCR

**Regra aprovada:** o tratamento de PDF escaneado e de OCR faz parte das regras aprovadas para a Etapa 0.

**Critério de aceite:** o aceite deve considerar PDF escaneado e OCR como situações previstas nas regras de conciliação.

**Evidência pendente:** comprovação do tratamento de PDF escaneado/OCR.

## Regra aprovada versus evidência pendente

- **Regra aprovada:** decisão de negócio registrada acima e aprovada pelo cliente para a Etapa 0.
- **Evidência pendente:** demonstração documental, operacional ou de validação da aplicação da regra. A ausência dessa evidência nesta entrega não revoga a aprovação da regra.
- Nenhuma evidência pendente deve ser interpretada como uma regra adicional.

## Limites de escopo e aceite

Este documento cobre somente a formalização das regras de negócio aprovadas para a Etapa 0 e serve como referência para o aceite correspondente. Não inclui:

- Fase 1;
- fixtures;
- parser;
- testes;
- qualquer alteração de código ou de banco de dados;
- migrações;
- implementação ou alteração de hooks, componentes, layout, dependências ou funcionalidades.

O critério de aceite desta entrega é a existência deste registro versionado, em português, contendo as nove regras, seus critérios de aceite, a indicação explícita de aprovação pelo cliente, a separação das evidências pendentes e os limites de escopo acima.
