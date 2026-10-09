# Módulo: Administração e Configurações

> Levantado do código em 2026-10-07 (Padrão SaaS, Fase 9). As regras de acesso que estavam no `AGENTS.md` estão em `docs/standards/` (ACCESS_CONTROL, SECURITY, MULTI_TENANCY e TENANT_LIFECYCLE, "Particularidades") e não se repetem aqui. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (`permissions`, `role_permissions` e `companies` são globais; as demais têm `company_id`).

- Chaves do módulo: `configuracoes` e `system`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz:
  - Configurações (menu Administração → Usuários e Configurações): usuários da unidade (vínculo, papel, matriz de permissões, cargos, reset de senha, desativar e remover acesso); empresas da plataforma e o 1º Admin de cada uma; credenciais de integração; alertas e validade do salmão; telas de Auditoria Sistema, Performance, Auditoria Segurança e Auditoria Compras (só leitura).
  - Painel Admin (rota `/admin`, só `system:global:manage`): contagens e RPCs de diagnóstico da unidade ativa, checkup RBAC (`rbac-lint-quick`/`rbac-lint-full`), promoção e rebaixamento de super admin, criação de acesso na unidade ativa, Empresas e Bug Tracker.
- Não faz:
  - Uso das credenciais da Z-API e da IA da Cotação → [compras.md](compras.md); aqui só a tela que grava pelas RPCs de Compras.
  - Parâmetros do salmão (`salmon_config`, `salmon_salvar_config`) e auditoria de compra de salmão (`salmon_auditorias_compra`) → [salmao.md](salmao.md); a sub-aba Salmão grava os alertas e a Auditoria Compras lê pelo `useSalmonStore`.
  - IA Central → [ia.md](ia.md).
  - Trilhas por módulo (`fin_audit_logs`, `rh_audit_log`) → módulos donos.
- Código: `src/components/ConfiguracoesView.tsx`, `AdminUsersView.tsx`, `PermissionMatrix.tsx`, `AuditView.tsx`, `GlobalAuditView.tsx`, `SecurityAuditView.tsx`, `PerformanceMonitorView.tsx`, `src/components/admin/` (`AdminCompaniesView`, `AccessManagementCard`, `CheckupSuiteCard`, `BugTrackerView`), `src/components/configuracoes/IntegracoesView.tsx`, `src/hooks/useIntegracoesConfig.ts`, `src/pages/AdminPanel.tsx`, `src/permissions/plataforma.ts`, `src/domain/admin/empresa.ts`, Edges `admin-users`, `admin-create-user`, `admin-companies`, `rbac-lint`, `rbac-lint-quick`, `rbac-lint-full` (helpers `supabase/functions/_shared/company-users.ts` e `company-scope.ts`).

## Submódulos e permissões

| Submódulo | Ações | Escopo |
|---|---|---|
| `configuracoes:geral` | view, manage | empresa |
| `configuracoes:integracoes` | view, manage | empresa |
| `configuracoes:salmon` | view, manage | empresa |
| `configuracoes:usuarios` | view, create, edit, delete, manage | empresa |
| `configuracoes:auditoria-sistema`, `configuracoes:performance`, `configuracoes:auditoria-seguranca`, `configuracoes:auditoria-compras` | view | empresa |
| `configuracoes:empresas` | view, create, edit, delete | global (só vale com a unidade da plataforma ativa) |
| `system:global` | manage | global (super admin) |

O que cada chave libera no código:

- `geral`: a sub-aba só mostra contadores do salmão; `geral:manage` também libera os alertas do salmão.
- `usuarios`: a gestão na tela exige `:manage` (com só `:view` a aba abre com aviso). A Edge `admin-users` escreve com `configuracoes:usuarios:manage`, `users:manage`, `system:admin` ou `system:global:manage`, e lista também com `:view`. `:create`, `:edit` e `:delete` não são conferidas por nenhum código.
- `integracoes`: as RPCs de leitura e gravação exigem `configuracoes:integracoes:manage`, `compras:cotacao:manage` ou `system:global:manage`; com só `:view`, a aba recebe `PERMISSION_DENIED` ao carregar.
- `auditoria-sistema`: `audit_logs` da unidade. `performance`: `audit_logs` com `module='perf'`. `auditoria-seguranca`: `audit_log` e `admin_actions_log` da unidade. `auditoria-compras`: sem gate próprio nos dados (policy de `salmon_auditorias_compra` só filtra a empresa).
- `system:global:manage`: o módulo `system` só aparece na matriz para quem já é super admin; a sub-aba Empresas, só para super admin com a plataforma ativa.
- Papel atribuído pela tela de usuários: só `admin` e `operador` (a Edge aceita também `viewer` e `sem_role`); os demais papéis do enum não são atribuídos por aqui.
- Chaves legadas no `LEGACY_PERMISSION_MAP` (só o frontend expande): `users:manage`, `settings:manage`, `system:admin`.

