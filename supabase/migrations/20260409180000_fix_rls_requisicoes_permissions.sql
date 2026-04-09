-- =========================================================
-- Fix RLS policies on requisicoes_estoque and requisicao_estoque_itens
-- Old policies used legacy key 'stock:requisitions:read' which has_permission()
-- does NOT map to granular keys at the DB level. Users with 'estoque:requisicoes:view'
-- or 'system:global:manage' were blocked. This replaces with granular + legacy + admin bypass.
-- =========================================================

-- ── requisicoes_estoque ──
DROP POLICY IF EXISTS "perm_req_select" ON public.requisicoes_estoque;
DROP POLICY IF EXISTS "perm_req_write" ON public.requisicoes_estoque;

CREATE POLICY "req_select" ON public.requisicoes_estoque
FOR SELECT TO authenticated USING (
  public.has_permission(auth.uid(), 'estoque:requisicoes:view')
  OR public.has_permission(auth.uid(), 'stock:requisitions:read')
  OR public.has_permission(auth.uid(), 'system:global:manage')
);

CREATE POLICY "req_insert" ON public.requisicoes_estoque
FOR INSERT TO authenticated WITH CHECK (
  public.has_permission(auth.uid(), 'estoque:requisicoes:create')
  OR public.has_permission(auth.uid(), 'stock:requisitions:create')
  OR public.has_permission(auth.uid(), 'system:global:manage')
);

CREATE POLICY "req_update" ON public.requisicoes_estoque
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'estoque:requisicoes:approve')
  OR public.has_permission(auth.uid(), 'stock:requisitions:create')
  OR public.has_permission(auth.uid(), 'system:global:manage')
)
WITH CHECK (
  public.has_permission(auth.uid(), 'estoque:requisicoes:approve')
  OR public.has_permission(auth.uid(), 'stock:requisitions:create')
  OR public.has_permission(auth.uid(), 'system:global:manage')
);

CREATE POLICY "req_delete" ON public.requisicoes_estoque
FOR DELETE TO authenticated USING (
  public.has_permission(auth.uid(), 'system:global:manage')
);

-- ── requisicao_estoque_itens ──
DROP POLICY IF EXISTS "perm_req_itens_select" ON public.requisicao_estoque_itens;
DROP POLICY IF EXISTS "perm_req_itens_write" ON public.requisicao_estoque_itens;
DROP POLICY IF EXISTS "Can read requisicao_itens via requisicao" ON public.requisicao_estoque_itens;
DROP POLICY IF EXISTS "Authenticated can insert requisicao_itens" ON public.requisicao_estoque_itens;
DROP POLICY IF EXISTS "Authorized can update requisicao_itens" ON public.requisicao_estoque_itens;

CREATE POLICY "req_itens_select" ON public.requisicao_estoque_itens
FOR SELECT TO authenticated USING (
  public.has_permission(auth.uid(), 'estoque:requisicoes:view')
  OR public.has_permission(auth.uid(), 'stock:requisitions:read')
  OR public.has_permission(auth.uid(), 'system:global:manage')
);

CREATE POLICY "req_itens_insert" ON public.requisicao_estoque_itens
FOR INSERT TO authenticated WITH CHECK (
  public.has_permission(auth.uid(), 'estoque:requisicoes:create')
  OR public.has_permission(auth.uid(), 'stock:requisitions:create')
  OR public.has_permission(auth.uid(), 'system:global:manage')
);

CREATE POLICY "req_itens_update" ON public.requisicao_estoque_itens
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'estoque:requisicoes:approve')
  OR public.has_permission(auth.uid(), 'stock:requisitions:create')
  OR public.has_permission(auth.uid(), 'system:global:manage')
)
WITH CHECK (
  public.has_permission(auth.uid(), 'estoque:requisicoes:approve')
  OR public.has_permission(auth.uid(), 'stock:requisitions:create')
  OR public.has_permission(auth.uid(), 'system:global:manage')
);
