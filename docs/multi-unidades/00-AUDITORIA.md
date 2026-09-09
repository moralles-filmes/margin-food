# Multiunidades — auditoria e plano anterior à implementação

Data: 2026-09-09. Repositório limpo em `main` no início. Banco consultado somente em leitura: `wuzxpbixprrgssoeeaez`. Nenhuma migration aplicada em produção nesta fase.

## 1. Arquitetura encontrada

SPA React 18 com Vite, React Router, Supabase Auth, PostgREST/RPCs, Edge Functions e Realtime. Estado em Context API e hooks (`useState`), combinado com TanStack Query. Não há Zustand/Redux, server actions ou middleware Next.js. `package.json` é mais recente que a documentação de arquitetura (Vite 8, TypeScript 5.9 e Recharts 3).

`auth.users` é a identidade; `profiles.id` referencia essa identidade. `companies` é o tenant operacional correto e será reutilizado como unidade. Não existe membership/workspace/store paralelo. `unidades_medida` representa medidas de produtos, não lojas. Marcas do fechamento financeiro são decomposições de receita dentro da empresa, não tenants.

As leituras operacionais usam RLS ou RPCs; `get_current_company_id()`, `assert_tenant()` e `get_current_company_id_strict()` resolvem o tenant por `profiles.company_id`. Algumas funções e políticas fazem a mesma leitura diretamente. Edge Functions misturam clientes autenticados e `service_role`, geralmente resolvendo a empresa pelo perfil e filtrando explicitamente suas operações.

## 2. Usuários e unidades hoje

Um perfil tem exatamente uma empresa. `user_roles` tem unicidade `(user_id, role)`; `user_permissions`, `(user_id, permission_key)`. Essas duas tabelas não têm `company_id`. `role_permissions` é um catálogo global de modelos de role. As permissões efetivas combinam role e ALLOW individual, com DENY prevalecendo.

`AuthContext` carrega perfil/roles/permissões e usa cache de sessão por usuário, com TTL de cinco minutos. `useCompanyId` consulta o perfil novamente. Há 13 perfis, 13 vínculos de role, 277 overrides e quatro empresas no banco consultado; nenhum perfil órfão de empresa ou identidade e nenhum perfil com tenant placeholder. Uma migration não deve apagar nem reconstruir as identidades.

`admin-users`, `admin-create-user` e `admin-companies` criam identidades via Supabase Auth. O cadastro atual falha quando o e-mail já existe. Editar, bloquear, trocar senha ou excluir afeta a identidade inteira: isso precisa ser separado da administração do acesso a uma unidade para evitar que o administrador de uma loja comprometa acessos em outras.

## 3. Limitações e abrangência da busca

Busca em frontend e Edge Functions: 141 arquivos relevantes, 803 referências a termos de escopo, 199 chamadas RPC, 576 chamadas `.from`, 28 declarações `queryKey` e sete inscrições `postgres_changes`. Inventário por arquivo acompanha este relatório. Termos `unit_id`, `workspace_id`, `store_id` e `organization_id` não representam uma arquitetura operacional existente.

Banco: 148 tabelas públicas e 451 políticas public/storage. O estado real diverge do documento que declara FORCE RLS universal: existem tabelas com RLS habilitado sem FORCE e `z_canary_test` sem RLS. Essa divergência é registrada; não autoriza remover tabelas ou dados nesta implementação. Toda nova tabela terá RLS e FORCE RLS.

Políticas de produtos, alertas de falta, cache de saldo e auditoria ainda consultam o perfil diretamente. Funções de planejamento, catálogo, inventário, transferências e rendimento também têm resolução direta. As RPCs de decisões/atas validam responsáveis usando a empresa do perfil. Esses pontos precisam passar pelo vínculo autorizado.

Há caches em React Query, estado local de stores, filtros em localStorage e rascunhos em sessionStorage. Cenários/atas já incluem empresa na persistência. Conciliação persiste saldo por UUID da conta. Uma troca de tenant exige desmontagem dos stores e descarte/cancelamento do cache operacional.

