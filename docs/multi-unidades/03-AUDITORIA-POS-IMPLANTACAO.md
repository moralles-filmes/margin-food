# Auditoria pós-implantação multiunidade

Data: 2026-09-15. **Fase 1 concluída; Fases 2, 3 e 4 implementadas e ensaiadas localmente, com publicação pendente. Estabilização ainda em andamento.**

Atualização Fase 2: [resultados, testes e sequência de produção](fase2-20260915/RESULTADOS.md). C01/C02 foram corrigidos no código e testados com 82 assertions SQL reais, cinco casos de drift e rollback de contenção; **continuam abertos em produção**, que recebeu somente leituras. A baseline e os achados abaixo preservam a auditoria da Fase 1.

Atualização Fase 3: [resultados, classificação e ordem de publicação](fase3-20260915/RESULTADOS.md). H01/H02/H03 corrigidos localmente com 175 assertions SQL, nove casos de drift, concorrência e recuo com preservação integral. **Continuam abertos em produção**; Fase 2 revalidada como não publicada em 15/09 às 15:21 UTC. A prévia histórica encontrou 34/32.414 eventos correlacionáveis em audit_log/audit_logs e 79/2.937 ambíguos, sem executar backfill. Próximo prompt: [Fase 4 — Salmão e grants](06-PROMPT-FASE-4.md).

Base: `main`, commit `1fdea27e69e3d687b49fdd04e91069b25cc70850`. Diretório inicialmente limpo. Projeto consultado: `wuzxpbixprrgssoeeaez`. Produção recebeu apenas consultas de leitura; nenhuma RPC de escrita foi executada, nenhuma migration, deploy ou reparação de histórico foi aplicada.

Atualização Fase 4: [resultados, ACLs, testes e publicação](fase4-20260915/RESULTADOS.md). Main atualizada até `80dcf4e` foi integrada, preservando validade/FEFO e correção de estorno do Salmão. H04 corrigido localmente com 146 assertions SQL, oito recusas de drift e 15 checks de concorrência/recuo; regressão de 175 assertions de logs e 773 unitários aprovada. **Às 20:28 UTC, Fases 2/3/4 ainda ausentes do banco vivo.** O preflight histórico da Fase 3 precisa ser reconciliado com as assinaturas/corpos de Salmão já publicados; não foi contornado. `20260910003448` reapareceu no Git e histórico remoto, sem encerrar a revisão histórica da Fase 9. Próximo prompt: [Fase 5 — fornecedores](07-PROMPT-FASE-5.md).

## 1. Resumo executivo

A arquitetura de memberships e clientes imutáveis por empresa está presente e deve ser preservada. Os riscos encontrados estão em caminhos legados que continuam acessíveis no banco.

**Prioridade imediata:** limitar manutenção global de logs e administração de empresas. Depois, corrigir os três caminhos de auditoria e recuperar o tenant dos registros históricos com evidência.

Dois achados CRITICAL:

1. `cleanup_old_audit_logs(integer)` executa DELETE global como postgres, sem autorização, e tem EXECUTE efetivo para anon/authenticated.
2. `companies_admin` concede ALL usando somente `system:admin`, que é uma permissão de admin de unidade. A leitura de uma empresa sem membership foi reproduzida sob RLS.

O relatório anterior não representa integralmente o banco atual:

- `audit_logs` **já tem** coluna de empresa, FK, índice e fronteira restritiva. Seu problema inclui escrita sem empresa e leitura intraempresa sem permissão funcional.
- Os nomes reais das RPCs internas são `create_salmon_entry_atomic`, `cancel_salmon_entry_atomic` e equivalentes de manipulação; os nomes `_salmon_*_atomic` citados na pendência não existem.
- `suppliers` **já tem** UNIQUE `(name, company_id)`. A RPC ainda usa `ON CONFLICT(name)`, sem índice compatível.
- As 844 versões locais e remotas coincidem. Isso não resolve a rastreabilidade da migration desaparecida nem prova equivalência do schema.

Nenhum achado foi marcado como resolvido no banco vivo. As correções locais de C01/C02 e H01/H02/H03 estão documentadas separadamente acima.

## 2. Evidências e reprodução

