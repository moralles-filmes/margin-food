-- Recebimento de pedido de compra com entrada no estoque opcional.
--
-- A tela de Compras pergunta, ao confirmar o recebimento, se os itens devem entrar
-- no estoque. Com "não", o item fica RECEIVED (pedido concluído/parcial igual), mas
-- nenhuma movimentação ENTRADA é gerada.
--
-- Contrato: p_metadata.stock_entry (boolean, opcional). Ausente = true, para que
-- abas antigas do frontend continuem dando entrada como antes. Assinatura inalterada
-- (CREATE OR REPLACE preserva owner e grants).
--
-- purchase_order_items.stock_entry_skipped marca o item recebido sem entrada — sem
-- ela, "recebido" não diz mais se o saldo mudou (a exclusão do pedido avisava
-- "já gerou entradas no estoque" pela qty_received). O estorno na exclusão já lê
-- as movimentações existentes, então item sem entrada simplesmente não é estornado.
--
-- Custo/fornecedor do produto (last_cost_*, last_supplier, supplier_item_prices)
-- continuam sendo atualizados: a compra aconteceu por aquele preço, com ou sem
-- entrada no estoque.

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS stock_entry_skipped boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_order_items.stock_entry_skipped IS
  'true quando o item foi recebido sem entrada automática no estoque (escolha do usuário no recebimento).';

CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(p_order_id uuid, p_items jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_caller uuid := auth.uid();
  v_order record;
  v_item jsonb;
  v_oi record;
  v_batch_key uuid;
  v_response jsonb;
  v_supplier_uuid uuid;
  v_conv numeric;
  v_qty_base numeric;
  v_cost_purchase numeric;
  v_cost_base numeric;
  v_qty_received numeric;
  v_qty_shortfall numeric;
  v_items_received int := 0;
  v_items_not_delivered int := 0;
  v_items_without_stock_entry int := 0;
  v_total_confirmed numeric := 0;
  v_new_status text;
  v_ref_id text;
  v_stock_entry boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_caller, ARRAY[
    'compras:recebimentos:create','compras:recebimentos:edit',
    'compras:recebimentos:close','purchases:receiving:manage','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:recebimentos:create' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_any_permission(v_caller, ARRAY[
    'compras:lista:approve','purchases:approve','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:lista:approve' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_batch_key := nullif(p_metadata->>'idempotency_key','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END;
  IF v_batch_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF p_metadata ? 'stock_entry' AND jsonb_typeof(p_metadata->'stock_entry') <> 'boolean' THEN
    RAISE EXCEPTION 'INVALID_STOCK_ENTRY_FLAG';
  END IF;
  v_stock_entry := coalesce((p_metadata->>'stock_entry')::boolean, true);
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_RECEIPT';
  END IF;
  IF (SELECT count(DISTINCT value->>'order_item_id') FROM jsonb_array_elements(p_items))
     <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'DUPLICATE_RECEIPT_ITEM';
  END IF;

  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT response INTO v_response
  FROM public.purchase_receipt_batches
  WHERE company_id = v_company AND idempotency_key = v_batch_key;
  IF FOUND THEN RETURN v_response || jsonb_build_object('idempotent',true); END IF;

  IF v_order.status NOT IN ('IN_RECEIVING','OPEN','SHOPPING_OK','PARTIAL','COMPLETED') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_order.status;
  END IF;

  PERFORM p.id
  FROM public.produtos p
  JOIN public.purchase_order_items oi
    ON oi.stock_item_id = p.id AND oi.company_id = p.company_id
  WHERE oi.order_id = p_order_id AND oi.company_id = v_company
    AND oi.id IN (SELECT (value->>'order_item_id')::uuid FROM jsonb_array_elements(p_items))
  ORDER BY p.id FOR UPDATE OF p;

  IF nullif(btrim(coalesce(v_order.supplier_name,'')),'') IS NOT NULL THEN
    INSERT INTO public.suppliers(name,company_id)
    VALUES (btrim(v_order.supplier_name),v_company)
    ON CONFLICT (name,company_id) DO UPDATE SET updated_at=now()
    RETURNING id INTO v_supplier_uuid;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi
    FROM public.purchase_order_items
    WHERE id=(v_item->>'order_item_id')::uuid AND order_id=p_order_id
      AND company_id=v_company AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_TENANT_MISMATCH'; END IF;
    IF (v_item->>'status') NOT IN ('RECEIVED','NOT_DELIVERED') THEN
      RAISE EXCEPTION 'INVALID_RECEIPT_STATUS';
    END IF;
    IF v_oi.received_status = 'RECEIVED' THEN CONTINUE; END IF;

    IF (v_item->>'status') = 'NOT_DELIVERED' THEN
      UPDATE public.purchase_order_items
      SET qty_received=0, received_status='NOT_DELIVERED',
          not_delivered_reason=coalesce(nullif(btrim(v_item->>'reason'),''),'Não entregue'),
          received_at=now(), received_by=v_caller, updated_at=now()
      WHERE id=v_oi.id AND company_id=v_company;
      v_items_not_delivered := v_items_not_delivered + 1;
      CONTINUE;
    END IF;

    v_qty_received := coalesce((v_item->>'qty_received')::numeric,0);
    IF v_qty_received <= 0 OR v_qty_received > v_oi.qty_requested THEN
      RAISE EXCEPTION 'INVALID_RECEIPT_QUANTITY: %', v_oi.name_snapshot;
    END IF;
    v_cost_purchase := coalesce((v_item->>'unit_cost')::numeric,v_oi.estimated_unit_value);
    IF v_cost_purchase < 0 THEN RAISE EXCEPTION 'INVALID_UNIT_COST'; END IF;
    v_qty_shortfall := v_oi.qty_requested-v_qty_received;

    UPDATE public.purchase_order_items
    SET qty_received=v_qty_received, estimated_unit_value=v_cost_purchase,
        received_status='RECEIVED', not_delivered_reason=NULL,
        stock_entry_skipped=(NOT v_stock_entry AND v_oi.stock_item_id IS NOT NULL),
        received_at=now(), received_by=v_caller, updated_at=now()
    WHERE id=v_oi.id AND company_id=v_company;

    IF v_qty_shortfall > 0.001 THEN
      INSERT INTO public.purchase_order_items(
        order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,
        qty_requested,qty_received,received_status,not_delivered_reason,
        received_at,received_by,shopping_status,shopping_note,
        purchase_unit_snapshot,purchase_unit_cost_snapshot,conversion_factor_snapshot,company_id
      ) VALUES (
        p_order_id,v_oi.stock_item_id,v_oi.name_snapshot,v_oi.unit_snapshot,v_cost_purchase,
        v_qty_shortfall,0,'NOT_DELIVERED',
        format('Recebimento parcial. Previsto: %s %s; recebido: %s %s.',
          v_oi.qty_requested,v_oi.unit_snapshot,v_qty_received,v_oi.unit_snapshot),
        now(),v_caller,v_oi.shopping_status,v_oi.shopping_note,
        v_oi.purchase_unit_snapshot,v_cost_purchase,v_oi.conversion_factor_snapshot,v_company
      );
      v_items_not_delivered := v_items_not_delivered + 1;
    END IF;

    IF v_oi.stock_item_id IS NOT NULL THEN
      v_conv := coalesce(nullif(v_oi.conversion_factor_snapshot,0),1);
      v_cost_base := v_cost_purchase/v_conv;

      IF v_stock_entry THEN
        v_qty_base := v_qty_received*v_conv;
        v_ref_id := 'POI:'||v_oi.id::text;
        INSERT INTO public.movimentacoes_estoque(
          produto_id,data,tipo,direction,quantidade,custo_unitario,custo_total,
          origem,observacao,created_by,status,reference_type,reference_id,
          internal_transfer,source_module,company_id
        ) VALUES (
          v_oi.stock_item_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,'ENTRADA','IN',v_qty_base,round(v_cost_base,4),
          round(v_qty_base*v_cost_base,2),'Recebimento Pedido/Compra',
          format('Recebimento atômico — Pedido %s Item %s',p_order_id,v_oi.name_snapshot),
          v_caller,'ATIVO','PURCHASE_ORDER_ITEM',v_ref_id,false,'purchases',v_company
        ) ON CONFLICT DO NOTHING;
      ELSE
        v_items_without_stock_entry := v_items_without_stock_entry + 1;
      END IF;

      UPDATE public.produtos
      SET last_cost_purchase_unit=v_cost_purchase,last_cost_base_unit=round(v_cost_base,4),
          last_purchase_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date::text,last_supplier=v_order.supplier_name
      WHERE id=v_oi.stock_item_id AND company_id=v_company;

      IF v_supplier_uuid IS NOT NULL THEN
        INSERT INTO public.supplier_item_prices(
          supplier_id,supplier_uuid,stock_item_id,unit_cost,purchase_unit,company_id,source,last_updated_at
        ) VALUES (
          v_order.supplier_name,v_supplier_uuid,v_oi.stock_item_id,v_cost_purchase,
          coalesce(v_oi.purchase_unit_snapshot,v_oi.unit_snapshot),v_company,'purchases',now()
        ) ON CONFLICT (supplier_id,stock_item_id,company_id) DO UPDATE SET
          supplier_uuid=excluded.supplier_uuid,unit_cost=excluded.unit_cost,
          purchase_unit=excluded.purchase_unit,source=excluded.source,last_updated_at=excluded.last_updated_at;
      END IF;
    END IF;
    v_items_received := v_items_received+1;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.purchase_order_items
    WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL AND received_status='PENDING') THEN
    v_new_status := 'IN_RECEIVING';
  ELSIF EXISTS (SELECT 1 FROM public.purchase_order_items
    WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL AND received_status='NOT_DELIVERED') THEN
    v_new_status := 'PARTIAL';
  ELSE v_new_status := 'COMPLETED'; END IF;

  SELECT coalesce(sum(qty_received*estimated_unit_value),0)
  INTO v_total_confirmed
  FROM public.purchase_order_items
  WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL
    AND received_status='RECEIVED';

  UPDATE public.purchase_orders
  SET status=v_new_status,total_confirmed=v_total_confirmed,
      concluded_at=CASE WHEN v_new_status='COMPLETED' THEN coalesce(concluded_at,now()) ELSE NULL END,
      updated_at=now()
  WHERE id=p_order_id AND company_id=v_company;

  IF v_new_status='PARTIAL' AND NOT EXISTS (
    SELECT 1 FROM public.notifications WHERE company_id=v_company
      AND recipient_user_id=v_order.created_by AND entity_type='purchase_order'
      AND entity_id=p_order_id AND type='NOT_DELIVERED_ACK_REQUIRED' AND read_at IS NULL
  ) THEN
    INSERT INTO public.notifications(
      recipient_user_id,type,module,title,message,entity_type,entity_id,
      link_path,created_by,company_id
    ) VALUES (
      v_order.created_by,'NOT_DELIVERED_ACK_REQUIRED','purchases','Confirmação necessária',
      format('Há itens não entregues no pedido "%s". Confirme ciência.',v_order.title),
      'purchase_order',p_order_id,'/compras',v_caller,v_company
    );
  END IF;

  v_response := jsonb_build_object(
    'status',v_new_status,'items_received',v_items_received,
    'items_not_delivered',v_items_not_delivered,'total_confirmed',v_total_confirmed,
    'stock_entry',v_stock_entry,'items_without_stock_entry',v_items_without_stock_entry,
    'idempotent',false
  );
  INSERT INTO public.purchase_receipt_batches(company_id,order_id,idempotency_key,response,created_by)
  VALUES (v_company,p_order_id,v_batch_key,v_response,v_caller);
  PERFORM public.log_audit('rpc','purchases','purchase_orders',p_order_id,
    'RECEBIMENTO_ATOMICO',to_jsonb(v_order),v_response);
  RETURN v_response;
END $function$;
