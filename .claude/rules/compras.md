---
paths:
  - "src/components/compras/**"
  - "src/domain/compras/**"
  - "src/components/ComprasView.tsx"
  - "src/components/PedidosComprasMercadoView.tsx"
  - "src/components/SuppliersView.tsx"
  - "supabase/functions/purchase-requisitions/**"
  - "supabase/functions/send-whatsapp-zapi/**"
  - "supabase/functions/cotacao-ia/**"
---

# Compras e Cotação — ao tocar pedidos, recebimentos, fornecedores ou a Cotação

Antes de alterar, leia `docs/modules/compras.md`. WhatsApp e IA: também `docs/standards/INTEGRATIONS.md` ("Particularidades") e `docs/integrations/providers/zapi.md`.

Pontos críticos:

- Confirmações, recebimentos, exclusão/estorno e requisições são lotes atômicos (`*_atomic`); retry de recebimento mantém a mesma chave e item filho é validado por `(company_id, parent_id, id)`.
- Item `RECEIVED` não implica movimentação: quem diz se o saldo mudou é `purchase_order_items.stock_entry_skipped`.
- `purchase_unit_cost_snapshot` é custo real (relatórios somam como gasto) e acompanha o preço atual do item.
- A sugestão da Cotação é função pura (`cotacaoOptimizer.ts`); a IA só anota, nunca decide números.
- A Z-API não deduplica: a tentativa é registrada antes do envio; resultado ambíguo vira `UNKNOWN` e só reenvia com confirmação.
- `suppliers` é o mesmo cadastro para Compras, Salmão e Financeiro; fornecedor usado se desativa, não se exclui.
