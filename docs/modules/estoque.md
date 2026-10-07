# Módulo: Estoque Geral

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `estoque`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: catálogo de produtos e códigos de barras, movimentações (entrada, saída, cancelamento com estorno), saldo, dashboard, ranking, perdas, preditivo, transferências entre locais, requisições de estoque e listas fixas, cadastros (setores, categorias, locais).
- Não faz: a saída simplificada do chão de operação → [operacional.md](operacional.md) (mesmo estoque, outra superfície); contagem física → [inventario.md](inventario.md); salmão → [salmao.md](salmao.md).
- Código: `src/components/EstoqueGeralView.tsx`, `StockView.tsx`, `MovimentacoesSection.tsx`, `StockCadastrosSection.tsx`, `RequisicaoEstoqueSection.tsx`, `src/components/estoque/`, `src/domain/estoque/`, `src/hooks/useEstoqueGeralStore.ts`, Edge `requisicao-estoque`.

## Submódulos e permissões

| Submódulo | Ações (`estoque:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `dashboard`, `ranking`, `perdas`, `preditivo`, `simulador` | view | empresa |
| `transferencias` | view, create | empresa |
| `saldo` | view, export | empresa |
| `movimentacoes` | view, create, edit, cancel, export | empresa |
| `requisicoes` | view, create, approve, close, delete, export, manage | empresa |
| `catalogo` | view, create, edit, delete, export | empresa |
| `cadastros` | view, create, edit, delete, manage, export | empresa |

Chaves legadas ainda aceitas nas policies: `stock:read`, `stock:movements:read` (o papel `operador` as carrega; ver [operacional.md](operacional.md)).

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `produtos` | empresa | `saldo_atual` é cache mantido por trigger (fonte única); `barcode` é legado |
| `produto_codigos_barras` | empresa | N códigos por produto, `UNIQUE (company_id, codigo)` |
| `movimentacoes_estoque` | empresa | ledger; `idx_mov_reference_unique`; estorno por `estorno_de_id` |
| `stock_sectors` / `stock_categories` / `stock_locations` / `stock_sku_counter` | empresa | cadastros; `stock_locations` é local físico, não filial |
| `requisicoes_estoque` / `requisicao_estoque_itens` | empresa | requisições |
| `listas_fixas_setor` / `listas_fixas_setor_itens` / `listas_fixas_setor_usuarios` | empresa | listas fixas e quem vê cada uma |

## Invariantes

### Saldo e movimentações

- **`produtos.saldo_atual` é fonte única da verdade** — Toda RPC de leitura de saldo/valor de estoque consome o cache (mantido por trigger `fn_recompute_product_saldo`), nunca recalcula sobre `movimentacoes_estoque` (estornos `*_ESTORNO` divergem do ledger cumulativo). RPCs alinhadas: `get_stock_summary`, `get_stock_dashboard`, `get_relatorios_kpis`, `get_stock_predictive_analysis_v2`. Já regrediu 2x por migrations que "consertavam" outra coisa — **confira com `pg_get_functiondef` antes de assumir que está alinhada**.
- **`idx_mov_reference_unique` admite UMA linha ativa por `(reference_type, reference_id)` — operação com várias linhas usa sufixo por linha** (`'<chave>:<n>'` no lote manual, `'<grupo>:OUT'`/`'<grupo>:IN'` na transferência entre locais). O estorno herda o par com `_ESTORNO`, então grupo compartilhado colide também no cancelamento. Transferência que grava as duas pernas com o mesmo `reference_id` nunca funcionou em produção; `cancel_stock_movement_atomic` estorna as duas pernas juntas.
- **Toda RPC que cancela uma movimentação de estoque com estorno precisa inserir o estorno (`estorno_de_id = id do original`) ANTES de marcar o original como `CANCELADO`, nunca depois** — `trg_validate_estorno` (`movimentacoes_estoque`, migration `20260309150114`) recusa `estorno_de_id` cujo original já esteja `CANCELADO`; Salmão foi alinhado em `20260915170000` e Compras/cancelamento externo no forward `20260916221400` do release F12 (`release/multiunit-stabilization-20260916/sql/`; a candidata local `20260916211110` tem o mesmo SQL e nunca foi aplicada). O cancelamento, a cascata de módulo e a auditoria pertencem à mesma transação.
- **`get_stock_dashboard`: bucket `ok` exige `saldo > 0`** — os 4 buckets (ok/atencao/critico/sem_estoque) são mutuamente exclusivos.
- **Estoque: Ranking/Preditivo exibem em unidade de compra** (`get_stock_top_consumed`, `get_stock_predictive_analysis_v2` convertem via `fator_exibicao`). Ficha Técnica e Inventário permanecem em unidade contábil (base).
- A Movimentação Operacional grava na mesma `movimentacoes_estoque` e é o único caminho que barra saldo negativo no banco: [operacional.md](operacional.md).

### Catálogo e código de barras

- **Catálogo: inativar é `deactivate_produto(uuid)`, reativar é edição** — `catalogo:delete` nunca autoriza UPDATE genérico/DELETE físico; não reabrir `recalc_product_costs` nem conceder create de catálogo ao operador de Salmão para liberar SKU (usa seu gate de entrada com prefixo SALM).
- **Código de barras: N por produto, em `produto_codigos_barras`** — o mesmo item de estoque chega em marcas diferentes, cada uma com seu EAN; `produtos.barcode` (coluna única) é LEGADO, não é mais lido nem escrito e será dropado em follow-up. Código é TEXT em todo o caminho: zero à esquerda é significativo (`0007894900011517` ≠ `7894900011517`) e GTIN-14 estoura a precisão de `Number`. UNIQUE `(company_id, codigo)` — global impediria a 2ª unidade de cadastrar o mesmo EAN. Duplicar produto **não** copia os códigos. `op_find_produto_por_barcode` devolve uma linha por setor **acessível**, então o leitor nunca contorna a permissão de setor; zero linhas é desambiguado por `op_barcode_existe` (código inexistente vs. produto só em setor sem acesso).
- Edição de lista filha por diff (ex.: `diffCodigos`) decide a remoção pelo `id`: DATABASE, "Particularidades".

### Requisições e listas fixas

- **Requisições de Estoque**: critério de "pendente" é `hasPendingItems(itens)` (`src/domain/estoque/requisitionStatus.ts`), nunca `status` isolado (um pedido `PARCIALMENTE_ATENDIDA` pode não ter nenhum item `SOLICITADO` aberto, e vice-versa: o status vira `PARCIALMENTE_ATENDIDA` no 1º item atendido). Encerramento — nenhum item `SOLICITADO` — dispara notificação modal bloqueante via `NotificationsProvider`/`RequisicaoNotificationModal`; avisar pelo status sozinho avisava o solicitante cedo demais e o índice único barrava o aviso final.
- **Listas fixas de requisição: quem vê cada lista é decidido pela RLS, não pela tela** — `listas_fixas_setor_usuarios` vincula colaboradores à lista; o colaborador só vê as listas em que foi selecionado e **lista sem vínculo fica visível apenas para `estoque:requisicoes:manage`/`system:global:manage`** (que veem todas). As policies SELECT de `listas_fixas_setor`/`_itens` fazem `EXISTS` no vínculo do próprio usuário sob a RLS dele — sem helper SECURITY DEFINER (o anterior ficava exposto em `/rpc` e saiu em `20260929160000`). É conveniência de navegação, não barreira: a requisição manual e `requisicao-estoque` aceitam qualquer setor.

## Commands, queries e eventos

- Commands: `estoque_registrar_movimentacoes_lote`, `cancel_stock_movement_atomic`, `deactivate_produto`, `estoque_criar_produto`, Edge `requisicao-estoque` (estorno, notificação, ack).
- Queries: `get_stock_summary`, `get_stock_dashboard`, `get_stock_top_consumed`, `get_stock_predictive_analysis_v2`, `get_movimentacoes_kpis`, `get_catalog_counts`.

## Dependências

- Compras (recebimento dá entrada, ver [compras.md](compras.md)), Salmão (manipulação e cancelamento em cascata, ver [salmao.md](salmao.md)), Inventário (finalização ajusta saldo), CMV de estoque (soma `tipo='SAIDA'`).

## Decisões

- Acesso de perfis limitados aos cadastros: `docs/rbac/stock-reference-access-20260916.md`.
