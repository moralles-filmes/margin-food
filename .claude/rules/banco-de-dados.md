---
paths:
  - "supabase/migrations/**"
  - "supabase/tests/**"
  - "supabase/rollback/**"
  - "supabase/seed*.sql"
  - "release/**"
  - "**/*.sql"
---

# Banco de dados — ao tocar SQL ou migrations

Antes de criar ou alterar migration, policy, função ou índice, leia `docs/standards/DATABASE.md`, `docs/standards/MULTI_TENANCY.md` e, se a tabela pertence a um módulo, `docs/standards/ACCESS_CONTROL.md`. O modelo de tenant e de permissões deste projeto está em `.claude/tenancy-profile.yml` (híbrido A/C, não o arquétipo E dos exemplos do padrão).

Pontos que mais causam vazamento ou perda de dados:

- Migration já aplicada não é editada. Crie uma nova (forward-only). Neste repo, `supabase db push` está bloqueado desde o release F12: migration nova vai por MCP `apply_migration` + `supabase migration repair` na mesma sessão (AGENTS.md §3; procedimento em DATABASE, "Particularidades").
- Toda tabela nova em schema exposto recebe, na **mesma** migration: RLS habilitada e forçada, policies e GRANT só do DML necessário a `authenticated` (nunca `ALL`).
- Tabela da empresa filtra por `company_id = (select public.get_current_company_id())`. Não há filial.
- Policies de insert e update usam `with check`. Helpers (`get_current_company_id`, `has_permission`, `has_any_permission`) sempre dentro de `(select …)`.
- Gate de permissão no banco usa `has_any_permission(auth.uid(), [<chave granular da tela>, <legado>, 'system:global:manage'])`, com chave que exista em `src/permissions/registry.ts`.
- Relacionamento entre tabelas do mesmo tenant: FK simples não garante a mesma empresa e a checagem de FK ignora RLS. Em tabela nova, use FK composta `(company_id, <fk>)`; em RPC que recebe id de outra tabela, confira a empresa.
- Transição crítica (baixa, aprovação, estorno, cancelamento) não tem grant de update na coluna de estado: passa por RPC que confere a ação.
- Permissão nova: registry + `sync_permissions_from_registry` + concessão aos papéis admin/diretor/gerente_geral na mesma migration. Chave de permissão não é renomeada em lugar.
- Views em schema exposto usam `with (security_invoker = true)`.
- Funções `security definer`: `set search_path = ''`, nomes qualificados, `assert_tenant()` e filtro `company_id` em busca por id. Funções novas são executáveis por `PUBLIC`: revogue e conceda explicitamente.
- Invariantes que dependem do estado atual (saldo, estoque, status) são garantidas na mesma transação da mutação. Chave de idempotência exige índice único.
- Dia de negócio é `(now() at time zone 'America/Sao_Paulo')::date`, nunca `current_date`.
- Valores monetários em `numeric` ou centavos inteiros, nunca float.
- Migration remota exige autorização explícita. Depois de aplicar, rode os Advisors.
