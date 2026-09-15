# Fase 3 — Logs com escopo confiável

Data: 15/09/2026. Branch: `codex/multiunit-phase3`, sobre `f5e2f2d` da Fase 2. **Implementação e ensaio local concluídos; publicação e classificação do histórico de produção pendentes.** Somente a Fase 3 foi implementada. Nenhum push, deploy, migration, backfill ou teste de escrita foi executado em produção.

## 1. Publicação revalidada

Projeto confirmado: `wuzxpbixprrgssoeeaez`, PostgreSQL 17.6, ativo. Última conferência: **15:21 UTC / 12:21 Brasília**; [evidência final](publicacao-final.json).

- Fase 2 (`20260915140812`) continua ausente do histórico remoto; `cleanup_old_audit_logs` ainda tem EXECUTE para anon, `refresh_materialized_views` para authenticated, e `companies_admin` ainda usa `system:admin`. **C01/C02 continuam abertos em produção.** A Fase 2 não foi aplicada automaticamente.
- Produção Vercel segue em `1fdea27e69e3d687b49fdd04e91069b25cc70850`, deployment `dpl_BKSLbqzyKxgEsnfhdthKheMQGWvP`, READY. Deployments de preview não foram tratados como publicação de produção.
- Edges publicadas: `scheduled-jobs` v7, `inventario` v15, `ficha-tecnica` v10, `requisicao-estoque` v14; permanecem anteriores às alterações locais.
- As duas migrations desta fase também estão ausentes remotamente. Backup restaurável e integração HTTP completa com os serviços publicados não foram comprovados nesta sessão. A entrega fica local, conforme o limite do prompt.

## 2. Achados e modelo final

| Achado | Código/ensaio local | Produção |
|---|---|---|
| H01 — audit_log sem tenant | Writer atômico, empresa derivada do recurso, ator da sessão; leitura tenant + permissão | Aberto até publicação e backfill revisado |
| H02 — audit_logs sem atribuição/autorização confiável | Triggers e callers corrigidos; APIs genéricas fechadas; fronteiras restritivas de tenant e permissão | Aberto; histórico não alterado |
| H03 — integration_logs sem tenant | Caminho interno ligado ao recurso Salmão; ACL e leitura restritas | Aberto até publicação; tabela vazia no snapshot |

As três tabelas usam `log_scope` e `scope_reason`:

- **TENANT:** empresa válida, não placeholder. Eventos novos derivam escopo do recurso no servidor; ator vem da sessão autenticada ou do contrato de serviço da Edge.
- **GLOBAL:** somente manutenção conhecida do serviço ou administração global autorizada de empresas. NULL sozinho nunca certifica um evento global.
- **AMBIGUOUS:** histórico pendente, ausente, inválido ou contraditório. Preserva conteúdo e empresa antiga quando existente; não aparece em leitores tenant.

`company_id` continua nullable para os dois últimos casos. Não foi imposto NOT NULL indiscriminado. O histórico correlacionado recebe `legacy_resource_correlated`: **a atribuição de empresa não certifica a autoria nem a veracidade do conteúdo antigo**. Telas e exports de auditoria sinalizam essa procedência.

RLS e FORCE RLS nas três tabelas; authenticated tem somente SELECT. As duas fronteiras RESTRICTIVE impedem que outra policy permissiva abra tenant ou permissão. As chaves vêm do registry: `configuracoes:auditoria-seguranca:view`, `configuracoes:auditoria-sistema:view`, `configuracoes:performance:view`, `financeiro:auditoria:view`, com compatibilidade `system:read` e administração `system:global:manage`.

Mesmo o super admin consulta somente a empresa selecionada no SELECT direto. `list_restricted_logs` é o caminho explícito para GLOBAL/AMBIGUOUS, com tenant validado, permissão global, paginação e tabelas permitidas. `system:admin` não libera esse caminho. GlobalAuditView oferece esse escopo para `audit_logs`; as demais tabelas restritas são consultáveis pela mesma RPC autorizada, sem nova tela administrativa genérica.

