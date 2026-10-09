# Módulo: Centro de CMV (CMV de estoque)

> Levantado do código em 2026-10-07 (Padrão SaaS, Fase 9); o `AGENTS.md` não tinha regras próprias deste módulo. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `cmv`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: CMV de estoque do período (custo das saídas do estoque ÷ faturamento bruto do Fechamento de Caixa), com escopo Tudo / Geral (sem salmão) / Somente Salmão e filtro por setor; quebra por categoria, por setor, top itens (paginado) e semanal (W1–W5); metas mensais de CMV (geral, salmão, total e faixas de alerta); insights e simulação rápida calculados só na tela.
- Não faz:
  - **CMV Financeiro** (Financeiro → CMV, chave `financeiro:cmv:*`): numerador nos boletos de Contas a Pagar e nas despesas de Lançamentos/Conciliação, não no estoque → [financeiro.md](financeiro.md) e `docs/cmv-financeiro/`. Os dois só compartilham o denominador (faturamento bruto do Fechamento de Caixa); o CMV Financeiro não lê `metas_cmv` nem a Edge `cmv`, e este módulo não lê boletos.
  - Relatórios → CMV (`relatorios:cmv:*`): outro cálculo, pela RPC `_relatorios_kpis_guarded` → [relatorios.md](relatorios.md).
  - Lançar faturamento: Financeiro → Fechamento de Caixa ([financeiro.md](financeiro.md)); aqui só é lido.
  - Saldo, movimentações e custo dos produtos → [estoque.md](estoque.md). Custo e CMV% por prato → [ficha-tecnica.md](ficha-tecnica.md).
- Código: `src/components/CmvView.tsx`, `src/components/cmv/` (filtros, KPIs, abas, metas, ranking e cache em memória por cliente da empresa), Edge `cmv`.

## Submódulos e permissões

| Submódulo | Ações (`cmv:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `categoria` | view, export | empresa |
| `setor` | view, export | empresa |
| `top-itens` | view, export | empresa |
| `semanal` | view, edit, export | empresa |

- Gate de cada ação da Edge `cmv`: `calcular_cmv` exige `cmv:categoria:view` (as abas Por Setor e Semanal vêm no mesmo resultado); `get_ranking_itens`, `cmv:top-itens:view`; `get_metas`, `cmv:semanal:view`; `save_meta`, `cmv:semanal:edit`.
- As ações `:export` estão no registry, mas nenhuma tela do módulo exporta.
- Chaves legadas no `LEGACY_PERMISSION_MAP` (só o frontend expande): `cmv:read`, `cmv:export`, `cmv:write` (= `cmv:semanal:edit`).

Papéis de sistema que recebem: `admin`, `diretor` e `gerente_geral` recebem o catálogo inteiro por `role_permissions` (ACCESS_CONTROL, "Particularidades").

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `metas_cmv` | empresa | uma meta por `(company_id, mes_ano)` (`idx_metas_cmv_company_mes_ano`); RLS: leitura `cmv:semanal:view`, escrita `cmv:semanal:edit` (ou `system:global:manage`) |
| leitura: `movimentacoes_estoque`, `produtos` | empresa | fontes do custo; a Edge lê com service role filtrando `company_id` |
| leitura: `stock_sectors` | empresa | filtro de setor, lido pela tela via PostgREST; a policy `operational_active_lookup` (só setores ativos) aceita as quatro chaves `cmv:*:view` |
| leitura: `financeiro_fechamento_caixa` | empresa | `faturamento_bruto`, denominador do CMV% |
| leitura: `inventario_itens` | empresa | só no método Inventário (`contagem_fisica × custo_snapshot`) |

## Invariantes

- **Custo consumido (método Ledger) é a soma de `|custo_total|` das movimentações `status='ATIVO'` dos tipos de `CMV_OUTFLOW_TYPES`** — `SAIDA`, `BAIXA_PERDA`, `SAIDA_CONSUMO`, `SAIDA_REQUISICAO`, `SAIDA_PERDA`, `AJUSTE_INVENTARIO_NEGATIVO` —, só de produtos com `produtos.conta_no_cmv = true`. A lista é a fonte única dentro da Edge `cmv`; movimentação cancelada e estorno (`*_ESTORNO`) não entram.
- **O CMV de estoque não exclui `internal_transfer`** — a SAÍDA da transferência entre locais e a da manipulação do Salmão contam como consumo; por isso "Nova Transferência" continua bloqueada até o CMV desconsiderar essas linhas (`TAREFAS.md`, `NOVA_TRANSFERENCIA_LIBERADA`).
- **Denominador = soma de `financeiro_fechamento_caixa.faturamento_bruto` do período** — dia sem fechamento não soma nada; período sem faturamento devolve CMV% 0, não erro.
- **Salmão = produtos com `is_salmon_raw_linked = true` e ativos** — o escopo (Geral/Salmão) filtra o custo geral, mas o "CMV Salmão" ignora escopo e setor.
- **Meta: uma por empresa e mês** — índice único `(company_id, mes_ano)`; a tela grava pela Edge (`save_meta`, upsert nessa chave) e o mês é o `yyyy-MM` da data inicial do filtro. `metas_cmv.meta_cmv_total` também é a única meta de CMV da Apresentação Sócios ([apresentacao-socios.md](apresentacao-socios.md)): mudar o significado da coluna muda as duas telas.

## Commands, queries e eventos

- Commands: Edge `cmv` → `save_meta`.
- Queries: Edge `cmv` → `calcular_cmv`, `get_ranking_itens` (paginado, até 50 por página), `get_metas`.
- Ações da Edge `cmv` que pertencem a outro módulo: `recalcular_precos_produto` / `recalcular_todos_precos` (gate `estoque:cadastros:manage`, chamadas pelo `EstoqueGeralView`), que regravam `custo_medio_30d`, `custo_ultima_compra`, `avg30_*` e `last_*` de `produtos` a partir das entradas dos últimos 30 dias. Estoque → Simulador chama `simular_compra_geral`, que a Edge não roteia.
- Ações sem chamador no frontend: `get_faturamento`, `get_historico_precos` e `save_faturamento` (upsert direto em `financeiro_fechamento_caixa`, gate `financeiro:fechamento:create`, fora de `rpc_upsert_fechamento_caixa_com_marcas`).
- Eventos publicados: nenhum.

## Dependências

- Estoque: leitura direta de `movimentacoes_estoque`, `produtos` (`conta_no_cmv`, `is_salmon_raw_linked`, `categoria`) e `stock_sectors`.
- Financeiro: leitura direta de `financeiro_fechamento_caixa.faturamento_bruto`.
- Inventário: `inventario_itens` no método Inventário (a tela não envia os inventários inicial e final).
- Consumidores: Apresentação Sócios (`metas_cmv.meta_cmv_total`), IA Central (`ai-chat` lê `metas_cmv`), Estoque (recálculo de preços pela Edge `cmv`).

## Decisões

- Por que o CMV Financeiro é um indicador separado deste: `docs/cmv-financeiro/PLANO.md`.
