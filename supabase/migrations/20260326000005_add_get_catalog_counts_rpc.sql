-- =========================================================
-- RPC PARA CONTAGEM DE CATÁLOGO (BLINDAGEM DE PERFORMANCE)
-- Data: 2026-03-26
-- Objetivo: Evitar tripla chamada de count:exact com RLS pesado.
-- Esta função SECURITY DEFINER roda com privilégios elevados,
-- o que é muito mais rápido que o RLS linha-a-linha para contagens.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_catalog_counts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_total int;
  v_active int;
  v_inactive int;
BEGIN
  -- Obter a empresa do contexto do usuário atual com segurança
  v_company_id := (SELECT company_id FROM public.profiles WHERE id = auth.uid());

  IF v_company_id IS NULL THEN
    RETURN json_build_object('total', 0, 'active', 0, 'inactive', 0);
  END IF;

  -- Realizar as contagens em uma única passagem ou de forma otimizada
  SELECT count(*) INTO v_total FROM public.produtos WHERE company_id = v_company_id;
  SELECT count(*) INTO v_active FROM public.produtos WHERE company_id = v_company_id AND ativo = true;
  SELECT count(*) INTO v_inactive FROM public.produtos WHERE company_id = v_company_id AND ativo = false;

  RETURN json_build_object(
    'total', v_total,
    'active', v_active,
    'inactive', v_inactive
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_catalog_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_catalog_counts() TO service_role;