| Artefato | Conteúdo |
|---|---|
| [Catálogo](auditoria-20260915/catalogo.json) | 149 tabelas públicas; flags RLS; coluna/default de empresa; constraints, índices, triggers e grants; 595 policies public/storage; 353 funções públicas e grants efetivos; 17 Edge Functions publicadas; Storage/Realtime |
| [Consultas](auditoria-20260915/inventario.sql) | Inventário executável em transação READ ONLY; não é migration |
| [Sondagem de admin](auditoria-20260915/sondagem-admin-leitura.sql) | Seleciona um vínculo real com system:admin e sem permissão global; aplica contexto de sessão e SET LOCAL ROLE authenticated; retorna apenas contagens; ROLLBACK |
| [Consumidores](auditoria-20260915/consumidores.json) | Localizações de acessos e escritas em frontend/Edges; imports, RPCs, persistência, query keys, canais |
| [Gerador](../../scripts/audit-multiunit-consumers.mjs) | AST TypeScript; não lê arquivos de ambiente; exclui testes e tipos gerados do banco |
| [Próxima fase](04-PROMPT-FASE-2.md) | Escopo e critérios de aceite da contenção crítica |

Os snapshots são de consultas separadas, não um dump transacional único. O catálogo não contém payloads de logs, nomes/e-mails de usuários, tokens ou valores de secrets. Registros de contagem são evidência da data da coleta e devem ser revalidados antes de migrations.

Regerar consumidores na raiz:

```sh
node scripts/audit-multiunit-consumers.mjs > docs/multi-unidades/auditoria-20260915/consumidores.json
```

O inventário AST encontrou 164 arquivos relevantes, 564 chamadas `.from`, 207 RPCs, 96 `.insert/.upsert`, 25 propriedades `queryKey`, seis inscrições `postgres_changes`, 53 operações de persistência e 30 `.invoke`. São localizações para revisão, não 96 violações: alvo dinâmico, origem do payload e eventuais APIs homônimas requerem interpretação. Referências de tipos/imports não significam uso operacional do cliente global.

### Abrangência desta fase

Lidos AGENTS/CLAUDE e os documentos 00/01/02/ARCHITECTURE; examinadas as seis migrations de implantação e correções posteriores pertinentes, histórico Git, resolvers vivos, policies, funções de logs/Salmão/fornecedores/admin e arquitetura de frontend. Catalogadas todas as tabelas públicas e todas as policies public/storage. A revisão semântica de cada função, de cada INSERT, de todas as permissões e de todas as Edges pertence às fases abaixo.

`mentions_tenant` e `mentions_permission` no catálogo são pistas textuais. Não comprovam autorização e podem ter falsos positivos/negativos por delegação, comentários e funções de trigger.

## 3. Achados por severidade

Todos os itens abaixo estão **ABERTOS em produção**. C01/C02 possuem correção ensaiada na Fase 2, H01/H02/H03 na Fase 3; os demais permanecem para as etapas seguintes.

### C01 — CRITICAL — Limpeza global de auditoria chamável por anon

**Fase 2:** contenção local na migration `20260915140812`; service_role-only, guard da conexão, retenção 24–120 meses, callers/Edge ajustados e teste real aprovado. Aplicação/pós-validação em produção pendentes.

- Objeto vivo: `public.cleanup_old_audit_logs(integer)`, SECURITY DEFINER, owner postgres, `search_path=public`.
- `has_function_privilege('anon', ..., 'EXECUTE')` e authenticated retornaram true.
- Corpo: `DELETE FROM audit_logs WHERE created_at < now() - (p_months || ' months')::interval`; sem identidade, tenant, permissão ou limite de retenção.
- A proteção por segredo em `supabase/functions/scheduled-jobs/index.ts:12` protege a Edge, mas não a chamada direta à função no banco.
- Evidência local: `20260228170034_split_3.sql`; corpo e grants conferidos no catálogo vivo.
- Impacto: endpoint de banco permite apagar auditoria de todas as empresas; um parâmetro inadequado amplia a janela de exclusão. A função não foi chamada para demonstrar destruição.
- Correção proposta: limitar entrada de manutenção ao papel autorizado do scheduler, revogando também PUBLIC; validar retenção; preservar o job legítimo. Investigar junto `refresh_materialized_views()`, igualmente SECURITY DEFINER, sem guard e executável por anon, que faz trabalho global e limpa cache.
- Teste exigido: banco real isolado, anon/usuário comum/admin local recusados antes de efeitos; scheduler autorizado continua funcionando; parâmetros inválidos recusados; conferir ACL efetiva, não só grants diretos.

