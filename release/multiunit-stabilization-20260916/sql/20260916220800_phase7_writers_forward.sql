-- Fase 7: autorização das APIs de escrita e relações operacionais. Nenhuma reescrita de dados.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF has_function_privilege('authenticated','public.set_cache(text,jsonb,integer)','EXECUTE') THEN RAISE EXCEPTION 'PHASE7_CONTAINMENT_REQUIRED'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('public.batch_reorder_fin_categorias(jsonb)'::regprocedure)) <> 'a85d0a48b349fc2d0844823fbd6ab320' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.batch_reorder_fin_categorias(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_item jsonb;
  v_cat_id uuid;
  v_ordem int;
BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_permission(auth.uid(),ARRAY['financeiro:cadastros:edit','financeiro:cadastros:manage','finance:manage','system:global:manage']::text[]),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Resolve company
  v_company_id := public.assert_tenant();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;

  -- Validate all categories belong to same company and are active
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item
    LEFT JOIN fin_categorias fc ON fc.id = (item->>'id')::uuid
    WHERE fc.id IS NULL OR fc.company_id != v_company_id OR fc.ativo = false
  ) THEN
    RAISE EXCEPTION 'Uma ou mais categorias inválidas ou de outro tenant';
  END IF;

  -- Validate all categories share same parent_id and tipo
  IF (
    SELECT COUNT(DISTINCT COALESCE(fc.parent_id, '00000000-0000-0000-0000-000000000000') || '|' || fc.tipo)
    FROM jsonb_array_elements(p_items) AS item
    JOIN fin_categorias fc ON fc.id = (item->>'id')::uuid
  ) > 1 THEN
    RAISE EXCEPTION 'Todas as categorias devem ter o mesmo parent_id e tipo';
  END IF;

  -- Apply updates with lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cat_id := (v_item->>'id')::uuid;
    v_ordem := (v_item->>'ordem')::int;

    UPDATE fin_categorias
    SET ordem = v_ordem, updated_at = now()
    WHERE id = v_cat_id AND company_id = v_company_id;
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'updated', jsonb_array_length(p_items));
END;
$function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.create_purchase_order_atomic(jsonb,uuid)'::regprocedure)) <> 'b93addea8a750814736e1a1690c11ab5' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.create_purchase_order_atomic(p_payload jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_order_id uuid;
  v_title text;
  v_type text;
  v_status text;
  v_total numeric := 0;
  v_item jsonb;
  v_is_mercado boolean;
  v_shopping_status text;
  v_existing_id uuid;
BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_permission(auth.uid(),ARRAY['compras:pedidos:create','compras:lista:create','purchases:create','compras:write','system:global:manage']::text[]),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_company := assert_tenant();

  SELECT id INTO v_existing_id
  FROM purchase_orders
  WHERE company_id = v_company AND idempotency_key = p_idempotency_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','idempotent','order_id', v_existing_id);
  END IF;

  v_title := p_payload->>'title';
  v_type  := p_payload->>'type';
  v_is_mercado := v_type IN ('MERCADO','SAZONAL');
  v_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OPEN' END;
  v_shopping_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_total := v_total + (v_item->>'qty_requested')::numeric * (v_item->>'estimated_unit_value')::numeric;
  END LOOP;

  INSERT INTO purchase_orders (
    title, type, priority, category, supplier_name, payment_type,
    need_by_date, delivery_forecast_date, responsible_user_id, notes,
    status, total_estimated, created_by, company_id, idempotency_key,
    origin, origin_ref
  ) VALUES (
    v_title, v_type,
    COALESCE(p_payload->>'priority','MEDIA'),
    COALESCE(p_payload->>'category',''),
    NULLIF(p_payload->>'supplier_name',''),
    NULLIF(p_payload->>'payment_type',''),
    NULLIF(p_payload->>'need_by_date','')::date,
    NULLIF(p_payload->>'delivery_forecast_date','')::date,
    NULLIF(p_payload->>'responsible_user_id','')::uuid,
    COALESCE(p_payload->>'notes',''),
    v_status, v_total, v_user, v_company, p_idempotency_key,
    COALESCE(NULLIF(p_payload->>'origin',''), 'MANUAL'),
    NULLIF(p_payload->>'origin_ref','')
  ) RETURNING id INTO v_order_id;

  INSERT INTO purchase_order_items (
    order_id, stock_item_id, name_snapshot, unit_snapshot,
    estimated_unit_value, qty_requested,
    purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot,
    shopping_status, company_id
  )
  SELECT
    v_order_id,
    NULLIF(item->>'stock_item_id','')::uuid,
    item->>'name_snapshot',
    item->>'unit_snapshot',
    (item->>'estimated_unit_value')::numeric,
    (item->>'qty_requested')::numeric,
    COALESCE(NULLIF(item->>'purchase_unit_snapshot',''), item->>'unit_snapshot'),
    COALESCE((item->>'purchase_unit_cost_snapshot')::numeric, (item->>'estimated_unit_value')::numeric),
    COALESCE((item->>'conversion_factor_snapshot')::numeric, 1),
    v_shopping_status,
    v_company
  FROM jsonb_array_elements(p_payload->'items') AS item;

  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('purchase_orders', v_order_id, 'CRIACAO', v_user);

  RETURN jsonb_build_object('status','created','order_id', v_order_id);
