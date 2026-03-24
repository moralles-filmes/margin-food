CREATE OR REPLACE FUNCTION public.ensure_salmon_raw_product()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_sku text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'salmon:entries:create')
     AND NOT public.has_permission(auth.uid(), 'stock:edit') THEN
    RAISE EXCEPTION 'Sem permissão para criar/vincular produto Salmão Fresco.';
  END IF;

  SELECT id INTO v_id FROM produtos WHERE is_salmon_raw_linked = true AND ativo = true LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT generate_next_sku('SALM') INTO v_sku;

  INSERT INTO produtos (
    nome_produto, sku, categoria, unidade_medida, unidade_compra,
    fator_conversao_padrao, custo_padrao, default_cost_purchase_unit, default_cost_base_unit,
    estoque_minimo, estoque_ideal, ativo, is_salmon_raw_linked, observacoes
  ) VALUES (
    'Salmão Fresco', v_sku, 'Pescados', 'KG', 'KG',
    1, 0, 0, 0,
    0, 0, true, true, 'Item vinculado automaticamente ao Controle de Salmão. Não editar unidades.'
  )
  RETURNING id INTO v_id;

  PERFORM public.log_audit('rpc', 'salmon', 'produtos', v_id, 'ENSURE_RAW_PRODUCT', NULL,
    jsonb_build_object('sku', v_sku, 'created', true));

  RETURN v_id;
END;
$function$;

-- 2) Fix mirror_salmon_to_stock: add FOR UPDATE on existing movement lookup