### C02 — CRITICAL — Admin de unidade consegue atravessar cadastro de empresas

**Fase 2:** policy/RPC legada exigem permissão global no código corrigido; removidos grants TRUNCATE/REFERENCES/TRIGGER/MAINTAIN de authenticated. Ensaio A/B/global aprovado; sondagem viva ainda reproduz duas empresas reais sem membership até publicação.

- Policy viva `companies_admin`: PERMISSIVE, ALL, TO authenticated, `USING ((SELECT has_permission(auth.uid(),'system:admin')))`, sem restrição por linha.
- authenticated possui SELECT/INSERT/UPDATE/DELETE na tabela. Não há fronteira restritiva em `companies`; único trigger de negócio é inicialização de categorias após INSERT.
- Sondagem de leitura com contexto de um admin real: `local_admin=true`, `global_admin=false`, quatro empresas visíveis, três fora do escopo e **duas empresas reais sem membership ativo**, além do placeholder. A sondagem final exclui o placeholder ao escolher o cenário; o total de empresas inclui essa linha reservada.
- A mesma policy cobre escrita; UPDATE destrutivo não foi realizado. Impacto potencial inclui desativar outra empresa e interromper seus acessos.
- `rpc_create_company(text,text)` também usa apenas `system:admin`. Em contraste, `update_company`, `list_companies` e `onboard_new_company` exigem a permissão global.
- Origem local: `20260301013203_split_0.sql`, otimização em `20260806173000_fix_rls_auth_initplan_bulk.sql`. O comentário de `20260914140000_logs_auditoria_chaves_granulares.sql:31` chama system:admin de gate global; isso contradiz a regra atual e não deve ser copiado.
- Correção proposta: separar descoberta de memberships, administração local legítima e administração global; fechar a policy e a RPC legada sem mudar identidade/memberships existentes.
- Testes: admin A não lê/altera B; não cria empresas por RPC legada; super admin mantém fluxo legítimo; usuário multiunidade mantém seleção via `list_my_companies`.

### H01 — HIGH — audit_log sem isolamento entre empresas

**Fase 3:** migration `20260915144030` adiciona escopo, RLS/ACL e triggers atômicos que substituem os INSERTs do browser/Edge. `handle_first_admin` não tem trigger ativo. Histórico classificado somente por recurso corroborado, via mecanismo explícito de `20260915144031`; prévia 34 tenant/79 ambíguos. Publicação/backfill pendentes.

- Sem company_id, FK/índice de empresa, FORCE RLS ou fronteira restritiva.
- SELECT exige apenas uma das permissões `configuracoes:auditoria-seguranca:view`, `system:read`, `system:global:manage`; não verifica empresa da linha.
- INSERT checa somente `auth.uid()=user_id`; permite declarar tabela/registro sem validar vínculo ao recurso.
- 113 linhas históricas: 73 de auth.users, sete inventarios, nove purchase_orders, 16 stock_categories, quatro stock_locations e quatro stock_sectors.
- Na sondagem, o admin viu todas as 113 linhas. A atribuição individual de cada linha ainda precisa do backfill; não foi presumida pela empresa atual do ator.
- Writers: 12 INSERTs em StockCadastrosSection; três em usePurchaseOrdersStore; Edge inventario ao finalizar; função trigger `handle_first_admin` contém escrita relacionada ao log (a ativação desse trigger no schema Auth deve ser confirmada).
- Reader: `SecurityAuditView.tsx:43`, cliente contextualizado; o header não isola tabela sem predicado por tenant.
- Correção/teste: fase 3, com escrita autenticada não falsificável, leitura A/A permitida e A/B negada; histórico sem atribuição confiável permanece restrito.

### H02 — HIGH — audit_logs perde tenant e ignora permissão funcional na leitura