Realtime publicado em produção: produtos, movimentações, notifications e purchase_orders. Cotação possui listeners, mas suas tabelas não estão na publicação atual. Realtime não propaga o cabeçalho HTTP do PostgREST; requer autorização própria por membership e filtro de empresa nas assinaturas. Não basta trocar o cabeçalho do cliente.

## 4. Modelo recomendado e tabelas

- Reutilizar `companies`, `auth.users`, `profiles`, `user_roles`, `user_permissions`, `role_permissions`, `job_roles` e logs existentes.
- Criar `company_memberships`, com unicidade `(user_id, company_id)`, status, cargo/setor por unidade, FKs e índices em ambas as direções.
- Acrescentar `company_id` a `user_roles` e `user_permissions`; fazer backfill pela empresa legada e ampliar suas unicidades. Manter `role_permissions` como catálogo global com administração restrita.
- Preservar `profiles.company_id` como vínculo legado/original para compatibilidade e rollback. Nunca usá-lo como preferência mutável de navegação. Não confiar em user_metadata para conceder acesso.
- Validar cada unidade solicitada contra membership ativo e empresa ativa. O identificador enviado por HTTP define a intenção da operação; a membership define a autorização. Ausência de escopo mantém o caminho legado apenas para chamadas compatíveis, sem conceder acesso adicional.
- Preferência de última unidade salva por identidade no navegador; sempre revalidada contra a lista retornada pelo backend. Sem nova autenticação ou token de tenant persistido no perfil.

## 5. Fluxo de autenticação e troca global

Após restaurar a sessão, buscar apenas unidades autorizadas e dados básicos. Uma unidade é selecionada automaticamente. Várias unidades sem preferência válida abrem a escolha inicial. Zero unidades mostra estado sem acesso. Carregar roles e permissões na unidade selecionada antes de montar módulos.

`AuthContext` continua sendo a fonte da identidade e da seleção global. Uma camada de escopo fornece cliente Supabase imutável por unidade e cache isolado. Os hooks existentes usam esse cliente; não haverá singleton cuja empresa mude enquanto uma operação está em andamento. Na troca: encerrar assinaturas, cancelar requisições, descartar estados e montar o escopo seguinte. Nenhuma senha ou renovação de identidade é necessária.

O seletor compacto ficará na identificação da empresa no topo da sidebar, incluindo menu recolhido/mobile. Uma única unidade mantém identificação estática.

## 6. Apresentação Sócios, detalhes e exports

`ApresentacaoSociosSection` centraliza a feature. Seus hooks já recebem `companyId` para cache, mas as chamadas RPC não o usam no transporte. O campo Unidade é estático. `PresentationMode` recebe dados e `unitName`, e os geradores PDF/PPTX consomem esses argumentos; não há backend separado para gerar esses arquivos.

Criar escopo local da feature: padrão = unidade global; override explícito = unidade escolhida na apresentação. Reutilizar o mesmo seletor visual, com callbacks distintos. Todas as consultas, permissões, decisões, atas, responsáveis, cenários, detalhes e exports usarão o escopo local. Guardar o override nos parâmetros já usados pela navegação da feature, validando acesso antes de carregar dados. Período/modo continuam preservados.

Troca global: sem override, a apresentação acompanha a nova unidade; com override, mantém a escolha local até sair da feature. PDF, PPTX, impressão e modo apresentação recebem o nome e os dados da unidade local. Indicar discretamente quando ela difere da global. Nenhuma opção de consolidado será criada.

## 7. Segurança, RLS, jobs e auditoria

Atualizar os resolvers canônicos e as consultas diretas ao perfil. Permissões e roles devem ser calculadas exclusivamente para a unidade solicitada; revogação tem efeito na próxima operação do backend. Proteger updates do próprio perfil contra troca de company_id. Funções privilegiadas terão search_path definido, grants explícitos, membership e permissão verificadas.

