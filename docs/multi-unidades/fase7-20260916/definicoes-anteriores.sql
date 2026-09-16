-- Evidência; NÃO executar como rollback. Grants vulneráveis não devem ser restaurados.
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL null
CREATE OR REPLACE FUNCTION public.fin_audit_integrity_check()
 RETURNS TABLE(tipo text, problema text, entidade_id uuid, descricao text, valor numeric, status text, lancamento_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
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

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_or_set_cache(p_key text, p_ttl_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_payload jsonb; v_expires timestamptz;
BEGIN
  SELECT payload, expires_at INTO v_payload, v_expires FROM dashboard_cache WHERE key = p_key;
  IF FOUND AND v_expires > now() THEN RETURN v_payload; END IF;
  RETURN NULL;
END; $function$

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_saldo numeric; v_company uuid;
BEGIN
  v_company := assert_tenant();
  SELECT COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0 WHEN direction = 'IN' THEN quantidade ELSE -quantidade END), 0) INTO v_saldo
  FROM movimentacoes_estoque WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company;
  RETURN ROUND(v_saldo, 4);
END; $function$

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.rbac_top_legacy_usage(_days integer DEFAULT 7, _limit integer DEFAULT 20)
 RETURNS TABLE(legacy_key text, usage_count bigint, first_seen timestamp with time zone, last_seen timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    legacy_key,
    COUNT(*) AS usage_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
  FROM rbac_legacy_usage
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY legacy_key
  ORDER BY usage_count DESC
  LIMIT _limit;
$function$

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.refresh_saldo_cache(p_conta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo numeric;
  v_company uuid;
  v_saldo_inicial numeric;
BEGIN
  SELECT company_id, saldo_inicial INTO v_company, v_saldo_inicial
  FROM fin_contas WHERE id = p_conta_id;

  IF v_company IS NULL THEN RETURN; END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM fin_lancamentos l
  WHERE l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.company_id = v_company
    AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id);

  INSERT INTO fin_contas_saldo_cache (conta_id, company_id, saldo, updated_at)
  VALUES (p_conta_id, v_company, v_saldo, now())
  ON CONFLICT (conta_id) DO UPDATE SET saldo = EXCLUDED.saldo, updated_at = now();
END;
$function$

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
  -- Resolve actor
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Get category with lock
  SELECT id, parent_id, tipo, ordem, company_id
  INTO v_cat
  FROM fin_categorias
  WHERE id = p_category_id AND ativo = true
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

-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_cache(p_key text, p_payload jsonb, p_ttl_seconds integer DEFAULT 120)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO dashboard_cache (key, payload, expires_at)
  VALUES (p_key, p_payload, now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at, created_at = now();
END; $function$

-- ACL {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_all_saldos_contas()
 RETURNS TABLE(conta_id uuid, saldo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
BEGIN
  _company_id := public.assert_tenant();

  RETURN QUERY
  SELECT
    c.id AS conta_id,
    (
      c.saldo_inicial
      + COALESCE((
        SELECT SUM(
          CASE
            WHEN l.tipo = 'RECEITA' THEN l.valor
            WHEN l.tipo = 'DESPESA' THEN -l.valor
            WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
            WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
            ELSE 0
          END
        )
        FROM public.fin_lancamentos l
        WHERE l.company_id = _company_id
          AND l.status IN ('REALIZADO', 'CONCILIADO')
          AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
      ), 0)
    )::numeric AS saldo
  FROM public.fin_contas c
  WHERE c.company_id = _company_id
    AND c.ativo = true;
END;
$function$;
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_inactive_stock_items()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result json;
BEGIN
  v_company_id := public.assert_tenant();

  IF v_company_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  INTO v_result
  FROM (
    SELECT
      p.id AS item_id,
      p.nome_produto AS item_name,
      p.categoria AS category,
      p.local_estoque AS location,
      p.unidade_medida,
      coalesce(p.inactivity_days_threshold, 30) AS inactivity_days_threshold,
      coalesce(p.last_movement_at, p.created_at) AS last_movement_at,
      extract(day FROM now() - coalesce(p.last_movement_at, p.created_at))::int AS days_inactive,
      coalesce(s.saldo, 0) AS stock_qty
    FROM public.produtos p
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END
      ) AS saldo
      FROM public.movimentacoes_estoque m
      WHERE m.produto_id = p.id
        AND m.status = 'ATIVO'
        AND m.company_id = v_company_id
    ) s ON true
    WHERE p.company_id = v_company_id
      AND p.ativo = true
      AND extract(day FROM now() - coalesce(p.last_movement_at, p.created_at))::int
          >= coalesce(p.inactivity_days_threshold, 30)
    ORDER BY days_inactive DESC
  ) t;

  RETURN v_result;
END;
$function$;
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_dashboard(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
    v_result jsonb;
    v_cutoff timestamptz;
BEGIN
    v_company := public.assert_tenant();
    v_cutoff := now() - (p_days || ' days')::interval;

    WITH produto_saldos AS (
        SELECT
            p.id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.estoque_minimo,
            COALESCE(p.saldo_atual, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS custo_efetivo
        FROM public.produtos p
        WHERE p.company_id = v_company AND p.ativo = true
    ),
    -- Distribuição por categoria (valor)
    cat_dist AS (
        SELECT jsonb_agg(jsonb_build_object(
            'categoria', COALESCE(sub.categoria, 'Sem Categoria'),
            'valor', sub.valor,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.valor DESC) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(ps.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(ps.saldo * ps.custo_efetivo)::numeric, 2) AS valor,
                COUNT(*)::int AS qtd_itens
            FROM produto_saldos ps
            WHERE ps.saldo > 0
            GROUP BY 1
        ) sub
    ),
    -- Contagem por status — buckets mutuamente exclusivos; saldo zero nunca é OK
    status_counts AS (
        SELECT
            COUNT(*) FILTER (
                WHERE ps.saldo > 0
                  AND (COALESCE(ps.estoque_minimo, 0) = 0 OR ps.saldo > ps.estoque_minimo)
            ) AS ok,
            COUNT(*) FILTER (
                WHERE ps.saldo > 0
                  AND ps.estoque_minimo > 0
                  AND ps.saldo <= ps.estoque_minimo
                  AND ps.saldo > (ps.estoque_minimo * 0.5)
            ) AS atencao,
            COUNT(*) FILTER (
                WHERE ps.saldo > 0
                  AND ps.estoque_minimo > 0
                  AND ps.saldo <= (ps.estoque_minimo * 0.5)
            ) AS critico,
            COUNT(*) FILTER (WHERE ps.saldo <= 0) AS sem_estoque,
            COUNT(*) FILTER (WHERE ps.custo_efetivo = 0) AS sem_custo
        FROM produto_saldos ps
    ),
    -- Movimentações recentes
    recent_mov AS (
        SELECT jsonb_agg(sub.row_data ORDER BY sub.rn) AS data
        FROM (
            SELECT
                ROW_NUMBER() OVER (ORDER BY m.created_at DESC) AS rn,
                jsonb_build_object(
                    'id', m.id,
                    'data', m.created_at,
                    'produto', p.nome_produto,
                    'tipo', m.tipo,
                    'quantidade', m.quantidade,
                    'custo_unitario', m.custo_unitario,
                    'unidade', p.unidade_medida,
                    'usuario', pr.nome
                ) AS row_data
            FROM public.movimentacoes_estoque m
            JOIN public.produtos p ON p.id = m.produto_id
            LEFT JOIN public.profiles pr ON pr.id = m.created_by
            WHERE m.company_id = v_company AND m.status = 'ATIVO'
              AND m.created_at >= v_cutoff
            ORDER BY m.created_at DESC
            LIMIT 10
        ) sub
    ),
    -- Totais
    totals AS (
        SELECT
            ROUND(SUM(ps.saldo * ps.custo_efetivo)::numeric, 2) AS valor_total,
            COUNT(*)::int AS total_produtos,
            COUNT(*) FILTER (WHERE ps.saldo > 0)::int AS produtos_com_saldo
        FROM produto_saldos ps
    )
    SELECT jsonb_build_object(
        'valor_total', COALESCE(t.valor_total, 0),
        'total_produtos', t.total_produtos,
        'produtos_com_saldo', t.produtos_com_saldo,
        'ok', sc.ok,
        'atencao', sc.atencao,
        'critico', sc.critico,
        'sem_estoque', sc.sem_estoque,
        'sem_custo', sc.sem_custo,
        'categorias', COALESCE(cd.data, '[]'::jsonb),
        'movimentacoes', COALESCE(rm.data, '[]'::jsonb)
    ) INTO v_result
    FROM totals t, status_counts sc, cat_dist cd, recent_mov rm;

    RETURN v_result;
END;
$function$;
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_losses_report(p_start_date date DEFAULT ((now() - '30 days'::interval))::date, p_end_date date DEFAULT (now())::date, p_category text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_loss_type text DEFAULT NULL::text, p_order_by text DEFAULT 'quantity'::text, p_group_by text DEFAULT 'daily'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
    v_result jsonb;
    v_days integer;
    -- Refinement: Removed 'baixa' from loss keywords as it incorrectly captures normal stock exits
    v_loss_keywords text[] := ARRAY['perda','descarte','vencimento','avaria','quebra','desperdicio','desperdício','dano','danificad','estrago','validade'];
BEGIN
    v_company := public.assert_tenant();
    v_days := GREATEST((p_end_date - p_start_date + 1), 1);

    WITH loss_mov AS (
        SELECT
            m.id,
            m.produto_id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.ativo AS produto_ativo,
            m.quantidade,
            m.custo_unitario,
            m.custo_total,
            m.observacao,
            m.created_at,
            m.created_at::date AS mov_date,
            CASE
                WHEN lower(m.observacao) ~ 'venciment|validade' THEN 'Vencimento'
                WHEN lower(m.observacao) ~ 'descart' THEN 'Descarte'
                WHEN lower(m.observacao) ~ 'avaria|dano|danificad' THEN 'Avaria'
                WHEN lower(m.observacao) ~ 'quebra' THEN 'Quebra'
                WHEN lower(m.observacao) ~ 'desperdic' THEN 'Desperdício'
                WHEN lower(m.observacao) ~ 'perd' THEN 'Perda'
                ELSE 'Baixa/Saída'
            END AS tipo_perda
        FROM public.movimentacoes_estoque m
        JOIN public.produtos p ON p.id = m.produto_id AND p.company_id = v_company
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('SAIDA_ESTORNO', 'ENTRADA_ESTORNO')
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
          AND (p_product_id IS NULL OR m.produto_id = p_product_id)
          AND (p_category IS NULL OR p.categoria = p_category)
          AND (
            p_loss_type IS NULL
            OR (p_loss_type = 'all_losses' AND EXISTS (
                SELECT 1 FROM unnest(v_loss_keywords) kw WHERE lower(m.observacao) LIKE '%' || kw || '%'
            ))
            OR (p_loss_type IS NOT NULL AND p_loss_type != 'all_losses' AND lower(m.observacao) LIKE '%' || lower(p_loss_type) || '%')
          )
    ),
    timeline AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'period', sub.period,
            'total_qty', sub.total_qty,
            'total_cost', sub.total_cost
        ) ORDER BY sub.period), '[]'::jsonb) AS data
        FROM (
            SELECT
                CASE p_group_by
                    WHEN 'weekly' THEN date_trunc('week', lm.mov_date)::date
                    WHEN 'monthly' THEN date_trunc('month', lm.mov_date)::date
                    ELSE lm.mov_date
                END AS period,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS total_qty,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS total_cost
            FROM loss_mov lm
            GROUP BY 1
            ORDER BY 1
        ) sub
    ),
    prod_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', sub.produto_id,
            'nome_produto', sub.nome_produto,
            'categoria', sub.categoria,
            'unidade_medida', sub.unidade_medida,
            'produto_ativo', sub.produto_ativo,
            'quantidade_perdida', sub.quantidade_perdida,
            'valor_perdido', sub.valor_perdido,
            'total_registros', sub.total_registros,
            'ultimo_registro', sub.ultimo_registro,
            'sem_custo', sub.sem_custo,
            'tipos_perda', sub.tipos_perda
        ) ORDER BY
            CASE WHEN p_order_by = 'cost' THEN sub.valor_perdido ELSE sub.quantidade_perdida END DESC
        ), '[]'::jsonb) AS data
        FROM (
            SELECT
                lm.produto_id,
                lm.nome_produto,
                lm.categoria,
                lm.unidade_medida,
                bool_and(lm.produto_ativo) AS produto_ativo,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade_perdida,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor_perdido,
                COUNT(*)::int AS total_registros,
                MAX(lm.created_at) AS ultimo_registro,
                bool_or(lm.custo_unitario = 0 OR lm.custo_unitario IS NULL) AS sem_custo,
                array_agg(DISTINCT lm.tipo_perda) AS tipos_perda
            FROM loss_mov lm
            GROUP BY lm.produto_id, lm.nome_produto, lm.categoria, lm.unidade_medida
        ) sub
    ),
    cat_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', sub.categoria,
            'quantidade_perdida', sub.quantidade_perdida,
            'valor_perdido', sub.valor_perdido,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.valor_perdido DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(lm.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade_perdida,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor_perdido,
                COUNT(DISTINCT lm.produto_id)::int AS qtd_itens
            FROM loss_mov lm
            GROUP BY 1
        ) sub
    ),
    type_breakdown AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'tipo', sub.tipo_perda,
            'quantidade', sub.quantidade,
            'valor', sub.valor,
            'registros', sub.registros
        ) ORDER BY sub.valor DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                lm.tipo_perda,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor,
                COUNT(*)::int AS registros
            FROM loss_mov lm
            GROUP BY lm.tipo_perda
        ) sub
    ),
    top10 AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'nome_produto', sub.nome_produto,
            'quantidade_perdida', sub.quantidade_perdida,
            'valor_perdido', sub.valor_perdido,
            'unidade_medida', sub.unidade_medida
        ) ORDER BY
            CASE WHEN p_order_by = 'cost' THEN sub.valor_perdido ELSE sub.quantidade_perdida END DESC
        ), '[]'::jsonb) AS data
        FROM (
            SELECT
                lm.nome_produto,
                lm.unidade_medida,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade_perdida,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor_perdido
            FROM loss_mov lm
            GROUP BY lm.nome_produto, lm.unidade_medida
            ORDER BY CASE WHEN p_order_by = 'cost' THEN SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario)) ELSE SUM(lm.quantidade) END DESC
            LIMIT 10
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(lm.quantidade), 0)::numeric, 4) AS quantidade_total,
            ROUND(COALESCE(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario)), 0)::numeric, 2) AS valor_total,
            COUNT(DISTINCT lm.produto_id)::int AS itens_distintos,
            COUNT(*)::int AS total_registros,
            COUNT(*) FILTER (WHERE lm.custo_unitario = 0 OR lm.custo_unitario IS NULL)::int AS registros_sem_custo
        FROM loss_mov lm
    )
    SELECT jsonb_build_object(
        'quantidade_total', t.quantidade_total,
        'valor_total', t.valor_total,
        'itens_distintos', t.itens_distintos,
        'total_registros', t.total_registros,
        'registros_sem_custo', t.registros_sem_custo,
        'dias_periodo', v_days,
        'timeline', tl.data,
        'produtos', ps.data,
        'categorias', cs.data,
        'tipos_perda', tb.data,
        'top10', t10.data
    ) INTO v_result
    FROM totals t, timeline tl, prod_summary ps, cat_summary cs, type_breakdown tb, top10 t10;

    RETURN v_result;
