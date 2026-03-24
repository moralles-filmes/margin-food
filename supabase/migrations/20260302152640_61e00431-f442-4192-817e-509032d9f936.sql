
-- P2-A: Migrate RLS to granular policies for CMV module
-- Keep legacy permissions working + add CMV granular permissions

-- ═══ PRODUTOS ═══
-- Drop existing policies
DROP POLICY IF EXISTS "tenant_read" ON public.produtos;
DROP POLICY IF EXISTS "tenant_insert" ON public.produtos;
DROP POLICY IF EXISTS "tenant_update" ON public.produtos;
DROP POLICY IF EXISTS "tenant_delete" ON public.produtos;

-- SELECT: stock legacy + CMV granular
CREATE POLICY "produtos_select" ON public.produtos
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:read',
      'estoque:geral:view',
      'estoque:cadastros:view',
      'cmv:categoria:view',
      'cmv:top-itens:view',
      'cmv:setor:view',
      'cmv:semanal:view',
      'cmv:precos:view',
      'cmv:simulador:view',
      'system:global:manage'
    ])
  );

-- INSERT: stock legacy + granular
CREATE POLICY "produtos_insert" ON public.produtos
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:edit',
      'estoque:cadastros:create',
      'estoque:cadastros:manage',
      'system:global:manage'
    ])
  );

-- UPDATE: stock legacy + CMV price recalc + granular
CREATE POLICY "produtos_update" ON public.produtos
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:edit',
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'cmv:precos:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (
    company_id = public.get_current_company_id()
  );

-- DELETE: stock legacy + granular
CREATE POLICY "produtos_delete" ON public.produtos
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:delete',
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'system:global:manage'
    ])
  );

-- ═══ MOVIMENTACOES_ESTOQUE ═══
DROP POLICY IF EXISTS "tenant_read" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "tenant_insert" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "tenant_update" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "tenant_delete" ON public.movimentacoes_estoque;

-- SELECT: stock legacy + CMV granular
CREATE POLICY "movimentacoes_select" ON public.movimentacoes_estoque
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:movements:read',
      'estoque:movimentacoes:view',
      'cmv:categoria:view',
      'cmv:top-itens:view',
      'cmv:setor:view',
      'cmv:semanal:view',
      'cmv:simulador:view',
      'system:global:manage'
    ])
  );

-- INSERT: stock only (CMV doesn't write)
CREATE POLICY "movimentacoes_insert" ON public.movimentacoes_estoque
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:movements:create',
      'estoque:movimentacoes:create',
      'estoque:movimentacoes:manage',
      'system:global:manage'
    ])
  );

-- UPDATE: stock only
CREATE POLICY "movimentacoes_update" ON public.movimentacoes_estoque
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:movements:edit',
      'estoque:movimentacoes:edit',
      'estoque:movimentacoes:manage',
      'system:global:manage'
    ])
  )
  WITH CHECK (
    company_id = public.get_current_company_id()
  );

-- DELETE: stock only
CREATE POLICY "movimentacoes_delete" ON public.movimentacoes_estoque
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'stock:delete',
      'estoque:movimentacoes:delete',
      'estoque:movimentacoes:manage',
      'system:global:manage'
    ])
  );

-- ═══ FINANCEIRO_FECHAMENTO_CAIXA ═══
DROP POLICY IF EXISTS "fechamento_read" ON public.financeiro_fechamento_caixa;
DROP POLICY IF EXISTS "fechamento_insert" ON public.financeiro_fechamento_caixa;
DROP POLICY IF EXISTS "fechamento_update" ON public.financeiro_fechamento_caixa;
DROP POLICY IF EXISTS "fechamento_delete" ON public.financeiro_fechamento_caixa;

-- SELECT: finance legacy + CMV granular
CREATE POLICY "fechamento_select" ON public.financeiro_fechamento_caixa
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'finance:read',
      'financeiro:fechamento:view',
      'financeiro:lancamentos:view',
      'cmv:categoria:view',
      'cmv:semanal:view',
      'system:global:manage'
    ])
  );

-- INSERT: finance legacy + granular
CREATE POLICY "fechamento_insert" ON public.financeiro_fechamento_caixa
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:create',
      'financeiro:fechamento:edit',
      'system:global:manage'
    ])
  );

-- UPDATE: finance legacy + granular
CREATE POLICY "fechamento_update" ON public.financeiro_fechamento_caixa
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (
    company_id = public.get_current_company_id()
  );

-- DELETE: restricted
CREATE POLICY "fechamento_delete" ON public.financeiro_fechamento_caixa
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:delete',
      'system:global:manage'
    ])
  );