END;
$function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.edit_purchase_order_atomic(uuid,jsonb)'::regprocedure)) <> '01f845d1f73fa9f8ee9fba51c830a8a1' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.edit_purchase_order_atomic(p_order_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_order record;
  v_is_mercado boolean;
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_permission(auth.uid(),ARRAY['compras:pedidos:edit','compras:lista:edit','purchases:edit','purchases:market:edit','compras:write','system:global:manage']::text[]),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_company := assert_tenant();

  SELECT * INTO v_order
  FROM purchase_orders
  WHERE id = p_order_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  v_is_mercado := v_order.type IN ('MERCADO','SAZONAL');

  UPDATE purchase_orders SET
    title = COALESCE(NULLIF(p_payload->>'title',''), title),
    type = COALESCE(NULLIF(p_payload->>'type',''), type),
    priority = COALESCE(NULLIF(p_payload->>'priority',''), priority),
    category = COALESCE(p_payload->>'category', category),
    supplier_name = NULLIF(p_payload->>'supplier_name',''),
    payment_type = NULLIF(p_payload->>'payment_type',''),
    need_by_date = NULLIF(p_payload->>'need_by_date','')::date,
    delivery_forecast_date = NULLIF(p_payload->>'delivery_forecast_date','')::date,
    responsible_user_id = NULLIF(p_payload->>'responsible_user_id','')::uuid,
    notes = COALESCE(p_payload->>'notes', notes),
    updated_at = now()
  WHERE id = p_order_id;

  IF p_payload ? 'items' AND jsonb_array_length(p_payload->'items') > 0 THEN
    UPDATE purchase_order_items SET
      deleted_at = now(), deleted_by = v_user
    WHERE order_id = p_order_id
      AND company_id = v_company
      AND received_status = 'PENDING'
      AND shopping_status = 'PENDING'
      AND deleted_at IS NULL;

    v_is_mercado := COALESCE(NULLIF(p_payload->>'type',''), v_order.type::text) IN ('MERCADO','SAZONAL');

    INSERT INTO purchase_order_items (
      order_id, stock_item_id, name_snapshot, unit_snapshot,
      estimated_unit_value, qty_requested,
      purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot,
      shopping_status, company_id
    )
    SELECT
      p_order_id,
      NULLIF(item->>'stock_item_id','')::uuid,
      item->>'name_snapshot',
      item->>'unit_snapshot',
      (item->>'estimated_unit_value')::numeric,
      (item->>'qty_requested')::numeric,
      COALESCE(NULLIF(item->>'purchase_unit_snapshot',''), item->>'unit_snapshot'),
      COALESCE((item->>'purchase_unit_cost_snapshot')::numeric, (item->>'estimated_unit_value')::numeric),
      COALESCE((item->>'conversion_factor_snapshot')::numeric, 1),
      CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END,
      v_company
    FROM jsonb_array_elements(p_payload->'items') AS item;

    SELECT COALESCE(SUM(qty_requested * estimated_unit_value), 0) INTO v_total
    FROM purchase_order_items
    WHERE order_id = p_order_id AND company_id = v_company AND deleted_at IS NULL;

    UPDATE purchase_orders SET total_estimated = v_total WHERE id = p_order_id;
  END IF;

  -- Fix: use p_order_id directly (UUID), not ::text
  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('purchase_orders', p_order_id, 'EDICAO', v_user);

  RETURN jsonb_build_object('status','updated','order_id', p_order_id);