## 3. Writers e readers revisados

| Caminho | Tratamento |
|---|---|
| StockCadastrosSection / usePurchaseOrdersStore | Removidos 12 + 3 INSERTs de auditoria no browser. Cinco triggers de recurso registram mudanças reais de campos permitidos na transação da operação. |
| `audit_trigger_fn` | Os **21 triggers ativos** passam a usar NEW/OLD, incluindo DELETE; ator autenticado, empresa do recurso, origem DB; impede mudança de empresa do recurso auditado. |
| `handle_first_admin` | **Nenhum trigger ativo** no catálogo; execução direta revogada. Não foi ativado nem alterado o desenho de Auth. O trigger real de criação de identidade segue `handle_new_user`. |
| `log_audit` (uuid/text), `audit_log_write` | Helpers internos; EXECUTE de PUBLIC/anon/authenticated/service_role revogado. Callers definers legítimos continuam chamando como owner. Nenhum cliente declara ator ou origem confiável. |
| Ficha técnica / requisição de estoque | `service_write_audit`: papel SQL real de serviço, membership ativo, recurso/empresa coerentes; Edges enviam ator e empresa já validados e checam o erro retornado. A permissão funcional é validada na Edge. |
| Inventário | Removido INSERT direto de finalização pela Edge; trigger registra status/risco de forma atômica. |
| `log_integration_error` / salmon_to_stock | Helper exclusivamente interno, valida referência a entrada/manipulação e conflitos. Não há caller ativo desse helper no catálogo; os caminhos atômicos de Salmão usam `log_audit`. Não foi inventada uma fila de erros durável. |
| Scheduler / cleanup / refresh | Contratos globais de serviço preservados; guard usa papel SQL da conexão, não claim `role` fornecida em JSON. Refresh e cleanup reais foram chamados somente sobre fixtures isoladas. |
| Administração de empresas | Eventos globais explícitos; recurso existente e permissão global, preservando a contenção da Fase 2. |
| SecurityAuditView / GlobalAuditView / PerformanceMonitorView | Fetch condicionado à permissão; escopo TENANT explícito; cancelamento lógico de respostas antigas e limpeza ao mudar cliente/escopo. Manutenção global visível só ao administrador global. |
| `_guarded_list_fin_audit_logs` | Acrescentado `log_scope='TENANT'` na fonte `audit_logs`; não abre histórico ambíguo pelo SECURITY DEFINER. |

Foi necessário retirar **somente o cast `::text` no INSERT de auditoria de IDs uuid** em `rpc_recebimentos_close`, `stock_transfer_between_locations` e `create_quick_inventory_atomic`. Os corpos completos são necessários ao CREATE OR REPLACE, mas cálculos, baixa, saldo e regras operacionais não foram modificados. O lint RBAC reconhece a nova entrada exclusiva de serviço e deixa de tratar os helpers genéricos fechados como RPCs administrativas públicas.

## 4. Histórico: contagens e limites de atribuição

Consultas de produção foram READ ONLY e não expuseram payloads nem identidades. Snapshots em momentos distintos, com tráfego concorrente:

| Primeiro snapshot desta fase | Total | Sem empresa | Com empresa |
|---|---:|---:|---:|
| audit_log | 113 | Coluna ainda inexistente | — |
| audit_logs | 35.335 | 33.807 | 1.528 |
| integration_logs | 0 | Coluna ainda inexistente | — |

Prévia posterior, em [preview-historico.json](preview-historico.json), após mais 16 eventos em `audit_logs`:

| Tabela | Total da prévia | Correlacionáveis com recurso | Devem permanecer ambíguos |
|---|---:|---:|---:|
| audit_log | 113 | 34 | 79 |
| audit_logs | 35.351 | 32.414 | 2.937 |
| integration_logs | 0 | 0 | 0 |

