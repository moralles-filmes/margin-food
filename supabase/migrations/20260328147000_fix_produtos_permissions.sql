-- =========================================================
-- CORREÇÃO DE PERMISSÕES E VISIBILIDADE: TABELA PRODUTOS
-- Data: 2026-03-28
-- Objetivo: Resolver erro "permission denied for table produtos"
-- =========================================================

-- 1. GARANTIR GRANTS BÁSICOS PARA O ROLE AUTHENTICATED
-- Mesmo que tenha sido feito globalmente, re-aplicamos para garantir
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;

-- 2. REPARAR POLÍTICA DE LEITURA (SELECT)
-- Vamos simplificar para garantir que não haja timeout ou erro de subquery
DROP POLICY IF EXISTS "tenant_read" ON public.produtos;

-- Garantir GRANT SELECT na tabela de produtos para todos os filtros
GRANT SELECT ON public.produtos TO authenticated;

DROP POLICY IF EXISTS "tenant_read" ON public.produtos;
CREATE POLICY "tenant_read" ON public.produtos 
FOR SELECT TO authenticated 
USING (
  -- Filtro por empresa (Tenant Isolation)
  -- Usamos uma subquery simples que o Postgres consegue otimizar
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) 
  AND (
    public.has_permission_quick(auth.uid(), 'stock:read')
    OR
    public.has_permission_quick(auth.uid(), 'admin')
  )
);

-- 3. RECARREGAR CONFIGURAÇÃO DO POSTGREST
NOTIFY pgrst, 'reload schema';
