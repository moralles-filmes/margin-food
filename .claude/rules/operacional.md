---
paths:
  - "src/components/estoque-operacional/**"
  - "src/hooks/useMovimentacaoOperacional.ts"
---

# Movimentação Operacional — ao tocar a saída de estoque do chão de operação

Antes de alterar, leia `docs/modules/operacional.md` (e `docs/modules/estoque.md` para catálogo e código de barras).

Pontos críticos:

- É uma 2ª interface sobre o MESMO estoque: nunca criar tabela, saldo ou sincronização paralela.
- O operador não tem permissão de tabela: tudo passa pelas RPCs `op_*`, que não expõem custo. Nunca adicionar chave `operacional:*` às policies de `produtos`/`movimentacoes_estoque`.
- Só SAÍDA. Lote é `op_registrar_saidas_lote`, tudo ou nada, chamando `op_registrar_movimentacao` por item.
- Idempotência garantida pelo índice `uq_mov_operacional_request`; a chave é derivada do conteúdo (`chaveSaida`) e o servidor recusa reuso com `REQUEST_ID_REUTILIZADO`.
- Quantidade exibida (`formatarQuantidade`) nunca volta para o campo editável: use `quantidadeParaCampo`.
