# Módulo: Ficha Técnica

> Levantado do código em 2026-10-07 (Padrão SaaS, Fase 9); o `AGENTS.md` não tinha regras próprias deste módulo. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `ficha` (aba `ficha-tecnica` no menu)
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: fichas técnicas em três níveis — Pré-Preparo → Item Pronto → Produto Final — com composição (insumos do catálogo, componentes filhos e salmão), rendimento, perda, custo indireto e modo de preparo; custo calculado em árvore; canais de venda (taxa %, taxa fixa, imposto, embalagem); preço de venda por canal com margem, CMV% e markup; simulador de cenários; preço de referência do salmão; análise da hierarquia e explicação de markup.
- Não faz: não movimenta estoque nem baixa salmão (só usa custos como referência); catálogo e custo dos insumos → [estoque.md](estoque.md); lotes de salmão → [salmao.md](salmao.md); CMV realizado do período → [cmv.md](cmv.md); CMV Financeiro → [financeiro.md](financeiro.md).
- Código: `src/components/FichaTecnicaView.tsx` (tela e diálogos), `src/domain/fichaTecnica/idempotencia.ts`, Edge `ficha-tecnica`.

## Submódulos e permissões

| Submódulo | Ações (`ficha:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `pre-preparos` | view, create, edit, delete | empresa |
| `itens-prontos` | view, create, edit, delete | empresa |
| `produtos-finais` | view, create, edit, delete | empresa |
| `canais` | view, manage | empresa |
| `analise` | view, simulate | empresa |
| `markup` | view, manage | empresa |

- Criar, editar e excluir componente usa o submódulo do **tipo** (`PRE_PREPARO` → `pre-preparos`, `ITEM_PRONTO` → `itens-prontos`, `PRODUTO_FINAL` → `produtos-finais`; `TIPO_SUBTAB` na Edge).
- `ficha:markup:manage` governa também a precificação por canal, o "Recalcular Todos" e o preço do salmão (manual e sincronização automática).
- Fora do módulo: `ficha:analise:view` é exigida também por Relatórios → Itens (`AnaliseItemView`, [relatorios.md](relatorios.md)).
- Chaves legadas no `LEGACY_PERMISSION_MAP` (só o frontend expande): `recipes:read/edit/delete/manage` e `ficha:read/write/delete/manage`. A Edge e as policies das tabelas do módulo conferem só as chaves granulares; as RPCs de gravação também aceitam `ficha:write`/`recipes:edit`, mas a Edge barra antes de chamá-las.

Papéis de sistema que recebem: `admin`, `diretor` e `gerente_geral` recebem o catálogo inteiro por `role_permissions` (ACCESS_CONTROL, "Particularidades").

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `ficha_componentes` | empresa | os três níveis (`tipo`); exclusão lógica (`deleted_at`, `ativo=false`); `custo_*_calculado` é cache; `client_request_id` com `uq_ficha_componentes_client_request`; busca por `nome_unaccent` |
| `ficha_componente_itens` | empresa | composição: `produto_id` (insumo), `componente_filho_id` ou `origem='MODULO_SALMAO'`; regravada inteira a cada salvamento |
| `canais_venda` | empresa | taxas, imposto e embalagem do canal; exclusão lógica |
| `precificacao_canal` | empresa | preço de venda por componente e canal, `UNIQUE (company_id, componente_id, canal_id)` |
| `config_precificacao` | empresa | uma linha por empresa: preço do salmão manual e automático |
| `cenarios_simulacao` | empresa | gravada por `salvar_cenario` (sem chamador na tela) |
| leitura: `produtos` | empresa | insumos ativos (`custo_ultima_compra`, `custo_padrao`, `unidade_medida`), lidos pela tela via PostgREST; a policy `operational_active_lookup` aceita `ficha:{pre-preparos,itens-prontos,produtos-finais}:view` e as legadas `recipes:read`/`ficha:read`, com custo (decisão do usuário, `20261007150000`) |

## Invariantes

- **Hierarquia da composição, validada no banco por `_ficha_gravar_componente_itens` (criação e edição)** — Pré-Preparo aceita insumos, salmão e outros pré-preparos; Item Pronto aceita insumos, salmão e pré-preparos; Produto Final aceita itens prontos e insumos (embalagem/complementos), nunca salmão direto.
- **Custo do insumo é `produtos.custo_ultima_compra`, com `custo_padrao` de reserva, em unidade contábil (base)** — a quantidade do item fica na `unidade_medida` do produto, como no Inventário ([estoque.md](estoque.md)). Salmão: quantidade digitada em gramas e gravada em kg × preço de referência por kg limpo. Componente filho: quantidade × custo unitário do filho.
- **Custo unitário = (soma dos itens + `custo_indireto`) ÷ (`rendimento` × (1 − `perda_estimada_percent`/100))**; com rendimento líquido ≤ 0, vale o custo total.
- **`custo_total_calculado`/`custo_unitario_calculado` são cache** — salvar a composição grava a soma dos `custo_snapshot` enviados pela tela; o custo da árvore com os preços atuais só é regravado por `recalcular_todos_custos` ("Recalcular Todos", Pré-Preparo → Item Pronto → Produto Final). Mudança de preço de insumo não se propaga sozinha; o detalhe do componente recalcula na hora sem gravar.
- **Precificação por canal usa o custo unitário em cache** — receita líquida = preço − taxa % − taxa fixa − imposto %; lucro = receita líquida − custo − embalagem; CMV% = custo ÷ preço; markup = preço ÷ custo.
- **Preço de referência do salmão: o automático vence o manual** — o manual só vale com `preco_referencia_salmao_auto` zerado. O automático é gravado pela própria tela (`sync_preco_salmao_auto`, exige `ficha:markup:manage`) com o custo/kg médio, ponderado pelo kg restante, dos lotes limpos ativos e não vencidos do Salmão.
- **A Ficha Técnica não movimenta estoque** — a Edge `ficha-tecnica` não escreve em `movimentacoes_estoque`; o salmão entra só como preço.
- **Excluir componente ou canal é exclusão lógica**, e o componente que aparece como filho em alguma composição é recusado (409) até a referência sair.
- **Criação de componente é atômica e idempotente** — `criar_componente` → `ficha_criar_componente_atomic` grava cabeçalho e composição numa transação, com o gate de CREATE do tipo; o índice `uq_ficha_componentes_client_request` é a garantia. Reenvio com a mesma chave e mesmo autor, tipo, nome e itens devolve o existente (`idempotente=true`); conteúdo diferente → `REQUEST_ID_REUTILIZADO`. A edição (`salvar_componente` + `salvar_componente_itens`) é regravação, sem chave.

## Commands, queries e eventos

- Commands (Edge `ficha-tecnica`): `criar_componente` (RPC `ficha_criar_componente_atomic`), `salvar_componente` (cabeçalho na edição), `salvar_componente_itens` (RPC `ficha_salvar_componente_itens_atomic`: trava o pai `FOR UPDATE`, gate de EDIT do tipo do pai), `deletar_componente`, `salvar_canal`, `deletar_canal`, `salvar_precificacao`, `recalcular_todos_custos`, `set_preco_referencia_salmao`, `sync_preco_salmao_auto`, `salvar_cenario`. Cada escrita grava auditoria por `service_write_audit` depois do commit; se a auditoria falhar, só vai para o log.
- Queries: `listar_componentes` (cursor por nome + id, até 500 por página), `get_componente_detalhe`, `listar_canais`, `get_precificacao`, `simular_cenario`, `get_preco_referencia_salmao`. Sem chamador na tela: `calcular_custo_componente` (também regrava o cache) e `calcular_custo_arvore`.
- Eventos publicados: nenhum.

## Dependências

- Estoque: lê `produtos` (insumos ativos e custo); não grava produto.
- Salmão: lotes limpos do `useSalmonStoreContext` (`Index.tsx` passa `lotesLimpos`) alimentam o preço automático.
- Consumidores: Relatórios → Itens (gate `ficha:analise:view`), IA Central (`ai-chat` lê `ficha_componentes` e `config_precificacao`).

## Decisões

- Por que a criação é atômica e idempotente: cabeçalho de `supabase/migrations/20260930042302_ficha_criar_componente_atomic.sql`.