**Fase 3:** 21 triggers, helpers/callers e readers corrigidos localmente; APIs genéricas internas, duas fronteiras RESTRICTIVE e serviço/global explícitos. Prévia posterior: 35.351 eventos, 32.414 correlacionáveis e 2.937 ambíguos. Não substituir os números da baseline abaixo por uma alegação de backfill executado.

- Possui company_id nullable, FK para companies, índice `idx_audit_logs_company_created`, RLS e `multiunit_scope_boundary`; FORCE RLS false.
- `audit_logs_select_tenant` libera qualquer membro do tenant, independentemente da permissão da tela. A policy `perm_audit_logs_select` não restringe essa liberação porque ambas são permissivas.
- `audit_logs_insert_tenant` exige apenas a empresa: sem impor ator, origem ou entidade. Além disso, `log_audit(...uuid...)` insere como definer sem identidade/tenant; a sobrecarga text delega à uuid quando o ID é válido. `log_integration_error` tem exposição semelhante.
- `audit_trigger_fn` grava before/after, mas não company_id. Há 21 triggers públicos usando essa função. `log_audit(...uuid...)` também omite company_id. Não existe trigger na própria audit_logs preenchendo-o.
- Contagem atual: **34.997 logs, 33.469 sem empresa (95,6%) e 1.528 atribuídos**. Dos nulos, 33.435 têm pista em before/after/metadata; 34 não têm. Nenhuma divergência before.company_id × after.company_id foi contada, mas validade de UUID, empresa existente e origem confiável ainda precisam de preflight.
- O histórico nulo fica invisível no acesso tenant normal, inclusive na RPC financeira filtrada por empresa. Isso não significa ausência do evento no banco.
- Na sondagem, `audit_logs_other_company=0`: isolamento das linhas atribuídas preservado no contexto testado. Não declarar cross-tenant indiscriminado nesta tabela.
- Readers: GlobalAuditView, PerformanceMonitorView e `_guarded_list_fin_audit_logs`. Esta última já exige tenant + `financeiro:auditoria:view`/global e filtra ambos os braços do UNION.
- Correção/testes: fase 3 deve tratar geração, atribuição histórica, leitura por permissão, falsificação por INSERT/RPC e logs globais explícitos conjuntamente.

### H03 — HIGH — integration_logs sem tenant, writer privilegiado público

**Fase 3:** tenant derivado da referência Salmão, ACL de escrita exclusivamente interna, leitura tenant + permissão, escopo ambíguo preservado. Nenhum caller ativo de `log_integration_error` nem linha na tabela no catálogo atual; fluxo completo de Salmão continua na Fase 4. Publicação pendente.

- Tabela sem company_id, FK de tenant, índice de tenant, FORCE RLS ou fronteira.
- SELECT depende apenas de `system:read`. Sem consumidor de leitura localizado em src/Edges; isso não impede acesso direto via Data API.
- Zero linhas na coleta. Ausência atual de dados reduz exposição histórica, não elimina o caminho inseguro.
- `log_integration_error(text,text,text,text,jsonb)` grava como postgres sem tenant/identidade/permissão e é executável por anon/authenticated.
- Modelo principal é integração Salmão → Estoque, portanto tenant operacional. Distinguir eventos de infraestrutura antes de permitir escopo global.
- Correção/testes: fase 3, revisão de chamadas transitivas e erro dentro de transação; negar publicação de payload atribuído a outra unidade.

### H04 — HIGH — RPCs internas de Salmão contornam os wrappers

- Nomes vivos: `create_salmon_entry_atomic`, `cancel_salmon_entry_atomic`, `create_salmon_manipulation_atomic`, `cancel_salmon_manipulation_atomic`.
- Todas SECURITY DEFINER, com EXECUTE efetivo para authenticated e anon; validam identidade/tenant, mas não permissão funcional.
- Anon não passa assert_tenant; o vetor principal é membro autenticado sem acesso funcional.
- Frontend `useSalmonStore.ts:401` e demais operações usam `_salmon_*_guarded`, que validam permissão e chamam as internas. Isso não protege quem chama diretamente as internas.
- `ensure_salmon_raw_product()` também requer revisão de exposição porque modifica catálogo.
- Correção: fase 4, decidir quais funções são realmente internas, revogar PUBLIC/anon/authenticated conforme dependências, manter gates públicos e uso pelas Edges.
- Testes: membro sem permissão não cria/cancela; usuário autorizado mantém entrada, manipulação, espelho e cancelamento idempotente.

