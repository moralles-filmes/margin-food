<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em src/domain/financeiro/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## Financeiro — ao tocar telas, domínio ou exportações do Financeiro

Antes de alterar, leia `docs/modules/financeiro.md`. Se o arquivo for da conciliação (`Conciliacao*`, `ConfirmarSaldoExtratoDialog`, `CriarLancamentoExtratoDialog`), leia também `docs/modules/conciliacao.md`; se for da Apresentação Sócios (`Presentation*`, `ApresentacaoSociosSection`, `src/domain/financeiro/presentation/`), `docs/modules/apresentacao-socios.md`.

Pontos que mais causaram dinheiro errado em produção:

- Toda operação financeira passa pelas RPCs `_guarded_` (tenant, permissão, lock otimista, `fin_audit_logs`). Criação é idempotente com `p_idempotency_key` de `useChavesPendentes`.
- Rateio manda: com linhas em `fin_lancamento_rateios`, o `categoria_id` e o centro de custo do cabeçalho são ignorados nos relatórios.
- Só a DRE é competência; todo outro relatório é caixa pelo Livro Razão, pela data efetiva `COALESCE(data_pagamento, conciliado_em::date, data_competencia)`.
- Espelho de baixa não se exclui (só estorno); baixa de CP exige conta bancária; `data_pagamento` é a data escolhida pelo usuário, nunca `CURRENT_DATE`.
- Não operacional (`excluir_dos_totais`) fica fora do resultado, mas o saldo bancário inclui tudo.
- CMV Financeiro não é o CMV de estoque: não reutilizar `metas_cmv`, Edge `cmv` nem DRE/DFC.

## Apresentação Sócios — ao tocar a apresentação, sessões, decisões ou exportações

Antes de alterar, leia `docs/modules/apresentacao-socios.md` e, para os números, `docs/modules/financeiro.md` ("Relatórios" e "Fechamento de Caixa").

Pontos críticos:

- Escopo de unidade próprio (`presentationUnit`): queries, permissões, detalhes e exports herdam o provider local, não a empresa ativa global.
- Números são caixa pelo Livro Razão; faturamento bruto vem do Fechamento de Caixa; detalhamentos dependem do `grupo` efetivo da categoria.
- Decisões e ações são as entidades canônicas; atas só as referenciam, e snapshot aprovado nunca vira fonte financeira viva.
- Os 4 exportadores `src/lib/presentation*Export.ts` usam paleta literal, fora dos tokens: não migrar para `hsl(var(--token))`.
- A chave `financeiro:relatorio-socios:*` também governa o Borderô.