Papéis de sistema que recebem: `admin`, `diretor` e `gerente_geral` recebem o catálogo inteiro, exceto `configuracoes:empresas:*` e `system:global:manage` (ACCESS_CONTROL, "Particularidades").

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `company_memberships` | empresa | vínculo usuário × unidade (`active`/`inactive`/`revoked`); escrita só por `admin_upsert_company_membership` |
| `user_roles` | empresa | papel por `(user_id, company_id)`; mesma RPC |
| `user_permissions` | empresa | ALLOW/DENY por `(user_id, company_id)`; mesma RPC e `admin_set_super_admin`; trigger `trg_user_permissions_empresas_plataforma` |
| `role_permissions` | global | catálogo dos papéis; trigger `trg_role_permissions_sem_empresas` |
| `permissions` | global | catálogo vindo do registry; chave fora dele é recusada (`UNKNOWN_PERMISSION`) |
| `profiles` | empresa (origem, legado) | nome e e-mail mudam só pela Edge `admin-users`, junto com o Auth |
| `job_roles` | empresa | cargos; criados e ativados/desativados pela Edge `admin-users` |
| `companies` | global | escrita por `onboard_new_company` e `update_company` |
| `multiunit_private.pending_identity_companies` | empresa (chave por e-mail) | reserva de 5 minutos gravada por `reserve_company_invitation` antes de criar a identidade |
| `admin_actions_log` | empresa | eventos de acesso, criação de empresa, super admin |
| `audit_logs` / `audit_log` / `integration_logs` | empresa (`log_scope='TENANT'`) ou global (`GLOBAL`/`AMBIGUOUS`) | lidas pelas telas de auditoria; escrita só no servidor (`log_private.stamp_log`) |
| `system_bugs` | empresa | Bug Tracker; RLS exige `system:global:manage` |

## Invariantes

### Já documentadas nos padrões

- Super admin sem acesso implícito a unidade, guards anti-escalada (`PRIVILEGE_ESCALATION_DENIED`, `SELF_PROVISIONING_DENIED`, `PROTECTED_MEMBERSHIP`, `COMPANY_HAS_USER_MANAGER`), `system:admin` sem expansão e Configurações → Empresas da plataforma: ACCESS_CONTROL, "Particularidades".
- Concessão só por `admin_upsert_company_membership` e DENY gravado para a chave desmarcada na matriz: ACCESS_CONTROL, "Particularidades".
- Revogar é por unidade, a identidade compartilhada nunca é excluída e e-mail existente ganha acesso sem mudar senha, nome ou e-mail: ACCESS_CONTROL e TENANT_LIFECYCLE, "Particularidades".
- Onboarding idempotente por `p_onboarding_request_id` e CNPJ único pelos dígitos: TENANT_LIFECYCLE, "Particularidades".
- Eventos de acesso em `admin_actions_log`, reserva de empresa antes de criar identidade no Auth e JWT validado dentro das Edges: SECURITY, "Particularidades".
- `SECURITY DEFINER` que devolve dado sensível (`list_profiles_minimal`) com `assert_tenant` e permissão explícita; empresa ativa pelo header `x-company-id`: MULTI_TENANCY, "Particularidades".
- INSERT em `audit_logs` resolve a empresa pelo registro: DATABASE, "Particularidades".

### Deste módulo