### H05 — HIGH — upsert_supplier incompatível com unicidade existente

- Schema vivo: `suppliers_name_company_key UNIQUE(name,company_id)`; nenhum UNIQUE(name) isolado. company_id NOT NULL com DEFAULT get_current_company_id().
- RPC: INSERT(name) e `ON CONFLICT(name) DO UPDATE`. O alvo não encontra índice árbitro compatível; erro esperado 42P10, sem chamar RPC de escrita em produção.
- 52 fornecedores, zero company_id nulo, zero órfãos de empresa e zero grupos duplicados por (company_id,name).
- Não há evidência de UPDATE cruzado bem-sucedido com esse schema: o defeito atual é incompatibilidade da RPC. Não recriar uma constraint que já existe.
- Consumer `RankingFornecedoresView.tsx:101` passa `supplier_id` como `p_name` e ignora o ID retornado; o upsert de preço seguinte também requer revisão da identidade do fornecedor e company_id.
- Correção/testes: fase 5, mesmo nome em A/B, reuso dentro de A e execução real do cadastro/preço.

### M01 — MEDIUM — Produtos: catálogo × cadastros

- `produtos_insert/update/delete` usam estoque:cadastros e legadas; faltam estoque:catalogo:create/edit/delete usados por EstoqueGeralView.
- Existem ainda policies tenant_insert/update/delete paralelas com has_permission_quick e chaves legadas. Avaliar a combinação completa, não só três nomes.
- Excluir no catálogo é UPDATE ativo=false. Conceder genericamente UPDATE por permissão de delete pode liberar edição indevida de outras colunas: distinguir ação e payload no desenho da correção.
- Correção/testes: fase 6, ALLOW granular + DENY legado e tentativa de editar campos com permissão apenas de excluir.

### M02 — MEDIUM — Divergência de documentação e cobertura de segurança

- 149 tabelas públicas, 139 com company_id, 137 com fronteira; profiles/memberships têm políticas próprias.
- 47 sem FORCE RLS; z_canary_test sem RLS, porém o catálogo de grants mostra acesso apenas de service_role e nenhuma concessão a anon/authenticated. Não há comprovação de exposição pública dessa canary.
- 353 funções públicas, incluindo helpers/extensões; 295 SECURITY DEFINER, 272 destas executáveis por authenticated e 183 por anon. Esses números são superfície de revisão, não 183 vulnerabilidades.
- FORCE RLS não neutraliza owner com BYPASSRLS. Functions definer requerem guard próprio e ACL.
- security:check retorna exit 0 mesmo quando pula a análise SQL por falta de secrets. Não equivale a uma certificação do banco.
- docs/ARCHITECTURE ainda diz “NUNCA enviar company_id” em 15.2, e outros trechos dizem o contrário. O padrão atual é payload explícito nas tabelas tenant, validado no backend.
- Correção: fases 6–11, com inventário classificado, sem aplicar FORCE ou coluna em objetos globais indiscriminadamente.

### M03 — MEDIUM — Drift sem rastreabilidade conclusiva

- Conjunto das versões: 844 locais = 844 remotas, diferenças vazias.
- `20260910003448_fix_membership_legacy_admin_delegation` não está nos arquivos, nem no histórico local `git log --all -- caminho`, nem na lista remota atual.
- Migrations posteriores alteram administração e o corpo vivo já inclui correções; não é possível reconstruir autoria/conteúdo da versão ausente somente por coincidência de versões.
- Correção: fase 9, comparar definições/ACLs e fontes históricas disponíveis; nenhuma repair foi executada. Se necessário, criar migration nova idempotente, sem fabricar a original.

### L01 — LOW — Seis testes estáticos falham nesta máquina

- Quatro falhas em marcaCategoriaVinculoMigration.test.ts e duas em presentationRevenueByStoreNetMigration.test.ts.
- Asserções com strings multilinha LF e marcadores; migrations locais possuem CRLF (147/147 e 759/759 quebras, respectivamente). Hipótese forte de incompatibilidade de fim de linha; não é evidência de erro financeiro em produção.
- Resolver no harness/testes, sem reescrever migrations históricas. Esta fase não modificou testes nem executou novamente com resultados mascarados.