Nas Edge Functions, validar JWT e resolver unidade via cliente autenticado; somente depois realizar operações privilegiadas filtradas pela empresa validada. Criação com e-mail existente vincula acesso sem sobrescrever senha, e-mail ou nome da identidade. Bloqueio/exclusão da unidade não pode banir/excluir a identidade compartilhada. Jobs/cron conservam seu escopo explícito por recurso/empresa, sem depender da seleção do navegador. Logs incluem a empresa da operação.

## 8. Arquivos afetados

- Base: `src/contexts/AuthContext.tsx`, camada de escopo, `src/hooks/useCompanyId.ts`, `src/lib/tenant.ts`, `src/integrations/supabase/client.ts`, `src/App.tsx`.
- Layout: `src/components/AppLayout.tsx`, seletor reutilizável e escolha inicial.
- Consumidores Supabase: hooks/stores e componentes de Estoque, Compras, Salmão, Inventário, CMV, Ficha Técnica, Planejamento, RH, Financeiro, Relatórios, IA e Configurações; adaptar acesso ao cliente mantendo regras de negócio.
- Apresentação: `ApresentacaoSociosSection`, filtros, todos os `usePresentation*`, navegação de detalhes, modo apresentação, decisões/atas e testes de export.
- Backend: migrations de membership/RBAC/resolvers/policies/compatibilidade, Edge Functions administrativas e operacionais, CORS compartilhado, tipos e testes SQL.
- Documentação: arquitetura final, comandos de implantação/verificação e rollback; atualização idêntica de AGENTS/CLAUDE apenas das regras arquiteturais alteradas.

## 9. Migrations, compatibilidade e riscos

Separar migrations de estrutura/backfill, autorização/consumidores legados e administração de memberships. Validar antes/depois contagens e equivalência das permissões antigas. Executar em transação, preservar estruturas legadas, capturar definições anteriores para rollback e testar repetição/conflitos. Produção só deve receber migrations após validação local e backup verificável.

Riscos principais: políticas permissivas paralelas anulando isolamento; funções SECURITY DEFINER com resolução legada; role global vazando para segunda unidade; operações antigas continuando após troca; cache de período exibindo dados da empresa anterior; Realtime sem contexto HTTP; administrador local alterando uma identidade compartilhada; clientes antigos após rollout. Usar validação por requisição, clientes com escopo fixo, montagem por unidade, guards e rollout em fases para tratar esses riscos.

## 10. Plano de testes

PostgreSQL real local para backfill, memberships duplicadas, isolamento SELECT/INSERT/UPDATE/DELETE/RPC, roles diferentes, DENY, header adulterado, perfil adulterado, unidade inativa, revogação, e-mail existente e rollback. Não simular banco em testes de integração.

Testes de estado/UI para uma/várias/zero unidades, preferência válida/inválida, reload, troca e requisições atrasadas, teardown de subscriptions. Apresentação A/B: filtros, cards, detalhes, retorno ao estoque A, override diante da troca global, PDF/PPTX/impressão com nome e dados B. Rodar testes existentes, build, lint e typecheck, distinguindo falhas anteriores das introduzidas. Verificação visual de seletor desktop/mobile/recolhido e tema usando browser disponível.

## 11. Rollback e sequência exata

Checkpoints: (0) este relatório; (1) estrutura e backfill; (2) autorização e compatibilidade; (3) contexto global; (4) seletor; (5) consumidores e cache/realtime; (6) apresentação local; (7) exports/detalhes; (8) segurança; (9) regressão; (10) documentação final.

Rollback: primeiro interromper concessão de novos acessos e voltar frontend/Edges para o checkpoint anterior; restaurar definições anteriores de funções/policies e compatibilidade das tabelas em transação. Antes de reduzir unicidades de RBAC, preservar todos os grants adicionais em snapshot privado e restaurar somente a unidade legada; não descartar memberships ou identidades. Memberships extras ficam preservadas para reativação. Confirmar novamente as permissões e contagens da unidade original. Nunca excluir empresas, dados financeiros ou usuários para reverter esta funcionalidade.

Referências de plataforma: [segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api), [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). As afirmações sobre este projeto foram verificadas no código e catálogo do banco, não inferidas dessas referências.
