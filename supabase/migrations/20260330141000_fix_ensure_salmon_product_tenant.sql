-- FIX: ensure_salmon_raw_product tenant isolation
CREATE OR REPLACE FUNCTION public.ensure_salmon_raw_product()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_sku text;
  v_company_id uuid;
BEGIN
  -- Enforcement
  v_company_id := assert_tenant();
  
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  -- 1. Look for existing linked product within company context
  SELECT id INTO v_id FROM produtos 
  WHERE is_salmon_raw_linked = true 
    AND ativo = true 
    AND company_id = v_company_id 
  LIMIT 1;
  
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- 2. Generate SKU (will use get_current_company_id fallback which is now dynamic)
  SELECT generate_next_sku('SALM') INTO v_sku;

  -- 3. Create product if missing for this company
  INSERT INTO produtos (
    nome_produto, sku, categoria, unidade_medida, unidade_compra,
    fator_conversao_padrao, custo_padrao, default_cost_purchase_unit, default_cost_base_unit,
    estoque_minimo, estoque_ideal, ativo, is_salmon_raw_linked, observacoes, company_id
  ) VALUES (
    'Salmão Fresco', v_sku, 'Pescados', 'KG', 'KG',
    1, 0, 0, 0,
    0, 0, true, true, 'Item vinculado automaticamente ao Controle de Salmão. Não editar unidades.',
    v_company_id
  )
  RETURNING id INTO v_id;

  -- 4. Audit with correct metadata
  PERFORM public.log_audit('rpc', 'salmon', 'produtos', v_id, 'ENSURE_RAW_PRODUCT', NULL,
    jsonb_build_object('sku', v_sku, 'created', true, 'company_id', v_company_id));

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_salmon_raw_product() TO authenticated;
