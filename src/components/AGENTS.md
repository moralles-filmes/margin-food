<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em src/components/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## Telas soltas em src/components e módulos sem regra própria

As telas de vários módulos ficam soltas na raiz de `src/components/`. Antes de alterar uma delas, leia o documento do módulo:

| Tela (prefixo do arquivo) | Documento |
|---|---|
| `SalmonControlView`, `EntriesView`, `ManipulationView`, `StockView`, `DashboardView`, `GoalsView`, `SmartSuggestionCard`, `EtiquetaModal`, `ValidadeAlertCard` | `docs/modules/salmao.md` |
| `EstoqueGeralView`, `MovimentacoesSection`, `StockCadastrosSection`, `RequisicaoEstoqueSection`, `SimuladorCompraGeral` | `docs/modules/estoque.md` |
| `ComprasView`, `PedidosComprasMercadoView`, `SuppliersView`, `UserMentionSelect` | `docs/modules/compras.md` |
| `FinanceiroView` | `docs/modules/financeiro.md` |
| `RhView` | `docs/modules/rh.md` |
| `InventarioView`, `QuickInventorySection` | `docs/modules/inventario.md` |
| `CmvView` | `docs/modules/cmv.md` |
| `FichaTecnicaView` | `docs/modules/ficha-tecnica.md` |
| `PlanningView`, `PlanningProjecaoCard`, `MetaCompraCard`, `WeeklyBreakdown`, `BudgetPressure`, `PurchaseRadar`, `SimuladorCompra` | `docs/modules/planejamento.md` |
| `RelatoriosView`, `AnaliseItemView`, `PeriodFilter` | `docs/modules/relatorios.md` |
| `CentralIAView` | `docs/modules/ia.md` |
| `ConfiguracoesView`, `AdminUsersView`, `PermissionMatrix`, `AuditView`, `GlobalAuditView`, `SecurityAuditView`, `PerformanceMonitorView`, `PasswordInput`, `PasswordStrengthMeter` | `docs/modules/admin.md` |
| `AppLayout`, `CompanySelector`, `NotificationBell`, `NotificationToaster`, `RequisicaoNotificationModal`, `PwaUpdatePrompt`, `FloatingCalculator` | `docs/modules/ui.md` |

Pontos críticos dos módulos sem regra própria:

- **CMV de estoque** (Edge `cmv`) não é o CMV Financeiro nem o de Relatórios: cada um tem numerador próprio e só dividem o faturamento do Fechamento de Caixa. `CMV_OUTFLOW_TYPES` é a fonte única dos tipos somados, e `metas_cmv.meta_cmv_total` é também a meta da Apresentação Sócios.
- **Ficha Técnica**: `custo_*_calculado` é cache e só "Recalcular Todos" refaz a árvore; a criação passa por `ficha_criar_componente_atomic` (atômica e idempotente); a Ficha não movimenta estoque.
- **Planejamento**: a meta grava só por `_planning_upsert_meta_guarded` e remover é inativar; o gasto realizado é calculado no servidor.
- **Relatórios** só lê, sempre por um wrapper `_relatorios_*_guarded`; CMV sem faturamento é nulo, nunca 0%.
- **IA Central**: envio só com `ia:<agente>:create`; a chamada paga é reservada em `ai_logs` antes do modelo; o contexto é lido com service role, então toda consulta filtra `company_id`.
- **Admin**: `system:global:manage` só sai por `admin_set_super_admin`; log GLOBAL só é lido e gravado por super admin; concessão de acesso só por `admin_upsert_company_membership`.

## Salmão — ao tocar entradas, manipulação, estoque por lote ou parâmetros

Antes de alterar, leia `docs/modules/salmao.md` (e `docs/modules/estoque.md` para movimentação e cancelamento).

Pontos críticos:

- A fila de consumo do lote bruto é FEFO (`expiration_date`); lote sem validade cai na data de entrada.
- Exclusão é cancelamento idempotente pelas RPCs `_salmon_cancel_*_guarded`, que também cancelam a movimentação; "já cancelado" é no-op (`isAlreadyCancelledError`).
- Quem manipula precisa LER `salmon_entries` (`salmon:manipulacao:view`).
- `salmon_config` é uma linha por unidade, gravada só por `salmon_salvar_config`; parâmetro nulo mantém o valor gravado.
