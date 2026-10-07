---
paths:
  - "src/components/estoque/**"
  - "src/domain/estoque/**"
  - "src/components/EstoqueGeralView.tsx"
  - "src/components/StockView.tsx"
  - "src/components/MovimentacoesSection.tsx"
  - "src/components/StockCadastrosSection.tsx"
  - "src/components/RequisicaoEstoqueSection.tsx"
  - "src/hooks/useEstoqueGeralStore.ts"
  - "supabase/functions/requisicao-estoque/**"
---

# Estoque Geral — ao tocar catálogo, movimentações, requisições ou cadastros de estoque

Antes de alterar, leia `docs/modules/estoque.md`. Se a mudança afetar a saída pelo chão de operação, leia também `docs/modules/operacional.md`.

Pontos críticos:

- `produtos.saldo_atual` é a fonte única do saldo (cache por trigger): nenhuma RPC de leitura recalcula sobre `movimentacoes_estoque`. Confira com `pg_get_functiondef` antes de assumir que uma RPC está alinhada.
- `idx_mov_reference_unique` admite uma linha ativa por `(reference_type, reference_id)`: operação com várias linhas usa sufixo por linha.
- Cancelamento com estorno insere o estorno antes de marcar o original `CANCELADO`, na mesma transação da cascata e da auditoria.
- O módulo administrativo barra saldo negativo só no cliente; o banco só barra no operacional.
- Código de barras é TEXT, N por produto, único por `(company_id, codigo)`.
- "Pendente" de requisição é `hasPendingItems(itens)`, nunca o `status` sozinho.
