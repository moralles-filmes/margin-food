---
paths:
  - "src/permissions/**"
  - "src/contexts/AuthContext.tsx"
  - "src/contexts/CompanyScope*.tsx"
  - "src/integrations/supabase/**"
  - "src/lib/company*.ts"
  - "src/lib/tenant.ts"
  - "src/lib/permissions.ts"
  - "src/components/admin/**"
  - "src/components/AdminUsersView.tsx"
  - "src/components/PermissionMatrix.tsx"
  - "src/pages/AdminPanel.tsx"
  - "supabase/functions/**"
  - "**/auth/**"
---

# Segurança, acesso e multi-tenancy — ao tocar auth, permissões ou código de servidor

Antes de alterar, leia `docs/standards/SECURITY.md`, `docs/standards/MULTI_TENANCY.md` e `docs/standards/ACCESS_CONTROL.md`. O modelo do projeto está em `.claude/tenancy-profile.yml` e as regras detalhadas em AGENTS.md (Multi-tenancy, RLS, RBAC, Autenticação).

Pontos que mais causam vazamento entre empresas ou escalada de privilégio:

- Autenticação, autorização e resolução de tenant são três verificações independentes.
- Na Edge Function, valide o usuário com o método que confere o token no Supabase Auth (`getUser()`/`getClaims()`), nunca só decodificando o JWT.
- A empresa ativa é indicada pelo header `x-company-id` (um cliente Supabase por empresa) e confirmada no banco por `get_current_company_id()`/`assert_tenant()`. O header só indica; quem concede é a membership ativa. Nunca leia a empresa de body, payload ou `profiles.company_id`.
- Permissão é `<modulo>:<submodulo>:<acao>`, por empresa, com ALLOW/DENY. O banco não expande `LEGACY_PERMISSION_MAP`: todo gate do banco inclui a chave granular que a tela usa. `useCan` no frontend é só UX.
- Dado operacional usa `useSupabase()`/`CompanyScopeProvider`, nunca o cliente global. Troca de empresa ou logout descarta o estado da empresa anterior.
- Campos de tenant, papel, permissão, preço, total e status vindos do cliente são ignorados ou revalidados. Nunca espalhe o body num insert/update.
- Tabelas de acesso não recebem escrita do cliente. Concessão só por `admin_upsert_company_membership`/`admin-users`: quem concede só concede o que tem; ninguém altera os próprios acessos; `system:global:manage` e `system:admin` só por quem já os detém.
- Service role / secret key ignora RLS: só na Edge Function, depois de resolver tenant e permissão com o JWT do usuário, filtrando `company_id` em toda query.
- Testes cobrem o bloqueio **e** o acesso legítimo: outra empresa, outro submódulo, ação sem permissão, DENY explícito, membership revogada.
