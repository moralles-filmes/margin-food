-- Códigos de barras dos produtos de um inventário, para a tela de leitura
-- buscar sozinha quando o texto digitado é um código cadastrado completo
-- (teclado numérico de celular/tablet não tem Enter). Só o texto do código:
-- nada de custo, saldo ou dado do produto.
CREATE OR REPLACE FUNCTION public.inventario_listar_codigos(p_inventario_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid := public.assert_tenant();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['inventario:detalhe:edit', 'inventario:criar:create', 'inventory:count', 'inventory:edit', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: inventario:detalhe:edit' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT array_agg(DISTINCT pcb.codigo)
    FROM public.produto_codigos_barras pcb
    JOIN public.inventario_itens ii
      ON ii.produto_id = pcb.produto_id AND ii.company_id = pcb.company_id
    WHERE pcb.company_id = v_company_id
      AND ii.inventario_id = p_inventario_id
      AND ii.deleted_at IS NULL
  ), '{}'::text[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.inventario_listar_codigos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventario_listar_codigos(uuid) TO authenticated;
