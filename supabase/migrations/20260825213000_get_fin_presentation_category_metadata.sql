-- Nova Fase 7 — metadados semânticos do dashboard executivo.
--
-- A RPC é deliberadamente separada dos agregados financeiros: `grupo` e
-- `linha_dre` mudam raramente, podem ter cache próprio e permitem identificar
-- CMV/Folha/Operacionais sem inferência pelo nome da categoria. Nenhum valor de
-- lançamento é retornado. Rollback: DROP FUNCTION da assinatura sem afetar a
-- RPC canônica nem as telas financeiras existentes.

CREATE OR REPLACE FUNCTION public.get_fin_presentation_category_metadata()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      category.id::text,
      jsonb_build_object(
        'group', NULLIF(BTRIM(category.grupo), ''),
        'dreLine', NULLIF(BTRIM(category.linha_dre), '')
      )
      ORDER BY category.id::text
    ),
    '{}'::jsonb
  )
  INTO v_result
  FROM public.fin_categorias category
  WHERE category.company_id = v_company_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_category_metadata()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_fin_presentation_category_metadata()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_fin_presentation_category_metadata()
IS 'Metadados semânticos tenant-scoped das categorias usados pelo dashboard da Apresentação Sócios; não retorna valores financeiros.';

-- Valida assinatura e resolve as colunas usadas antes do deploy concluir.
DO $migration_check$
BEGIN
  PERFORM pg_get_functiondef(
    'public.get_fin_presentation_category_metadata()'::regprocedure
  );
  PERFORM
    category.id,
    NULLIF(BTRIM(category.grupo), ''),
    NULLIF(BTRIM(category.linha_dre), '')
  FROM public.fin_categorias category
  WHERE false;
END;
$migration_check$;