Motivos ambíguos: `audit_log` tem 73 eventos de identidade/global sem prova e seis recursos ausentes/não suportados; `audit_logs` tem 2.921 recursos ausentes/não suportados, nove eventos de identidade/global sem prova, quatro IDs ausentes/inválidos e três empresas de recurso inválidas/placeholder. Não houve conflito de pistas nesse snapshot; UUIDs inválidos e conflitos foram exercitados em fixtures.

**Não são contagens após backfill de produção.** Produção conserva o estado original. No ensaio, oito eventos legados de `audit_logs` resultaram em um TENANT e sete AMBIGUOUS, sem alterar payloads; dry-run não alterou linhas e a reexecução não consumiu registros já classificados. Os demais cenários cobrem as três tabelas e os eventos novos/globais.

Classificação usa lista fechada de recursos existentes e coteja empresa original, before/after/metadata/payload e IDs. Pistas isoladas, `source='db'` antigo, empresa atual do perfil ou membership atual nunca são prova suficiente. Recursos apagados e identidade Auth compartilhada ficam restritos. Mover um recurso auditado entre empresas é bloqueado; a resolução para backfill mantém `FOR SHARE` no recurso durante o lote.

`backfill_log_scope(tabela, lote, dry_run)` aceita somente serviço real, lote de 1–2.000 (padrão 500), **dry_run=true por padrão**. Usa FOR UPDATE SKIP LOCKED nos logs, uma transação por chamada e motivo final para não reclassificar ambiguidades. As migrations instalam o mecanismo; **não executam o backfill**. Dry-run repetido inspeciona o mesmo primeiro lote; para a prévia completa anterior à instalação, usar a consulta read-only arquivada. Não interpretar `scanned=0` isoladamente como fim se outro worker estiver segurando linhas.

## 5. Artefatos e proteções de drift

- [Migration 1](../../../supabase/migrations/20260915144030_trusted_log_writers_and_readers.sql): writers, readers, RLS/ACL, constraints, índices e guard de pré-requisito da Fase 2.
- [Migration 2](../../../supabase/migrations/20260915144031_classify_legacy_logs_safely.sql): classificador/lotes; verifica definições e prontidão dos writers da migration anterior.
- [Preflight](preflight.sql): somente leitura; funções/corpos/owner/ACL/overloads, políticas, colunas/defaults, constraints, triggers e grants de coluna. Locks das migrations têm timeout de cinco segundos. Divergência aborta; não contornar removendo o guard.
- [Definições anteriores](definicoes-anteriores.sql): cópia legível com espaços finais normalizados, **não rollback executável seguro**; o catálogo JSON conserva as definições capturadas usadas na comparação de drift.
- [Rollback de contenção](../../../supabase/rollback/phase3_fail_closed.sql): preserva todas as linhas, classificações e writers; fecha leitores e backfill, conserva manutenção autorizada da Fase 2. Recuperação por migration corretiva revisada; jamais restaurar as policies/APIs vulneráveis.
- [Pós-validação](pos-validacao.sql): grants, fronteiras, APIs fechadas e contagens agregadas. Executada no ensaio; pendente em produção.
- Catálogo, grants/triggers e `schema-evidence.json`: **318 definições SQL/PLpgSQL vivas** sem divergência contra o schema vazio usado no ensaio; zero views dependentes das três tabelas. Nenhum dado de produção importado para o banco de testes.

## 6. Testes efetivamente executados

PostgreSQL **17.10 real e isolado**, `127.0.0.1:15440`, database final `moralles_phase3_test_acceptance`. Pré-requisitos carregam o schema já migrado, sem reaplicar as seis migrations multiunidade. A Fase 2 é aplicada **somente nesse ensaio descartável** antes da Fase 3. Schema vazio SHA-256: `89360CDC5F0213FF9ECA374F0295AD2D29128474BA6762CB959DEDE00F05BD5B`.

