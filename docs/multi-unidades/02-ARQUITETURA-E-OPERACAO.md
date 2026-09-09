# Multiunidades: arquitetura e operação

Implementação de 09/09/2026. A auditoria foi concluída e apresentada antes das alterações; veja [auditoria](00-AUDITORIA.md) e [inventário](01-INVENTARIO.md). Este documento descreve a versão preparada no repositório. **Nenhuma migration ou Edge Function desta entrega foi publicada em produção.**

## Modelo e compatibilidade

`auth.users` continua sendo a única identidade. `profiles` preserva nome, e-mail, avatar, IDs, histórico e `company_id` original. `companies` é a unidade operacional existente; não foi criada uma segunda entidade de lojas. Marcas de fechamento, setores e unidades de medida continuam com seus significados atuais.

`company_memberships` relaciona usuário e empresa, com unicidade `(user_id, company_id)`, status `active/inactive/revoked`, cargo e setor locais. `user_roles` e `user_permissions` ganharam `company_id` e FKs para esse vínculo; o catálogo de modelos `role_permissions` permanece global, com escrita restrita à administração global. A precedência ALLOW/DENY foi preservada: DENY vence.

O backfill copia a empresa/cargo/setor original de cada perfil e acrescenta a mesma empresa aos grants existentes. Compara IDs e conteúdo dos grants antes/depois, sem recriar logins, alterar senhas ou mover dados. O tenant placeholder continua proibido. A empresa original é um mecanismo de compatibilidade, não uma preferência mutável.

## Escopo de cada requisição

O cliente imutável criado por `createCompanyClient(companyId, userId)` envia `x-company-id` em REST, RPC, Storage e Edge Functions e reutiliza a sessão do cliente Auth original. Não cria outro GoTrue client nem outro mecanismo de autenticação.

Em desenvolvimento (`bun run dev`), `supabaseFetch` encaminha somente as Edge Functions do projeto configurado por `/__supabase/functions/v1/`, no proxy do Vite. Isso permite testar localmente quando o CORS publicado aceita apenas o domínio de produção. O proxy tem destino fixo em `VITE_SUPABASE_URL`, preserva JWT, chave pública, unidade, corpo, cancelamento e streaming; REST, Auth e Storage continuam diretos. Builds de produção também mantêm as Edge Functions diretas no Supabase. Não é preciso ampliar as origens permitidas em produção para executar o frontend local.

`get_current_company_id()` lê esse header e verifica `auth.uid()`, membership ativo e empresa ativa. UUID inválido ou unidade sem acesso falha com SQLSTATE `42501` / `COMPANY_ACCESS_DENIED`. Sem header, somente a empresa original ainda autorizada é aceita. `assert_tenant()` falha também quando não há escopo. O header é uma solicitação, nunca prova de autorização.

Roles e permissões são calculadas para a unidade validada. As funções que anteriormente liam o tenant diretamente do perfil foram adaptadas. Uma policy restritiva de fronteira foi adicionada às tabelas públicas com `company_id` e RLS, para impedir que policies permissivas antigas combinadas com OR ampliem o escopo HTTP. Perfis e memberships têm policies específicas para identidade/acessos. Funções auxiliares com tenant explícito que não deveriam ser APIs públicas tiveram o EXECUTE revogado.

Edge Functions encaminham o header ao cliente JWT, validam o escopo e então filtram as operações administrativas por essa empresa. Jobs agendados continuam usando a empresa explícita do job. Os logs financeiros existentes continuam derivados do tenant validado; concessões, alterações e revogações de membership usam `admin_actions_log`.

Para Realtime, a RLS verifica membership e permissão da empresa de cada linha, sem depender do header HTTP. A policy específica só é válida no contexto sem headers usado pelo Realtime; em HTTP, prevalece a unidade solicitada. Canais usam nomes e filtros por unidade e são removidos no encerramento do escopo. Documentos de RH têm autorização por empresa do colaborador, ação e membership; não pela empresa original do perfil.

## Login, seleção e cache

`AuthContext` carrega somente `{ id, nome }` das unidades autorizadas. Uma unidade entra automaticamente. Várias unidades exigem escolha quando não existe preferência válida. A preferência é armazenada em `marginpro:last-company:<userId>` e sempre comparada à lista retornada pelo backend.