## 4. Modelo dos logs para a fase 3

| Tabela/caminho | Classificação preliminar | Fonte aceitável de atribuição |
|---|---|---|
| audit_log: inventário, compras, cadastros | TENANT-SCOPED | Recurso referenciado, quando ainda existente e com vínculo único; histórico verificável |
| audit_log: auth.users | MISTO/A CLASSIFICAR | Evento pode ser identidade global ou administração de membership. O usuário pode pertencer a várias empresas; não inferir pela empresa atual do perfil |
| audit_logs: audit_trigger_fn e RPCs operacionais | TENANT-SCOPED | NEW/OLD.company_id validado; objeto afetado; contexto autorizado da operação |
| audit_logs: scheduled-jobs, refresh global, cleanup | GLOBAL legítimo | Execução de infraestrutura autenticada pelo papel de serviço; nunca fallback silencioso de INSERT sem tenant |
| integration_logs: salmon_to_stock | TENANT-SCOPED | Recurso de salmão/estoque e empresa da operação autorizada |
| integration_logs: outros módulos futuros | A CLASSIFICAR | Contrato explícito antes de disponibilizar writer |

Regras do backfill:

1. Corrigir writers para interromper geração de novos nulos.
2. Validar UUIDs, empresas existentes/ativas quando aplicável, ausência de contradições entre pistas e titularidade da entidade.
3. before/after/metadata não são prova suficiente sozinhos: writers antigos aceitam conteúdo fornecido pelo cliente. Corroborar origem e recurso.
4. Usuário com um membership hoje não prova onde operava na data passada. Não atribuir automaticamente por profiles.company_id.
5. Preservar registros ambíguos em escopo restrito e identificável, sem apagá-los ou inventar empresa.
6. Eventos globais devem ter via de escrita e leitura explicitamente globais. NULL não pode ser sinônimo automático de “global confiável”.
7. Snapshot/backfill deve considerar concorrência, contagens antes/depois, batches quando necessários, rollback seguro e teste das funções de trigger. Inserir NOT NULL antes disso quebra writers e pode reverter operações de negócio.

## 5. Classificação das tabelas sem company_id

| Tabela | Natureza | Tratamento |
|---|---|---|
| app_config | GLOBAL | Parâmetros de plataforma, service-role-only |
| permissions | GLOBAL | Catálogo RBAC; não prova que chave ainda pertence ao registry |
| role_permissions | GLOBAL | Templates; escrita global restrita |
| unidades_medida | GLOBAL | Catálogo de medidas |
| security_risk_register | GLOBAL | Registro de riscos da plataforma, gate global |
| companies | GLOBAL, com leitura de descoberta limitada | Cada linha é uma unidade; separar escopos de administração e descoberta (C02) |
| dashboard_cache | GLOBAL/REVISAR conteúdo | Cache técnico sem policies permissivas; confirmar que agregados tenant não são expostos por RPCs |
| z_canary_test | GLOBAL técnico | Sem RLS; somente grants de serviço observados; não apagar dados como correção automática |
| audit_log | MISTO histórico | Segregar operação de unidade e identidade/global com evidência |
| integration_logs | TENANT-SCOPED predominante | Integração operacional, hoje vazia |

As demais 139 tabelas têm company_id, mas presença de coluna não constitui revisão de todos os fluxos. `audit_logs` exige modelo misto explícito; profiles tem identidade compartilhada; memberships, user_roles e user_permissions representam acessos locais. Backups com company_id permanecem preservados e entram na revisão de grants e exposição.

## 6. Frontend, Edge Functions, Storage e Realtime

### Evidências positivas preservadas

