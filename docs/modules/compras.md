# Módulo: Compras

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `compras`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: lista do dia, pedidos e mercado, checklist, calendário de pedidos, ranking, fornecedores, Cotação (RFQ) com WhatsApp e IA, recebimentos (com ou sem entrada no estoque), confirmações e itens em falta.
- Não faz: saldo e movimentação de estoque → [estoque.md](estoque.md); pagamento ao fornecedor → [financeiro.md](financeiro.md).
- Código: `src/components/ComprasView.tsx`, `PedidosComprasMercadoView.tsx`, `SuppliersView.tsx`, `src/components/compras/`, `src/domain/compras/`, Edges `purchase-requisitions`, `send-whatsapp-zapi`, `cotacao-ia`.

## Submódulos e permissões

| Submódulo | Ações (`compras:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `lista` | view, create, edit, approve, cancel, delete, export | empresa |
| `pedidos` | view, create, edit, delete, export | empresa |
| `checklist` | view, edit, approve | empresa |
| `calendario` | view, edit, export | empresa |
| `ranking` | view, export | empresa |
| `fornecedores` | view, create, edit, delete, export | empresa |
| `cotacao` | view, create, edit, delete, approve, close, manage, export | empresa |
| `recebimentos` | view, create, edit, close, export | empresa |
| `confirmacoes` | view, approve | empresa |
| `alertas_falta` | view, approve | empresa |

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `purchase_orders` / `purchase_order_items` / `purchase_receipt_batches` | empresa | pedidos, itens e recebimentos; `uq_po_company_idempotency` |
| `purchase_requisitions` / `purchase_requisition_items` / `purchase_requisition_audit` | empresa | requisições de compra |
| `purchase_reminders` / `purchase_ignored_rules` | empresa | calendário e regras |
| `suppliers` | empresa | cadastro único de fornecedores (Compras, Salmão e Financeiro) |
| `cotacoes` / `cotacao_itens` / `cotacao_fornecedores` / `cotacao_respostas` / `cotacao_sugestoes` | empresa | Cotação (RFQ) |
| `cotacao_whatsapp_logs` / `cotacao_zapi_config` / `cotacao_ia_config` | empresa | WhatsApp (registro antes do envio) e credenciais por empresa |

## Invariantes

- **`suppliers` é um cadastro só para Compras, Salmão e Financeiro** — mesma tabela, mesma tela (`SuppliersView` + `useSuppliers`); Compras gerencia com `compras:fornecedores:*` e o Financeiro em Cadastros Base com `financeiro:cadastros:*` (`20261006013432`). A leitura aceita também as telas consumidoras (cotação, calendário, Salmão, simulador), todas as linhas — histórico precisa do nome de fornecedor inativo; excluir fornecedor já usado é barrado por FK — o caminho é desativar.
- **Cotação (RFQ)** — sub-módulo de Compras completo: CRUD, respostas/matriz comparativa, sugestão inteligente (função pura e determinística em `src/domain/compras/cotacaoOptimizer.ts` — a IA só anota, nunca decide números), WhatsApp via Z-API (config por empresa, token só no banco), IA multi-provider (reusa `ai-chat`/Gemini), conversão em pedido via RPC atômica `create_purchase_orders_from_cotacao_atomic` (1 `purchase_orders` por fornecedor vencedor, só INSERT — não toca recebimento/estoque).
- **`uq_po_company_idempotency` é o árbitro do `ON CONFLICT ... WHERE idempotency_key IS NOT NULL` de `create_purchase_orders_from_cotacao_atomic`** — mudar o predicado do índice (ex.: excluir `deleted_at`) quebra a conversão de cotação em pedido; por isso pedido excluído não libera a chave, e o calendário (1 pedido por lembrete+dia) avisa quando o pedido do dia foi excluído.
- **Compras: confirmações, recebimentos e requisições são lotes atômicos** — checklist, recebimento, exclusão/estorno, notificações e mutações de requisição usam suas RPCs `*_atomic`; retries de recebimento mantêm a mesma idempotency key e item filho sempre é validado por `(company_id, parent_id, id)`. A entrada no estoque é escolha do usuário no recebimento (`p_metadata.stock_entry=false`; ausente = dá entrada): item `RECEIVED` não implica movimentação — quem diz se o saldo mudou é `purchase_order_items.stock_entry_skipped`.
- **`purchase_order_items.purchase_unit_cost_snapshot` é custo real, não referência** — `get_relatorios_compras` e `_planning_spend_summary_inner` somam `COALESCE(NULLIF(purchase_unit_cost_snapshot,0), estimated_unit_value)` como gasto; o snapshot precisa acompanhar o preço atual do item (`estimated_unit_value`). O "preço da última compra" da solicitação (`src/domain/compras/pedidoPrecos.ts`) é só comparação na tela — persisti-lo exige coluna própria.
- A Z-API não deduplica: o WhatsApp da Cotação registra a tentativa antes de enviar (INTEGRATIONS, "Particularidades").

## Commands, queries e eventos

- Commands: `create_purchase_orders_from_cotacao_atomic`, `receive_purchase_order_atomic` e as demais `*_atomic` de checklist, exclusão/estorno, notificações e requisições; Edge `send-whatsapp-zapi`.
- Queries: `get_relatorios_compras`, `_planning_spend_summary_inner` (gasto pelo snapshot de custo).

## Integrações

- Z-API → `docs/integrations/providers/zapi.md`. IA da Cotação (`cotacao-ia`, Anthropic/OpenAI/Gemini, chave por empresa) ainda sem documento de provedor.

## Dependências

- Estoque: o recebimento dá entrada (salvo `p_metadata.stock_entry=false`). Financeiro: `suppliers`.