Antes da publicação das migrations, o frontend também aceita o banco de empresa única. `loadAccessibleCompanies` só ativa essa compatibilidade quando `list_my_companies` retorna `PGRST202` **e** `user_roles.company_id` ainda não existe (`42703`); falhas de rede, autenticação, permissão ou schema parcialmente migrado continuam bloqueadas. Nesse modo, oferece exclusivamente a empresa original ativa, valida `assert_tenant()` e usa as roles/permissões existentes. Não envia `x-company-id`, pois o CORS das Edge Functions anteriores ainda não aceita esse header. Tanto o escopo global quanto o da apresentação usam esse modo; preferências e URLs não permitem selecionar outra empresa. A revalidação passa automaticamente ao modelo de memberships quando o backend estiver publicado, recriando clientes e caches. Esse modo permite executar o frontend local contra o backend atual, mas não habilita multiunidades antes da implantação completa.

O `CompanySelector` reutiliza o dropdown existente. Na sidebar expandida aparece junto à identificação da empresa; recolhida, usa um botão com ícone e nome acessível. Uma unidade não recebe dropdown.

A troca global mostra carregamento e desmonta o escopo anterior. Cada escopo possui seu cliente, AbortController e QueryClient; cancelar o escopo cancela requisições, limpa cache e remove canais. Uma operação atrasada mantém a empresa original e não pode reaproveitar o cliente encerrado para escrever na nova empresa. Operações já confirmadas no servidor não são desfeitas pelo cancelamento do navegador.

Todos os módulos operacionais passaram a obter o cliente de `useSupabase()`. Helpers externos recebem esse cliente explicitamente. As chaves React Query da apresentação incluem empresa; o cache em memória de CMV inclui empresa e usuário. Rascunhos da apresentação continuam separados por usuário/empresa, e dados de conciliação por UUID da conta. Preferências apenas visuais podem continuar globais.

A lista e o contexto de permissões são revalidados no foco, reconexão e a cada 60 segundos; RPCs de contexto têm timeout de 15 segundos. Uma resposta com `COMPANY_ACCESS_DENIED` dispara revalidação imediata e remove a área de dados. Com uma unidade restante, ela é selecionada; com várias, há nova escolha; com nenhuma, há mensagem de ausência de acesso. A autorização de cada operação permanece no servidor durante todo esse intervalo.

## Apresentação Sócios

`PresentationCompanyScope` envolve a funcionalidade inteira. Sem `presentationUnit` na URL, acompanha a unidade global. Uma escolha diferente grava o override na URL e monta um escopo local, com cliente, permissões e cache próprios. Trocar a unidade global preserva um override explícito. Escolher a unidade global novamente remove o override. Sair para outra rota encerra o escopo local; voltar sem parâmetro usa a unidade global.

Período, granularidade e filtros de análise são preservados. IDs de categoria, decisão, reunião e responsáveis da loja anterior são removidos na troca. O filtro Total descobre os limites da nova empresa antes de mostrar o agregado; não reaproveita os limites da loja anterior. Links de detalhes preservam o override. Uma URL sem acesso mostra uma mensagem com retorno à unidade atual; a autorização backend independe dessa checagem visual.

Todos os hooks, cards, gráficos, planejamento, cenários, governança, detalhes e exports recebem o escopo local. O objeto de apresentação carrega também `{ company: { id, name } }`. PDF, PowerPoint, impressão e nomes de arquivo identificam essa unidade. Exportações em andamento são canceladas ao desmontar a apresentação. Nenhum consolidado entre unidades foi implementado.

## Cadastro e administração

As três funções de criação reutilizam `addCompanyUser`: normalização de e-mail, consulta exata de identidade somente via service-role, criação Auth se necessário e concessão de membership. A unicidade do Auth resolve concorrência de criação; a RPC usa lock por usuário/empresa e constraint única para serializar concessões. Repetir a adição de membro existente não altera suas permissões.

Uma identidade nova exige uma reserva privada temporária da empresa, validada pela RPC administrativa antes de chamar Auth, tanto no cadastro com senha quanto no convite. GoTrue grava `app_metadata` após o INSERT de `auth.users`, então esses metadados ainda não estão disponíveis no trigger. O trigger consome a reserva e cria o perfil; membership e grants são criados juntos pela RPC autorizada. Assim, uma falha intermediária não concede acesso parcial e uma nova tentativa completa o cadastro. `user_metadata` editável pelo usuário não concede acesso a nenhuma empresa.

