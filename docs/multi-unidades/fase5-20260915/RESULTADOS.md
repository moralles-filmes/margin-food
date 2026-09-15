# Fase 5 — fornecedores e preço por item

15/09/2026, branch `codex/multiunit-phase5`, base `b44eeaf`. **Implementação e ensaio local concluídos. H05 continua aberto em produção até publicação e pós-validação.** Somente Fase 5; nenhuma escrita em produção, migration remota, deploy, repair, backfill, exclusão, unificação ou push. Fase 6 não iniciada.

## 1. Estado revalidado

- Checkout inicialmente limpo. Dois fetches confirmaram `origin/main=80dcf4e`, já incorporada pela Fase 4; nenhum merge adicional necessário. AGENTS/CLAUDE estavam idênticos.
- Projeto `wuzxpbixprrgssoeeaez`, PostgreSQL 17.6, ACTIVE_HEALTHY. Às **23:16 UTC**, migrations das Fases 2/3/4 e desta Fase 5 ausentes; somente `20260910003448` presente entre as versões consultadas. `upsert_supplier(text)` mantém corpo incompatível, hash `ea5e790b1608da95c56d2731f8ddb9ac`.
- Vercel permanece READY em `80dcf4ec527d1a7e86ed3509496638b71219ab43`, deployment `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, target production. Edges: scheduled-jobs v7, inventario v15, ficha-tecnica v11, requisicao-estoque v14, purchase-requisitions v10. Nenhuma Edge foi alterada nesta fase. Versões não certificam publicação dos writers locais das fases anteriores.
- Produção: **54 fornecedores, quatro preços**, zero duplicatas exatas por nome/empresa, zero grupos por case/acento/trim no levantamento auxiliar, zero preço com UUID nulo/órfão/cruzado, zero vínculo cruzado de cotação. Nenhum saneamento necessário no snapshot; nova divergência faz o preflight abortar.
- Cinco `salmon_entries.supplier_id` nulos são compatíveis com o fluxo atual, que guarda `supplier_name` e grava a identidade canônica no preço. Zero snapshots de nome sem fornecedor exato na mesma empresa. **Não preencher esses UUIDs automaticamente:** correlação atual não reconstitui identidade histórica.

Artefatos: [publicação revalidada](publicacao.json), [catálogo anterior](catalogo.json), [cotação](cotacao-anterior.json), [inventário agregado](inventario-dados.json) / [consulta](inventario-dados.sql), [consumers AST](consumers.json), [comparação do schema](comparacao-schema.json), [ACLs após ensaio](acls-apos-ensaio.json), [validação](validacao.json). Catálogos não contêm linhas reais de fornecedores, contatos, identidades Auth ou payloads de logs.

## 2. Correções

Migration [20260915225538_isolate_supplier_prices.sql](../../../supabase/migrations/20260915225538_isolate_supplier_prices.sql).

1. `upsert_supplier(text)` conserva assinatura/retorno UUID e o trim já existente. Resolve empresa por `assert_tenant()`, envia `company_id` e usa **o UNIQUE existente** `(name,company_id)`. Aceita create/edit de fornecedores, `suppliers:edit` ou global. Retirado `purchases:edit`, que no registry autoriza pedidos, não cadastro de fornecedores. Sem normalização nova de nomes.
2. Nova `upsert_supplier_price(text,uuid,numeric,text)` valida permissão de editar fornecedores, produto da empresa e valores; utiliza o UUID retornado pelo upsert e grava preço/fornecedor/auditoria na mesma transação. Empresa, ator e origem não são parâmetros. Conflito real: `(supplier_id,stock_item_id,company_id)`, mantendo o índice e o texto histórico existentes. Auditoria de preço referencia o fornecedor validado, com ID do preço/produto no conteúdo.
3. Preços recebem FKs compostas para fornecedor/empresa e produto/empresa, com índices nas duas pontas. Escritas novas exigem UUID; UPDATE não pode trocar empresa, fornecedor ou produto de um preço existente. Isso também protege contra um nome antigo ser reutilizado por outro fornecedor e silenciosamente tomar seu preço: a operação aborta, exigindo revisão explícita. Nenhuma linha antiga é reescrita.
4. O único writer direto de preço no frontend foi substituído pela RPC. `authenticated` fica com SELECT na tabela de preços; serviço real conserva escrita sujeita às FKs. Fornecedores conservam CRUD/RLS; retirados privilégios não limitados por RLS (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN). Exclusão de fornecedor com preço agora é recusada pela FK, preservando vínculo; desativação continua disponível.
5. `useSalmonStore.addSupplier` envia empresa explícita de `useCompanyId()`. Ranking usa o gate `compras:fornecedores:edit` no botão e handler, bloqueia submissão em andamento e descarta respostas antigas de consulta. Mantidos provider, cliente imutável, cancelamento e cache por empresa.
6. **Consumer ativo `receive_purchase_order_atomic`:** tinha `ON CONFLICT(name)`, colunas de preço inexistentes (`produto_id`, `conversion_factor`, `updated_at`) e consultas de pedido/produto sem tenant. Agora valida pedido/item/produto na empresa, envia empresa nos INSERTs, usa colunas e conflito reais e o UUID local. Mantém custo por unidade de compra/base e fator de conversão. Locks de produto precedem fornecedor, como nos outros writers. Repetição de pedido concluído ou item com espelho ativo não duplica espelho/total. A auditoria usa o helper interno da Fase 3, sem reabri-lo.
7. Cotação cria/vincula fornecedores por UUID opcional e snapshot. Uma FK composta impede fornecedor de B na cotação de A, inclusive em RPC definer. A exclusão permitida de fornecedor sem preço continua anulando **só supplier_id**, preservando snapshot e empresa. Não houve alteração das RPCs/Edges de cotação.

O corpo de entrada de Salmão, validade, FEFO, custo, estorno e grants internos da Fase 4 permanecem intactos. Não foi criada constraint de nome duplicada, alterada fórmula de estoque/financeiro ou atribuída identidade por semelhança textual.

## 3. Consumers, identidades e ACLs

| Consumer | Identidade e autorização | Tratamento |
|---|---|---|
| SuppliersView / useSalmonStore | `suppliers.id` UUID; nome exato único na empresa; CRUD direto com RLS | Empresa explícita no INSERT; selects/updates/deletes seguem cliente contextualizado |
| RankingFornecedoresView | Formulário informa nome; servidor retorna/usa UUID; `stock_item_id` é `produtos.id` | Duas requisições não atômicas viraram uma RPC; preço não recebe UUID arbitrário do browser |
| get_supplier_ranking | UUID canônico para nome atual, `supplier_id` textual como snapshot; filtro por empresa já existente | Corpo preservado, ACL pública reduzida a authenticated; leitura A/B testada |
| usePurchaseOrdersStore → receive_purchase_order_atomic | Pedido guarda `supplier_name` snapshot; resolve fornecedor exato **na empresa do contexto validado** | Corrigido writer efetivamente chamado por confirmReceiving/finalizePartialItem |
| Salmão → create_salmon_entry_atomic | `supplier_name` snapshot; upsert local devolve UUID para preço; `salmon_entries.supplier_id` pode ser nulo | Corpo preservado; regressões de criação/manipulação/cancelamento/falhas executadas |
| Lotes / ManipulationView / calendários / pedidos de mercado | Nome buscado na lista já contextualizada; contatos/configuração, não identidade global | Não convertidos indiscriminadamente para UUID |
| CotacaoFormDialog / useCotacoesStore | UUID de supplier opcional + nome/telefone/condições snapshot; respostas por `cotacao_fornecedor_id` | FK composta protege vínculo canônico; conversão cria pedido com snapshot e não grava supplier_item_prices |
| cotacao-ia / send-whatsapp-zapi | Leem cotação/fornecedor da cotação, não escrevem tabela canônica de fornecedores/preços | Sem alteração ou disparo externo |
| Financeiro: ContasPagarSection / CriarLancamentoExtratoDialog | UUID opcional selecionado em suppliers e textos do título | Leitores contextualizados inventariados; sem alteração de baixas/FKs financeiras, cuja revisão geral pertence à Fase 7 |
| get_relatorios_score / get_fin_kpis / diagnóstico admin | Agregações ou contagens de suppliers | Inventariados no catálogo; não são writers de preço |

Antes: upsert, ranking, recebimento e validador eram SECURITY DEFINER/postgres com EXECUTE efetivo via PUBLIC para anon/authenticated/service_role. Depois: as três RPCs públicas existentes e a nova RPC são authenticated-only; validador é interno, sem EXECUTE para esses papéis. Owners preservados; upserts/validador usam search_path vazio, recebimento/ranking usam public,pg_temp. Serviço escreve diretamente quando houver caller legítimo; não recebeu EXECUTE por suposição.

## 4. Ensaio e cobertura real

PostgreSQL **17.10 real**, `127.0.0.1:15440`; template vazio `moralles_phase4_test_committed`, Fases 2/3/4 previamente aplicadas **somente em bancos descartáveis**. Nenhuma das seis migrations originais multiunidade foi reaplicada. Comparação das 321 funções públicas SQL/PLpgSQL vivas: 300 iguais; 21 diferenças explicadas pelas Fases 2/3/4, com três APIs novas de logs já previstas. Não foi usado dado real como fixture nem mock de banco.

| Check | Resultado |
|---|---|
| SQL Fase 5 | **67 assertions PASS**, fixtures revertidas |
| Regressão logs Fase 3 | **175 assertions PASS** |
| Regressão Salmão Fase 4 | **146 assertions PASS** |
| Preflight negativo | **10 recusas PASS**: corpo, ACL função/tabela/coluna, overload, trigger desabilitado, default, policy, índice, novo caller |
| Concorrência/recuo Fase 5 | **13 checks PASS** com conexões reais |
| Concorrência/recuo Salmão | **15 checks PASS**, runner anterior com apenas guard do nome do banco adaptado |
| Vitest | **773/773**, 97 arquivos |
| TypeScript app/node, build | PASS |
| ESLint | **0 erros / 1.355 warnings**, baseline preservada |
| RBAC | PASS, zero blockers, dois important preexistentes |
| security:check | PASS estático; **SQL pulado por falta de configuração de serviço** |
| Deno | Não aplicável: nenhuma Edge alterada |

Cobertos anon, A, B, admin A, multi A/B, super, create-only, sem permissão e serviço; granular ALLOW/legado DENY; empresa/membership inativos/revogados; header inválido, forjado e placeholder; produto/fornecedor cruzados; tentativa de escolher empresa/ator/origem; criação/lookup/preço/recebimento/Salmão; falha tardia com digest integral de recursos, preços, custos e logs; renomeação preservando snapshot; FK da cotação e ON DELETE; repetição e disputa simultânea. Recebimento usa o contrato do frontend que marca RECEIVED antes da confirmação.

Reproduzir:

```powershell
./scripts/test-phase5-db.ps1 -TemplateDatabase moralles_phase4_test_committed -Database moralles_phase5_test_novo
node scripts/test-phase5-concurrency.mjs moralles_phase5_test_novo
```

O runner recusa nomes/host remoto, template com dados e banco já existente; não exclui nem reutiliza banco. O teste de concorrência deixa suas fixtures no banco descartável, após testar contenção. Para outro ambiente, reconstruir schema vazio atual e pré-requisitos conforme resultados das fases anteriores; o template local não é backup restaurável de produção.

## 5. Limites e pendências

- **Produção não corrigida.** Backup restaurável e integração com gateway/JWT/GoTrue/PostgREST/browser autenticado não foram comprovados. A suíte SQL usa papéis e contextos reais do PostgreSQL, não certifica transporte HTTP.
- Troca de escopo e resposta atrasada continuam cobertas pelos testes unitários existentes de CompanyScope/cliente imutável. Não houve novo ensaio autenticado de A→B especificamente no formulário de ranking. Revalidar esse fluxo no candidato integrado antes de promover.
- A Fase 3 histórica ainda aborta no Salmão publicado; reconciliação de release segue separada. A Fase 5 exige Fases 2/3/4 prontas, sem reabrir helpers ou editar histórico. Não aplicar db push indiscriminado.
- `trg_po_block_post_approval_changes` exige **compras:lista:approve** para mudar total confirmado de pedido que já saiu de OPEN/DRAFT/SUBMITTED. O ensaio registrou recusa com apenas recebimentos:close e sucesso com o ALLOW granular adicional. Regra preservada; eventual revisão da autorização de recebimento exige entrega própria.
- Idempotência de recebimento ensaiada para itens com produto/espelho e pedido concluído. Itens livres sem produto em pedido parcial mantêm o contrato legado; não foi inventada chave de requisição ou certificada idempotência geral desses itens.
- Renomear fornecedor não altera textos históricos. Reutilização do nome antigo que colida com preço ligado a outro UUID é recusada (`PRICE_IDENTITY_IMMUTABLE`); não retargetar/deduplicar automaticamente. Não existe saneamento pendente demonstrado nos quatro preços vivos.
- Permanecem fora do escopo: planejamento com conflito/coluna inválidos, inventário rápido com tipo incompatível, categorias fora do registry, edição de Salmão em duas chamadas, cancelamento externo em múltiplas requisições, estorno de Compras e revisão geral de produtos/permissões/FKs financeiras.

## 6. Ordem exata de produção e recuo

1. Confirmar projeto `wuzxpbixprrgssoeeaez`, candidato revisado, responsável, janela e **backup completo restaurável**. Capturar definições/ACLs, contagens/vínculos/custos de referência e deploys atuais. Nenhum push automático em main.
2. Tratar publicações anteriores explicitamente: Fase 2 com scheduler validado; reconciliar o preflight/release da Fase 3 com Salmão vivo sem editar migrations históricas; publicar/pós-validar logs e Fase 4 conforme seus relatórios. Não considerar o template de teste autorização para produção.
3. Reexecutar [preflight.sql](preflight.sql), inventário agregado e ensaio completo no mesmo candidato/schema atualizado. Qualquer drift ou dado órfão/cruzado/UUID ausente bloqueia aplicação; preparar revisão/saneamento separado e reversível se necessário. Validar fluxo HTTP A/B, ranking atrasado e usuários legítimos de recebimento (incluindo approve quando exigido).
4. Conferir lista de migrations e preparar lote **somente** `20260915225538`. Na janela, aplicar com CLI após confirmar o plano. Se MCP for necessário, aplicar só o SQL aprovado e reparar imediatamente na mesma sessão: versão local `20260915225538` como applied e a versão real criada pelo MCP como reverted; confirmar ambos no histórico.
5. Migration transacional com lock_timeout de cinco segundos; valida dados/FKs e resolução de colunas. Se falhar, manter candidato anterior e investigar, sem remover o preflight. Não há backfill nem deleção. Publicar frontend revisado em seguida; a versão antiga de ranking não pode gravar preços diretamente após a revogação. Nenhuma Edge nova nesta fase.
6. Executar [pos-validacao.sql](pos-validacao.sql); conferir ACL efetiva, owner/search_path, FKs validadas, UUID correto, ausência de duplicatas cruzadas e contagens/custos/vínculos preservados. Validar cadastro→preço→recebimento/entrada de Salmão com contas de teste autorizadas no ambiente apropriado. Confirmar deployment realmente ativo. Só então fechar H05 em produção.
7. Em incidente, pausar as operações afetadas e executar [phase5_fail_closed.sql](../../../supabase/rollback/phase5_fail_closed.sql): fecha upsert/preço/recebimento e CRUD direto de fornecedores/preços para authenticated; mantém leitura, dados, logs, índices, FKs, serviço e atômicas de Salmão protegidas. **Não restaura ACLs antigas nem desfaz memberships.** Indisponibilidade desses writers é deliberada. Recuperar por migration de avanço revisada, reensaiar e reconciliar histórico; o recuo não autoriza marcar a migration como nunca aplicada nem remover constraints.

## 7. Entrega

Commits locais: `59157c2` (correção) e `4b31d7a` (ensaio), seguidos pelo commit desta documentação; listar com `git log b44eeaf..codex/multiunit-phase5`. Sem push. Próxima tarefa: [prompt completo da Fase 6](../08-PROMPT-FASE-6.md).

Referências técnicas consultadas: [RLS e grants no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [FKs no PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK). Conclusões operacionais baseadas no catálogo vivo e testes deste candidato.