END;
$function$;
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_predictive_analysis_v2(p_category_id text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_target_coverage_days integer DEFAULT 7, p_only_critical boolean DEFAULT false, p_use_weekday_pattern boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
  v_today_dow int;
  v_dow_names text[] := ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
BEGIN
  v_company_id := public.assert_tenant();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant inválido';
  END IF;
  PERFORM assert_tenant();
  v_today_dow := EXTRACT(DOW FROM current_date)::int;

  WITH active_products AS (
    SELECT
      p.id,
      p.nome_produto,
      p.categoria,
      p.unidade_medida,
      CASE
        WHEN p.unidade_compra IS NOT NULL
         AND p.unidade_compra <> p.unidade_medida
         AND COALESCE(p.fator_conversao_padrao, 0) > 0
        THEN p.unidade_compra
        ELSE p.unidade_medida
      END AS unidade_exibicao,
      CASE
        WHEN p.unidade_compra IS NOT NULL
         AND p.unidade_compra <> p.unidade_medida
         AND COALESCE(p.fator_conversao_padrao, 0) > 0
        THEN p.fator_conversao_padrao
        ELSE 1.0
      END AS fator_exibicao,
      COALESCE(p.custo_medio_30d, p.custo_ultima_compra, p.custo_padrao, 0) AS custo_unitario,
      COALESCE(p.saldo_atual, 0) AS saldo_atual
    FROM produtos p
    WHERE p.company_id = v_company_id AND p.ativo = true
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND (p_category_id IS NULL OR p.categoria = p_category_id)
  ),
  daily_consumption AS (
    SELECT m.produto_id, m.data AS dia,
           EXTRACT(DOW FROM m.data)::int AS dow,
           SUM(m.quantidade) AS consumo
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id AND m.status = 'ATIVO'
      AND m.direction = 'OUT'
      AND m.tipo IN ('SAIDA', 'BAIXA_PERDA', 'SAIDA_TRANSFERENCIA')
      AND m.data >= (current_date - interval '60 days')
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id, m.data
  ),
  dow_avg AS (
    SELECT dc.produto_id, dc.dow, AVG(dc.consumo) AS media_dow, COUNT(*) AS ocorrencias
    FROM daily_consumption dc GROUP BY dc.produto_id, dc.dow
  ),
  avg_7d AS (
    SELECT dc.produto_id, SUM(dc.consumo) / 7.0 AS media_diaria_7d, COUNT(DISTINCT dc.dia) AS dias_com_consumo_7d
    FROM daily_consumption dc WHERE dc.dia >= (current_date - interval '7 days') GROUP BY dc.produto_id
  ),
  avg_30d AS (
    SELECT dc.produto_id, SUM(dc.consumo) / 30.0 AS media_diaria_30d, COUNT(DISTINCT dc.dia) AS dias_com_consumo_30d
    FROM daily_consumption dc WHERE dc.dia >= (current_date - interval '30 days') GROUP BY dc.produto_id
  ),
  weekday_profile AS (
    SELECT da.produto_id,
           jsonb_object_agg(da.dow::text, jsonb_build_object('media', ROUND(da.media_dow::numeric, 2), 'n', da.ocorrencias)) AS perfil_dow,
           SUM(da.ocorrencias) AS total_ocorrencias,
           COUNT(DISTINCT da.dow) AS dow_count
    FROM dow_avg da GROUP BY da.produto_id
  ),
  analise AS (
    SELECT ap.id AS produto_id, ap.nome_produto, ap.categoria,
      ap.unidade_medida, ap.unidade_exibicao, ap.fator_exibicao,
      ap.custo_unitario,
      ap.saldo_atual,
      COALESCE(a7.media_diaria_7d, 0) AS media_diaria_7d,
      COALESCE(a7.dias_com_consumo_7d, 0) AS dias_com_consumo_7d,
      COALESCE(a30.media_diaria_30d, 0) AS media_diaria_30d,
      COALESCE(a30.dias_com_consumo_30d, 0) AS dias_com_consumo_30d,
      COALESCE(wp.perfil_dow, '{}'::jsonb) AS perfil_dow,
      COALESCE(wp.total_ocorrencias, 0) AS total_ocorrencias,
      COALESCE(wp.dow_count, 0) AS dow_count,
      (COALESCE(wp.total_ocorrencias, 0) >= 14 AND COALESCE(wp.dow_count, 0) >= 4) AS has_seasonality
    FROM active_products ap
    LEFT JOIN avg_7d a7 ON a7.produto_id = ap.id
    LEFT JOIN avg_30d a30 ON a30.produto_id = ap.id
    LEFT JOIN weekday_profile wp ON wp.produto_id = ap.id
  ),
  forecast_days AS (
    SELECT a.produto_id, d.offset_day,
      ((v_today_dow + d.offset_day) % 7) AS future_dow,
      COALESCE((a.perfil_dow -> (((v_today_dow + d.offset_day) % 7)::text) ->> 'media')::numeric, 0) AS dow_media,
      CASE
        WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7 + a.media_diaria_30d * 0.3)
        WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d
        WHEN a.media_diaria_30d > 0 THEN a.media_diaria_30d
        ELSE 0
      END AS media_recente,
      a.has_seasonality
    FROM analise a
    CROSS JOIN generate_series(1, GREATEST(p_target_coverage_days, 7)) AS d(offset_day)
  ),
  forecast_computed AS (
    SELECT fd.produto_id, fd.offset_day, fd.future_dow,
      CASE
        WHEN p_use_weekday_pattern AND fd.has_seasonality AND fd.dow_media > 0 THEN
          ROUND((fd.media_recente * 0.4 + fd.dow_media * 0.6)::numeric, 3)
        ELSE ROUND(fd.media_recente::numeric, 3)
      END AS previsao_dia
    FROM forecast_days fd
  ),
  forecast_agg AS (
    SELECT fc.produto_id,
      MAX(CASE WHEN fc.offset_day = 1 THEN fc.previsao_dia END) AS previsao_amanha,
      SUM(CASE WHEN fc.offset_day <= 7 THEN fc.previsao_dia ELSE 0 END) AS previsao_7d,
      SUM(fc.previsao_dia) AS previsao_n_dias
    FROM forecast_computed fc GROUP BY fc.produto_id
  ),
  rupture_calc AS (
    SELECT fc.produto_id,
      MIN(fc.offset_day) FILTER (
        WHERE (SELECT SUM(fc2.previsao_dia) FROM forecast_computed fc2 WHERE fc2.produto_id = fc.produto_id AND fc2.offset_day <= fc.offset_day) >= a.saldo_atual AND a.saldo_atual > 0
      ) AS ruptura_em_dias,
      (SELECT fc3.offset_day FROM forecast_computed fc3 WHERE fc3.produto_id = fc.produto_id AND fc3.offset_day <= 7 ORDER BY fc3.previsao_dia DESC LIMIT 1) AS dia_pico_offset,
      (SELECT fc3.future_dow FROM forecast_computed fc3 WHERE fc3.produto_id = fc.produto_id AND fc3.offset_day <= 7 ORDER BY fc3.previsao_dia DESC LIMIT 1) AS dia_pico_dow
    FROM forecast_computed fc
    JOIN analise a ON a.produto_id = fc.produto_id
    WHERE fc.offset_day <= GREATEST(p_target_coverage_days, 14)
    GROUP BY fc.produto_id, a.saldo_atual
  ),
  forecast_series AS (
    SELECT fc.produto_id,
      jsonb_agg(jsonb_build_object('day', fc.offset_day, 'dow', fc.future_dow, 'dow_label', v_dow_names[(fc.future_dow) + 1], 'previsao', fc.previsao_dia) ORDER BY fc.offset_day) FILTER (WHERE fc.offset_day <= 7) AS serie_7d
    FROM forecast_computed fc GROUP BY fc.produto_id
  ),
  resultado AS (
    SELECT a.*,
      COALESCE(fa.previsao_amanha, 0) AS previsao_amanha,
      COALESCE(fa.previsao_7d, 0) AS previsao_7d,
      COALESCE(fa.previsao_n_dias, 0) AS previsao_n_dias,
      rc.ruptura_em_dias,
      CASE WHEN rc.ruptura_em_dias IS NOT NULL THEN (current_date + rc.ruptura_em_dias)::text ELSE NULL END AS ruptura_data,
      COALESCE(v_dow_names[(rc.dia_pico_dow) + 1], '') AS dia_critico,
      rc.dia_pico_dow,
      COALESCE(fs.serie_7d, '[]'::jsonb) AS serie_7d,
      CASE
        WHEN p_use_weekday_pattern AND a.has_seasonality AND (a.perfil_dow -> (v_today_dow::text) ->> 'media') IS NOT NULL THEN
          ROUND((CASE WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7 + a.media_diaria_30d * 0.3)
                      WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d ELSE a.media_diaria_30d END * 0.4 +
                 (a.perfil_dow -> (v_today_dow::text) ->> 'media')::numeric * 0.6)::numeric, 3)
        ELSE ROUND(CASE WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7 + a.media_diaria_30d * 0.3)
                        WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d ELSE a.media_diaria_30d END::numeric, 3)
      END AS consumo_previsto_diario,
      CASE
        WHEN a.media_diaria_7d = 0 AND a.media_diaria_30d = 0 THEN 'sem_dados'
        WHEN a.media_diaria_30d = 0 THEN 'subindo'
        WHEN a.media_diaria_7d > a.media_diaria_30d * 1.15 THEN 'subindo'
        WHEN a.media_diaria_7d < a.media_diaria_30d * 0.85 THEN 'caindo'
        ELSE 'estavel'
      END AS tendencia,
      CASE
        WHEN p_use_weekday_pattern AND a.has_seasonality THEN '40% média recente + 60% padrão ' || v_dow_names[(v_today_dow) + 1]
        ELSE '70% últimos 7d + 30% últimos 30d'
      END AS explicacao_previsao
    FROM analise a
    LEFT JOIN forecast_agg fa ON fa.produto_id = a.produto_id
    LEFT JOIN rupture_calc rc ON rc.produto_id = a.produto_id
    LEFT JOIN forecast_series fs ON fs.produto_id = a.produto_id
  ),
  final_calc AS (
    SELECT r.*,
      CASE WHEN r.consumo_previsto_diario > 0 THEN ROUND((r.saldo_atual / r.consumo_previsto_diario)::numeric, 1) ELSE 999 END AS cobertura_dias,
      CASE
        WHEN r.consumo_previsto_diario = 0 THEN 'sem_consumo'
        WHEN r.ruptura_em_dias IS NOT NULL AND r.ruptura_em_dias <= 1 THEN 'ruptura_iminente'
        WHEN r.ruptura_em_dias IS NOT NULL AND r.ruptura_em_dias <= 3 THEN 'critico'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 7 THEN 'atencao'
        ELSE 'sem_risco'
      END AS status_risco,
      -- GREATEST(0, saldo_atual) como defesa em profundidade: saldo negativo nunca
      -- deve reduzir a diferença abaixo de previsao_n_dias ao ser subtraído.
      GREATEST(0, ROUND((r.previsao_n_dias - GREATEST(0, r.saldo_atual))::numeric, 3)) AS sugestao_compra_base,
      GREATEST(0, ROUND(((r.previsao_n_dias - GREATEST(0, r.saldo_atual)) * r.custo_unitario)::numeric, 2)) AS custo_estimado_compra
    FROM resultado r
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', f.produto_id,
        'nome_produto', f.nome_produto,
        'categoria', f.categoria,
        'unidade_medida', f.unidade_exibicao,
        'custo_unitario', f.custo_unitario,
        'saldo_atual',             ROUND((f.saldo_atual             / f.fator_exibicao)::numeric, 4),
        'media_diaria_7d',         ROUND((f.media_diaria_7d         / f.fator_exibicao)::numeric, 4),
        'media_diaria_30d',        ROUND((f.media_diaria_30d        / f.fator_exibicao)::numeric, 4),
        'consumo_previsto_diario', ROUND((f.consumo_previsto_diario / f.fator_exibicao)::numeric, 4),
        'previsao_amanha',         ROUND((f.previsao_amanha         / f.fator_exibicao)::numeric, 4),
        'previsao_7d',             ROUND((f.previsao_7d             / f.fator_exibicao)::numeric, 4),
        'sugestao_compra',         ROUND((f.sugestao_compra_base    / f.fator_exibicao)::numeric, 4),
        'custo_estimado_compra',   f.custo_estimado_compra,
        'cobertura_dias',   LEAST(f.cobertura_dias, 999),
        'tendencia',        f.tendencia,
        'status_risco',     f.status_risco,
        'ruptura_em_dias',  f.ruptura_em_dias,
        'ruptura_data',     f.ruptura_data,
        'dia_critico',      f.dia_critico,
        'has_seasonality',  f.has_seasonality,
        'explicacao',       f.explicacao_previsao,
        'serie_7d', CASE
          WHEN f.fator_exibicao = 1.0 THEN f.serie_7d
          ELSE (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'day',       (el->>'day')::int,
                'dow',       (el->>'dow')::int,
                'dow_label', el->>'dow_label',
                'previsao',  ROUND(((el->>'previsao')::numeric / f.fator_exibicao)::numeric, 3)
              ) ORDER BY (el->>'day')::int
            ), '[]'::jsonb)
            FROM jsonb_array_elements(f.serie_7d) AS el
          )
        END,
        'perfil_dow', CASE
          WHEN f.fator_exibicao = 1.0 THEN f.perfil_dow
          ELSE (
            SELECT COALESCE(jsonb_object_agg(
              kv.dow_key,
              jsonb_build_object(
                'media', ROUND(((kv.dow_val->>'media')::numeric / f.fator_exibicao)::numeric, 3),
                'n',     (kv.dow_val->>'n')::int
              )
            ), '{}'::jsonb)
            FROM jsonb_each(f.perfil_dow) AS kv(dow_key, dow_val)
          )
        END
      ) ORDER BY
        CASE f.status_risco WHEN 'ruptura_iminente' THEN 1 WHEN 'critico' THEN 2 WHEN 'atencao' THEN 3 WHEN 'sem_risco' THEN 4 ELSE 5 END,
        f.cobertura_dias ASC
      )
      FROM final_calc f
      WHERE (NOT p_only_critical OR f.status_risco IN ('ruptura_iminente', 'critico', 'atencao'))
    ), '[]'::jsonb),
    'kpis', (
      SELECT jsonb_build_object(
        'total_itens', COUNT(*),
        'ruptura_iminente', COUNT(*) FILTER (WHERE f.status_risco = 'ruptura_iminente'),
        'critico', COUNT(*) FILTER (WHERE f.status_risco = 'critico'),
        'atencao', COUNT(*) FILTER (WHERE f.status_risco = 'atencao'),
        'sem_risco', COUNT(*) FILTER (WHERE f.status_risco = 'sem_risco'),
        'sem_consumo', COUNT(*) FILTER (WHERE f.status_risco = 'sem_consumo'),
        'tendencia_subindo', COUNT(*) FILTER (WHERE f.tendencia = 'subindo'),
        'valor_compras_sugeridas', ROUND(COALESCE(SUM(f.custo_estimado_compra), 0)::numeric, 2),
        'itens_cobertura_abaixo_3d', COUNT(*) FILTER (WHERE f.cobertura_dias < 3 AND f.consumo_previsto_diario > 0),
        'ruptura_3d', COUNT(*) FILTER (WHERE f.ruptura_em_dias IS NOT NULL AND f.ruptura_em_dias <= 3),
        'pico_fds', COUNT(*) FILTER (WHERE f.dia_pico_dow IN (0, 5, 6)),
        'com_sazonalidade', COUNT(*) FILTER (WHERE f.has_seasonality)
      )
      FROM final_calc f
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_top_consumed(p_start_date date, p_end_date date, p_rank_by text DEFAULT 'quantity'::text, p_limit integer DEFAULT 20, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
    v_result jsonb;
    v_days integer;
BEGIN
    v_company := public.assert_tenant();
    v_days := GREATEST((p_end_date - p_start_date + 1), 1);

    WITH saldos AS (
        SELECT
            m.produto_id,
            SUM(
              CASE
                WHEN m.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0
                WHEN m.direction = 'IN' THEN m.quantidade
                ELSE -m.quantidade
              END
            ) AS saldo
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
        GROUP BY m.produto_id
    ),
    consumo AS (
        SELECT
            m.produto_id,
            -- agregação em base; conversão para unidade de compra ocorre em full_ranked
            ROUND(SUM(m.quantidade)::numeric, 4) AS consumo_total,
            ROUND(SUM(m.quantidade * m.custo_unitario)::numeric, 2) AS custo_total,
            COUNT(*)::int AS total_saidas,
            MAX(m.created_at) AS ultima_saida
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
        GROUP BY m.produto_id
    ),
    -- Full dataset (no LIMIT) for category summary
    full_ranked AS (
        SELECT
            p.id AS produto_id,
            p.nome_produto,
            p.categoria,

            -- Unidade de exibição: unidade_compra quando dual-unit válido, senão unidade_medida.
            -- Mantém nome de coluna "unidade_medida" para compatibilidade com o front sem breaking change.
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN p.unidade_compra
                ELSE p.unidade_medida
            END AS unidade_medida,

            -- Estoque mínimo convertido (base armazenada → compra para display)
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(p.estoque_minimo, 0) / p.fator_conversao_padrao)::numeric, 4)
                ELSE COALESCE(p.estoque_minimo, 0)
            END AS estoque_minimo,

            -- Saldo convertido para unidade de compra
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(s.saldo, 0) / p.fator_conversao_padrao)::numeric, 4)
                ELSE COALESCE(s.saldo, 0)
            END AS saldo_atual,

            -- Consumo convertido para unidade de compra
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(c.consumo_total, 0) / p.fator_conversao_padrao)::numeric, 4)
                ELSE COALESCE(c.consumo_total, 0)
            END AS consumo_total,

            COALESCE(c.custo_total, 0) AS custo_total,  -- R$: não converte
            COALESCE(c.total_saidas, 0) AS total_saidas,
            c.ultima_saida,

            -- Média diária convertida (consumo convertido / dias)
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(c.consumo_total, 0) / p.fator_conversao_padrao / v_days)::numeric, 4)
                ELSE ROUND((COALESCE(c.consumo_total, 0) / v_days)::numeric, 4)
            END AS media_diaria,

            -- Cobertura em dias: invariante sob conversão (saldo/fator ÷ consumo/fator/v_days = saldo*v_days/consumo).
            -- Calculado em base para simplicidade.
            CASE
                WHEN COALESCE(c.consumo_total, 0) > 0 AND COALESCE(s.saldo, 0) > 0
                THEN ROUND((COALESCE(s.saldo, 0) / (COALESCE(c.consumo_total, 0) / v_days))::numeric, 1)
                ELSE NULL
            END AS cobertura_dias,

            -- Status de estoque avaliado em base para preservar thresholds originais
            CASE
                WHEN COALESCE(s.saldo, 0) <= 0 THEN 'sem_estoque'
                WHEN p.estoque_minimo > 0 AND COALESCE(s.saldo, 0) <= (p.estoque_minimo * 0.5) THEN 'critico'
                WHEN p.estoque_minimo > 0 AND COALESCE(s.saldo, 0) <= p.estoque_minimo THEN 'atencao'
                ELSE 'ok'
            END AS status_estoque,

            CASE
                WHEN COALESCE(
                    NULLIF(p.avg30_cost_base_unit, 0),
                    NULLIF(p.last_cost_base_unit, 0),
                    NULLIF(p.default_cost_base_unit, 0), 0
                ) = 0 THEN true ELSE false
            END AS sem_custo
        FROM consumo c
        JOIN public.produtos p ON p.id = c.produto_id AND p.company_id = v_company AND p.ativo = true
        LEFT JOIN saldos s ON s.produto_id = p.id
        WHERE (p_category IS NULL OR p.categoria = p_category)
    ),
    ranked AS (
        SELECT *
        FROM full_ranked
        ORDER BY
            CASE WHEN p_rank_by = 'cost' THEN custo_total ELSE consumo_total END DESC NULLS LAST
        LIMIT p_limit
    ),
    items_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', r.produto_id,
            'nome_produto', r.nome_produto,
            'categoria', r.categoria,
            'unidade_medida', r.unidade_medida,
            'consumo_total', r.consumo_total,
            'custo_total', r.custo_total,
            'media_diaria', r.media_diaria,
            'saldo_atual', r.saldo_atual,
            'estoque_minimo', r.estoque_minimo,
            'cobertura_dias', r.cobertura_dias,
            'status_estoque', r.status_estoque,
            'sem_custo', r.sem_custo,
            'total_saidas', r.total_saidas,
            'ultima_saida', r.ultima_saida
        )), '[]'::jsonb) AS data
        FROM ranked r
    ),
    alertas AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', r.produto_id,
            'nome_produto', r.nome_produto,
            'status_estoque', r.status_estoque,
            'sem_custo', r.sem_custo,
            'consumo_total', r.consumo_total,
            'saldo_atual', r.saldo_atual,
            'cobertura_dias', r.cobertura_dias,
            'unidade_medida', r.unidade_medida
        )), '[]'::jsonb) AS data
        FROM ranked r
        WHERE r.status_estoque IN ('critico', 'sem_estoque', 'atencao') OR r.sem_custo = true
    ),
    -- Category summary from FULL dataset (not limited)
    cat_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', sub.categoria,
            'consumo_total', sub.consumo_total,
            'custo_total', sub.custo_total,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.consumo_total DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(r.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(r.consumo_total)::numeric, 4) AS consumo_total,
                ROUND(SUM(r.custo_total)::numeric, 2) AS custo_total,
                COUNT(*)::int AS qtd_itens
            FROM full_ranked r
            GROUP BY 1
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(r.consumo_total), 0)::numeric, 4) AS consumo_total,
            ROUND(COALESCE(SUM(r.custo_total), 0)::numeric, 2) AS custo_total,
            COUNT(CASE WHEN r.status_estoque IN ('critico','sem_estoque') THEN 1 END)::int AS itens_criticos,
            COUNT(CASE WHEN r.sem_custo THEN 1 END)::int AS itens_sem_custo
        FROM full_ranked r
    )
    SELECT jsonb_build_object(
        'items', ij.data,
        'alertas', al.data,
        'categorias', cs.data,
        'consumo_total', t.consumo_total,
        'custo_total', t.custo_total,
        'itens_criticos', t.itens_criticos,
        'itens_sem_custo', t.itens_sem_custo,
        'dias_periodo', v_days
    ) INTO v_result
    FROM items_json ij, alertas al, cat_summary cs, totals t;

    RETURN v_result;
END;
$function$;
-- ACL {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
$function$;
