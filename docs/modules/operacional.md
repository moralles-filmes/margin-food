# Módulo: Movimentação Operacional

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `operacional`
- Status: ativo no código; liberação aos operadores pendente de concessões e vínculos de setor (ver `TAREFAS.md`)
- Flag: nenhuma

## Responsabilidade

- Faz: saída simplificada de estoque pelo chão de operação (item a item ou em lote), leitura de código de barras, histórico das últimas movimentações e administração de setores por usuário e produtos por setor.
- Não faz: entrada de estoque, cadastro de produto, custo → [estoque.md](estoque.md).
- Código: `src/components/estoque-operacional/`, `src/hooks/useMovimentacaoOperacional.ts`.

## Submódulos e permissões

| Submódulo | Ações (`operacional:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `movimentacao` | view, create | empresa (setores do usuário) |
| `historico` | view | empresa (setores do usuário) |
| `setores` | view, manage | empresa |

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `estoque_setor_produtos` | empresa | produtos de cada setor |
| `estoque_usuario_setores` | empresa | setores de cada usuário |
| `movimentacoes_estoque` | empresa | a mesma do Estoque Geral; o operador grava só pelas RPCs `op_*` |

## Invariantes

- **Movimentação Operacional é uma 2ª interface sobre o MESMO estoque, não um 2º estoque** — grava na mesma `movimentacoes_estoque`, com os mesmos triggers e o mesmo cache `produtos.saldo_atual`. Nunca criar tabela, saldo ou sincronização paralela. O que separa os dois módulos é só a superfície: o administrativo passa por `estoque_registrar_movimentacoes_lote` (`NovaMovimentacaoModal` → `addMovimentacoesLote`; SECURITY INVOKER, mesma RLS do INSERT direto, lote atômico, chave por linha em `reference_id='<chave>:<n>'` com `reference_type='ESTOQUE_MANUAL'`, porque `idx_mov_reference_unique` só admite uma linha ativa por referência); o operacional passa por `op_registrar_movimentacao`, que identifica a origem com `origem='OPERACIONAL'` + `source_module='operacional'` + `reference_type='OPERACIONAL'`.
- **`operacional` é módulo próprio no registry, nunca subtab de `estoque`** — como subtab, `useModuleAccess('estoque')` retornaria `true` para o operador e liberaria a aba administrativa "Controle de Estoque".
- **O usuário operacional não tem permissão de tabela nenhuma — tudo pelas RPCs `op_*`** — `produtos_select` e `movimentacoes_select` devolvem a linha inteira via PostgREST (`custo_padrao`, `custo_medio_30d`, `avg30_*`, `last_supplier`, `custo_unitario`, `custo_total`); conceder essas policies ao operador vazaria custo no Network mesmo com a tela escondendo o campo. As `op_*` (SECURITY DEFINER) projetam só nome, SKU, código de barras, unidade e saldo. **Nunca adicionar chave `operacional:*` às policies de `produtos`/`movimentacoes_estoque`.** Pelo mesmo motivo, usuário puramente operacional não deve receber o papel `operador`, que carrega as chaves legadas `stock:read`/`stock:movements:read` e satisfaz aquelas policies.
- **O operacional só registra SAÍDA** — `op_registrar_movimentacao` recusa `p_tipo` diferente de `'SAIDA'` (`TIPO_INVALIDO`); entrada é lançada só no módulo administrativo, e as entradas operacionais antigas continuam no histórico.
- **`op_registrar_movimentacao` é o único caminho que barra saldo negativo no banco** — o módulo administrativo valida estoque insuficiente **só no cliente** (`validarLote`, pela soma das linhas do mesmo produto no lote); `validate_stock_movement` no banco só exige `quantidade > 0`. A RPC operacional lê `produtos.saldo_atual` sob `SELECT ... FOR UPDATE`, então duas saídas simultâneas do mesmo item serializam. Custo é resolvido no servidor (avg30 → última → padrão → `custo_padrao/fator`), nunca vem do cliente, e saída de item sem custo é recusada (`PRODUTO_SEM_CUSTO`), igual à regra do admin.
- **A idempotência do operacional é garantida pelo índice `uq_mov_operacional_request`, não pelo SELECT prévio** — o `FOR UPDATE` do produto protege o saldo, **não** a chave de idempotência: duas chamadas simultâneas com o mesmo `client_request_id` passavam as duas pelo check-then-insert e a segunda duplicava a movimentação. O índice único parcial em `(company_id, reference_id) where reference_type='OPERACIONAL' and status='ATIVO'` é a garantia real; o SELECT continua só como caminho rápido e a `unique_violation` é tratada como reenvio. `status='ATIVO'` no predicado é proposital: movimentação cancelada libera a chave para relançamento. **Qualquer RPC nova que aceite chave de idempotência precisa do índice — check-then-insert sozinho não é idempotente.**
- **Saída de vários itens no operacional é `op_registrar_saidas_lote`, que chama `op_registrar_movimentacao` por item na mesma transação (tudo ou nada)** — nunca copiar as regras de saldo/custo/setor/idempotência para a RPC de lote, nem gravar a lista com N chamadas do cliente (uma recusa no meio deixaria meia saída gravada). Os produtos do lote são travados antes em ordem de id (sem isso, dois lotes com os mesmos itens em ordens diferentes entram em deadlock); o erro sai como `LOTE_ITEM=<n base 1> <erro unitário>` com o SQLSTATE original.
- **Setor no operacional: `estoque_setor_produtos` (produtos do setor) + `estoque_usuario_setores` (setores do usuário)** — não existia vínculo produto↔setor no schema (`stock_sectors` é só a lista de nomes e `produtos.local_estoque` é local físico), e `company_memberships.sector` guarda um setor só. **Setor sem nenhuma linha em `estoque_setor_produtos` devolve o catálogo ativo inteiro** — é migração gradual, não bug. Quem tem `operacional:setores:manage`, `estoque:cadastros:manage`, `estoque:movimentacoes:create` ou `system:global:manage` alcança todos os setores ativos sem linha em `estoque_usuario_setores` (`op_pode_todos_setores`).
- **`op_barcode_existe` responde sem filtrar setor — trade-off aceito, não descuido** — ela só devolve boolean e existe para separar "código não cadastrado" de "produto existe, mas fora dos seus setores"; a orientação ao operador muda entre os dois casos (procurar o cadastro vs. procurar o gerente). Filtrar por setor faria o operador pedir cadastro de um código que já existe e colidiria no índice único. O dado exposto é a existência de um EAN impresso na embalagem do produto que ele tem na mão.
- Código de barras: N por produto, em `produto_codigos_barras`, TEXT em todo o caminho; `op_find_produto_por_barcode` devolve só setores acessíveis ([estoque.md](estoque.md), "Catálogo e código de barras").
- Chave de idempotência derivada da operação (`chaveSaida` sobre `useChavesPendentes`): AGENTS.md §12 e DATABASE, "Particularidades".

## Commands, queries e eventos

- Commands: `op_registrar_movimentacao`, `op_registrar_saidas_lote`.
- Queries: `op_find_produto_por_barcode`, `op_barcode_existe`, `op_pode_todos_setores` e as demais `op_*` de listagem.

## Dependências

- Estoque Geral: catálogo, cache `produtos.saldo_atual`, triggers de `movimentacoes_estoque`.