- `CompanyScopeProvider`: lifetime por userId/companyId/mode; QueryClient próprio; cancelQueries, clear e dispose no teardown.
- `createCompanyClient`: header imutável, AbortController, validação da identidade da sessão e remoção de canais. Uma operação já confirmada no servidor não é desfeita pelo abort.
- `AuthContext`: geração da requisição evita resposta antiga sobrescrever unidade; preferência por identidade; revalidação periódica e evento de revogação.
- `get_current_company_id` vivo valida header via membership ativo + companies.ativo. Sem header usa apenas origem autorizada. `get_company_permissions` aplica DENY e escopo.
- Registry não expande system:admin para global. A falha C02 está no backend, não autoriza restaurar expansão no frontend.
- Import global em useSalmonStore é usado pelo helper Auth fora do hook; operações internas usam variável de useSupabase. EstoqueGeralView tem import residual sombreado pela variável contextualizada. Helpers de apresentação têm referências de tipo, não singleton operacional.
- CORS compartilhado lista x-company-id e resolve origem na allowlist.

### Inventário e limites

17 Edges publicadas ACTIVE no snapshot; bodies remotos completos ainda não comparados ao Git. Localmente há auth/session, clientes contextualizados e service role com filtros explícitos; uma revisão por rota/ação ainda é necessária.

Um bucket: rh-documentos, privado. Policies de Storage estão salvas no catálogo. Publicação Realtime contém produtos, movimentacoes_estoque, notifications, purchase_orders, cotacoes e cotacao_fornecedores.

Não foi repetido nesta fase o fluxo JWT/HTTP/Storage/WebSocket real A → B → alteração em A. A sondagem SQL testa o papel PostgreSQL e o contexto da requisição, mas não testa emissão/validação de JWT pelo gateway, browser ou WebSocket. Eventos locais, mutations atrasadas e caches manuais também serão revistos.

## 7. Fases de execução

A numeração abaixo é a deste trabalho; agrupa as 20 frentes do pedido original.

| Fase | Entrega e limite | Aceite mínimo |
|---|---|---|
| **1 — concluída** | Auditoria inicial, inventário vivo, baseline e plano | Evidências salvas e nenhuma mudança operacional |
| **2 — implementada/testada localmente; publicação pendente** | Contenção crítica: companies_admin/rpc_create_company e RPCs globais de manutenção | 82 assertions SQL e recuo seguro aprovados; faltam publicação, validação do scheduler externo e pós-validação viva |
| 3 | Logs completos: escrita, leitura, histórico e escopo global | Implementado e ensaiado localmente; publicação/backfill pendentes ([resultados](fase3-20260915/RESULTADOS.md)) |
| 4 | RPCs de Salmão, funções internas e grants | Implementada e ensaiada localmente; publicação pendente ([resultados](fase4-20260915/RESULTADOS.md)) |
| 5 | Fornecedores e preço por item | Mesmo nome em A/B sem conflito, identidade correta no consumer |
| 6 | Produtos e inventário automático de permissões | Comparar backend vivo, migrations, Edges e frontend com registry; classificar VÁLIDA/LEGADA/FANTASMA/NÃO ENCONTRADA/DIVERGENTE/GLOBAL |
| 7 | Todas as tabelas, INSERTs, RLS, views e SECURITY DEFINER | Classificação global/tenant, FKs/índices, guard/grant por função e testes reais dos achados |
| 8 | Edges, Storage, Realtime, integrações e jobs | Tenant explícito/autorizado, revogação, isolamento de arquivos e canais e ausência de mistura em jobs |
| 9 | Drift de schema/histórico | Diferenças explicadas, definições esperadas comparadas ao vivo e migration nova somente se necessária |
| 10 | Frontend/cache e jornada multiunidade | A/B/multi/admin/global; troca, revogação, identidade existente e respostas atrasadas |
| 11 | Regressão final, performance e operação | Todos os checks, EXPLAIN pertinente, checklist completo, deploy/rollback ordenados e documentação final |

Cada fase executa auditoria específica antes da alteração, entrega correções pequenas verificadas, atualiza este relatório e fornece o prompt da seguinte. Achados críticos novos podem antecipar trabalho com justificativa. Fase 2 é separada do backfill extenso para permitir correção crítica pequena e revisável.

## 8. Validação executada nesta fase