END;
$function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.ficha_salvar_componente_itens_atomic(uuid,jsonb)'::regprocedure)) <> 'a0ebf725819019c0d5d0747a732d6342' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.ficha_salvar_componente_itens_atomic(_componente_pai_id uuid, _itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_parent_tipo text;
  v_child_tipo text;
  v_item jsonb;
  v_idx int := 0;
  v_custo_total numeric := 0;
  v_custo_unitario numeric := 0;
  v_rendimento numeric;
  v_perda numeric;
  v_rendimento_liq numeric;
  v_custo_indireto numeric;
BEGIN
  -- 1. Assert tenant (fail-closed)
  v_company_id := assert_tenant();

  -- 2. Lock parent component (prevent concurrent edits)
  SELECT tipo, rendimento, perda_estimada_percent, custo_indireto
  INTO v_parent_tipo, v_rendimento, v_perda, v_custo_indireto
  FROM ficha_componentes
  WHERE id = _componente_pai_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_parent_tipo IS NULL THEN
    RAISE EXCEPTION 'Componente pai não encontrado ou não pertence ao tenant';
  END IF;

  IF NOT coalesce(public.has_any_permission(auth.uid(),ARRAY[
    CASE v_parent_tipo WHEN 'PRE_PREPARO' THEN 'ficha:pre-preparos:edit' WHEN 'ITEM_PRONTO' THEN 'ficha:itens-prontos:edit' WHEN 'PRODUTO_FINAL' THEN 'ficha:produtos-finais:edit' END,
    'recipes:edit','ficha:write','system:global:manage']),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;

  -- 3. Validate hierarchy for each child component
  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    IF v_item->>'componente_filho_id' IS NOT NULL AND v_item->>'componente_filho_id' != '' THEN
      SELECT tipo INTO v_child_tipo
      FROM ficha_componentes
      WHERE id = (v_item->>'componente_filho_id')::uuid
        AND company_id = v_company_id
        AND deleted_at IS NULL;

      IF v_child_tipo IS NULL THEN
        RAISE EXCEPTION 'Componente filho % não encontrado no tenant', v_item->>'componente_filho_id';
      END IF;

      IF v_parent_tipo = 'PRE_PREPARO' AND v_child_tipo != 'PRE_PREPARO' THEN
        RAISE EXCEPTION 'Pré-Preparo só aceita insumos e outros pré-preparos. "%" não permitido.', v_child_tipo;
      END IF;
      IF v_parent_tipo = 'ITEM_PRONTO' AND v_child_tipo != 'PRE_PREPARO' THEN
        RAISE EXCEPTION 'Item Pronto só aceita insumos, pré-preparos e salmão. "%" não permitido.', v_child_tipo;
      END IF;
      IF v_parent_tipo = 'PRODUTO_FINAL' AND v_child_tipo != 'ITEM_PRONTO' THEN
        RAISE EXCEPTION 'Produto Final só aceita itens prontos e insumos. "%" não permitido.', v_child_tipo;
      END IF;
    END IF;

    -- Block PRODUTO_FINAL from using salmon directly
    IF v_parent_tipo = 'PRODUTO_FINAL' AND (v_item->>'origem') = 'MODULO_SALMAO' THEN
      RAISE EXCEPTION 'Produto Final não pode usar salmão diretamente.';
    END IF;
  END LOOP;

  -- 4. Delete existing items (within tenant scope)
  DELETE FROM ficha_componente_itens
  WHERE componente_pai_id = _componente_pai_id
    AND company_id = v_company_id;

  -- 5. Insert new items (with explicit company_id)
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    INSERT INTO ficha_componente_itens (
      componente_pai_id, componente_filho_id, produto_id,
      quantidade, unidade, custo_snapshot, ordem, origem,
      unidade_original, quantidade_original, company_id
    ) VALUES (
      _componente_pai_id,
      NULLIF(v_item->>'componente_filho_id', '')::uuid,
      NULLIF(v_item->>'produto_id', '')::uuid,
      COALESCE((v_item->>'quantidade')::numeric, 0),
      COALESCE(v_item->>'unidade', 'un'),
      COALESCE((v_item->>'custo_snapshot')::numeric, 0),
      v_idx,
      COALESCE(v_item->>'origem', 'ESTOQUE_GERAL'),
      COALESCE(v_item->>'unidade_original', ''),
      COALESCE((v_item->>'quantidade_original')::numeric, 0),
      v_company_id
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 6. Simple cost recalculation (sum of snapshots + indirect)
  -- Full recursive calc is done by the EF after this returns
  SELECT COALESCE(SUM(quantidade * custo_snapshot), 0)
  INTO v_custo_total
  FROM ficha_componente_itens
  WHERE componente_pai_id = _componente_pai_id
    AND company_id = v_company_id;

  v_custo_total := v_custo_total + COALESCE(v_custo_indireto, 0);
  v_rendimento_liq := COALESCE(v_rendimento, 1) * (1 - COALESCE(v_perda, 0) / 100);
  IF v_rendimento_liq > 0 THEN
    v_custo_unitario := v_custo_total / v_rendimento_liq;
  ELSE
    v_custo_unitario := v_custo_total;
  END IF;

  -- 7. Update parent costs
  UPDATE ficha_componentes
  SET custo_total_calculado = ROUND(v_custo_total, 2),
      custo_unitario_calculado = ROUND(v_custo_unitario, 2),
      updated_at = now()
  WHERE id = _componente_pai_id
    AND company_id = v_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'custoTotal', ROUND(v_custo_total, 2),
    'custoUnitario', ROUND(v_custo_unitario, 2),
    'itensCount', v_idx
  );
END;
$function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.fin_audit_integrity_check()'::regprocedure)) <> 'e59f91afba890131c8752b9211ddb360' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.fin_audit_integrity_check()
 RETURNS TABLE(tipo text, problema text, entidade_id uuid, descricao text, valor numeric, status text, lancamento_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_permission(auth.uid(),ARRAY['financeiro:auditoria:view','finance:read','system:global:manage']::text[]),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  v_company_id := public.assert_tenant();

  -- 1. CPs PAGO sem lancamento_id
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'PAGO sem lançamento espelho'::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND cp.lancamento_id IS NULL;

  -- 2. CPs PAGO cujo espelho não existe mais
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'Espelho excluído ou inexistente'::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND cp.lancamento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = cp.lancamento_id);

  -- 3. CPs PAGO cujo espelho está CANCELADO
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'Espelho CANCELADO mas CP ainda PAGO'::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  JOIN public.fin_lancamentos l ON l.id = cp.lancamento_id
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND l.status = 'CANCELADO';

  -- 4. Espelhos sem CP/CR correspondente
  RETURN QUERY
  SELECT 'lancamento_orfao'::text, 'Espelho CP sem conta a pagar correspondente'::text,
    l.id, l.descricao, l.valor, l.status, l.id
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.origem = 'espelho_cp'
    AND l.status != 'CANCELADO'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_contas_pagar cp
      WHERE cp.lancamento_id = l.id OR cp.id::text = l.referencia_id
    );

  -- 5. CRs RECEBIDO sem lancamento_id
  RETURN QUERY
  SELECT 'conta_receber'::text, 'RECEBIDO sem lançamento espelho'::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND cr.lancamento_id IS NULL;

  -- 6. CRs RECEBIDO cujo espelho não existe mais
  RETURN QUERY
  SELECT 'conta_receber'::text, 'Espelho excluído ou inexistente'::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND cr.lancamento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = cr.lancamento_id);

  -- 7. CRs RECEBIDO cujo espelho está CANCELADO
  RETURN QUERY
  SELECT 'conta_receber'::text, 'Espelho CANCELADO mas CR ainda RECEBIDO'::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  JOIN public.fin_lancamentos l ON l.id = cr.lancamento_id
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND l.status = 'CANCELADO';

  -- 8. Espelhos CR sem conta a receber correspondente
  RETURN QUERY
  SELECT 'lancamento_orfao'::text, 'Espelho CR sem conta a receber correspondente'::text,
    l.id, l.descricao, l.valor, l.status, l.id
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.origem = 'espelho_cr'
    AND l.status != 'CANCELADO'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_contas_receber cr
      WHERE cr.lancamento_id = l.id OR cr.id::text = l.referencia_id
    );

  -- 9. Valor divergente entre CP e seu espelho
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'Valor divergente: CP=' || cp.valor::text || ' vs Espelho=' || l.valor::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  JOIN public.fin_lancamentos l ON l.id = cp.lancamento_id
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND l.status != 'CANCELADO'
    AND cp.valor != l.valor;

  -- 10. Valor divergente entre CR e seu espelho
  RETURN QUERY
  SELECT 'conta_receber'::text, 'Valor divergente: CR=' || cr.valor::text || ' vs Espelho=' || l.valor::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  JOIN public.fin_lancamentos l ON l.id = cr.lancamento_id
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND l.status != 'CANCELADO'
    AND cr.valor != l.valor;