- **`system:global:manage` só sai por `admin_set_super_admin`** — exige o e-mail do alvo e a frase `REBAIXAR` (`PROMOVER` para conceder), e ninguém rebaixa a si mesmo. Regravar permissões sem a chave é recusado (`GLOBAL_KEY_REMOVAL_DENIED`), por isso a edição de usuário reenvia a chave que a pessoa já tem.
- **Remover acesso exige motivo e nunca vale para si mesmo** — `delete` pede motivo com 3 ou mais caracteres e grava `MEMBERSHIP_REVOKED`; a Edge recusa `disable`, `enable` e `delete` do próprio usuário (a edição do próprio usuário não é barrada).
- **Identidade nova exige senha de 12 ou mais caracteres e é descartada se o vínculo for recusado** — só depois de conferir que nenhum membership foi gravado, para que uma resposta perdida não vire exclusão. O reset de senha também exige 12 ou mais.
- **Logs: leitura pela unidade ativa; escopo global só para o super admin** — `audit_log`, `audit_logs` e `integration_logs` têm duas policies RESTRICTIVE de SELECT (`log_scope='TENANT'` + empresa ativa; chave da tela, `system:read` ou `system:global:manage`). Linhas `GLOBAL`/`AMBIGUOUS` só por `list_restricted_logs`, que exige `system:global:manage`. Escrita só por `postgres`/`service_role` (`LOG_WRITER_DENIED`).
- **Edição de empresa e jobs de serviço são log global** — `update_company` grava `COMPANY_UPDATED` em `audit_logs`, e `stamp_log` o classifica como `GLOBAL` (`company_administration`), aceitando só autor com `system:global:manage`. Por isso o delegado com `configuracoes:empresas:edit`/`delete` sem essa chave passa pelo gate de `update_company` e tem a edição revertida por `GLOBAL_LOG_DENIED` (ninguém está nessa situação em 2026-10-07). `SLOW_QUERY` (`reporting.mv_%`) e `JOB_RUN` gravados por serviço também viram `GLOBAL`. A criação de empresa grava `COMPANY_CREATED` em `admin_actions_log` da empresa nova.
- **Integrações: a tela lê e grava só pelas RPCs de Compras, com o segredo mascarado** — `get_cotacao_zapi_config`/`get_cotacao_ia_config` devolvem `has_*` e os 4 últimos caracteres; em `save_*`, segredo vazio preserva o gravado. O SELECT direto na tabela não é mascarado: [gemini.md](../integrations/providers/gemini.md), "Particularidades operacionais".
- **Painel Admin e diagnósticos exigem `system:global:manage` na unidade ativa** — a rota `/admin` na tela; no banco, `admin_health_counts`, `admin_checkup_suite`, `debug_company_inventory`, `debug_stock_last_movements`, `rbac_sql_lint_report_quick`/`_admin` e as policies de `system_bugs`.

## Commands, queries e eventos

- Commands:
  - Edge `admin-users`: `create`, `edit-user`, `update-role`, `disable`, `enable`, `delete`, `reset-password`, `create-job-role`, `toggle-job-role` (todas sobre a unidade do header).
  - Edge `admin-companies`: `create-first-user` (1º Admin de empresa sem gestor; gate `can_manage_companies('create')`).
  - Edge `admin-create-user`: cria acesso `operador` na unidade ativa (super admin, Painel Admin).
  - RPCs: `onboard_new_company`, `update_company`, `admin_set_super_admin`, `save_cotacao_zapi_config`, `save_cotacao_ia_config`. Pelas Edges, com service role: `admin_upsert_company_membership`, `reserve_company_invitation`, `find_auth_user_by_email`.
- Queries: Edge `admin-users` → `list`; `list_companies`, `admin_list_users`, `list_profiles_minimal`, `list_restricted_logs`, `get_cotacao_zapi_config`, `get_cotacao_ia_config`, `admin_health_counts`, `admin_checkup_suite`, `debug_tenant`, `debug_company_inventory`, `debug_stock_last_movements`; Edges `rbac-lint-quick` e `rbac-lint-full` (`rbac-lint` não tem chamador no frontend).
- Eventos publicados: nenhum. Trilha em `admin_actions_log` (`MEMBERSHIP_CREATED`, `MEMBERSHIP_UPDATED`, `MEMBERSHIP_REVOKED`, `IDENTITY_PASSWORD_RESET`, `JOB_ROLE_CREATED`, `JOB_ROLE_UPDATED`, `COMPANY_CREATED`) e em `audit_logs` (`COMPANY_UPDATED`).

## Integrações

- Nenhuma própria. Auth do Supabase pela Admin API (`createUser`, `inviteUserByEmail`, `updateUserById`, `deleteUser`) dentro das Edges.

## Dependências

- Compras: `cotacao_zapi_config` e `cotacao_ia_config` pelas RPCs `get_/save_cotacao_*_config` ([compras.md](compras.md)).
- Salmão: `salmon_salvar_config` (sub-aba Salmão) e `salmon_auditorias_compra` (Auditoria Compras), pelo `useSalmonStore` ([salmao.md](salmao.md)).
- Financeiro: `onboard_new_company` cria as categorias não operacionais da empresa nova (`fin_get_categoria_desconto_baixa`/`_concedido`), além de turnos e cargos padrão.
- Acesso e tenant: `has_permission`, `get_effective_permissions`, `get_company_permissions`, `assert_tenant`, `can_manage_companies`, `platform_company_id` (ACCESS_CONTROL e MULTI_TENANCY).

## Pendências registradas

- Monitor de Performance sem fonte: nada grava `SLOW_QUERY` em `audit_logs` (`TAREFAS.md`).
- `rbac_sql_lint_report()` completo estoura `statement_timeout` em produção (`TAREFAS.md`).

## Decisões

- Unidade é a empresa, sem filial: [ADR-0001](../adr/0001-unidade-e-empresa-sem-filial.md).
- Playbook operacional de RBAC: `docs/rbac/playbook-operacional.md`.
