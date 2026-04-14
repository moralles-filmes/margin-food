-- Fix: Vazamento de dados entre empresas no campo Responsável e demais dropdowns de usuários
-- Problema 1: Policy "Users can read all profiles" com USING(true) permitia ler usuários de qualquer empresa
-- Problema 2: RPC list_profiles_minimal() não filtrava por company_id nem por usuários excluídos

-- ============================================================
-- PARTE A: Limpar policies permissivas (sem isolamento de tenant)
-- ============================================================
DROP POLICY IF EXISTS "Users can read all profiles"     ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile"      ON public.profiles;
-- Nota: mantemos profiles_select_own, profiles_select_admin_company e profiles_update_own
-- que já foram criadas corretamente em 20260301175412.

-- ============================================================
-- PARTE B: Policy para membros da mesma empresa
-- Permite que qualquer usuário autenticado leia profiles da SUA empresa.
-- Isso é necessário para dropdowns como "Responsável", sem expor outras empresas.
-- Usuários excluídos (nome prefixado com [EXCLUÍDO]) são bloqueados aqui também.
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_company_member" ON public.profiles;
CREATE POLICY "profiles_select_company_member" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND nome NOT ILIKE '[EXCLUÍDO]%'
  );

-- ============================================================
-- PARTE C: Corrigir RPC list_profiles_minimal()
-- A função era SECURITY DEFINER sem filtro de empresa, retornando
-- TODOS os usuários de TODAS as empresas para qualquer usuário autenticado.
-- Fix: adiciona filtro por company_id e exclui usuários soft-deletados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_profiles_minimal(
  p_search text DEFAULT '',
  p_limit  int  DEFAULT 50
)
RETURNS TABLE(id uuid, nome text, email text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  v_company_id := public.get_current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome, p.email, p.avatar_url
    FROM   public.profiles p
    WHERE  p.company_id = v_company_id
      AND  p.nome NOT ILIKE '[EXCLUÍDO]%'
      AND  (
             p_search = ''
             OR p.nome  ILIKE '%' || p_search || '%'
             OR p.email ILIKE '%' || p_search || '%'
           )
    ORDER BY p.nome
    LIMIT p_limit;
END;
$$;

NOTIFY pgrst, 'reload schema';