END;
$function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.get_saldo_produto(uuid)'::regprocedure)) <> '1df9e419d06f54452e9ab78030a6ea5c' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_company uuid; v_saldo numeric;
BEGIN
 v_company := public.assert_tenant();
 SELECT p.saldo_atual INTO v_saldo FROM public.produtos p WHERE p.id=p_produto_id AND p.company_id=v_company;
 RETURN round(coalesce(v_saldo,0),4);
END; $function$;
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.reorder_fin_categoria(uuid,text)'::regprocedure)) <> '9b0fb56d173d272047bc466604c0d8a1' THEN RAISE EXCEPTION 'PHASE7_WRITER_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.reorder_fin_categoria(p_category_id uuid, p_direction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_cat RECORD;
  v_sibling RECORD;
BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_permission(auth.uid(),ARRAY['financeiro:cadastros:edit','financeiro:cadastros:manage','finance:manage','system:global:manage']::text[]),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  -- Resolve actor
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Get category with lock
  SELECT id, parent_id, tipo, ordem, company_id
  INTO v_cat
  FROM fin_categorias
  WHERE id = p_category_id AND company_id = public.assert_tenant() AND ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada';
  END IF;

  v_company_id := v_cat.company_id;

  -- Verify tenant
  IF NOT EXISTS (
    SELECT 1 WHERE v_company_id = public.assert_tenant()
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Find adjacent sibling
  IF p_direction = 'up' THEN
    SELECT id, ordem
    INTO v_sibling
    FROM fin_categorias
    WHERE company_id = v_company_id
      AND ativo = true
      AND tipo = v_cat.tipo
      AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000') = COALESCE(v_cat.parent_id, '00000000-0000-0000-0000-000000000000')
      AND (ordem < v_cat.ordem OR (ordem = v_cat.ordem AND id < p_category_id))
      AND id != p_category_id
    ORDER BY ordem DESC, id DESC
    LIMIT 1;
  ELSIF p_direction = 'down' THEN
    SELECT id, ordem
    INTO v_sibling
    FROM fin_categorias
    WHERE company_id = v_company_id
      AND ativo = true
      AND tipo = v_cat.tipo
      AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000') = COALESCE(v_cat.parent_id, '00000000-0000-0000-0000-000000000000')
      AND (ordem > v_cat.ordem OR (ordem = v_cat.ordem AND id > p_category_id))
      AND id != p_category_id
    ORDER BY ordem ASC, id ASC
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Direção inválida: use up ou down';
  END IF;

  IF v_sibling.id IS NULL THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Já está na posição limite');
  END IF;

  -- Swap ordem values
  UPDATE fin_categorias SET ordem = v_sibling.ordem, updated_at = now() WHERE id = p_category_id;
  UPDATE fin_categorias SET ordem = v_cat.ordem, updated_at = now() WHERE id = v_sibling.id;

  -- If both had the same ordem, assign distinct values
  IF v_cat.ordem = v_sibling.ordem THEN
    UPDATE fin_categorias SET ordem = v_cat.ordem + 1, updated_at = now()
    WHERE id = (CASE WHEN p_direction = 'up' THEN v_sibling.id ELSE p_category_id END);
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$function$
;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.purchase_order_items s LEFT JOIN public.purchase_orders p ON p.id=s.order_id WHERE s.order_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: purchase_order_items.order_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.purchase_order_items s LEFT JOIN public.produtos p ON p.id=s.stock_item_id WHERE s.stock_item_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: purchase_order_items.stock_item_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.ficha_componente_itens s LEFT JOIN public.ficha_componentes p ON p.id=s.componente_pai_id WHERE s.componente_pai_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: ficha_componente_itens.componente_pai_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.ficha_componente_itens s LEFT JOIN public.ficha_componentes p ON p.id=s.componente_filho_id WHERE s.componente_filho_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: ficha_componente_itens.componente_filho_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.ficha_componente_itens s LEFT JOIN public.produtos p ON p.id=s.produto_id WHERE s.produto_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: ficha_componente_itens.produto_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.inventarios s LEFT JOIN public.turnos p ON p.id=s.turno_id WHERE s.turno_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: inventarios.turno_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.inventario_itens s LEFT JOIN public.inventarios p ON p.id=s.inventario_id WHERE s.inventario_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: inventario_itens.inventario_id'; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.inventario_itens s LEFT JOIN public.produtos p ON p.id=s.produto_id WHERE s.produto_id IS NOT NULL AND (p.id IS NULL OR p.company_id IS DISTINCT FROM s.company_id)) THEN RAISE EXCEPTION 'PHASE7_INTEGRITY_REQUIRED: inventario_itens.produto_id'; END IF; END $$;
ALTER TABLE public.purchase_orders ADD CONSTRAINT phase7_purchase_orders_company_id_unique UNIQUE(company_id,id);
ALTER TABLE public.ficha_componentes ADD CONSTRAINT phase7_ficha_componentes_company_id_unique UNIQUE(company_id,id);
ALTER TABLE public.turnos ADD CONSTRAINT phase7_turnos_company_id_unique UNIQUE(company_id,id);
ALTER TABLE public.inventarios ADD CONSTRAINT phase7_inventarios_company_id_unique UNIQUE(company_id,id);
ALTER TABLE public.purchase_order_items ADD CONSTRAINT phase7_purchase_order_items_order_id_tenant_fk FOREIGN KEY(company_id,order_id) REFERENCES public.purchase_orders(company_id,id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT phase7_purchase_order_items_stock_item_id_tenant_fk FOREIGN KEY(company_id,stock_item_id) REFERENCES public.produtos(company_id,id) ON DELETE NO ACTION;
ALTER TABLE public.ficha_componente_itens ADD CONSTRAINT phase7_ficha_componente_itens_componente_pai_id_tenant_fk FOREIGN KEY(company_id,componente_pai_id) REFERENCES public.ficha_componentes(company_id,id) ON DELETE CASCADE;
ALTER TABLE public.ficha_componente_itens ADD CONSTRAINT phase7_ficha_componente_itens_componente_filho_id_tenant_fk FOREIGN KEY(company_id,componente_filho_id) REFERENCES public.ficha_componentes(company_id,id) ON DELETE NO ACTION;
ALTER TABLE public.ficha_componente_itens ADD CONSTRAINT phase7_ficha_componente_itens_produto_id_tenant_fk FOREIGN KEY(company_id,produto_id) REFERENCES public.produtos(company_id,id) ON DELETE NO ACTION;
ALTER TABLE public.inventarios ADD CONSTRAINT phase7_inventarios_turno_id_tenant_fk FOREIGN KEY(company_id,turno_id) REFERENCES public.turnos(company_id,id) ON DELETE NO ACTION;
ALTER TABLE public.inventario_itens ADD CONSTRAINT phase7_inventario_itens_inventario_id_tenant_fk FOREIGN KEY(company_id,inventario_id) REFERENCES public.inventarios(company_id,id) ON DELETE CASCADE;
ALTER TABLE public.inventario_itens ADD CONSTRAINT phase7_inventario_itens_produto_id_tenant_fk FOREIGN KEY(company_id,produto_id) REFERENCES public.produtos(company_id,id) ON DELETE NO ACTION;
NOTIFY pgrst, 'reload schema';
COMMIT;