| Verificação | Resultado |
|---|---|
| bun x tsc --noEmit -p tsconfig.app.json | PASS |
| bun run build | PASS; avisos de chunks grandes e Browserslist antigo |
| bun run lint | 0 erros, 1.349 warnings preexistentes |
| bun run rbac:lint | PASS; 0 blockers, 2 important, 11 allowlisted e 14 info |
| bun run test --maxWorkers=4 | 713 passaram, 6 falharam; 89 arquivos passaram, 2 falharam, total 91 |
| bun run security:check | Exit 0, mas **SQL lint foi pulado por falta de configuração de secrets**; apenas parte estática validada |
| Sondagem SQL READ ONLY com SET LOCAL ROLE authenticated | Reproduz C02; confirma zero logs atribuídos a outra unidade em audit_logs no contexto testado |
| Consultas de catálogo/contagens | Executadas via MCP, leitura somente |
| Gerador AST | node --check e execução concluídos |
| SQL de regressão de escrita / suite multiunit_security | Não executados nesta fase; precisam de banco real isolado e fixture apropriada ao schema atual |

A primeira tentativa de Vitest falhou antes de carregar a configuração por sandbox/esbuild. A execução autorizada fora do sandbox rodou a suíte completa e produziu os seis failures acima. Supabase CLI --version falhou ao tentar escrever telemetria fora do workspace; inspeção remota prosseguiu pelo MCP.

O runner SQL existente `scripts/test-multiunit-db.sh` espera dump anterior às seis migrations e cluster local, criando banco novo. Não pode ser apontado para produção nem reaplicado ao schema já migrado sem preparar o ensaio.

Nenhuma correção funcional foi feita; portanto estas falhas são baseline anterior às correções. Não classificar security:check como “banco aprovado” pelo exit code.

## 9. Checklist final de isolamento

Itens pendentes até evidência nas fases correspondentes:

- [ ] Nenhuma tabela tenant-sensitive conhecida permite leitura cross-tenant.
- [ ] Três tabelas de logs protegidas e histórico classificado.
- [ ] Manutenção global e administração de empresas inacessíveis ao admin local/anon.
- [ ] RPCs de Salmão exigem permissão e grants internos foram revisados.
- [ ] upsert_supplier e seus consumidores funcionam por empresa.
- [ ] Policies de Produtos correspondem às ações reais.
- [ ] Todas as permissões do backend comparadas ao registry; fantasmas críticas eliminadas.
- [ ] Todas as funções SECURITY DEFINER e EXECUTE grants revisados semanticamente.
- [ ] Todas as tabelas, views, INSERTs e integrações classificadas.
- [ ] Storage/Realtime/Edges validados A/B com sessões reais.
- [ ] Imports globais, mutations, cache e persistência auditados.
- [ ] Admin local não obtém funções globais; super admin mantém capacidades legítimas.
- [ ] Usuário de uma empresa, usuário multi e memberships inativos/revogados testados.
- [ ] Jornada completa de criação/login/vínculo de identidade existente comprovada.
- [ ] Drift resolvido por evidência de schema e histórico.
- [x] Build e TypeScript passaram na baseline.
- [ ] Suíte inteira de testes passou após correções.
- [ ] Performance por company_id validada após migrations.
- [x] Nenhuma mudança de banco/deploy foi realizada na fase 1.

## 10. Riscos, Git e produção

Não houve aceitação dos riscos de C01/C02/H01–H05 como comportamento definitivo. Eles continuam abertos e ordenados para correção. A ausência de correção nesta fase é o limite da etapa de auditoria solicitada, não uma conclusão de segurança.

Arquivos criados: relatório, prompt da fase 2, catálogo/consumidores, consultas READ ONLY e gerador AST. AGENTS/CLAUDE recebem apenas substituições de regras factualmente incorretas e alerta operacional crítico, em espelho. Entrega em branch local `codex/multiunit-audit-phase1`, sem push; mensagem de commit: `docs(security): audita multiunidade e prioriza contencao critica`.

**Produção nesta fase:** nenhuma migration a aplicar, nenhuma Edge a publicar e nenhum frontend a publicar. Não fazer push em main apenas para publicar documentação (há auto-deploy). As fases corretivas devem listar suas migrations novas, preflight, ensaio, pós-validação e ordem de deploy; o snapshot desta auditoria não substitui backup restaurável.

Referências técnicas: [RLS e grants no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). As evidências dos achados são do código/catálogo do projeto, não inferidas dessa documentação.
