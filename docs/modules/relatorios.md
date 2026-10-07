# Módulo: Relatórios

> Levantado do código e das migrations em 2026-10-07 (Padrão SaaS, Fase 9). Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`, exceto `app_config`).

- Chave do módulo: `relatorios`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: painel de leitura por período com seis abas — CMV (CMV geral e do salmão, margem, CMV por categoria, tendência de 3 meses), Estoque (giro, cobertura, ruptura, perdas, valor em estoque, estoque parado, salmão bruto/limpo, gastos por setor), Compras (indicadores por fornecedor), Tendência (custo e CMV por semana, período atual × anterior, volatilidade, consumo por dia da semana), Score (score de fornecedor, projeção de 4 semanas e simulador estratégico) e Itens (análise por produto, com detalhe).
- Não faz: nenhuma escrita — o módulo só lê; metas e Centro de CMV de estoque → [cmv.md](cmv.md); CMV Financeiro e Fechamento de Caixa → [financeiro.md](financeiro.md).
- Código: `src/components/RelatoriosView.tsx`, `AnaliseItemView.tsx`, `src/components/relatorios/GastosPorSetorChart.tsx`, `src/hooks/useRelatoriosData.ts`; filtro de período compartilhado em `src/components/PeriodFilter.tsx`.

## Submódulos e permissões

| Submódulo | Ações (`relatorios:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `cmv`, `estoque`, `compras`, `itens` | view, export | empresa |
| `tendencia` | view | empresa |
| `score` | view, simulate, export | empresa |

Cada aba aparece só com o `:view` do submódulo; o simulador do Score exige `relatorios:score:simulate`. Nenhuma aba exporta hoje: as ações `export` estão no registry sem botão. Chave legada: `reports:read` vale nas funções internas `get_relatorios_*` e nas de itens, mas os wrappers `_relatorios_*_guarded` checam só a chave granular.

## Tabelas

Nenhuma tabela própria. Leitura, só pelas RPCs:

| Tabela | Escopo | Observação |
|---|---|---|
| `movimentacoes_estoque` / `produtos` | empresa | custo consumido, perdas, giro, gastos por setor e análise por item; saldo pelo cache `produtos.saldo_atual` |
| `financeiro_fechamento_caixa` | empresa | faturamento (`faturamento_bruto`), denominador do CMV |
| `purchase_orders` / `purchase_order_items` | empresa | compras recebidas (aba Compras) |
| `salmon_entries` / `salmon_manipulations` | empresa | estoque e compras de salmão |
| `metas_cmv` | empresa | meta de CMV usada só pelo simulador |
| `app_config` | global (sem `company_id`) | chave `meta_cmv` lida pelos KPIs |

## Invariantes

- **A tela entra sempre por um wrapper `_guarded`**: `_relatorios_<aba>_guarded(text,text)` e `_simulate_relatorios_guarded` checam a chave granular da aba e delegam para `get_relatorios_*(date,date)`/`simulate_relatorios_score`, que aceitam também `reports:read` e `system:global:manage` (`20260914142000`). As sobrecargas `(text,text)` das funções internas eram código morto quebrado e saem no forward F12 `20260916221400`.
- **CMV = custo de saída ÷ faturamento do Fechamento de Caixa**: custo de movimentações `direction = 'OUT'`, `status = 'ATIVO'`, sem `*_ESTORNO`, de produtos com `conta_no_cmv = true`, sobre `financeiro_fechamento_caixa.faturamento_bruto` do período. Sem faturamento o servidor devolve CMV nulo, nunca 0% (o KPI mostra "—").
- **Análise por Item ordena e calcula no banco** — ordenação, % CMV e cobertura saem de `list_report_items_page` sobre todos os itens do período; a tela só pagina por offset (máximo 100 por página). `list_report_items_cursor` fica só para o frontend anterior.
- **Gastos por Setor soma só `direction = 'OUT'`** — nenhum tipo de entrada entra (inclusive `AJUSTE_INVENTARIO_POSITIVO`); "sem perdas" exclui `BAIXA_PERDA`, `SAIDA_PERDA` e `SAIDA_VENCIMENTO`; setor vazio vira "Não informado".
- Valor em estoque e saldo por item vêm do cache `produtos.saldo_atual` (`get_relatorios_kpis` é uma das RPCs alinhadas): [estoque.md](estoque.md), "Saldo e movimentações".
- Compras recebidas valem pelo snapshot de custo (`get_relatorios_compras`): [compras.md](compras.md).
- KPIs agregados vão por RPC com `SUM` no Postgres: PERFORMANCE, "Particularidades".
- Transferência entre locais ainda entra no consumo (`get_relatorios_kpis`, `get_spend_by_sector`, `get_report_items_summary`): pendência da "Nova Transferência" em `TAREFAS.md`.

## Commands, queries e eventos

- Commands: nenhum (o simulador estratégico é `STABLE` e não grava).
- Queries: `_relatorios_kpis_guarded` → `get_relatorios_kpis` (abas CMV e Estoque), `_relatorios_tendencia_guarded` → `get_relatorios_tendencia`, `_relatorios_compras_guarded` → `get_relatorios_compras`, `_relatorios_score_guarded` → `get_relatorios_score`, `_simulate_relatorios_guarded` → `simulate_relatorios_score`, `get_spend_by_sector`, `list_report_items_page`, `get_report_items_summary`, `get_report_item_detail`.
- Eventos publicados: nenhum.

## Dependências

- Estoque: movimentações (`direction`, `status`, `internal_transfer`, `setor`), `produtos.conta_no_cmv`, `estoque_minimo` e `saldo_atual` ([estoque.md](estoque.md)).
- Financeiro: `financeiro_fechamento_caixa.faturamento_bruto` ([financeiro.md](financeiro.md)).
- Compras: pedidos recebidos ([compras.md](compras.md)).
- Salmão: `salmon_entries` e `salmon_manipulations` ([salmao.md](salmao.md)).
- CMV de estoque: `metas_cmv` (simulador) ([cmv.md](cmv.md)). Configuração global: `app_config.meta_cmv` (KPIs).

## Decisões

- Sem ADR. Gates das RPCs alinhados às chaves granulares na migration `20260914142000`; paginação da Análise por Item em `20260915200000`.