| Verificação | Resultado |
|---|---|
| [SQL de autorização e operação](../../../supabase/tests/database/phase3_logs.sql) | **175/175 assertions**, transação revertida |
| [Runner de drift](../../../scripts/test-phase3-db.ps1) | **9 casos negativos** recusados: corpo, ACL de tabela, ACL de coluna, policy, trigger, overload, default, constraint e alteração de writer antes do backfill |
| [Concorrência, performance e recuo](../../../scripts/test-phase3-concurrency.mjs) | Duas conexões processam linhas distintas; nova escrita funciona; recurso não pode mudar durante classificação; reexecução vazia; recuo preserva digest integral das linhas e serviço |
| Paginação com 10.000 logs sintéticos | Índice parcial `audit_logs_tenant_page`; 50 linhas, **8,947 ms execução / 5,022 ms planejamento** local; não é benchmark de produção |
| Vitest | **719/719**, 91 arquivos |
| TypeScript / build Vite | Aprovados |
| ESLint | **0 erros / 1.349 warnings**, baseline preservada |
| RBAC | PASS, zero blockers; dois avisos importantes preexistentes |
| security:check | PASS estático; **SQL lint pulado por ausência de configuração de serviço**, não certifica SQL remoto |
| Deno | `check` aprovado em inventario, ficha-tecnica e requisicao-estoque |
| Advisors Supabase | Baseline viva anterior à publicação: 1 INFO e 6 WARN; não houve pós-publicação porque nada foi aplicado |

Cobertura SQL: anon, A, B, admin A, multi A/B, super e usuário sem permissão; granular ALLOW com legado DENY; membership revogado/inativo, empresa inativa, header inválido/cruzado; escrita direta e RPC genérica negadas; forja de ator/empresa/recurso/origem/global negada inclusive com grant acidental; APIs globais autorizadas; policies permissivas adicionais não contornam fronteiras; triggers reais, DELETE, compras, finalização normal de inventário e idempotência, baixa de CP com espelho/auditoria e helper interno de integração.

Reproduzir num cluster local descartável existente, usando um **novo nome de banco** e schema vazio atualizado/corroborado:

```powershell
./scripts/test-phase3-db.ps1 -SchemaFile .phase2.local/schema.sql -Database moralles_phase3_test_novo
node scripts/test-phase3-concurrency.mjs moralles_phase3_test_novo
bun run test
bunx tsc --noEmit -p tsconfig.app.json
bunx tsc --noEmit -p tsconfig.node.json
bun run lint
bun run rbac:lint
bun run security:check
bun run build
deno check --no-lock supabase/functions/inventario/index.ts supabase/functions/ficha-tecnica/index.ts supabase/functions/requisicao-estoque/index.ts
```

O schema indicado é artefato local ignorado; não é backup de produção. O runner não aceita host remoto nem apaga/reutiliza banco existente. A suíte SQL reverte fixtures; o runner complementar conserva seus dados sintéticos apenas no banco descartável para inspeção, após testar o recuo.

## 7. Limites conhecidos e próximos trabalhos

- Não houve navegação autenticada nas telas nem testes HTTP completos das três Edges contra Supabase publicado. Deno e banco real cobrem tipos/contrato SQL, não gateway ou sessão de browser. Validar antes de promover.
- Auditoria suplementar das Edges é best-effort e pode falhar após a operação; agora verifica/relata o erro. Não foi convertida em transação distribuída. Os novos triggers de recursos são atômicos.
- `_planning_upsert_meta_guarded` falha antes do log por `ON CONFLICT` incompatível (42P10); `_planning_delete_meta_guarded` por coluna `deleted_at` inexistente (42703). Os testes registram essas falhas **preexistentes**, sem alegar sucesso operacional; o contrato interno de `audit_log_write` foi testado separadamente. Corrigir planejamento em escopo próprio.
- `create_quick_inventory_atomic` usa tipo `rapido`, incompatível com o CHECK atual de tipos (`completo/parcial/ciclico`). A finalização normal foi testada; não há alegação de cobertura ponta a ponta do inventário rápido, transferência ou fechamento de recebimento. Os três ajustes uuid descritos acima não corrigem essas regras legadas.
- Policies de categorias de estoque ainda usam chaves `estoque:categorias:*` fora do registry. A operação de categoria no ensaio usa as permissões legadas existentes; as permissões de **leitura dos logs** foram testadas com granular ALLOW e legado DENY. Revisar o gate operacional na fase de RLS/RBAC.
- A revisão completa das RPCs internas de Salmão, espelhos, cancelamentos e grants permanece na **Fase 4**; o helper de integração sem callers ativos não prova esse fluxo.
- Históricos ambíguos não são resolvidos por quantidade nem por conveniência de tela. Precisam de nova evidência verificável, eventualmente revisão humana, antes de outra classificação.

