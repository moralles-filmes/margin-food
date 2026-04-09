-- =============================================================================
-- Fix: RLS Tenant Isolation para tabelas sem company_id nas policies
-- Tabelas afetadas: stock_categories, stock_locations, fin_categorias,
--                   fin_centros_custo, turnos, rh_escalas, job_roles
--
-- Problema: policies usavam apenas has_permission() sem filtrar por company_id,
-- permitindo que usuários de uma empresa vissem/editassem dados de outra.
--
-- Padrão correto:
--   USING (company_id = get_current_company_id() AND has_any_permission(...))
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. stock_categories
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_categories FORCE ROW LEVEL SECURITY;

-- Drop todas as policies históricas
DROP POLICY IF EXISTS "stock_categories_select" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_insert" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_update" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_delete" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_read_categories"   ON public.stock_categories;
DROP POLICY IF EXISTS "stock_edit_categories"   ON public.stock_categories;
DROP POLICY IF EXISTS "stock_update_categories" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_delete_categories" ON public.stock_categories;

CREATE POLICY "tenant_select_stock_categories" ON public.stock_categories
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:categorias:view', 'stock:read', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_insert_stock_categories" ON public.stock_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:categorias:create', 'stock:edit', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_update_stock_categories" ON public.stock_categories
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:categorias:edit', 'stock:edit', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "tenant_delete_stock_categories" ON public.stock_categories
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:categorias:delete', 'stock:edit', 'system:global:manage'
    ])
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. stock_locations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_locations FORCE ROW LEVEL SECURITY;

-- Drop todas as policies históricas
DROP POLICY IF EXISTS "stock_locations_select" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_locations_insert" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_locations_update" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_locations_delete" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_read_locations"   ON public.stock_locations;
DROP POLICY IF EXISTS "stock_edit_locations"   ON public.stock_locations;
DROP POLICY IF EXISTS "stock_update_locations" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_delete_locations" ON public.stock_locations;

CREATE POLICY "tenant_select_stock_locations" ON public.stock_locations
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:locais:view', 'stock:read', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_insert_stock_locations" ON public.stock_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:locais:create', 'stock:edit', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_update_stock_locations" ON public.stock_locations
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:locais:edit', 'stock:edit', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "tenant_delete_stock_locations" ON public.stock_locations
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'estoque:locais:delete', 'stock:edit', 'system:global:manage'
    ])
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fin_categorias
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_categorias FORCE ROW LEVEL SECURITY;

-- Drop todas as policies históricas
DROP POLICY IF EXISTS "Masters can manage fin_categorias"     ON public.fin_categorias;
DROP POLICY IF EXISTS "Financeiro can manage fin_categorias"  ON public.fin_categorias;
DROP POLICY IF EXISTS "Authenticated can read fin_categorias" ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_read_categorias"                   ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_manage_insert_categorias"          ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_manage_update_categorias"          ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_manage_delete_categorias"          ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_categorias_select"                 ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_categorias_insert"                 ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_categorias_update"                 ON public.fin_categorias;
DROP POLICY IF EXISTS "fin_categorias_delete"                 ON public.fin_categorias;
DROP POLICY IF EXISTS "tenant_read"                           ON public.fin_categorias;
DROP POLICY IF EXISTS "tenant_insert"                         ON public.fin_categorias;
DROP POLICY IF EXISTS "tenant_update"                         ON public.fin_categorias;
DROP POLICY IF EXISTS "tenant_delete"                         ON public.fin_categorias;

CREATE POLICY "tenant_select_fin_categorias" ON public.fin_categorias
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:categorias:view', 'finance:read', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_insert_fin_categorias" ON public.fin_categorias
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:categorias:create', 'finance:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_update_fin_categorias" ON public.fin_categorias
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:categorias:edit', 'finance:manage', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "tenant_delete_fin_categorias" ON public.fin_categorias
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:categorias:delete', 'finance:manage', 'system:global:manage'
    ])
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fin_centros_custo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_centros_custo FORCE ROW LEVEL SECURITY;

