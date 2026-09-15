# Fase 6 — produtos e inventário automático de permissões

15/09/2026. Branch `codex/multiunit-phase6`, base `d21df57`. **Implementação e ensaio local concluídos; M01 continua aberto em produção até publicação e pós-validação.** Fase 7 não iniciada. Nenhuma escrita em produção, migration remota, repair, push ou deploy; nenhum dado real usado como fixture, apagado, unificado ou recalculado.

## Estado revalidado

- Checkout inicialmente limpo; fetch confirmou `origin/main=80dcf4e`, já incorporada. AGENTS/CLAUDE idênticos. Lidos contexto e documentos 00/01/02/03/ARCHITECTURE e resultados das Fases 2–5.
- Projeto `wuzxpbixprrgssoeeaez`, PostgreSQL 17.6. Snapshot de catálogo **23:27:40 UTC**; revalidação **23:45:01 UTC**: nenhuma versão das Fases 2–6 aplicada. `recalc_product_costs(uuid)` continua executável por anon/authenticated; dez policies de produtos permanecem vivas. C01/C02/H01/H02/H03/H04/H05 não foram encerrados.
- Vercel: domínio de produção `www.marginfood.com` continua em `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, READY, commit `80dcf4ec527d1a7e86ed3509496638b71219ab43`. Edges: scheduled-jobs v7, inventario v15, ficha-tecnica v11, requisicao-estoque v14, purchase-requisitions v10. Nenhuma Edge alterada nesta fase.
- Preflight desta fase, executado **READ ONLY em produção**, recusou com `PHASE6_PREREQUISITES_REQUIRED`. Não foi contornado. O bloqueio histórico da Fase 3 no Salmão permanece dependência de release separada; não foram editadas migrations históricas.

Evidências: [catálogo vivo](catalogo-vivo.json), [consulta](inventario.sql), [definições anteriores do candidato](definicoes-anteriores.sql), [comparação com produção](comparacao-schema.json), [após ensaio](apos-ensaio.json), [publicação](publicacao.json), [validação](validacao.json), [consumers AST](consumers.json). Definições/ACLs não são scripts de rollback. Sem payloads privados, secrets ou linhas de usuários.

## Correção M01

Migration [20260915232846_align_product_catalog_permissions.sql](../../../supabase/migrations/20260915232846_align_product_catalog_permissions.sql).

1. INSERT e UPDATE recebem respectivamente `estoque:catalogo:create/edit`. Preservados os gates funcionais anteriores de Cadastros/CMV e legados; INSERT aceita também `stock:write`, alias que o frontend já usa para create. Removidas somente as três policies paralelas de escrita `tenant_insert/update/delete`, semanticamente redundantes com as chaves legadas das policies principais: `has_permission_quick` vivo delega a `has_permission`, sem expansão de aliases.
2. Nova **`deactivate_produto(uuid)`**: identidade, membership/empresa ativos e permissão delete validados no servidor; SELECT por ID **e empresa**, com lock de linha; só escreve `ativo=false`. Não recebe payload, tenant ou ator. Repetição retorna o mesmo ID sem novo UPDATE/log. O trigger real de auditoria mantém operação/log na mesma transação.
3. `catalogo:delete` **não** foi acrescentada ao UPDATE ou DELETE físico. Delete-only não edita nome, custo, unidades, SKU, saldo, tenant, não reativa nem apaga fisicamente. UPDATE direto para inativar é recusado até para editor; a operação passa pela RPC dedicada. Reactivações permanecem edição. Leitura por ação permite INSERT RETURNING/edição sem depender de view adicional; navegação da tela continua sujeita a view.
4. O código atual tinha `canDeleteCatalogo` declarado, mas **Inativar/Reativar** usava edit e chamava `updateProduto`. Agora Inativar usa delete e `deleteProduto`→RPC; Reativar usa edit e UPDATE. Handler revalida a ação e relata erro. O formulário continua editando produto inativo sem reativá-lo implicitamente.
5. Cadastro envia `company_id` de `useCompanyId()`. O trigger deixa de substituir empresa arbitrária silenciosamente: INSERT compara com `assert_tenant()` e UPDATE recusa troca de tenant, inclusive pelo serviço real. Preservados defaults e callers internos legítimos; nenhum produto existente é movido.
6. SKU conserva assinatura, contador por empresa, algoritmo de reserva e índice único existente. Agora exige criação de produto. O caller interno de Salmão exige a autorização de criar entrada e prefixo **SALM**; isso preserva `ensure_salmon_raw_product`, seus corpos, lock e ACLs, sem conceder create genérico de produtos ao operador. Anon/service não recebem EXECUTE do gerador por conveniência.
7. **Contenção mínima adicional:** `recalc_product_costs(uuid)` é SECURITY DEFINER/postgres, executável por PUBLIC, sem identidade/tenant/permissão e atualiza custos de produto escolhido por UUID. É um caminho para contornar M01 inclusive entre empresas. Revogado EXECUTE de PUBLIC/anon/authenticated/service_role; corpo/fórmula intactos. Caller SQL localizado: `storno_purchase_order_stock(uuid)`, definer de mesmo owner; nenhum caller externo literal em frontend/Edges. O defeito de ordem de estorno desse caller continua pendente. Não executamos recalculação em produção como prova.
8. Retirados privilégios TRUNCATE/REFERENCES/TRIGGER/MAINTAIN de authenticated em produtos: não são limitados por RLS nem necessários aos consumers. SELECT/INSERT/UPDATE/DELETE e serviço real preservados conforme gates. Helper trigger fica interno.

## Matriz de ações e ACLs

| Caminho | Antes | Depois no candidato |
|---|---|---|
| SELECT direto | produtos_select + tenant_read + company_realtime_read, fronteira restritiva | Preservados; leitura adicional por ação de escrita na empresa validada |
| INSERT | Cadastros create/manage, stock:edit, global; tenant_insert paralelo | Acrescenta Catálogo create/stock:write, empresa explícita validada; sem policy paralela |
| UPDATE de campos/reativação | Cadastros edit/manage, CMV preços edit, stock:edit, global; tenant_update paralelo | Acrescenta Catálogo edit; USING/WITH CHECK completos; nenhuma permissão delete |
| Inativação | UPDATE genérico; UI dependia de edit | RPC UUID somente, Catálogo/Cadastros delete, Cadastros manage, stock:delete ou global |
| DELETE físico | Cadastros delete/manage, stock:delete, global + tenant_delete | Gate principal preservado; **Catálogo delete-only não ganha acesso**; FKs continuam recusando dependências |
| generate_next_sku | PUBLIC/anon/authenticated/service, sem gate funcional | authenticated-only + criação de produto ou entrada de Salmão no prefixo SALM |
| recalc_product_costs | PUBLIC/anon/authenticated/service, sem tenant/guard | Interno owner-only, mesma fórmula |
| deactivate_produto | Não existia | authenticated-only, definer/postgres, search_path vazio, actor/tenant/permissão explícitos |
| Tabela produtos | authenticated com arwdDxtm | authenticated com SELECT/INSERT/UPDATE/DELETE; service e owner preservados |

Dez policies vivas → oito no candidato (remove três duplicadas, acrescenta uma de leitura por ação). Fronteira restritiva, leitura Realtime, triggers de saldo e auditoria preservados. Grants herdados de papéis clientes, grants de coluna, nova policy/caller/overload e drift de índices/constraints/defaults são recusados pelo preflight. Não há concessão massiva, sync ou chave nova no registry.

### Consumers e preservação

| Consumer | Contrato conferido |
|---|---|
| Catálogo/useEstoqueGeralStore | SELECT paginado, counts/saldos RPC, SKU, INSERT com empresa, UPDATE de edição, RPC de inativação; client contextualizado/cache mantidos |
| StockCadastrosSection | Gerencia categorias/locais/setores, não é outro formulário de produtos. Gates antigos em produtos preservados; fantasmas nas tabelas auxiliares inventariadas |
| Compras/recebimento/preço | receive_purchase_order_atomic e upsert_supplier_price da Fase 5; produto/empresa canônicos, FKs compostas intactas. Fluxo Catálogo→preço/movimento real ensaiado |
| Salmão | ensure_salmon_raw_product→generate_next_sku('SALM'); wrappers/atômicas/FEFO/validade/estorno e índice produtos_one_active_salmon_raw intactos |
| Ficha técnica | FichaTecnicaView e Edge ficha-tecnica leem catálogo/custos; não escreve produto. Sem retirar grants de leitura |
| Inventário | QuickInventorySection lê produtos; create_inventory_atomic/quick e Edge inventario consultam/verificam produto; finalização e trigger atualizam cache pelo caminho interno |
| Estoque/requisição/relatórios/CMV/IA | Leitores, movements, cache e helpers constam no catálogo e grafo de callers; fórmulas não alteradas |

O catálogo contém todas as 321 funções SQL/PLpgSQL públicas e suas ACLs efetivas, 595 policies public/storage, todas as colunas/defaults, três triggers de produtos e constraints/índices inclusive referências de entrada. `objects` do inventário cruza callers SQL e frontend/Edges. Busca textual/AST é localizador: SQL dinâmico, overloads e delegação exigem revisão manual; não certifica todas as funções do sistema. `get_catalog_counts` e `get_saldo_produtos` preservam resolução de tenant e contrato de leitura; revisão geral de gates funcionais continua na Fase 7.

Comparação antes/depois confirma corpos idênticos de `get_stock_summary`, `get_stock_dashboard`, `get_relatorios_kpis`, `get_stock_predictive_analysis_v2`, `fn_recompute_product_saldo` e todas as funções Salmão. `produtos.saldo_atual` permanece a fonte de leitura; não houve ajuste de saldo/custo nem recálculo do ledger para fazer teste passar.

## Inventário automático

Gerador [audit-permission-inventory.ts](../../../scripts/audit-permission-inventory.ts); [resumo/critério/revisão](permissoes.md) e [ocorrências/grafo/ACLs](permissoes.json).

515 arquivos TS/TSX, 861 migrations, 321 funções e 595 policies vivas. **3.214 VÁLIDA, 1.602 LEGADA, 688 FANTASMA, 1.022 NÃO ENCONTRADA, 9 DIVERGENTE e 1.657 GLOBAL** são ocorrências textuais, não contagem de vulnerabilidades. DIVERGENTE é anotação semântica de M01; o helper de custo tem anotação em objects. Snapshot ausente é indisponibilidade; registro sem ocorrência literal não prova ausência de autorização. Fonte/localização, contexto, assinatura, ação, caller e ciclo de vida ficam no JSON.

As classes têm precedência e critérios explícitos no resumo. Literais e expressões dinâmicas separados; tipos/testes/comentários não viram gates ativos. Falsos positivos incluem eventos `estoque:produtos`, exemplos e literais de contexto. Chaves históricas como `system:read` fora do map/registry ficam FANTASMA pelo critério exato e exigem revisão de compatibilidade. GLOBAL caracteriza a chave, não automaticamente a tabela/recurso; system:admin continua local. Arrays OR, DENY, interseção restritiva e grants efetivos precisam ser analisados juntos. O banco não expande LEGACY_PERMISSION_MAP.

Reprodução determinística (mesmos inputs produzem mesmo SHA256):

```powershell
bun scripts/audit-permission-inventory.ts
```

Limites: corpos das Edges publicadas não foram baixados nesta fase; cobertura de Edge é código local + versões revalidadas. Catálogo vivo é anterior à candidata; migration não é prova de publicação. Objetos fora de produtos não tiveram todas as ACLs de tabela novamente avaliadas. A revisão semântica ampla pertence à Fase 7, não foi iniciada aqui.

## Ensaio e checks

PostgreSQL **17.10 real**, 127.0.0.1:15440, `moralles_phase6_test_final`. Template vazio `moralles_phase5_test_phase6_current`, derivado do template da Fase 5; somente schema/fixtures próprias. Quatro diferenças de bytes (CRLF) em admin_upsert_company_membership, list_report_items_page e duas funções Borderô foram conferidas com diff e alinhadas às definições vivas **apenas no template descartável**. Resultado: 297/321 corpos iguais; 24 diferenças das Fases 2/3/4/5 e funções novas de logs/preço explicadas. Nenhuma das seis migrations multiunidade foi reaplicada.

| Verificação | Resultado |
|---|---|
| SQL Fase 6 | **80 assertions PASS**, rollback das fixtures |
| Fase 6 drift | **13 recusas PASS**, incluindo herança de papel e pré-requisito ausente |
| Fase 6 concorrência/recuo | **12 checks PASS**; desativação simultânea idempotente, um log, SKU serializado, colisão recusada, referências preservadas |
| Regressões SQL Fases 3/4/5 no candidato Fase 6 | **175 + 146 + 67 PASS** |
| Regressão drift Fases 4/5 | **8 + 10 PASS**, seus runners originais em novos bancos de pré-requisitos |
| Concorrência/recuo Fases 4/5 sobre candidato Fase 6 | **15 + 13 PASS**, cópias locais dos runners com só guard do nome de banco adaptado |
| Vitest | **776/776**, 98 arquivos; inclui três novos testes do inventário |
| TypeScript app/node | PASS |
| ESLint | **0 erros / 1.355 warnings**, baseline preservada |
| RBAC | PASS: zero blockers, dois important preexistentes |
| Build | PASS; avisos de bundle/Browserslist anteriores |
| security:check | PASS estático; **SQL pulado por falta de configuração de serviço** |
| Deno | Não aplicável: nenhuma Edge alterada |

Matriz: anon, A, B, admin A, multi A/B, super, sem permissão, serviço real; catálogo/cadastros/create/edit/delete/view-only, sem role herdada, granular ALLOW/legadas DENY. Header forjado/inválido/placeholder, empresa inativa, membership revogado/inativo, empresa no payload, UUID/SKU cruzados, NULL, payload misto/extra e RPC vazia. UPDATE sem mudança (`id=id`) por delete-only retorna zero linhas. Claims de serviço forjadas não concedem acesso. Falha injetada no AFTER audit reverte produto/log; digests antes/depois comprovam preservação. Serviço real mantém escrita legítima, não pode retargetar tenant.

```powershell
./scripts/test-phase6-db.ps1 -Database moralles_phase6_test_novo
node scripts/test-phase6-concurrency.mjs moralles_phase6_test_novo
```

Runner recusa host remoto, template com dados, nomes fora do padrão e banco já existente; não exclui banco. Teste de concorrência conserva apenas fixtures sintéticas no descartável, após conter writers. Em outra máquina é necessário reconstruir schema vazio atual + pré-requisitos revisados, conforme relatórios das fases anteriores. Esse template não é backup restaurável de produção.

## Limites e riscos

- **Não certificado nesta fase:** gateway/JWT real, PostgREST/GoTrue e navegador autenticado no fluxo de Catálogo. Recusas de payloads foram exercitadas em SQL/RPC; não se alegam códigos HTTP observados. O ambiente não disponibilizou PostgREST/Docker nos comandos conhecidos. Antes de promover, realizar integração A/B/delete-only no candidato integrado.
- Nenhuma alteração no modelo de cache/estado por unidade; a suíte existente de CompanyScope/cliente imutável/resposta atrasada passou. É teste de UI/transporte, separado da autorização PostgreSQL real. Não houve teste novo de navegador A→B especificamente no Catálogo.
- Reserva de SKU e INSERT do formulário são requisições separadas: falha de INSERT pode deixar lacuna no contador, comportamento anterior. Não certificada idempotência de criação de produto por repetição HTTP. O índice por empresa recusa o mesmo SKU e a RPC de inativação é idempotente.
- Cadastros/stock:delete continuam podendo DELETE físico autorizado se nenhuma FK impedir; Catálogo delete-only não. Frontend antigo que inativa via UPDATE falha após a migration: publicar cliente coordenadamente. Não oferecer fallback inseguro.
- Backup restaurável não comprovado; pré-requisitos anteriores não autorizados para produção. A exposição viva de recalc_product_costs exige priorização de release/contensão revisada; permanece aberta até publicação.
- Pendências anteriores preservadas: planejamento com conflito/coluna inválidos; inventário rápido com tipo incompatível; categorias fora do registry; Salmão editado em duas chamadas; cancelamento externo em múltiplas requisições; estorno de Compras; recebimento pós-aprovação exige compras:lista:approve; idempotência geral de itens livres parciais não certificada.

## Sequência exata de publicação e recuo

1. Confirmar projeto `wuzxpbixprrgssoeeaez`, candidato revisado, responsável/janela, commits realmente integrados e **backup completo restaurável**. Capturar catálogo/ACLs, dados de referência por consulta agregada autorizada e deploys atuais. Nenhum push automático em main.
2. Tratar release das Fases 2/3/4/5 explicitamente conforme seus relatórios. Reconciliar o guard histórico da Fase 3 com o Salmão vivo por artefato de avanço revisado; nunca editar histórico, reabrir log_audit/audit_log_write ou conceder EXECUTE para fazer passar. Pós-validar cada fase. Sem isso, a Fase 6 deve continuar recusada.
3. Atualizar snapshot e rodar [preflight](preflight.sql) READ ONLY no projeto e ensaio completo do mesmo candidato. Não apenas mudar fingerprints para aceitar drift. Conferir callers novos/dinâmicos e efetivos grants herdados. Validar HTTP/browser com contas/fixtures próprias em integração, incluindo delete-only e inativação/reativação.
4. Conferir histórico/lista e preparar lote **somente `20260915232846`**, com as dependências já publicadas e verificadas. Não executar `db push` cego. Aplicar via CLI com plano conferido na janela; se MCP for necessário, aplicar só SQL aprovado e reparar imediatamente na mesma sessão: `migration repair --status applied 20260915232846 --yes` e `migration repair --status reverted <versão-real-criada-pelo-MCP> --yes`; conferir histórico final.
5. Migration é transacional e usa lock_timeout de cinco segundos. Falha aborta; nenhum dado é reescrito. Publicar frontend com a RPC/gates/empresa explícita logo após a migration, com clientes antigos pausados. Nenhuma Edge nova nesta fase.
6. Rodar [pós-validação](pos-validacao.sql); conferir as oito policies (incluindo a fronteira), ACL efetiva/owner/search_path, overload único, ausência de acesso público ao helper de custo e preservação das FKs/índices/cache. Validar Catálogo→preço/recebimento, criação automática de Salmão, auditoria, scopes A/B e operação delete-only com autorização apropriada. Conferir commit ativo. Só então encerrar M01 e a contenção adicional em produção.
7. Em incidente, pausar writers e executar [phase6_fail_closed.sql](../../../supabase/rollback/phase6_fail_closed.sql): fecha INSERT/UPDATE/DELETE direto de produtos, RPC de inativação e SKU para clientes, mantendo leitura, dados, histórico, FKs/índices, serviço e funções internas. Não restaura grants antigos. Callers internos SECURITY DEFINER permanecem: contenção é do Catálogo/APIs fechadas, não paralisação universal do estoque. Recuperar por migration de avanço e ensaio; não marcar a versão como nunca aplicada nem desfazer memberships.

## Entrega

Commits locais: `05d71e2` (correção) e `f22b65b` (ensaio/inventário), seguidos pelo commit deste relatório/evidências; consultar `git log d21df57..codex/multiunit-phase6`. Sem push. Próxima tarefa: [prompt completo copiável da Fase 7](../09-PROMPT-FASE-7.md), **não iniciada**.

Referência consultada: [RLS e grants no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). Conclusões do projeto baseadas em código, catálogo e ensaio real.
