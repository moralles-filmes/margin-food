---
paths:
  - "src/components/financeiro/**"
  - "src/components/FinanceiroView.tsx"
  - "src/domain/financeiro/**"
  - "src/lib/borderoPdfExport.ts"
  - "src/lib/cmvFinanceiroPdfExport.ts"
  - "src/hooks/useCmvFinanceiro*"
---

# Financeiro — ao tocar telas, domínio ou exportações do Financeiro

Antes de alterar, leia `docs/modules/financeiro.md`. Se o arquivo for da conciliação (`Conciliacao*`, `ConfirmarSaldoExtratoDialog`, `CriarLancamentoExtratoDialog`), leia também `docs/modules/conciliacao.md`; se for da Apresentação Sócios (`Presentation*`, `ApresentacaoSociosSection`, `src/domain/financeiro/presentation/`), `docs/modules/apresentacao-socios.md`.

Pontos que mais causaram dinheiro errado em produção:

- Toda operação financeira passa pelas RPCs `_guarded_` (tenant, permissão, lock otimista, `fin_audit_logs`). Criação é idempotente com `p_idempotency_key` de `useChavesPendentes`.
- Rateio manda: com linhas em `fin_lancamento_rateios`, o `categoria_id` e o centro de custo do cabeçalho são ignorados nos relatórios.
- Só a DRE é competência; todo outro relatório é caixa pelo Livro Razão, pela data efetiva `COALESCE(data_pagamento, conciliado_em::date, data_competencia)`.
- Espelho de baixa não se exclui (só estorno); baixa de CP exige conta bancária; `data_pagamento` é a data escolhida pelo usuário, nunca `CURRENT_DATE`.
- Não operacional (`excluir_dos_totais`) fica fora do resultado, mas o saldo bancário inclui tudo.
- CMV Financeiro não é o CMV de estoque: não reutilizar `metas_cmv`, Edge `cmv` nem DRE/DFC.
