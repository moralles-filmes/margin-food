-- Evidência; NÃO executar como rollback (reabriria vulnerabilidades).
CREATE OR REPLACE FUNCTION public.handle_first_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;

  -- Corrigido: Removido o ::text que causava erro
  INSERT INTO public.audit_logs (
    module, action, entity, entity_id, actor_user_id, source, success, after, metadata
  ) VALUES (
    'system', 'create_first_admin', 'user_roles', NEW.id, NEW.id,
    'trigger', true,
    jsonb_build_object('user_id', NEW.id, 'role', 'admin'),
    jsonb_build_object('trigger', 'handle_first_admin', 'note', 'Bootstrap first admin')
  );

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_salmon_entry_atomic(p_entry_date date, p_lot text, p_sif text, p_supplier_name text, p_boxes integer, p_units integer, p_gross_kg numeric, p_total_value numeric, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_supplier_uuid uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  -- Multi-tenant enforcement
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_kg <= 0 THEN RAISE EXCEPTION 'gross_kg deve ser > 0'; END IF;
  IF p_total_value < 0 THEN RAISE EXCEPTION 'total_value não pode ser negativo'; END IF;

  v_cost_per_kg := CASE WHEN p_gross_kg > 0 THEN ROUND(p_total_value / p_gross_kg, 4) ELSE 0 END;

  -- 1. Insert salmon_entries
  INSERT INTO salmon_entries (
    entry_date, lot, sif, supplier_name, boxes, units, gross_kg, total_value, notes, created_by, company_id
  ) VALUES (
    p_entry_date, COALESCE(p_lot,''), COALESCE(p_sif,''), COALESCE(p_supplier_name,''),
    COALESCE(p_boxes,0), COALESCE(p_units,0), p_gross_kg, p_total_value,
    COALESCE(p_notes,''), v_caller, v_company_id
  ) RETURNING id INTO v_entry_id;

  -- 2. Ensure salmon raw product (v_produto_id is global reference but logically belongs to the tenant)
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  -- 3. Mirror to stock (ENTRADA)
  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = v_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      data = p_entry_date,
      observacao = 'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,''),
      editado_em = now(), editado_por = v_caller,
      salmon_lot_id = p_lot
    WHERE id = v_mov_id AND company_id = v_company_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, company_id
    ) VALUES (
      v_produto_id, p_entry_date, 'ENTRADA', p_gross_kg, v_cost_per_kg,
      ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão',
      'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,''),
      v_caller, 'ATIVO', 'SALMON_ENTRY', v_entry_id::text, false, 'salmon', p_lot, v_company_id
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- 4. Update produto cost (Global but context of company insert)
  IF v_cost_per_kg > 0 THEN
    UPDATE produtos SET
      last_cost_purchase_unit = v_cost_per_kg, last_cost_base_unit = v_cost_per_kg,
      last_purchase_date = p_entry_date::text, last_supplier = p_supplier_name,
      custo_padrao = CASE WHEN custo_padrao = 0 THEN v_cost_per_kg ELSE custo_padrao END,
      default_cost_purchase_unit = CASE WHEN default_cost_purchase_unit = 0 THEN v_cost_per_kg ELSE default_cost_purchase_unit END,
      default_cost_base_unit = CASE WHEN default_cost_base_unit = 0 THEN v_cost_per_kg ELSE default_cost_base_unit END
    WHERE id = v_produto_id AND (company_id = v_company_id OR company_id IS NULL);
  END IF;

  -- 5. Upsert supplier + supplier_item_prices
  IF p_supplier_name IS NOT NULL AND p_supplier_name != '' THEN
    INSERT INTO suppliers (name, company_id) VALUES (p_supplier_name, v_company_id)
    ON CONFLICT (name, company_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;

    IF v_supplier_uuid IS NOT NULL THEN
      INSERT INTO supplier_item_prices (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, last_updated_at, source, company_id)
      VALUES (p_supplier_name, v_supplier_uuid, v_produto_id, v_cost_per_kg, 'KG', now(), 'salmon', v_company_id)
      ON CONFLICT (supplier_id, stock_item_id, company_id) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost, supplier_uuid = EXCLUDED.supplier_uuid,
        last_updated_at = EXCLUDED.last_updated_at, source = 'salmon';
    END IF;
  END IF;

  -- 6. Audit (includes company_id)
  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', v_entry_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object('gross_kg', p_gross_kg, 'total_value', p_total_value, 'lot', p_lot, 'supplier', p_supplier_name, 'mov_id', v_mov_id));

  RETURN jsonb_build_object('entry_id', v_entry_id, 'movement_id', v_mov_id, 'unit_cost', v_cost_per_kg, 'company_id', v_company_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_salmon_entry_atomic(p_entry_id uuid, p_reason text DEFAULT 'Cancelamento de entrada'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  -- Lock entry by company_id
  SELECT * INTO v_entry FROM salmon_entries
  WHERE id = p_entry_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;
  IF v_entry.status = 'CANCELLED' THEN RAISE EXCEPTION 'Entrada já cancelada.'; END IF;

  -- Check for active manipulations referencing this entry
  IF EXISTS (SELECT 1 FROM salmon_manipulations
             WHERE entry_id = p_entry_id AND status = 'ACTIVE' AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Existem manipulações ativas vinculadas. Cancele-as primeiro.';
  END IF;

  -- Cancel entry
  UPDATE salmon_entries SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_entry_id AND company_id = v_company_id;

  -- Cancel stock movement + create reversal
  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = p_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;

    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_ENTRY', v_mov.reference_id || '_ESTORNO', false, 'salmon', v_mov.salmon_lot_id, v_company_id
    ) RETURNING id INTO v_estorno_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', p_entry_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_kg', v_entry.gross_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'entry_id', p_entry_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_salmon_manipulation_atomic(p_manip_id uuid, p_reason text DEFAULT 'Cancelamento de manipulação'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_manip RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  -- Lock manipulation by company_id
  SELECT * INTO v_manip FROM salmon_manipulations
  WHERE id = p_manip_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Manipulação não encontrada ou sem permissão.'; END IF;
  IF v_manip.status = 'CANCELLED' THEN RAISE EXCEPTION 'Manipulação já cancelada.'; END IF;

  UPDATE salmon_manipulations SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_manip_id AND company_id = v_company_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = p_manip_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;

    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'SAIDA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_MANIPULATION', v_mov.reference_id || '_ESTORNO', true, 'salmon', v_mov.salmon_lot_id, v_mov.setor, v_company_id
    ) RETURNING id INTO v_estorno_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', p_manip_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_out_kg', v_manip.gross_out_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'manipulation_id', p_manip_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.update_company(p_company_id uuid, p_nome text DEFAULT NULL::text, p_cnpj text DEFAULT NULL::text, p_ativo boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_old record;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão';
  END IF;

  IF p_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '400: Não é possível editar a empresa placeholder';
  END IF;

  SELECT * INTO v_old FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Empresa não encontrada';
  END IF;

  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' AND trim(p_cnpj) <> COALESCE(v_old.cnpj, '') THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj) AND id <> p_company_id) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado em outra empresa';
    END IF;
  END IF;

  UPDATE companies SET
    nome       = COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
    cnpj       = CASE WHEN p_cnpj IS NOT NULL THEN NULLIF(trim(p_cnpj), '') ELSE v_old.cnpj END,
    ativo      = COALESCE(p_ativo, v_old.ativo),
    updated_at = now()
  WHERE id = p_company_id;

  INSERT INTO audit_logs (actor_user_id, company_id, action, module, entity, entity_id, metadata)
  VALUES (v_caller_uid, p_company_id, 'COMPANY_UPDATED', 'admin', 'companies', p_company_id, jsonb_build_object(
    'old_nome', v_old.nome, 'new_nome', COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
    'old_ativo', v_old.ativo, 'new_ativo', COALESCE(p_ativo, v_old.ativo)
  ));

  RETURN jsonb_build_object('success', true);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_integration_error(p_module text, p_action text, p_reference_id text, p_error_message text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO integration_logs (module, action, reference_id, status, error_message, payload)
  VALUES (p_module, p_action, p_reference_id, 'ERROR', p_error_message, p_payload);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.receive_market_order_atomic(p_recebimento_id uuid, p_items jsonb, p_observacoes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_company uuid;
  v_rec recebimentos%ROWTYPE;
  v_item jsonb;
  v_ri recebimento_itens%ROWTYPE;
  v_prod RECORD;
  v_orig_item RECORD;
  v_ref_id text;
  v_custo_unit numeric;
  v_qtd numeric;
  v_mov_id uuid;
  v_items_inserted int := 0;
  v_items_skipped int := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT has_permission(v_caller, 'compras:recebimentos:close') THEN
    RAISE EXCEPTION 'Sem permissão (compras:recebimentos:close)';
  END IF;

  v_company := public.assert_tenant();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado para o usuário';
  END IF;

  SELECT * INTO v_rec FROM recebimentos WHERE id = p_recebimento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento não encontrado: %', p_recebimento_id;
  END IF;

  IF v_rec.status NOT IN ('AGUARDANDO_RECEBIMENTO', 'RECEBIDO_CONFIRMADO') THEN
    RAISE EXCEPTION 'Status inválido para lançamento de estoque: %', v_rec.status;
  END IF;

  IF v_rec.estoque_atualizado_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'recebimento_id', p_recebimento_id,
      'message', 'Estoque já foi atualizado para este recebimento'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ri FROM recebimento_itens
    WHERE id = (v_item->>'recebimento_item_id')::uuid
      AND recebimento_id = p_recebimento_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % não pertence ao recebimento %',
        v_item->>'recebimento_item_id', p_recebimento_id;
    END IF;

    IF v_ri.produto_id IS NULL OR v_ri.recebido = false THEN
      v_items_skipped := v_items_skipped + 1;
      CONTINUE;
    END IF;

    v_qtd := COALESCE(v_ri.qtd_recebida, v_ri.qtd_comprada);
    IF v_qtd <= 0 THEN
      v_items_skipped := v_items_skipped + 1;
      CONTINUE;
    END IF;

    v_ref_id := 'MARKET_POI:' || v_ri.id::text;

    SELECT custo_padrao INTO v_prod FROM produtos WHERE id = v_ri.produto_id;

    SELECT preco_unitario INTO v_orig_item
    FROM solic_compra_mercado_item WHERE id = v_ri.item_id;

    v_custo_unit := COALESCE(v_orig_item.preco_unitario, v_prod.custo_padrao, 0);

    IF NOT EXISTS (
      SELECT 1 FROM movimentacoes_estoque
      WHERE reference_type = 'MARKET_RECEBIMENTO_ITEM'
        AND reference_id = v_ref_id
        AND status = 'ATIVO'
    ) THEN
      INSERT INTO movimentacoes_estoque (
        produto_id, data, tipo, quantidade, custo_unitario, custo_total,
        origem, observacao, created_by, status,
        reference_type, reference_id, internal_transfer, source_module
      ) VALUES (
        v_ri.produto_id,
        CURRENT_DATE,
        'ENTRADA',
        v_qtd,
        ROUND(v_custo_unit::numeric, 4),
        ROUND((v_qtd * v_custo_unit)::numeric, 2),
        'Recebimento Mercado',
        'Entrada atômica — Recebimento ' || p_recebimento_id::text || ' Item ' || COALESCE(v_ri.item_id::text, '?'),
        v_caller,
        'ATIVO',
        'MARKET_RECEBIMENTO_ITEM',
        v_ref_id,
        false,
        'compras_mercado'
      ) RETURNING id INTO v_mov_id;

      UPDATE produtos SET
        last_cost_purchase_unit = v_custo_unit,
        last_cost_base_unit = ROUND(v_custo_unit::numeric, 4),
        last_purchase_date = CURRENT_DATE::text,
        custo_padrao = CASE
          WHEN custo_padrao IS NULL OR custo_padrao = 0 THEN v_custo_unit
          ELSE custo_padrao
        END
      WHERE id = v_ri.produto_id;

      v_items_inserted := v_items_inserted + 1;
    ELSE
      v_items_skipped := v_items_skipped + 1;
    END IF;
  END LOOP;

  UPDATE recebimentos SET
    status = 'RECEBIDO_CONFIRMADO',
    recebido_por = COALESCE(recebido_por, v_caller),
    recebido_em = COALESCE(recebido_em, now()),
    enviar_ao_estoque = true,
    estoque_atualizado_em = now(),
    estoque_atualizado_por = v_caller,
    observacoes = COALESCE(NULLIF(p_observacoes, ''), observacoes),
    updated_at = now()
  WHERE id = p_recebimento_id;

  UPDATE solic_compra_mercado SET
    status = 'ESTOQUE_ATUALIZADO',
    updated_at = now()
  WHERE id = v_rec.solicitacao_id;

  INSERT INTO confirmacoes_recebimento (
    recebimento_id, solicitacao_id, mensagem, criado_por, responsavel_compra_id
  )
  SELECT
    p_recebimento_id,
    v_rec.solicitacao_id,
    'Estoque atualizado via RPC atômica — ' || v_items_inserted || ' itens inseridos',
    v_caller,
    s.responsavel_user_id
  FROM solic_compra_mercado s
  WHERE s.id = v_rec.solicitacao_id;

  -- Fix: registro_id is UUID, cast properly
  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('recebimentos', p_recebimento_id, 'ESTOQUE_ATUALIZADO_ATOMIC', v_caller);

  RETURN jsonb_build_object(
    'success', true,
    'recebimento_id', p_recebimento_id,
    'items_inserted', v_items_inserted,
    'items_skipped', v_items_skipped,
    'already_processed', false
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_audit(p_source text, p_module text, p_entity text, p_entity_id text, p_action text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_uuid uuid;
  v_metadata jsonb;
BEGIN
  v_metadata := COALESCE(p_metadata, '{}'::jsonb);

  IF p_source IS NOT NULL AND p_source <> '' THEN
    v_metadata := jsonb_build_object('source', p_source) || v_metadata;
  END IF;

  IF p_entity_id IS NOT NULL
     AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entity_uuid := p_entity_id::uuid;
    PERFORM public.log_audit(
      p_source := p_source,
      p_module := p_module,
      p_entity := p_entity,
      p_entity_id := v_entity_uuid,
      p_action := p_action,
      p_before := p_before,
      p_after := p_after,
      p_metadata := CASE WHEN v_metadata = '{}'::jsonb THEN NULL ELSE v_metadata END
    );
    RETURN;
  END IF;

  PERFORM public.audit_log_write(
    _module := p_module,
    _action := p_action,
    _entity_type := p_entity,
    _entity_id := p_entity_id,
    _before := p_before,
    _after := p_after,
    _metadata := CASE WHEN v_metadata = '{}'::jsonb THEN NULL ELSE v_metadata END,
    _severity := 'info'
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(p_order_id uuid, p_items jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_oi RECORD;
  v_conv numeric;
  v_qty_base numeric;
  v_cost_base numeric;
  v_mov_id uuid;
  v_items_received int := 0;
  v_items_not_delivered int := 0;
  v_total_confirmed numeric := 0;
  v_new_status text;
  v_ref_id text;
  v_caller uuid;
  v_supplier_uuid uuid;
  v_qty_received numeric;
  v_qty_shortfall numeric;
  v_shortfall_item_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  IF NOT has_any_permission(v_caller, ARRAY[
    'purchases:receiving:manage',
    'compras:recebimentos:edit',
    'compras:recebimentos:close',
    'compras:recebimentos:create',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão para receber pedidos.';
  END IF;

  SELECT * INTO v_order FROM purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id; END IF;
  IF v_order.status NOT IN ('IN_RECEIVING', 'OPEN', 'SHOPPING_OK', 'PARTIAL') THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_order.status;
  END IF;

  IF v_order.supplier_name IS NOT NULL AND v_order.supplier_name != '' THEN
    INSERT INTO suppliers (name) VALUES (v_order.supplier_name)
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM purchase_order_items
    WHERE id = (v_item->>'order_item_id')::uuid AND order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % não pertence ao pedido %', v_item->>'order_item_id', p_order_id;
    END IF;

    IF (v_item->>'status') = 'NOT_DELIVERED' THEN
      UPDATE purchase_order_items SET
        received_status = 'NOT_DELIVERED',
        not_delivered_reason = COALESCE(v_item->>'reason', 'Não entregue'),
        received_at = now(), received_by = v_caller, updated_at = now()
      WHERE id = v_oi.id;
      v_items_not_delivered := v_items_not_delivered + 1;
    ELSE
      v_qty_received := COALESCE((v_item->>'qty_received')::numeric, 0);
      IF v_qty_received <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser > 0 para item %', v_oi.name_snapshot;
      END IF;

      -- Detect partial receipt: qty_received < qty_requested
      v_qty_shortfall := v_oi.qty_requested - v_qty_received;

      UPDATE purchase_order_items SET
        qty_received = v_qty_received,
        received_status = 'RECEIVED', received_at = now(),
        received_by = v_caller, updated_at = now()
      WHERE id = v_oi.id;

      -- If there's a shortfall, create a new NOT_DELIVERED item for the difference
      IF v_qty_shortfall > 0.001 THEN
        INSERT INTO purchase_order_items (
          order_id, stock_item_id, name_snapshot, unit_snapshot,
          estimated_unit_value, qty_requested, qty_received,
          received_status, not_delivered_reason, received_at, received_by,
          shopping_status, shopping_note,
          purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot
        ) VALUES (
          p_order_id, v_oi.stock_item_id, v_oi.name_snapshot, v_oi.unit_snapshot,
          v_oi.estimated_unit_value, v_qty_shortfall, 0,
          'NOT_DELIVERED',
          'Item marcado como comprado no Checklist, porém no recebimento foi informada quantidade inferior à prevista. Previsto: ' || v_oi.qty_requested || ' ' || v_oi.unit_snapshot || ', Recebido: ' || v_qty_received || ' ' || v_oi.unit_snapshot || '.',
          now(), v_caller,
          v_oi.shopping_status, v_oi.shopping_note,
          v_oi.purchase_unit_snapshot, v_oi.purchase_unit_cost_snapshot, v_oi.conversion_factor_snapshot
        ) RETURNING id INTO v_shortfall_item_id;

        v_items_not_delivered := v_items_not_delivered + 1;
      END IF;

      -- Stock entry logic
      IF v_oi.stock_item_id IS NOT NULL THEN
        v_conv := COALESCE(v_oi.conversion_factor_snapshot, 1);
        v_qty_base := v_qty_received * v_conv;
        v_cost_base := CASE WHEN v_conv > 0
          THEN COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value) / v_conv
          ELSE COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value)
        END;

        v_ref_id := 'POI:' || v_oi.id::text;

        IF NOT EXISTS (
          SELECT 1 FROM movimentacoes_estoque
          WHERE reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id = v_ref_id AND status = 'ATIVO'
        ) THEN
          INSERT INTO movimentacoes_estoque (
            produto_id, data, tipo, quantidade, custo_unitario, custo_total,
            origem, observacao, created_by, status,
            reference_type, reference_id, internal_transfer, source_module
          ) VALUES (
            v_oi.stock_item_id,
            COALESCE((v_item->>'movement_date')::date, CURRENT_DATE),
            'ENTRADA', v_qty_base, ROUND(v_cost_base::numeric, 4),
            ROUND((v_qty_base * v_cost_base)::numeric, 2),
            'Recebimento Pedido/Compra',
            'Recebimento atômico — Pedido ' || p_order_id::text || ' Item ' || v_oi.name_snapshot,
            v_caller, 'ATIVO', 'PURCHASE_ORDER_ITEM', v_ref_id, false, 'purchases'
          ) RETURNING id INTO v_mov_id;

          UPDATE produtos SET
            last_cost_purchase_unit = COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
            last_cost_base_unit = ROUND(v_cost_base::numeric, 4),
            last_purchase_date = CURRENT_DATE::text,
            last_supplier = v_order.supplier_name
          WHERE id = v_oi.stock_item_id;

          IF v_supplier_uuid IS NOT NULL AND v_oi.stock_item_id IS NOT NULL THEN
            INSERT INTO supplier_item_prices (supplier_id, produto_id, unit_cost, purchase_unit, conversion_factor)
            VALUES (v_supplier_uuid, v_oi.stock_item_id,
              COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
              COALESCE(v_oi.purchase_unit_snapshot, v_oi.unit_snapshot),
              COALESCE(v_oi.conversion_factor_snapshot, 1))
            ON CONFLICT (supplier_id, produto_id) DO UPDATE SET
              unit_cost = EXCLUDED.unit_cost,
              purchase_unit = EXCLUDED.purchase_unit,
              conversion_factor = EXCLUDED.conversion_factor,
              updated_at = now();
          END IF;
        END IF;
      END IF;

      v_total_confirmed := v_total_confirmed + (v_qty_received * COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value));
      v_items_received := v_items_received + 1;
    END IF;
  END LOOP;

  -- Determine new order status based on ALL items in the order (not just current batch)
  IF EXISTS (
    SELECT 1 FROM purchase_order_items
    WHERE order_id = p_order_id AND deleted_at IS NULL AND received_status = 'PENDING'
  ) THEN
    v_new_status := 'IN_RECEIVING';
  ELSIF EXISTS (
    SELECT 1 FROM purchase_order_items
    WHERE order_id = p_order_id AND deleted_at IS NULL AND received_status = 'NOT_DELIVERED'
  ) THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'COMPLETED';
  END IF;

  UPDATE purchase_orders SET
    status = v_new_status,
    total_confirmed = COALESCE(total_confirmed, 0) + v_total_confirmed,
    concluded_at = CASE WHEN v_new_status = 'COMPLETED' THEN now() ELSE concluded_at END,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO audit_log (tabela, registro_id, acao, user_id, valor_novo)
  VALUES ('purchase_orders', p_order_id, 'RECEBIMENTO_ATOMICO', v_caller,
    jsonb_build_object('status', v_new_status, 'received', v_items_received, 'not_delivered', v_items_not_delivered)::text);

  RETURN jsonb_build_object(
    'status', v_new_status,
    'items_received', v_items_received,
    'items_not_delivered', v_items_not_delivered,
    'total_confirmed', v_total_confirmed
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_audit(p_source text, p_module text, p_entity text, p_entity_id uuid, p_action text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, source, module, entity, entity_id, action, before, after, metadata)
  VALUES (auth.uid(), p_source, p_module, p_entity, p_entity_id, p_action, p_before, p_after, p_metadata);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_entity text;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_entity_id uuid;
  v_sensitive_keys text[] := ARRAY['cpf','senha','password','token','card_number','secret'];
  k text;
BEGIN
  v_module := TG_ARGV[0];
  v_entity := TG_ARGV[1];

  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_after := row_to_json(NEW)::jsonb;
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := row_to_json(OLD)::jsonb;
    v_after := row_to_json(NEW)::jsonb;
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_before := row_to_json(OLD)::jsonb;
    v_entity_id := OLD.id;
  END IF;

  -- Mask sensitive fields
  FOREACH k IN ARRAY v_sensitive_keys LOOP
    IF v_before IS NOT NULL AND v_before ? k THEN
      v_before := v_before || jsonb_build_object(k, '***');
    END IF;
    IF v_after IS NOT NULL AND v_after ? k THEN
      v_after := v_after || jsonb_build_object(k, '***');
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (actor_user_id, source, module, entity, entity_id, action, before, after)
  VALUES (auth.uid(), 'db', v_module, v_entity, v_entity_id, v_action, v_before, v_after);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.aprovar_ferias(p_registro_id uuid, p_aprovado_por uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_registro RECORD;
  v_saldo RECORD;
  v_new_gozados int;
  v_new_restantes int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['rh:ferias:approve', 'rh:manage', 'rh:admin', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar férias.';
  END IF;

  SELECT * INTO v_registro FROM rh_ferias_afastamentos WHERE id = p_registro_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF v_registro.status != 'SOLICITADO' THEN RAISE EXCEPTION 'Solicitação já processada (status: %)', v_registro.status; END IF;

  IF v_registro.tipo = 'ferias' THEN
    SELECT * INTO v_saldo FROM rh_ferias_saldo WHERE colaborador_id = v_registro.colaborador_id FOR UPDATE;
    IF FOUND AND v_saldo.dias_restantes < v_registro.dias_uteis THEN
      RAISE EXCEPTION 'Saldo insuficiente! Disponível: % dias. Solicitado: % dias.', v_saldo.dias_restantes, v_registro.dias_uteis;
    END IF;
  END IF;

  UPDATE rh_ferias_afastamentos SET status = 'APROVADO', aprovado_por = p_aprovado_por, aprovado_em = now(), updated_at = now() WHERE id = p_registro_id;

  IF v_registro.tipo = 'ferias' AND v_saldo.id IS NOT NULL THEN
    v_new_gozados := v_saldo.dias_gozados + v_registro.dias_uteis;
    v_new_restantes := GREATEST(0, v_saldo.dias_direito - v_new_gozados - v_saldo.dias_vendidos);
    UPDATE rh_ferias_saldo SET dias_gozados = v_new_gozados, dias_restantes = v_new_restantes, updated_at = now() WHERE id = v_saldo.id;
  END IF;

  PERFORM public.log_audit('rpc', 'rh', 'rh_ferias_afastamentos', p_registro_id, 'FERIAS_APPROVE',
    jsonb_build_object('status_anterior', 'SOLICITADO', 'colaborador_id', v_registro.colaborador_id),
    jsonb_build_object('status', 'APROVADO', 'aprovado_por', p_aprovado_por));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_months integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deleted int;
BEGIN
  DELETE FROM audit_logs WHERE created_at < now() - (p_months || ' months')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  INSERT INTO audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'audit_logs', 'JOB_CLEANUP', jsonb_build_object('deleted_count', v_deleted, 'retention_months', p_months), true);
  RETURN v_deleted;
END; $function$
;
CREATE OR REPLACE FUNCTION public._guarded_list_fin_audit_logs(p_entidade text DEFAULT NULL::text, p_acao text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_dias integer DEFAULT 30, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_desde timestamptz;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:auditoria:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_desde := (now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(days => p_dias);

  WITH unified_logs AS (
    -- fin_audit_logs
    SELECT
      f.id,
      f.created_at,
      f.acao,
      f.entidade,
      f.entidade_id::text AS entidade_id,
      f.justificativa,
      f.antes,
      f.depois,
      f.user_id,
      'fin_audit_logs'::text AS origem_log,
      NULL::jsonb AS metadata
    FROM fin_audit_logs f
    WHERE f.company_id = v_company_id
      AND f.created_at >= v_desde

    UNION ALL

    -- audit_logs where module = financeiro or entity starts with fin_
    SELECT
      a.id,
      a.created_at,
      a.action AS acao,
      a.entity AS entidade,
      a.entity_id::text AS entidade_id,
      NULL::text AS justificativa,
      a.before AS antes,
      a.after AS depois,
      a.actor_user_id AS user_id,
      'audit_logs'::text AS origem_log,
      a.metadata
    FROM audit_logs a
    WHERE a.company_id = v_company_id
      AND a.created_at >= v_desde
      AND (a.module = 'financeiro' OR a.entity LIKE 'fin_%')
  ),
  filtered AS (
    SELECT
      ul.*,
      p.nome AS user_nome,
      p.email AS user_email
    FROM unified_logs ul
    LEFT JOIN profiles p ON p.id = ul.user_id
    WHERE
      (p_entidade IS NULL OR ul.entidade = p_entidade)
      AND (p_acao IS NULL OR ul.acao = p_acao)
      AND (p_search IS NULL OR (
        ul.entidade ILIKE '%' || p_search || '%'
        OR ul.acao ILIKE '%' || p_search || '%'
        OR ul.justificativa ILIKE '%' || p_search || '%'
        OR p.nome ILIKE '%' || p_search || '%'
        OR p.email ILIKE '%' || p_search || '%'
        OR ul.entidade_id ILIKE '%' || p_search || '%'
      ))
      AND (
        p_cursor_created_at IS NULL
        OR (ul.created_at, ul.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY ul.created_at DESC, ul.id DESC
    LIMIT p_limit + 1
  ),
  page AS (
    SELECT * FROM filtered LIMIT p_limit
  ),
  summary AS (
    SELECT
      COUNT(*) FILTER (WHERE TRUE) AS total,
      COUNT(*) FILTER (WHERE acao = 'INSERT') AS inserts,
      COUNT(*) FILTER (WHERE acao = 'UPDATE') AS updates,
      COUNT(*) FILTER (WHERE acao = 'DELETE') AS deletes,
      COUNT(DISTINCT user_id) AS usuarios_ativos
    FROM unified_logs ul
    WHERE
      (p_entidade IS NULL OR ul.entidade = p_entidade)
      AND (p_acao IS NULL OR ul.acao = p_acao)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pg.id,
        'created_at', pg.created_at,
        'acao', pg.acao,
        'entidade', pg.entidade,
        'entidade_id', pg.entidade_id,
        'justificativa', pg.justificativa,
        'antes', pg.antes,
        'depois', pg.depois,
        'user_id', pg.user_id,
        'user_nome', pg.user_nome,
        'user_email', pg.user_email,
        'origem_log', pg.origem_log,
        'metadata', pg.metadata
      ) ORDER BY pg.created_at DESC, pg.id DESC)
      FROM page pg
    ), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) FROM filtered) > p_limit,
    'next_cursor_created_at', (SELECT created_at FROM page ORDER BY created_at ASC, id ASC LIMIT 1),
    'next_cursor_id', (SELECT id FROM page ORDER BY created_at ASC, id ASC LIMIT 1),
    'summary', (SELECT jsonb_build_object(
      'total', total,
      'inserts', inserts,
      'updates', updates,
      'deletes', deletes,
      'usuarios_ativos', usuarios_ativos
    ) FROM summary)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  UPDATE notifications
  SET read_at = now()
  WHERE recipient_user_id = auth.uid()
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM log_audit(
      'rpc', 'notifications', 'notifications', NULL::uuid,
      'MARK_ALL_READ', NULL,
      jsonb_build_object('count', v_count, 'timestamp', now())
    );
  END IF;

  RETURN v_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_results jsonb := '[]'::jsonb;
  v_mv text;
  v_elapsed numeric;
  -- List now includes schema prefix
  v_views text[] := ARRAY[
    'reporting.mv_fin_dre_mensal',
    'reporting.mv_fin_fluxo_caixa_diario',
    'reporting.mv_consumo_itens_semana',
    'reporting.mv_giro_estoque',
    'reporting.mv_pedidos_status_resumo'
  ];
BEGIN
  FOREACH v_mv IN ARRAY v_views LOOP
    v_start := clock_timestamp();
    -- Dynamic SQL needs fully qualified names, which we provided in the array
    EXECUTE 'REFRESH MATERIALIZED VIEW ' || v_mv;
    v_elapsed := EXTRACT(EPOCH FROM clock_timestamp() - v_start) * 1000;

    v_results := v_results || jsonb_build_object('view', v_mv, 'ms', round(v_elapsed::numeric, 1));

    -- Log slow refreshes (>800ms)
    IF v_elapsed > 800 THEN
      INSERT INTO audit_logs (source, module, entity, action, metadata, success)
      VALUES ('db', 'perf', v_mv, 'SLOW_QUERY', jsonb_build_object('type', 'mv_refresh', 'duration_ms', round(v_elapsed::numeric, 1)), true);
    END IF;
  END LOOP;

  -- Clear cache
  DELETE FROM dashboard_cache WHERE expires_at < now();

  -- Log job completion
  INSERT INTO audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'materialized_views', 'JOB_RUN', v_results, true);

  RETURN v_results;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_create_company(p_nome text, p_cnpj text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT has_permission(auth.uid(), 'system:admin') THEN
    RAISE EXCEPTION 'Sem permissão (system:admin).';
  END IF;

  INSERT INTO public.companies (nome, cnpj)
  VALUES (p_nome, p_cnpj)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (module, action, entity, entity_id, actor_user_id, source, success, after)
  VALUES (
    'system', 'create_company', 'companies', v_id, auth.uid(), 'rpc', true,
    jsonb_build_object('nome', p_nome, 'cnpj', p_cnpj)
  );

  RETURN jsonb_build_object('id', v_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_recebimentos_close(p_recebimento_id uuid, p_enviar_ao_estoque boolean DEFAULT false, p_observacoes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rec recebimentos%ROWTYPE;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Permission guard
  IF NOT has_permission(v_user_id, 'compras:recebimentos:close') THEN
    RAISE EXCEPTION 'Sem permissão (compras:recebimentos:close)';
  END IF;

  -- Get recebimento
  SELECT * INTO v_rec FROM recebimentos WHERE id = p_recebimento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento não encontrado';
  END IF;

  IF v_rec.status <> 'AGUARDANDO_RECEBIMENTO' THEN
    RAISE EXCEPTION 'Recebimento não está aguardando (status: %)', v_rec.status;
  END IF;

  -- Check all items are confirmed
  IF EXISTS (
    SELECT 1 FROM recebimento_itens
    WHERE recebimento_id = p_recebimento_id AND recebido = false
  ) THEN
    RAISE EXCEPTION 'Confirme todos os itens antes de fechar o recebimento';
  END IF;

  -- Update recebimento status
  UPDATE recebimentos SET
    status = 'RECEBIDO_CONFIRMADO',
    recebido_por = v_user_id,
    recebido_em = now(),
    enviar_ao_estoque = p_enviar_ao_estoque,
    observacoes = p_observacoes,
    updated_at = now()
  WHERE id = p_recebimento_id;

  -- Update linked solicitation
  UPDATE solic_compra_mercado SET
    status = 'RECEBIDO_CONFIRMADO',
    updated_at = now()
  WHERE id = v_rec.solicitacao_id;

  -- Create confirmation event
  INSERT INTO confirmacoes_recebimento (
    recebimento_id, solicitacao_id, mensagem, criado_por, responsavel_compra_id
  )
  SELECT
    p_recebimento_id,
    v_rec.solicitacao_id,
    'Recebimento confirmado via RPC — ' || COALESCE(p_observacoes, ''),
    v_user_id,
    s.responsavel_user_id
  FROM solic_compra_mercado s
  WHERE s.id = v_rec.solicitacao_id;

  -- Audit
  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('recebimentos', p_recebimento_id::text, 'RECEBIMENTO_CONFIRMADO', v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'recebimento_id', p_recebimento_id,
    'enviar_ao_estoque', p_enviar_ao_estoque
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report_internal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb := '{}'::jsonb;
  _fails int := 0;
  _section jsonb;
  _global_allowlist text[] := ARRAY[
    'companies','permissions','role_permissions','user_roles','profiles',
    'rbac_legacy_usage','dashboard_cache','schema_migrations',
    'spatial_ref_sys','geography_columns','geometry_columns',
    'audit_logs','audit_log','integration_logs'
  ];
  _force_rls_exceptions text[] := ARRAY[
    'profiles','companies','permissions','role_permissions','user_roles',
    'rbac_legacy_usage','dashboard_cache','audit_logs','audit_log','integration_logs'
  ];
  _rls_exceptions text[] := ARRAY[
    'spatial_ref_sys','geography_columns','geometry_columns',
    'dashboard_cache','schema_migrations'
  ];
BEGIN
  SELECT jsonb_agg(c.relname ORDER BY c.relname) INTO _section
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE '_pg_%'
    AND c.relname != ALL(_rls_exceptions);
  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('tables_without_rls', _section);

  SELECT jsonb_agg(c.relname ORDER BY c.relname) INTO _section
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
    AND NOT c.relforcerowsecurity AND c.relname != ALL(_force_rls_exceptions)
    AND EXISTS (SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'company_id');
  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('tables_without_force_rls', _section);

  SELECT jsonb_agg(t.table_name ORDER BY t.table_name) INTO _section
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND t.table_name != ALL(_global_allowlist) AND t.table_name NOT LIKE 'pg_%'
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = t.table_name AND col.column_name = 'company_id');
  _section := COALESCE(_section, '[]'::jsonb);
  _result := _result || jsonb_build_object('business_tables_missing_company_id', _section);

  SELECT jsonb_agg(col.table_name ORDER BY col.table_name) INTO _section
  FROM information_schema.columns col
  WHERE col.table_schema = 'public' AND col.column_name = 'company_id'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = col.table_name
        AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'companies'
        AND EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu
          WHERE kcu.constraint_name = tc.constraint_name AND kcu.column_name = 'company_id'));
  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('company_id_without_fk', _section);

  SELECT jsonb_agg(jsonb_build_object('name', p.proname, 'schema', n.nspname) ORDER BY p.proname) INTO _section
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true AND p.prosrc NOT LIKE '%has_permission%'
    AND p.proname NOT IN ('get_current_company_id','assert_tenant','has_permission','has_role',
      'get_default_company_id','get_effective_permissions','handle_new_user','moddatetime');
  _section := COALESCE(_section, '[]'::jsonb);
  _result := _result || jsonb_build_object('security_definer_without_guard', _section);

  SELECT jsonb_agg(item ORDER BY item->>'type', item->>'name') INTO _section
  FROM (
    SELECT jsonb_build_object('type','function','schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text) AS item
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname NOT IN ('rbac_sql_lint_report','rbac_sql_lint_report_internal','rbac_sql_lint_report_admin')
      AND pg_get_functiondef(p.oid) ~ 'has_permission\s*\(\s*''[^'']*''\s*\)'
    UNION ALL
    SELECT jsonb_build_object('type','policy','schema',schemaname,'name',policyname,'table',tablename) AS item
    FROM pg_policies WHERE schemaname = 'public'
      AND (qual ~ 'has_permission\s*\(\s*''[^'']*''\s*\)' OR with_check ~ 'has_permission\s*\(\s*''[^'']*''\s*\)')
  ) sub;
  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('has_permission_one_arg_calls', jsonb_build_object('count', jsonb_array_length(_section), 'items', _section));

  _result := jsonb_build_object('status', CASE WHEN _fails = 0 THEN 'PASS' ELSE 'FAIL' END, 'fail_count', _fails, 'timestamp', now()) || _result;
  RETURN _result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_salmon_manipulation_atomic(p_entry_id uuid, p_manipulation_date date, p_fish_count integer, p_gross_out_kg numeric, p_clean_in_kg numeric, p_leftover_kg numeric DEFAULT 0, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_manip_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_out_kg <= 0 THEN RAISE EXCEPTION 'gross_out_kg deve ser > 0'; END IF;
  IF p_clean_in_kg < 0 THEN RAISE EXCEPTION 'clean_in_kg não pode ser negativo'; END IF;

  -- Lock parent entry by company_id
  SELECT * INTO v_entry FROM salmon_entries
  WHERE id = p_entry_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;
  IF v_entry.status != 'ACTIVE' THEN RAISE EXCEPTION 'Entrada não está ativa (status: %)', v_entry.status; END IF;

  v_cost_per_kg := CASE WHEN v_entry.gross_kg > 0 THEN ROUND(v_entry.total_value / v_entry.gross_kg, 4) ELSE 0 END;

  -- 1. Insert manipulation
  INSERT INTO salmon_manipulations (
    entry_id, manipulation_date, lot, sif, supplier_name, fish_count,
    gross_out_kg, clean_in_kg, leftover_kg, cost_per_kg_gross, notes, created_by, company_id
  ) VALUES (
    p_entry_id, p_manipulation_date, v_entry.lot, v_entry.sif, v_entry.supplier_name,
    COALESCE(p_fish_count, 0), p_gross_out_kg, p_clean_in_kg,
    COALESCE(p_leftover_kg, 0), v_cost_per_kg, COALESCE(p_notes,''), v_caller, v_company_id
  ) RETURNING id INTO v_manip_id;

  -- 2. Mirror to stock (SAIDA for gross)
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = v_manip_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_out_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_out_kg * v_cost_per_kg)::numeric, 2),
      data = p_manipulation_date,
      observacao = 'Saída Manipulação — Lote: ' || v_entry.lot,
      editado_em = now(), editado_por = v_caller, salmon_lot_id = v_entry.lot
    WHERE id = v_mov_id AND company_id = v_company_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor, company_id
    ) VALUES (
      v_produto_id, p_manipulation_date, 'SAIDA', p_gross_out_kg, v_cost_per_kg,
      ROUND((p_gross_out_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão', 'Saída Manipulação — Lote: ' || v_entry.lot,
      v_caller, 'ATIVO', 'SALMON_MANIPULATION', v_manip_id::text, true, 'salmon', v_entry.lot, 'Sushi', v_company_id
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- 3. Audit
  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', v_manip_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object(
      'entry_id', p_entry_id, 'gross_out_kg', p_gross_out_kg, 'clean_in_kg', p_clean_in_kg,
      'cost_per_kg', v_cost_per_kg, 'mov_id', v_mov_id
    ));

  RETURN jsonb_build_object(
    'manipulation_id', v_manip_id, 'movement_id', v_mov_id,
    'waste_kg', GREATEST(p_gross_out_kg - p_clean_in_kg, 0),
    'yield_percent', CASE WHEN p_gross_out_kg > 0 THEN ROUND(p_clean_in_kg / p_gross_out_kg * 100, 2) ELSE 0 END,
    'cost_per_kg_gross', v_cost_per_kg,
    'company_id', v_company_id
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.stock_insert_movement_atomic(p_produto_id uuid, p_qty numeric, p_tipo text, p_direction text, p_origem text DEFAULT 'MANUAL'::text, p_ref_type text DEFAULT NULL::text, p_ref_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_setor text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_produto record;
  v_saldo numeric;
  v_cost_unit numeric;
  v_cost_total numeric;
  v_new_id uuid;
  v_new_saldo numeric;
BEGIN
  v_company := assert_tenant();

  -- RBAC check
  IF NOT has_any_permission(auth.uid(), ARRAY[
    'estoque:movimentacoes:create', 'stock:movements:create', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION '403RBAC: Sem permissão para criar movimentações';
  END IF;

  -- Validate produto belongs to tenant (with lock)
  SELECT id, avg30_cost_base_unit, last_cost_base_unit, default_cost_base_unit,
         custo_padrao, fator_conversao_padrao, nome_produto
  INTO v_produto
  FROM produtos
  WHERE id = p_produto_id AND company_id = v_company AND ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Produto não encontrado no tenant';
  END IF;

  -- Calculate current balance
  SELECT COALESCE(SUM(
    CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END
  ), 0)
  INTO v_saldo
  FROM movimentacoes_estoque m
  WHERE m.produto_id = p_produto_id AND m.status = 'ATIVO' AND m.company_id = v_company;

  -- Block negative balance for OUT
  IF p_direction = 'OUT' AND v_saldo < p_qty THEN
    RAISE EXCEPTION '400: Saldo insuficiente. Disponível: %, Solicitado: %', v_saldo, p_qty;
  END IF;

  -- Determine cost
  v_cost_unit := COALESCE(
    NULLIF(v_produto.avg30_cost_base_unit, 0),
    NULLIF(v_produto.last_cost_base_unit, 0),
    NULLIF(v_produto.default_cost_base_unit, 0),
    CASE WHEN COALESCE(v_produto.fator_conversao_padrao, 1) > 0
         THEN COALESCE(v_produto.custo_padrao, 0) / COALESCE(v_produto.fator_conversao_padrao, 1)
         ELSE 0 END
  );
  v_cost_total := ROUND(p_qty * v_cost_unit, 2);

  -- Idempotency: if ref_type + ref_id exists, return existing
  IF p_ref_type IS NOT NULL AND p_ref_id IS NOT NULL THEN
    SELECT id INTO v_new_id
    FROM movimentacoes_estoque
    WHERE reference_type = p_ref_type AND reference_id = p_ref_id
      AND status = 'ATIVO' AND company_id = v_company;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'id', v_new_id, 'idempotent', true);
    END IF;
  END IF;

  -- Insert movement
  INSERT INTO movimentacoes_estoque (
    produto_id, tipo, direction, quantidade, custo_unitario, custo_total,
    origem, reference_type, reference_id, observacao, created_by,
    company_id, setor, status, data
  ) VALUES (
    p_produto_id, p_tipo, p_direction, p_qty, ROUND(v_cost_unit, 2), v_cost_total,
    p_origem, p_ref_type, p_ref_id, p_note, auth.uid(),
    v_company, p_setor, 'ATIVO', CURRENT_DATE
  )
  RETURNING id INTO v_new_id;

  v_new_saldo := v_saldo + CASE WHEN p_direction = 'IN' THEN p_qty ELSE -p_qty END;

  -- Audit
  PERFORM log_audit(
    p_source := 'rpc',
    p_module := 'estoque',
    p_entity := 'movimentacoes_estoque',
    p_entity_id := v_new_id::text,
    p_action := 'INSERT_MOVEMENT_ATOMIC',
    p_before := jsonb_build_object('saldo', v_saldo),
    p_after := jsonb_build_object('saldo', v_new_saldo, 'qty', p_qty, 'direction', p_direction)
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'saldo_anterior', v_saldo,
    'saldo_novo', v_new_saldo,
    'custo_unitario', ROUND(v_cost_unit, 2),
    'custo_total', v_cost_total
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_log_write(_module text, _action text, _entity_type text, _entity_id text DEFAULT NULL::text, _before jsonb DEFAULT NULL::jsonb, _after jsonb DEFAULT NULL::jsonb, _metadata jsonb DEFAULT NULL::jsonb, _severity text DEFAULT 'INFO'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_email text;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.assert_tenant(), p.email INTO v_company_id, v_email
  FROM profiles p WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT string_agg(ur.role::text, ',') INTO v_role
  FROM user_roles ur WHERE ur.user_id = v_user_id AND ur.company_id = public.assert_tenant();

  INSERT INTO audit_logs (
    company_id, actor_user_id, actor_email, actor_role,
    module, action, entity, entity_id,
    before, after, metadata, severity, source, success
  ) VALUES (
    v_company_id, v_user_id, v_email, v_role,
    _module, _action, _entity_type, _entity_id::uuid,
    _before, _after, _metadata, _severity, 'edge_function', true
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.stock_transfer_between_locations(p_product_id uuid, p_from_location text, p_to_location text, p_quantity numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id uuid;
    v_company_id uuid;
    v_product record;
    v_saldo numeric;
    v_cost_base numeric;
    v_transfer_group uuid;
    v_mov_out_id uuid;
    v_mov_in_id uuid;
    v_today text;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'P0001';
    END IF;

    v_company_id := public.assert_tenant();

    IF v_company_id IS NULL OR v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.has_any_permission(v_actor_id, ARRAY['estoque:transferencias:create', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Permissão negada: estoque:transferencias:create necessário' USING ERRCODE = 'P0001';
    END IF;

    IF p_from_location IS NULL OR trim(p_from_location) = '' THEN
        RAISE EXCEPTION 'Local de origem é obrigatório';
    END IF;
    IF p_to_location IS NULL OR trim(p_to_location) = '' THEN
        RAISE EXCEPTION 'Local de destino é obrigatório';
    END IF;
    IF trim(lower(p_from_location)) = trim(lower(p_to_location)) THEN
        RAISE EXCEPTION 'Local de origem e destino devem ser diferentes';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser maior que zero';
    END IF;

    SELECT * INTO v_product
    FROM public.produtos
    WHERE id = p_product_id AND company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado';
    END IF;
    IF NOT v_product.ativo THEN
        RAISE EXCEPTION 'Produto inativo';
    END IF;

    SELECT COALESCE(SUM(
        CASE WHEN direction = 'IN' THEN quantidade ELSE -quantidade END
    ), 0) INTO v_saldo
    FROM public.movimentacoes_estoque
    WHERE produto_id = p_product_id
      AND company_id = v_company_id
      AND status = 'ATIVO';

    IF v_saldo < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente. Disponível: % %', round(v_saldo, 2), v_product.unidade_medida;
    END IF;

    v_cost_base := COALESCE(NULLIF(v_product.avg30_cost_base_unit, 0),
                            NULLIF(v_product.last_cost_base_unit, 0),
                            NULLIF(v_product.default_cost_base_unit, 0),
                            0);

    v_transfer_group := gen_random_uuid();
    v_today := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

    INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, quantidade,
        custo_unitario, custo_total, origem, observacao,
        created_by, setor, reference_type, reference_id,
        internal_transfer, source_module, direction
    ) VALUES (
        p_product_id, v_company_id, v_today, 'SAIDA', p_quantity,
        round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
        'Transferência Interna',
        format('Transferência: %s → %s. %s', trim(p_from_location), trim(p_to_location), COALESCE(p_reason, '')),
        v_actor_id, trim(p_from_location), 'INTERNAL_TRANSFER', v_transfer_group::text,
        true, 'estoque', 'OUT'
    )
    RETURNING id INTO v_mov_out_id;

    INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, quantidade,
        custo_unitario, custo_total, origem, observacao,
        created_by, setor, reference_type, reference_id,
        internal_transfer, source_module, direction
    ) VALUES (
        p_product_id, v_company_id, v_today, 'ENTRADA', p_quantity,
        round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
        'Transferência Interna',
        format('Transferência: %s → %s. %s', trim(p_from_location), trim(p_to_location), COALESCE(p_reason, '')),
        v_actor_id, trim(p_to_location), 'INTERNAL_TRANSFER', v_transfer_group::text,
        true, 'estoque', 'IN'
    )
    RETURNING id INTO v_mov_in_id;

    INSERT INTO public.audit_logs (
        action, entity, entity_id, module, actor_user_id, company_id,
        severity, source, success, metadata
    ) VALUES (
        'STOCK_TRANSFER', 'movimentacoes_estoque', v_transfer_group::text,
        'estoque', v_actor_id, v_company_id,
        'info', 'rpc', true,
        jsonb_build_object(
            'product_id', p_product_id,
            'product_name', v_product.nome_produto,
            'from_location', trim(p_from_location),
            'to_location', trim(p_to_location),
            'quantity', p_quantity,
            'unit', v_product.unidade_medida,
            'cost_unit', round(v_cost_base, 4),
            'cost_total', round(p_quantity * v_cost_base, 2),
            'reason', COALESCE(p_reason, ''),
            'mov_out_id', v_mov_out_id,
            'mov_in_id', v_mov_in_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'transfer_group_id', v_transfer_group,
        'mov_out_id', v_mov_out_id,
        'mov_in_id', v_mov_in_id,
        'quantity', p_quantity,
        'from_location', trim(p_from_location),
        'to_location', trim(p_to_location),
        'cost_total', round(p_quantity * v_cost_base, 2)
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_quick_inventory_atomic(p_items jsonb, p_observacao text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id       uuid;
    v_company_id     uuid;
    v_inv_id         uuid;
    v_item           jsonb;
    v_product        record;
    v_saldo          numeric;
    v_counted        numeric;
    v_diff           numeric;
    v_diff_pct       numeric;
    v_cost_base      numeric;
    v_impact         numeric;
    v_today          text;
    v_now            timestamptz;
    v_total_items    int := 0;
    v_adjusted       int := 0;
    v_total_impact   numeric := 0;
    v_acuracia_sum   numeric := 0;
    v_acuracia_count int := 0;
    v_turno_id       uuid;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'P0001';
    END IF;

    IF NOT has_any_permission(v_actor_id, ARRAY['inventario:rapido:create', 'inventario:criar:create', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Forbidden: inventario:rapido:create required';
    END IF;

    v_company_id := public.assert_tenant();

    IF v_company_id IS NULL OR v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = 'P0001';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        IF EXISTS (
            SELECT 1 FROM public.inventarios
            WHERE company_id = v_company_id
              AND idempotency_key = p_idempotency_key
        ) THEN
            RETURN jsonb_build_object('success', false, 'reason', 'duplicate', 'message', 'Inventário rápido já registrado');
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Nenhum item informado para contagem';
    END IF;

    v_now := now();
    v_today := to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

    SELECT id INTO v_turno_id
    FROM public.turnos
    WHERE company_id = v_company_id
    ORDER BY created_at ASC
    LIMIT 1;

    v_inv_id := gen_random_uuid();
    BEGIN
        INSERT INTO public.inventarios (
            id, company_id, tipo, status, data, hora,
            responsavel_user_id, observacao, idempotency_key, turno_id
        ) VALUES (
            v_inv_id, v_company_id, 'rapido', 'EM_CONTAGEM', v_today,
            to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS'),
            v_actor_id, COALESCE(p_observacao, 'Inventário Rápido'),
            COALESCE(NULLIF(p_idempotency_key, ''), gen_random_uuid()::text),
            v_turno_id
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate', 'message', 'Inventário rápido já registrado');
    END;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_counted := COALESCE((v_item->>'counted_quantity')::numeric, 0);
        IF v_counted < 0 THEN
            RAISE EXCEPTION 'Quantidade negativa não permitida para produto %', v_item->>'product_id';
        END IF;

        SELECT * INTO v_product
        FROM public.produtos
        WHERE id = (v_item->>'product_id')::uuid
          AND company_id = v_company_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado: %', v_item->>'product_id';
        END IF;
        IF NOT v_product.ativo THEN
            RAISE EXCEPTION 'Produto inativo: %', v_product.nome_produto;
        END IF;

        SELECT COALESCE(SUM(
            CASE WHEN direction = 'IN' THEN quantidade ELSE -quantidade END
        ), 0) INTO v_saldo
        FROM public.movimentacoes_estoque
        WHERE produto_id = v_product.id
          AND company_id = v_company_id
          AND status = 'ATIVO';

        v_diff := v_counted - v_saldo;
        v_diff_pct := CASE WHEN v_saldo > 0 THEN round((v_diff / v_saldo) * 100, 2) ELSE 0 END;

        v_cost_base := COALESCE(NULLIF(v_product.avg30_cost_base_unit, 0),
                                NULLIF(v_product.last_cost_base_unit, 0),
                                NULLIF(v_product.default_cost_base_unit, 0), 0);
        v_impact := round(abs(v_diff) * v_cost_base, 2);

        INSERT INTO public.inventario_itens (
            inventario_id, company_id, produto_id, tipo_item,
            saldo_teorico, contagem_fisica,
            diferenca_qtd, diferenca_percent,
            custo_snapshot, impacto_financeiro,
            classificacao, contado_por, contagem_inicio, contagem_fim
        ) VALUES (
            v_inv_id, v_company_id, v_product.id, 'geral',
            v_saldo, v_counted,
            v_diff, v_diff_pct,
            v_cost_base, v_impact,
            CASE
                WHEN abs(v_diff_pct) > 10 OR v_impact > 500 THEN 'CRITICO'
                WHEN abs(v_diff_pct) > 5 OR v_impact > 100 THEN 'ALERTA'
                ELSE 'NORMAL'
            END,
            v_actor_id, v_now, v_now
        );

        v_total_items := v_total_items + 1;
        v_total_impact := v_total_impact + v_impact;

        IF v_saldo > 0 THEN
            v_acuracia_sum := v_acuracia_sum + LEAST(v_counted / v_saldo, 1.0);
            v_acuracia_count := v_acuracia_count + 1;
        ELSIF v_counted = 0 THEN
            v_acuracia_sum := v_acuracia_sum + 1.0;
            v_acuracia_count := v_acuracia_count + 1;
        END IF;

        IF v_diff <> 0 THEN
            INSERT INTO public.movimentacoes_estoque (
                produto_id, company_id, data, tipo, quantidade,
                custo_unitario, custo_total, origem, observacao,
                created_by, reference_type, reference_id,
                source_module, direction
            ) VALUES (
                v_product.id, v_company_id, v_today,
                CASE WHEN v_diff > 0 THEN 'ENTRADA' ELSE 'SAIDA' END,
                abs(v_diff),
                round(v_cost_base, 4),
                round(abs(v_diff) * v_cost_base, 2),
                'Inventário Rápido',
                format('Ajuste inventário rápido: %s (%s → %s %s)',
                    v_product.nome_produto,
                    round(v_saldo, 2)::text,
                    round(v_counted, 2)::text,
                    v_product.unidade_medida),
                v_actor_id,
                'QUICK_INVENTORY', v_inv_id::text,
                'inventario',
                CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END
            );
            v_adjusted := v_adjusted + 1;
        END IF;
    END LOOP;

    UPDATE public.inventarios
    SET status = 'FINALIZADO',
        finalizado_em = v_now,
        finalizado_por = v_actor_id,
        acuracia_percent = CASE WHEN v_acuracia_count > 0
            THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2)
            ELSE 100 END,
        drift_total_valor = v_total_impact,
        updated_at = v_now
    WHERE id = v_inv_id;

    INSERT INTO public.audit_logs (
        action, entity, entity_id, module, actor_user_id, company_id,
        severity, source, success, metadata
    ) VALUES (
        'QUICK_INVENTORY', 'inventarios', v_inv_id::text,
        'inventario', v_actor_id, v_company_id,
        CASE WHEN v_total_impact > 500 THEN 'warning' ELSE 'info' END,
        'rpc', true,
        jsonb_build_object(
            'total_items', v_total_items,
            'adjusted', v_adjusted,
            'total_impact', v_total_impact,
            'acuracia', CASE WHEN v_acuracia_count > 0
                THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2)
                ELSE 100 END
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'inventory_id', v_inv_id,
        'total_items', v_total_items,
        'adjusted', v_adjusted,
        'total_impact', v_total_impact
    );
END;
$function$
;
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
CREATE OR REPLACE FUNCTION public.attend_requisicao_item_atomic(p_requisicao_id uuid, p_item_id uuid, p_quantidade_aprovada numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_req record;
  v_item record;
  v_prod record;
  v_existing_movement uuid;
  v_now timestamptz := now();
  v_qtd_solicitada numeric;
  v_qtd_efetiva numeric;
  v_qtd_base numeric;
  v_saldo numeric;
  v_status text;
  v_is_partial boolean;
  v_qtd_faltante numeric;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF v_user IS NULL THEN
    RAISE EXCEPTION '401: Usuário não autenticado';
  END IF;

  IF NOT public.has_any_permission(v_user, ARRAY[
    'estoque:requisicoes:approve',
    'estoque:requisicoes:close',
    'estoque:movimentacoes:create',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION '403RBAC: Sem permissão para atender itens';
  END IF;

  SELECT r.id, r.status, r.setor
    INTO v_req
  FROM public.requisicoes_estoque r
  WHERE r.id = p_requisicao_id
    AND r.company_id = v_company
    AND r.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Requisição não encontrada';
  END IF;

  IF v_req.status IN ('CANCELADA', 'NEGADA') THEN
    RAISE EXCEPTION '400: Requisição não pode ser alterada';
  END IF;

  SELECT rei.id,
         rei.requisicao_id,
         rei.produto_id,
         rei.status,
         rei.quantidade_solicitada,
         rei.quantidade_atendida,
         rei.unidade
    INTO v_item
  FROM public.requisicao_estoque_itens rei
  WHERE rei.id = p_item_id
    AND rei.requisicao_id = p_requisicao_id
    AND rei.company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Item da requisição não encontrado';
  END IF;

  SELECT m.id
    INTO v_existing_movement
  FROM public.movimentacoes_estoque m
  WHERE m.reference_type = 'REQUISICAO_ITEM'
    AND m.reference_id = p_item_id::text
    AND m.status = 'ATIVO'
    AND m.company_id = v_company
  LIMIT 1;

  IF v_item.status <> 'SOLICITADO' THEN
    IF v_item.status = 'ATENDIDO' AND v_existing_movement IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'movement_id', v_existing_movement,
        'item_id', p_item_id,
        'requisicao_id', p_requisicao_id,
        'quantidade_atendida', COALESCE(v_item.quantidade_atendida, 0),
        'message', 'Item já atendido anteriormente.'
      );
    END IF;

    RAISE EXCEPTION '409: Item já está com status %', v_item.status;
  END IF;

  v_qtd_solicitada := COALESCE(v_item.quantidade_solicitada, 0);
  IF v_qtd_solicitada <= 0 THEN
    RAISE EXCEPTION '400: Quantidade solicitada inválida';
  END IF;

  IF p_quantidade_aprovada IS NULL THEN
    v_qtd_efetiva := v_qtd_solicitada;
  ELSE
    v_qtd_efetiva := p_quantidade_aprovada;
    IF v_qtd_efetiva <= 0 THEN
      RAISE EXCEPTION '400: Quantidade aprovada deve ser maior que zero';
    END IF;
    IF v_qtd_efetiva > v_qtd_solicitada THEN
      RAISE EXCEPTION '400: Quantidade aprovada (%) não pode ser maior que a solicitada (%)', v_qtd_efetiva, v_qtd_solicitada;
    END IF;
  END IF;

  SELECT p.id,
         p.nome_produto,
         p.unidade_compra,
         p.fator_conversao_padrao,
         COALESCE(
           NULLIF(p.avg30_cost_base_unit, 0),
           NULLIF(p.last_cost_base_unit, 0),
           NULLIF(p.default_cost_base_unit, 0),
           CASE
             WHEN COALESCE(NULLIF(p.fator_conversao_padrao, 0), 1) > 0
               THEN COALESCE(p.custo_padrao, 0) / COALESCE(NULLIF(p.fator_conversao_padrao, 0), 1)
             ELSE 0
           END
         ) AS custo_unitario_base
    INTO v_prod
  FROM public.produtos p
  WHERE p.id = v_item.produto_id
    AND p.company_id = v_company
    AND p.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Produto não encontrado no tenant';
  END IF;

  v_qtd_base := ROUND((v_qtd_efetiva * COALESCE(NULLIF(v_prod.fator_conversao_padrao, 0), 1))::numeric, 3);

  -- Cálculo de saldo: ignora estornos (ENTRADA_ESTORNO/SAIDA_ESTORNO)
  -- pois eles existem apenas como registro contábil de movimentações CANCELADAS
  SELECT COALESCE(SUM(
    CASE
      WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
      WHEN m.direction = 'IN' THEN m.quantidade
      ELSE -m.quantidade
    END
  ), 0)
    INTO v_saldo
  FROM public.movimentacoes_estoque m
  WHERE m.produto_id = v_item.produto_id
    AND m.status = 'ATIVO'
    AND m.company_id = v_company;

  IF v_saldo < v_qtd_base THEN
    RAISE EXCEPTION '400: Saldo insuficiente. Disponível: %, Necessário: %', v_saldo, v_qtd_base;
  END IF;

  UPDATE public.requisicao_estoque_itens
     SET status = 'ATENDIDO',
         quantidade_atendida = v_qtd_efetiva,
         atendido_por = v_user,
         atendido_em = v_now
   WHERE id = p_item_id
     AND company_id = v_company;

  INSERT INTO public.movimentacoes_estoque (
    produto_id,
    tipo,
    direction,
    quantidade,
    custo_unitario,
    custo_total,
    origem,
    referencia_id,
    reference_type,
    reference_id,
    observacao,
    created_by,
    company_id,
    setor,
    status,
    data
  ) VALUES (
    v_item.produto_id,
    'SAIDA',
    'OUT',
    v_qtd_base,
    ROUND(COALESCE(v_prod.custo_unitario_base, 0)::numeric, 2),
    ROUND((v_qtd_base * COALESCE(v_prod.custo_unitario_base, 0))::numeric, 2),
    'REQUISICAO_ESTOQUE',
    p_requisicao_id::text,
    'REQUISICAO_ITEM',
    p_item_id::text,
    FORMAT('Baixa requisição %s - %s', LEFT(p_requisicao_id::text, 8), COALESCE(v_req.setor, '')),
    v_user,
    v_company,
    v_req.setor,
    'ATIVO',
    CURRENT_DATE
  )
  ON CONFLICT (reference_type, reference_id)
  WHERE status = 'ATIVO' AND reference_type IS NOT NULL AND reference_id IS NOT NULL AND reference_type <> ALL (ARRAY['INVENTARIO_AJUSTE', 'AJUSTE_CORRECAO_POSTERIOR'])
  DO NOTHING
  RETURNING id INTO v_existing_movement;

  IF v_existing_movement IS NULL THEN
    SELECT m.id
      INTO v_existing_movement
    FROM public.movimentacoes_estoque m
    WHERE m.reference_type = 'REQUISICAO_ITEM'
      AND m.reference_id = p_item_id::text
      AND m.status = 'ATIVO'
      AND m.company_id = v_company
    LIMIT 1;
  END IF;

  IF v_existing_movement IS NULL THEN
    RAISE EXCEPTION '500: Movimentação do item não foi criada';
  END IF;

  v_is_partial := v_qtd_efetiva < v_qtd_solicitada;

  IF v_is_partial THEN
    v_qtd_faltante := v_qtd_solicitada - v_qtd_efetiva;

    INSERT INTO public.alertas_falta_estoque (
      company_id,
      produto_id,
      produto_nome,
      quantidade_solicitada,
      unidade,
      saldo_no_momento,
      requisicao_id,
      requisicao_item_id,
      setor_solicitante,
      origem,
      status,
      created_by
    ) VALUES (
      v_company,
      v_item.produto_id,
      COALESCE(v_prod.nome_produto, v_item.produto_id::text),
      v_qtd_faltante,
      COALESCE(v_prod.unidade_compra, v_item.unidade, 'UN'),
      GREATEST(0, v_saldo - v_qtd_base),
      p_requisicao_id,
      p_item_id,
      COALESCE(v_req.setor, ''),
      'ATENDIMENTO_PARCIAL',
      'PENDENTE',
      v_user
    )
    ON CONFLICT (requisicao_id, produto_id)
    DO UPDATE SET
      quantidade_solicitada = EXCLUDED.quantidade_solicitada,
      saldo_no_momento = EXCLUDED.saldo_no_momento,
      origem = EXCLUDED.origem,
      status = EXCLUDED.status,
      requisicao_item_id = EXCLUDED.requisicao_item_id;
  END IF;

  v_status := COALESCE(public.compute_requisicao_status_agregado(p_requisicao_id), 'SOLICITADA');

  UPDATE public.requisicoes_estoque
     SET status = v_status,
         updated_at = v_now,
         atendido_por = CASE WHEN v_status IN ('ATENDIDA', 'PARCIALMENTE_ATENDIDA') THEN v_user ELSE atendido_por END,
         atendido_em = CASE WHEN v_status IN ('ATENDIDA', 'PARCIALMENTE_ATENDIDA') THEN v_now ELSE atendido_em END
   WHERE id = p_requisicao_id
     AND company_id = v_company;

  PERFORM public.log_audit(
    p_source := 'rpc',
    p_module := 'estoque',
    p_entity := 'requisicao_estoque_itens',
    p_entity_id := p_item_id::text,
    p_action := CASE WHEN v_is_partial THEN 'ITEM_ATENDIDO_PARCIAL' ELSE 'ITEM_ATENDIDO' END,
    p_before := jsonb_build_object(
      'status', 'SOLICITADO',
      'produto_id', v_item.produto_id,
      'quantidade_solicitada', v_qtd_solicitada
    ),
    p_after := jsonb_build_object(
      'status', 'ATENDIDO',
      'quantidade_solicitada', v_qtd_solicitada,
      'quantidade_atendida', v_qtd_efetiva,
      'quantidade_movimentada_base', v_qtd_base,
      'movement_id', v_existing_movement,
      'ajuste_parcial', v_is_partial
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_existing_movement,
    'item_id', p_item_id,
    'requisicao_id', p_requisicao_id,
    'quantidade_solicitada', v_qtd_solicitada,
    'quantidade_atendida', v_qtd_efetiva,
    'quantidade_movimentada_base', v_qtd_base,
    'partial', v_is_partial,
    'requisicao_status', v_status,
    'message', CASE
      WHEN v_is_partial THEN FORMAT('Item atendido parcialmente: %s de %s solicitado(s).', v_qtd_efetiva, v_qtd_solicitada)
      ELSE 'Item atendido com sucesso.'
    END
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.receive_conta_receber(p_id uuid, p_expected_updated_at text, p_data_recebimento date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_exists boolean;
  v_rec date;
  v_comp date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:receber:edit', 'finance:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão para receber contas.';
  END IF;

  SELECT * INTO v_item FROM fin_contas_receber WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status != 'A_RECEBER' THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_item.status;
  END IF;

  v_company_id := v_item.company_id;

  v_rec := COALESCE(p_data_recebimento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_comp := COALESCE(v_item.data_competencia, v_item.data_vencimento, v_rec);

  IF v_item.conta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_item.conta_id AND company_id = v_company_id) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'RECEITA', v_item.valor, v_comp, v_rec, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_receber', p_id::text, v_company_id, 'espelho_cr'
  )
  RETURNING id INTO v_lanc_id;

  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  UPDATE fin_contas_receber
  SET status = 'RECEBIDO', data_recebimento = v_rec, valor_recebido = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_receber', p_id, 'receber', auth.uid(), v_company_id);

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_receber', p_id, 'RECEIVE',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO', 'data_recebimento', v_rec, 'data_competencia', v_comp));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_cotacao_atomic(p_cotacao_id uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company     uuid;
  v_user        uuid;
  v_cot         record;
  v_forn        record;
  v_order_id    uuid;
  v_total       numeric;
  v_items       int;
  v_orders      int := 0;
  v_total_items int := 0;
  v_order_ids   uuid[] := '{}';
  v_sel_count   int;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED: não autenticado'; END IF;

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:close','compras:cotacao:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:close';
  END IF;

  SELECT id, codigo, titulo, status, updated_at
    INTO v_cot
  FROM public.cotacoes
  WHERE id = p_cotacao_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_cot.status = 'CONVERTIDA' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (cotação já convertida em pedido)', v_cot.status;
  END IF;
  IF v_cot.status IN ('CANCELADA','ENCERRADA') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (cotação encerrada)', v_cot.status;
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_cot.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  SELECT count(*) INTO v_sel_count
  FROM public.cotacao_respostas r
  JOIN public.cotacao_fornecedores f ON f.id = r.cotacao_fornecedor_id
  WHERE f.cotacao_id = p_cotacao_id
    AND r.company_id = v_company
    AND r.selecionado = true
    AND r.disponivel = true
    AND r.preco_unitario IS NOT NULL;
  IF v_sel_count = 0 THEN
    RAISE EXCEPTION 'VALIDATION: nenhuma resposta selecionada — gere e salve a sugestão antes de converter';
  END IF;

  FOR v_forn IN
    SELECT f.id, f.supplier_nome_snapshot, f.condicao_pagamento
    FROM public.cotacao_fornecedores f
    WHERE f.cotacao_id = p_cotacao_id
      AND f.company_id = v_company
      AND EXISTS (
        SELECT 1 FROM public.cotacao_respostas r
        WHERE r.cotacao_fornecedor_id = f.id
          AND r.company_id = v_company
          AND r.selecionado = true
          AND r.disponivel = true
          AND r.preco_unitario IS NOT NULL
      )
    ORDER BY f.supplier_nome_snapshot
  LOOP
    SELECT coalesce(sum(r.preco_unitario * i.quantidade), 0) INTO v_total
    FROM public.cotacao_respostas r
    JOIN public.cotacao_itens i ON i.id = r.cotacao_item_id
    WHERE r.cotacao_fornecedor_id = v_forn.id
      AND r.company_id = v_company
      AND r.selecionado = true
      AND r.disponivel = true
      AND r.preco_unitario IS NOT NULL;

    INSERT INTO public.purchase_orders (
      title, type, priority, category, supplier_name, payment_type,
      notes, status, total_estimated, created_by, company_id,
      idempotency_key, origin, origin_ref
    ) VALUES (
      v_cot.codigo || ' — ' || v_forn.supplier_nome_snapshot,
      'FORNECEDOR', 'MEDIA', '',
      v_forn.supplier_nome_snapshot,
      NULLIF(btrim(coalesce(v_forn.condicao_pagamento,'')), ''),
      'Gerado da cotação ' || v_cot.codigo || ' (' || v_cot.titulo || ')',
      'OPEN', coalesce(v_total, 0), v_user, v_company,
      gen_random_uuid(), 'COTACAO', p_cotacao_id::text
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.purchase_order_items (
      order_id, stock_item_id, name_snapshot, unit_snapshot,
      estimated_unit_value, qty_requested,
      purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot,
      shopping_status, company_id
    )
    SELECT
      v_order_id,
      i.produto_id,
      i.produto_nome_snapshot,
      coalesce(NULLIF(i.unidade_snapshot,''), 'UN'),
      r.preco_unitario,
      i.quantidade,
      coalesce(NULLIF(i.purchase_unit_snapshot,''), NULLIF(i.unidade_snapshot,''), 'UN'),
      r.preco_unitario,
      coalesce(i.conversion_factor_snapshot, 1),
      'OK',
      v_company
    FROM public.cotacao_respostas r
    JOIN public.cotacao_itens i ON i.id = r.cotacao_item_id
    WHERE r.cotacao_fornecedor_id = v_forn.id
      AND r.company_id = v_company
      AND r.selecionado = true
      AND r.disponivel = true
      AND r.preco_unitario IS NOT NULL;

    GET DIAGNOSTICS v_items = ROW_COUNT;
    v_total_items := v_total_items + v_items;
    v_orders := v_orders + 1;
    v_order_ids := array_append(v_order_ids, v_order_id);

    UPDATE public.cotacao_fornecedores
       SET status = 'FECHADO'
     WHERE id = v_forn.id AND company_id = v_company;

    INSERT INTO public.audit_log (tabela, registro_id, acao, user_id)
    VALUES ('purchase_orders', v_order_id, 'CRIACAO', v_user);
  END LOOP;

  UPDATE public.cotacoes
     SET status = 'CONVERTIDA'
   WHERE id = p_cotacao_id AND company_id = v_company;

  UPDATE public.cotacao_sugestoes s
     SET dados_json = coalesce(s.dados_json, '{}'::jsonb)
                      || jsonb_build_object('generated_order_ids', to_jsonb(v_order_ids))
   WHERE s.id = (
     SELECT id FROM public.cotacao_sugestoes
     WHERE cotacao_id = p_cotacao_id AND company_id = v_company
     ORDER BY created_at DESC
     LIMIT 1
   );

  RETURN jsonb_build_object(
    'success', true,
    'orders', v_orders,
    'items', v_total_items,
    'order_ids', to_jsonb(v_order_ids)
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.pay_conta_pagar(p_id uuid, p_expected_updated_at text, p_data_pagamento date DEFAULT NULL::date, p_conta_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_id uuid;
  v_pag date;
  v_comp date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:pagar:edit', 'financeiro:pagar:approve', 'finance:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão para pagar contas.';
  END IF;

  v_company_id := public.assert_tenant();

  SELECT * INTO v_item FROM fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta a pagar não encontrada.'; END IF;

  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_item.status;
  END IF;

  v_conta_id := COALESCE(p_conta_id, v_item.conta_id);
  IF v_conta_id IS NULL THEN
    RAISE EXCEPTION 'CONTA_OBRIGATORIA: selecione a conta bancária de onde o pagamento saiu.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_conta_id AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_pag := COALESCE(p_data_pagamento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_comp := COALESCE(v_item.data_competencia, v_item.data_vencimento, v_pag);

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'DESPESA', v_item.valor, v_comp, v_pag, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_pagar', p_id::text, v_company_id, 'espelho_cp'
  )
  RETURNING id INTO v_lanc_id;

  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  UPDATE fin_contas_pagar
  SET status = 'PAGO', data_pagamento = v_pag, valor_pago = v_item.valor,
      lancamento_id = v_lanc_id, conta_id = v_conta_id
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('contas_pagar', p_id, 'pagar', auth.uid(), v_company_id,
    jsonb_build_object('lancamento_id', v_lanc_id, 'conta_id', v_conta_id, 'data_pagamento', v_pag));

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_pagar', p_id, 'PAY',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO', 'data_pagamento', v_pag,
      'data_competencia', v_comp, 'conta_id', v_conta_id));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO', 'conta_id', v_conta_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.upsert_supplier(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:create', 'compras:fornecedores:edit', 'purchases:edit', 'suppliers:edit', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar fornecedores.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nome do fornecedor não pode ser vazio.';
  END IF;

  INSERT INTO suppliers (name)
  VALUES (trim(p_name))
  ON CONFLICT (name) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  PERFORM log_audit(
    'rpc', 'purchases', 'suppliers', v_id,
    'UPSERT', NULL,
    jsonb_build_object('name', trim(p_name))
  );

  RETURN v_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.storno_purchase_order_stock(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_company uuid;
  v_mov RECORD;
  v_count int := 0;
  v_affected_products uuid[] := ARRAY[]::uuid[];
  v_pid uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  v_company := assert_tenant();
  IF NOT public.has_any_permission(v_user, ARRAY['compras:pedidos:delete', 'estoque:movimentacoes:cancel', 'purchases:create', 'stock:edit', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão para estornar movimentações de pedido.';
  END IF;

  PERFORM 1 FROM purchase_orders WHERE id = p_order_id AND company_id = v_company FOR UPDATE;

  FOR v_mov IN
    SELECT * FROM movimentacoes_estoque
    WHERE company_id = v_company
    AND (
      (reference_type = 'PURCHASE_ORDER' AND reference_id = p_order_id::text)
      OR
      (reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id LIKE 'POI:%' AND EXISTS (
        SELECT 1 FROM purchase_order_items poi
        WHERE poi.order_id = p_order_id AND poi.company_id = v_company
          AND 'POI:' || poi.id::text = movimentacoes_estoque.reference_id
      ))
    )
    AND status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    FOR UPDATE
  LOOP
    UPDATE movimentacoes_estoque
    SET status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_user,
        justificativa_cancelamento = 'Exclusão de pedido de compra'
    WHERE id = v_mov.id AND company_id = v_company;

    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno automático — Exclusão pedido compra ' || p_order_id::text,
      v_user, 'ATIVO', v_mov.id, v_mov.reference_type,
      v_mov.reference_id || '_ESTORNO', false, 'purchases', v_company
    );

    IF NOT v_mov.produto_id = ANY(v_affected_products) THEN
      v_affected_products := array_append(v_affected_products, v_mov.produto_id);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  FOREACH v_pid IN ARRAY v_affected_products LOOP
    PERFORM recalc_product_costs(v_pid);
  END LOOP;

  PERFORM public.log_audit('rpc', 'compras', 'purchase_orders', p_order_id, 'STORNO', NULL,
    jsonb_build_object('movimentacoes_estornadas', v_count));
END;
$function$
;