-- Drop todas as policies históricas
DROP POLICY IF EXISTS "Masters can manage fin_centros_custo"     ON public.fin_centros_custo;
DROP POLICY IF EXISTS "Financeiro can manage fin_centros_custo"  ON public.fin_centros_custo;
DROP POLICY IF EXISTS "Authenticated can read fin_centros_custo" ON public.fin_centros_custo;
DROP POLICY IF EXISTS "fin_read_centros_custo"                   ON public.fin_centros_custo;
DROP POLICY IF EXISTS "fin_manage_insert_centros_custo"          ON public.fin_centros_custo;
DROP POLICY IF EXISTS "fin_manage_update_centros_custo"          ON public.fin_centros_custo;
DROP POLICY IF EXISTS "fin_manage_delete_centros_custo"          ON public.fin_centros_custo;
DROP POLICY IF EXISTS "tenant_read"                              ON public.fin_centros_custo;
DROP POLICY IF EXISTS "tenant_insert"                            ON public.fin_centros_custo;
DROP POLICY IF EXISTS "tenant_update"                            ON public.fin_centros_custo;
DROP POLICY IF EXISTS "tenant_delete"                            ON public.fin_centros_custo;

CREATE POLICY "tenant_select_fin_centros_custo" ON public.fin_centros_custo
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:centros-custo:view', 'finance:read', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_insert_fin_centros_custo" ON public.fin_centros_custo
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:centros-custo:create', 'finance:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_update_fin_centros_custo" ON public.fin_centros_custo
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:centros-custo:edit', 'finance:manage', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "tenant_delete_fin_centros_custo" ON public.fin_centros_custo
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:centros-custo:delete', 'finance:manage', 'system:global:manage'
    ])
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. turnos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.turnos FORCE ROW LEVEL SECURITY;

-- Drop todas as policies históricas
DROP POLICY IF EXISTS "Authenticated can read turnos" ON public.turnos;
DROP POLICY IF EXISTS "Admin can manage turnos"       ON public.turnos;
DROP POLICY IF EXISTS "perm_turnos_select"            ON public.turnos;
DROP POLICY IF EXISTS "perm_turnos_write"             ON public.turnos;

CREATE POLICY "tenant_select_turnos" ON public.turnos
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'configuracoes:turnos:view', 'settings:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_insert_turnos" ON public.turnos
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'configuracoes:turnos:create', 'settings:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_update_turnos" ON public.turnos
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'configuracoes:turnos:edit', 'settings:manage', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "tenant_delete_turnos" ON public.turnos
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'configuracoes:turnos:delete', 'settings:manage', 'system:global:manage'
    ])
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. rh_escalas
-- Políticas corretas já existem (rh_escalas_select/insert/update/delete via
-- 20260303015805), mas políticas antigas sem company_id ainda estão ativas
-- e permitem acesso cross-tenant via OR. Apenas remover as quebradas.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Masters can manage rh_escalas"             ON public.rh_escalas;
DROP POLICY IF EXISTS "Gerente can manage rh_escalas"             ON public.rh_escalas;
DROP POLICY IF EXISTS "Authenticated can read published rh_escalas" ON public.rh_escalas;
DROP POLICY IF EXISTS "perm_rh_escalas_select"                    ON public.rh_escalas;
DROP POLICY IF EXISTS "perm_rh_escalas_write"                     ON public.rh_escalas;

-- Garantir que as políticas corretas existam (idempotente: recria se ausentes)
DROP POLICY IF EXISTS "rh_escalas_select" ON public.rh_escalas;
DROP POLICY IF EXISTS "rh_escalas_insert" ON public.rh_escalas;
DROP POLICY IF EXISTS "rh_escalas_update" ON public.rh_escalas;
DROP POLICY IF EXISTS "rh_escalas_delete" ON public.rh_escalas;

CREATE POLICY "rh_escalas_select" ON public.rh_escalas
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:view', 'rh:escalas:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "rh_escalas_insert" ON public.rh_escalas
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "rh_escalas_update" ON public.rh_escalas
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:manage', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_escalas_delete" ON public.rh_escalas
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:manage', 'system:global:manage'
    ])
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. job_roles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_roles FORCE ROW LEVEL SECURITY;

-- Drop todas as policies históricas
DROP POLICY IF EXISTS "Masters can manage job_roles"          ON public.job_roles;
DROP POLICY IF EXISTS "Authenticated can read active job_roles" ON public.job_roles;
DROP POLICY IF EXISTS "perm_job_roles_manage"                 ON public.job_roles;

CREATE POLICY "tenant_select_job_roles" ON public.job_roles
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'usuarios:cargos:view', 'users:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_insert_job_roles" ON public.job_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'usuarios:cargos:create', 'users:manage', 'system:global:manage'
    ])
  );

CREATE POLICY "tenant_update_job_roles" ON public.job_roles
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'usuarios:cargos:edit', 'users:manage', 'system:global:manage'
    ])
  )
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "tenant_delete_job_roles" ON public.job_roles
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'usuarios:cargos:delete', 'users:manage', 'system:global:manage'
    ])
  );