## 8. Ordem exata para publicação futura

1. Confirmar novamente projeto, branch/commits revisados, estado de deploy, responsáveis e **backup restaurável**. Revalidar definições/callers/ACLs vivos e ensaiar o mesmo candidato com schema atual. Nenhuma autorização implícita de push em main.
2. Tratar a **publicação da Fase 2 separadamente**, pela sequência do seu RESULTADOS.md: scheduler, banco, frontend e pós-validação. C01/C02 precisam estar contidos, com manutenção de serviço comprovada. A migration da Fase 3 aborta se cleanup/refresh continuarem públicos. Não remover esse pré-requisito.
3. Reservar janela coordenada para os writers/Edges/clientes afetados. Obter contagens e prévia histórica read-only atualizadas; executar `preflight.sql`. Durante a transição, clientes antigos não podem manter a expectativa de INSERT direto de logs ou chamar helpers genéricos.
4. Aplicar `20260915144030` e depois `20260915144031` pelo CLI, conferindo resultado e histórico de migrations. Se o CLI falhar em múltiplos statements e for necessário MCP, fazer os dois `migration repair` correspondentes **na mesma sessão**, conforme AGENTS. Não aplicar migrations de outras fases por conveniência.
5. Publicar as três Edges (`inventario`, `ficha-tecnica`, `requisicao-estoque`) e o frontend revisado com tipos/readers/writers novos. Confirmar os commits/versões realmente ativos. Realizar testes de integração autorizados no ambiente apropriado antes de liberar tráfego operacional da janela.
6. Rodar `pos-validacao.sql`, conferir advisors e ACLs efetivos. Conferir criação/edição/finalização, auditoria tenant, A/B, leitor financeiro e eventos globais autorizados. Não disparar cleanup destrutivo em produção como teste de autorização.
7. Em sessão administrativa controlada, executar **dry-run** de `backfill_log_scope('audit_logs',500,true)` e equivalentes para as outras tabelas, usando papel real `service_role` sem expor credenciais. Revisar motivos e totais com a prévia. O default seguro não faz alterações.
8. Somente após a revisão, chamar lotes explícitos com `false`, uma transação por chamada, por tabela. Observar latência/locks; reduzir lote se necessário. Conferir contagem `scope_reason='legacy_pending'` e workers em andamento até zerar, além de somar TENANT/GLOBAL/AMBIGUOUS. Preservar todos os motivos ambíguos. Registrar contagens **antes/depois reais**, sem copiar a previsão deste relatório.
9. Pós-validar novamente os leitores, manutenção legítima, contagens e logs de erro; acompanhar a retomada do tráfego. Só então fechar H01/H02/H03 como publicados, mantendo a quantidade de ambiguidades remanescentes explícita.

Se houver falha, pausar rollout/backfill e usar o rollback de contenção revisado. Ele suspende a consulta dessas auditorias (inclusive a RPC financeira que as agrega) enquanto conserva escrita e dados. Não executar definições anteriores como rollback, não remover colunas e não restaurar permissões vulneráveis. Documentar o incidente e corrigir para frente.

## 9. Entrega

Commits locais: `92ef168` (implementação) e `c5d40c0` (testes/operação), seguidos pelo commit deste relatório e evidências; sem push. Consultar `git log codex/multiunit-phase2..codex/multiunit-phase3` para a lista final.

Próxima execução: [prompt completo da Fase 4](../06-PROMPT-FASE-4.md). A Fase 4 não foi iniciada nesta entrega.
