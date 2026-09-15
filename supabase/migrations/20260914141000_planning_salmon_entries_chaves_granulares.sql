-- Grupo B — alinha RLS de Planejamento e Salmão às chaves granulares do registry.
--
-- Mesmo bug já corrigido no Financeiro (20260912131731 / 20260912164500 / 20260914120000):
-- o frontend libera a tela por uma chave granular de src/permissions/registry.ts, mas a
-- policy checa só a chave legada. has_permission/has_any_permission NÃO expandem
-- LEGACY_PERMISSION_MAP (só o useCan do frontend expande), e Admin → Permissões grava
-- DENY explícito para toda chave default do perfil que não aparece na matriz — inclusive
-- as legadas. Resultado: tela aberta, RLS negando.
--
-- Casos reais confirmados no banco vivo em 2026-09-14 (simulação por
-- get_company_permissions sobre os 17 memberships ativos):
--   • juniorsaori01@gmail.com  / Royal Parma Bauru → planning SELECT + planning INSERT/UPDATE + salmon SELECT
--   • compras.rensushi@gmail.com / Ren Sushi       → salmon SELECT
--
-- A mudança é ADITIVA: nenhuma chave legada é removida, o escopo por company_id é
-- preservado literalmente e system:global:manage passa a valer onde faltava.
-- has_any_permission continua embrulhado em (select ...) para virar InitPlan (1x por
-- execução) em vez de ser reavaliado por linha.
--
-- public.produtos foi auditado neste mesmo grupo e NÃO precisa de mudança: as policies
-- tenant_read/tenant_insert/tenant_update/tenant_delete (só stock:read/stock:edit/
-- stock:delete) convivem, PERMISSIVE, com produtos_select/insert/update/delete (que já
-- têm as chaves granulares) para os mesmos comandos — o Postgres faz OR, então a
-- estreiteza das tenant_* é inócua hoje (0 de 17 memberships bloqueados, confirmado).
-- Existe um gap latente diferente (produtos_insert/update/delete não têm
-- estoque:catalogo:create/edit/delete), mas com impacto vivo = zero porque quem tem
-- catalogo:* também tem cadastros:* hoje. CLAUDE.md registra 2 regressões anteriores
-- nessa área — fica como item futuro em vez de entrar junto com a correção de incidente.

-- ============================================================================
-- 1. planning_metas_compra → planning:meta-compras:* (PlanningView.tsx)
-- ============================================================================
-- Gate real do frontend: PlanningView.tsx:67 useCan('planning:meta-compras:edit');
-- leitura direta via PostgREST em usePlanningStore.ts:76 e useSalmonStore.ts:117;
-- escrita direta (upsert) em useSalmonStore.ts:329 (saveMetaCompra).
--
-- O submódulo meta-compras é VIEW_EDIT no registry — não existe create/delete
-- granular, então 'edit' cobre INSERT, UPDATE e DELETE.
--
-- ATENÇÃO: estas policies NÃO têm cláusula de company_id hoje — o isolamento vem da
-- policy RESTRICTIVE multiunit_scope_boundary (que tem fallback is_company_member
-- quando não há header x-company-id). Acrescentar company_id = get_current_company_id()
-- aqui ESTREITARIA esse fallback; por isso o escopo é preservado exatamente como está.

ALTER POLICY "planning_select" ON public.planning_metas_compra
  USING (
    (SELECT has_any_permission(auth.uid(), ARRAY['planning:meta-compras:view', 'planning:read', 'system:global:manage']))
  );

ALTER POLICY "planning_insert" ON public.planning_metas_compra
  WITH CHECK (
    (SELECT has_any_permission(auth.uid(), ARRAY['planning:meta-compras:edit', 'planning:manage', 'system:global:manage']))
    AND created_by = (SELECT auth.uid())
  );

ALTER POLICY "planning_update" ON public.planning_metas_compra
  USING (
    (SELECT has_any_permission(auth.uid(), ARRAY['planning:meta-compras:edit', 'planning:manage', 'system:global:manage']))
  )
  WITH CHECK (
    (SELECT has_any_permission(auth.uid(), ARRAY['planning:meta-compras:edit', 'planning:manage', 'system:global:manage']))
  );

ALTER POLICY "planning_delete" ON public.planning_metas_compra
  USING (
    (SELECT has_any_permission(auth.uid(), ARRAY['planning:meta-compras:edit', 'planning:manage', 'system:global:manage']))
  );

-- NOTA sobre planning_delete_blocked (DELETE, qual = false): ela é PERMISSIVE, não
-- RESTRICTIVE — verificado em pg_policies. Policies PERMISSIVE são OR'd, então uma
-- com qual=false é no-op e NÃO bloqueia nada; quem manda no DELETE é planning_delete.
-- É policy morta, não um bloqueio deliberado. Deixada intacta de propósito (remover
-- está fora do escopo desta correção aditiva).

-- ============================================================================
-- 2. salmon_entries → salmon:entradas:* (EntriesView.tsx)
-- ============================================================================
-- Gates reais do frontend: EntriesView.tsx:44-46
--   salmon:entradas:create / salmon:entradas:edit / salmon:entradas:delete
--
-- SELECT é o único comando LOAD-BEARING: useSalmonStore.ts:112 e :952 fazem
-- .from('salmon_entries').select(...) direto via PostgREST.
--
-- INSERT/UPDATE/DELETE hoje NÃO passam por esta RLS: todas as escritas vão pelos
-- wrappers _salmon_create_entry_guarded / _salmon_cancel_entry_guarded, que são
-- SECURITY DEFINER com owner = postgres, e postgres tem rolbypassrls = true — ou seja,
-- a RLS é ignorada dentro deles mesmo com FORCE RLS. Esses wrappers já checam as
-- chaves granulares corretas ('salmon:entradas:create' / 'salmon:entradas:delete'),
-- então não há bug de acesso no caminho do app. O alinhamento abaixo é defensivo:
-- fecha a armadilha para qualquer escrita direta futura via PostgREST.

ALTER POLICY "salmon_tenant_select" ON public.salmon_entries
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['salmon:entradas:view', 'salmon:read', 'system:global:manage']))
  );

ALTER POLICY "salmon_tenant_insert" ON public.salmon_entries
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['salmon:entradas:create', 'salmon:entries:create', 'system:global:manage']))
  );

-- 'salmon:edit' não existe em LEGACY_PERMISSION_MAP nem no registry, mas TEM concessão
-- viva (role_permissions: admin/diretor/gerente_geral; 1 ALLOW + 1 DENY em
-- user_permissions) — não é chave morta, então continua no array pela regra aditiva.
-- WITH CHECK preservado literalmente (hoje só valida company_id, sem checagem de chave).
ALTER POLICY "salmon_tenant_update" ON public.salmon_entries
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['salmon:entradas:edit', 'salmon:edit', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
  );

ALTER POLICY "salmon_tenant_delete" ON public.salmon_entries
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['salmon:entradas:delete', 'salmon:delete', 'system:global:manage']))
  );
