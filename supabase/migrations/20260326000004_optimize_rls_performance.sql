-- =========================================================
-- OTIMIZAÇÃO DE PERFORMANCE RLS (ROW LEVEL SECURITY)
-- Data: 2026-03-26
-- Objetivo: Resolver timeout no catálogo convertendo funções PLPGSQL 
-- em funções SQL inlináveis e otimizando o acesso ao company_id.
-- =========================================================

-- 1. REESCREVER get_current_company_id COMO SQL (PARA PERMITIR INLINING)
-- O formato anterior em PLPGSQL impedia que o Postgres otimizasse a consulta no RLS.
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE id = auth.uid()),
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

-- 2. FUNÇÃO DE CHECAGEM DE PERMISSÃO OTIMIZADA PARA RLS
-- Em vez de gerar um array de centenas de permissões e conferir em cada linha,
-- fazemos uma checagem direta de existência, que é muito mais rápida para o RLS.
CREATE OR REPLACE FUNCTION public.has_permission_quick(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Permissão via Role
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role::text
      WHERE ur.user_id = _user_id AND rp.permission_key = _permission
    )
    OR 
    -- Permissão direta (ALLOW)
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id AND permission_key = _permission AND effect = 'ALLOW'
    )
  ) AND NOT EXISTS (
    -- Bloqueio direto (DENY)
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission_key = _permission AND effect = 'DENY'
  );
$$;

-- 3. ATUALIZAR POLÍTICAS DA TABELA PRODUTOS
-- Vamos reescrever as políticas para usar a subquery diretamente onde possível,
-- facilitando para o planejador do banco "achatar" a consulta.
DROP POLICY IF EXISTS "tenant_read" ON public.produtos;
CREATE POLICY "tenant_read" ON public.produtos 
FOR SELECT TO authenticated 
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) 
  AND public.has_permission_quick(auth.uid(), 'stock:read')
);

DROP POLICY IF EXISTS "tenant_insert" ON public.produtos;
CREATE POLICY "tenant_insert" ON public.produtos 
FOR INSERT TO authenticated 
WITH CHECK (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) 
  AND public.has_permission_quick(auth.uid(), 'stock:edit')
);

DROP POLICY IF EXISTS "tenant_update" ON public.produtos;
CREATE POLICY "tenant_update" ON public.produtos 
FOR UPDATE TO authenticated 
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) 
  AND public.has_permission_quick(auth.uid(), 'stock:edit')
) 
WITH CHECK (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) 
  AND public.has_permission_quick(auth.uid(), 'stock:edit')
);

DROP POLICY IF EXISTS "tenant_delete" ON public.produtos;
CREATE POLICY "tenant_delete" ON public.produtos 
FOR DELETE TO authenticated 
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) 
  AND public.has_permission_quick(auth.uid(), 'stock:delete')
);

-- 4. RECARREGAR CONFIGURAÇÃO
NOTIFY pgrst, 'reload schema';