Desativar ou excluir no administrador de usuários afeta apenas o membership. Reintroduzir um usuário revogado aplica somente os novos grants escolhidos, sem restaurar automaticamente os antigos. Nome/e-mail/senha de identidade compartilhada só podem ser alterados pela administração global; um administrador de outra loja não assume controle da conta ao adicionar o e-mail. O cadastro aceita senha vazia ao vincular identidade existente; senha continua obrigatória para uma identidade nova criada sem convite.

## Migrations e publicação

Há seis migrations, em ordem:

1. `20260909192644_company_memberships`: snapshots privados, estrutura, constraints, índices e backfill.
2. `20260909192839_company_scope_authorization`: resolvers, permissões, policies e proteção de perfil.
3. `20260909193057_company_scope_legacy_consumers`: RPCs legadas, busca de usuários e Realtime.
4. `20260909193257_company_membership_administration`: provisionamento, convites, administração e onboarding.
5. `20260909195048_company_scope_security_backstops`: helpers internos e documentos de RH.
6. `20260909195238_company_scope_validation`: fronteiras de RLS, validação final e reload do schema.

As migrations são transacionais individualmente. A conversão é protegida contra drift e mantém snapshots para reversão. Não são um script para reaplicar por cima de uma instalação já migrada; o histórico do Supabase deve controlá-las.

Sequência de publicação:

1. Criar e verificar um backup completo/restaurável do projeto, incluindo Auth, dados, grants e metadados de Storage; registrar também o deploy e as versões atuais das Edge Functions. O snapshot privado de RBAC e o dump de schema usado nos testes **não substituem** esse backup.
2. Ensaiar as seis migrations numa branch/staging Supabase com o schema atual. Repetir os testes SQL e o fluxo autenticado com JWT real, REST, Realtime e Storage. Conferir o diff do schema desde a auditoria e executar `supabase migration list`.
3. Abrir uma janela de manutenção para evitar versões mistas, sobretudo durante criação/edição de usuários. Aplicar as migrations com `supabase db push`; em seguida, conferir o histórico. A checagem local usou CLI 2.116.0. Se for necessário MCP, reparar o histórico imediatamente, conforme AGENTS.md.
4. Publicar juntas as Edge Functions alteradas: `admin-users`, `admin-create-user`, `admin-companies`, `ai-chat`, `cmv`, `cotacao-ia`, `ficha-tecnica`, `inventario`, `purchase-requisitions`, `requisicao-estoque`, `rh`, `send-whatsapp-zapi`, `check-password` e as três variantes de `rbac-lint`. Preservar secrets, CORS e configuração JWT existentes; `x-company-id` foi acrescentado aos headers CORS permitidos.
5. Publicar o frontend, validar usuário com uma loja e usuário com duas lojas, comparar saldos/KPIs de referência, cadastrar e remover um vínculo de teste e conferir logs. Só então reabrir tráfego.

Nenhuma permissão nova foi criada no registry, portanto esta entrega não exige novo sync de chaves RBAC.

## Rollback

