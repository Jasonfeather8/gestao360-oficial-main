# Fila de aprovação Master — Alternativa A

## Regra de inclusão

Lançamentos financeiros entram na fila Master somente quando todas estas condições forem verdadeiras: `status_pagamento = quitação_pendente`, `status_aprovacao = digital`, possuem conciliação e não são transferência bancária nem transferência banco/Cofre.

As demais modalidades mantêm seus estados e critérios próprios atuais: fechamento com `aguardando_master`; transferência bancária conciliada com `conciliada_pendente_master`; movimentação de Cofre com `aguardando_master`, dentro dos filtros atuais; e transferência banco/Cofre com `aguardando_master`, observados seus pré-requisitos. Essas regras não alteram os critérios específicos de cada modalidade.

Transações importadas que ainda não possuem conciliação não entram na fila.

## Fluxo

**Importação → identificação e conciliação → aprovação digital e quitação pendente → fila Master → decisão.** A transação só alcança a fila quando satisfaz os critérios de inclusão aplicáveis; então aguarda a decisão Master.

## Autoridade e disponibilidade

A consulta da fila e a decisão dependem de usuário Master autenticado. O papel `anon` não possui permissão `EXECUTE` para essas operações.

Uma fila sem itens é um resultado válido: a consulta responde HTTP 200 com `[]`. Isso não representa erro nem altera os critérios de inclusão.
