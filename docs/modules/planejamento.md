# Módulo: Planejamento

> Levantado do código e das migrations em 2026-10-07 (Padrão SaaS, Fase 9). Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `planning`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: meta mensal de compras por categoria (valor e faixas de alerta amarelo/vermelho), gasto realizado do mês contra a meta, projeção mensal, ritmo semanal (W1–W5), pressão orçamentária, radar de compras e simulador de compra hipotética, com filtro por origem (Tudo, Salmão, Geral) e por categoria.
- Não faz: pedido e recebimento de compra → [compras.md](compras.md); entradas de salmão e metas próprias do Salmão (`salmon_metas_provisionadas`, `salmon_purchase_targets`) → [salmao.md](salmao.md); o Simulador de Compras do Estoque (`SimuladorCompraGeral`, `estoque:simulador`) → [estoque.md](estoque.md).
- Código: `src/components/PlanningView.tsx`, `MetaCompraCard.tsx`, `PlanningProjecaoCard.tsx`, `WeeklyBreakdown.tsx`, `BudgetPressure.tsx`, `PurchaseRadar.tsx`, `SimuladorCompra.tsx`, `src/hooks/usePlanningStore.ts`. `PlanningView` também é montada na sub-aba Salmão → Planejamento (`SalmonControlView.tsx`), e `PurchaseRadar` e as funções de cálculo de `MetaCompraCard`/`WeeklyBreakdown`/`BudgetPressure` são reaproveitadas em `EntriesView.tsx` (Salmão).

## Submódulos e permissões

| Submódulo | Ações (`planning:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `meta-compras` | view, edit | empresa |
| `projecao`, `ritmo`, `pressao`, `radar`, `simulador` | view | empresa |

Cada card da tela aparece só com o `:view` do seu submódulo (`SECTION_TO_SUBTAB` em `PlanningView.tsx`; o card "Ritmo Semanal" é `ritmo`). Chaves legadas: `planning:read`/`planning:manage` valem nas policies de `planning_metas_compra` e `planning:write`/`planning:manage` em `_planning_delete_meta_guarded`; `_planning_upsert_meta_guarded` e `_planning_spend_summary_guarded` aceitam só a chave granular.

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `planning_metas_compra` | empresa | única tabela do módulo; `UNIQUE (company_id, year, month, categoria)`; policies por `planning:meta-compras:*`, isolamento de empresa pela policy RESTRICTIVE `multiunit_scope_boundary` |
| `purchase_orders` / `purchase_order_items` | empresa | só leitura, dentro de `_planning_spend_summary_inner` (gasto realizado) |
| `produtos` | empresa | só leitura: `categoria` agrupa o gasto |
| `salmon_entries` / `movimentacoes_estoque` | empresa | só leitura, pelos stores do Salmão e do Estoque, para os cards calculados no cliente |

## Invariantes

- **Uma meta por `(company_id, year, month, categoria)`** (`phase7_planning_metas_compra_tenant_key`, forward F12 `20260916220900`). A escrita é `_planning_upsert_meta_guarded`: upsert nessa chave, reativa meta inativa e grava auditoria — nunca INSERT/UPDATE direto pelo PostgREST.
- **`categoria` da meta é texto com quatro formas**: `tudo` (consolidado), `salmao`, `geral` ou o nome de uma `produtos.categoria`, escolhida pela combinação dos filtros de origem e categoria (`activeCategoria` em `PlanningView.tsx`).
- **Remover meta é inativar** — `_planning_delete_meta_guarded` grava `ativo = false` (a tabela não tem `deleted_at`); toda leitura filtra `ativo = true`.
- **Gasto realizado (cards Meta e Projeção) é calculado só no servidor**, em `_planning_spend_summary_inner`: itens `RECEIVED` com `qty_received > 0`, de pedidos que não estão `CANCELLED`/`DELETED`, pela data de recebimento em `America/Sao_Paulo`, agrupados por `produtos.categoria` (`Sem Categoria` quando nula). Valor pelo snapshot de custo: [compras.md](compras.md).
- **`_planning_spend_summary_inner(company_id, …)` recebe a empresa por parâmetro e não é executável por `authenticated`** (`20260909195048`); a entrada é `_planning_spend_summary_guarded`, que resolve a empresa por `assert_tenant()`.
- KPIs agregados vão por RPC com `SUM` no Postgres: PERFORMANCE, "Particularidades".
- Transferência entre locais ainda entra como consumo/entrada nas RPCs de estoque e no planejamento: pendência da "Nova Transferência" em `TAREFAS.md`.

## Commands, queries e eventos

- Commands: `_planning_upsert_meta_guarded` (exige `planning:meta-compras:edit`); `_planning_delete_meta_guarded` (nenhuma tela chama hoje).
- Queries: `_planning_spend_summary_guarded` → `_planning_spend_summary_inner` (metas do mês, realizado por categoria e total, `weekly_breakdown` W1–W5, comparativo); SELECT direto em `planning_metas_compra` (`ativo = true`, limite 200).
- Calculado no cliente: projeção (`calcProjecao`), ritmo semanal (`calcWeeklyIdeal`), pressão (`calcBudgetPressure`), radar e simulador, sobre as entradas de salmão e as movimentações `ENTRADA` já carregadas no store do Estoque. O simulador do Planejamento não grava nada (`PlanningView` não passa `onApply`).
- Eventos publicados: nenhum no banco; no cliente, `planning:metas` (`useEmitDataEvent`) depois de salvar ou remover meta.

## Dependências

- Compras: itens de pedido recebidos (gasto realizado) e a regra do snapshot de custo ([compras.md](compras.md)).
- Estoque: `produtos.categoria` e as movimentações carregadas por `useEstoqueGeralStore` ([estoque.md](estoque.md)).
- Salmão: `useSalmonStore` (entradas e fornecedores ativos do simulador); a sub-aba Salmão → Planejamento renderiza `PlanningView` sem o store do Estoque ([salmao.md](salmao.md)).
- UI: `MonthNavigator` do Financeiro.

## Decisões

- Sem ADR. Policies de `planning_metas_compra` alinhadas às chaves granulares na migration `20260914141000`.