O script executável é [multiunit_to_single_company.sql](../../supabase/rollback/multiunit_to_single_company.sql). Requer conexão administrativa e manutenção, sem tráfego. Exemplo, com a conexão do ambiente já configurada de forma segura:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/multiunit_to_single_company.sql
```

Antes de executá-lo, confirmar o banco/conexão, verificar um backup completo recente e preparar as versões anteriores de frontend e Edge Functions. O script bloqueia as tabelas envolvidas, arquiva o estado atual dos memberships/roles/overrides em `multiunit_private`, restaura funções, ACLs, policies, flags de RLS, publicação Realtime e os formatos antigos dos grants. Mantém os grants mais recentes da empresa original; os adicionais permanecem arquivados. Nenhuma identidade ou dado operacional é excluído.

O script aborta antes de alterar dados se algum perfil já perdeu o acesso à sua empresa original ou ainda não foi provisionado. Reverter nesse estado poderia reativar um acesso indevido no modelo antigo. Resolver esse caso com uma decisão explícita de identidade/acesso antes do rollback; nunca contornar a trava apagando snapshots. Uma segunda execução também falha para não sobrescrever o arquivo de reversão.

Depois do rollback, publicar/reabrir as versões antigas e conferir saldos, grants e login de referência. Registrar a reversão no histórico de migrations: não deixar o CLI acreditar que as seis versões continuam aplicadas. Uma futura reativação requer migration de avanço baseada nos arquivos privados preservados; não reaplicar cegamente a primeira migration nem remover `multiunit_private`.

## Validação realizada e limites

- Banco real: PostgreSQL 18 local, schema público efetivamente exportado de produção, dados sintéticos de três empresas, papéis PostgreSQL reais e RLS executada como `authenticated`. O fixture contém a superfície Auth necessária para esses testes; não é uma execução do serviço GoTrue.
- O roteiro [test-multiunit-db.sh](../../scripts/test-multiunit-db.sh) cria um **novo** banco `moralles_multiunit_test*` no socket local `/tmp`, porta 55439 por padrão. Nunca apaga banco existente. Requer um cluster PostgreSQL local com `pgcrypto`, `unaccent` e `pg_trgm` disponíveis e um dump do schema anterior. Exemplo: `scripts/test-multiunit-db.sh /caminho/public-before.sql`.
- [multiunit_security.sql](../../supabase/tests/database/multiunit_security.sql): backfill, ALLOW/DENY, header inválido, unidade C não autorizada, SELECT/INSERT/UPDATE/DELETE entre empresas, notificações, permissões locais, cadastro repetido, falha parcial, revogação, reintrodução com novos grants, empresa inativa, RPCs de apresentação, Storage por colaborador e regras de autorização Realtime.
- [multiunit_rollback.sql](../../supabase/tests/database/multiunit_rollback.sql): restauração exata das definições de funções e policies, preservação das identidades, arquivo dos novos memberships/grants e formato legado das permissões.
- Frontend: 89 arquivos/700 testes passaram (`bun run test --maxWorkers=4`); inclui 14 testes novos de seleção, escopos, cache/canais, requisição atrasada, StrictMode, override, detalhes, exports/impressão e acesso removido, além da validação dos arquivos PDF/PPTX reais e do filtro Total.
- `bun x tsc --noEmit -p tsconfig.app.json`, build Vite e lint sem erros. O lint mantém avisos preexistentes; as dependências de hooks alterados foram ajustadas. Deno checou as 12 Edge Functions operacionais alteradas.
- Navegador isolado: login real do Vite e seletores/componentes reais em uma prévia com dados sintéticos, nas larguras desktop e 390 px, incluindo sidebar recolhida, sem erros de execução. A prévia temporária foi removida.

A entrega não afirma ter exercitado JWT/GoTrue, entrega de eventos WebSocket, APIs de Storage ou todas as jornadas de todos os módulos em staging. A autorização correspondente foi testada em PostgreSQL, e o transporte/estado da interface em testes unitários. A verificação integrada desses serviços e o backup completo continuam sendo etapas obrigatórias de publicação; nenhuma operação em produção foi usada para simular esses testes.

A correção de compatibilidade anterior à migração foi validada adicionalmente com 26 testes de acesso/seleção/escopo, TypeScript, lint sem erros e build. Na aba local já autenticada do usuário, o recarregamento abriu a empresa Moralles e carregou Contas a Pagar pelo backend real, sem alterar registros ou publicar migrations. Os testes cobrem login legado, apresentação, headers de Edge Functions, transição para memberships com descarte de clientes/caches e recusa de fallback em falhas de autorização ou migração parcial.

## Cobertura dos 18 casos solicitados

| Casos | Evidência |
|---|---|
| 1–3: uma loja, várias lojas, troca A → B | `CompanyScope.test.tsx`, `companySelection.test.ts` |
| 4–5: unidade C e separação entre usuários | `multiunit_security.sql` |
| 6: mesmo e-mail em outra unidade | lookup normalizado, identidade preservada, membership idempotente em `multiunit_security.sql` |
| 7: permissões diferentes | SQL + contexto local no teste React |
| 8–9: cache e canais antigos | cliente real Supabase em teste de transporte (REST e Edge, incluindo streaming), descarte de QueryClient/canais; policies Realtime em SQL |
| 10–11: apresentação B e outro módulo A | `CompanyScope.test.tsx` |
| 12–14: PDF, PowerPoint, impressão B | teste de escopo + `presentationExports.test.ts` + impressão DOM |
| 15: detalhes permanecem em B | testes de contexto/URL e navegação da apresentação |
| 16: manipulação de escopo | SQL com header forjado + URL C no teste React |
| 17–18: revogação e reload | SQL, contexto React e preferência validada por identidade |
