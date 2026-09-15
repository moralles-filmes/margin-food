-- Evidência, NÃO executar como rollback. Espaços finais normalizados para revisão; hashes exatos no preflight.
CREATE OR REPLACE FUNCTION public._planning_spend_summary_inner(p_company_id uuid, p_year integer, p_month integer, p_source text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_date date;
  v_end_date date;
  v_metas jsonb;
  v_realizado jsonb;
  v_realizado_total numeric;
  v_comparativo jsonb;
  v_weekly jsonb;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (date_trunc('month', v_start_date) + interval '1 month' - interval '1 day')::date;

  -- Metas do mês (TENANT SCOPED)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pm.id,
    'categoria', pm.categoria,
    'target_value', pm.target_value,
    'alerta_amarelo_percent', pm.alerta_amarelo_percent,
    'alerta_vermelho_percent', pm.alerta_vermelho_percent
  )), '[]'::jsonb)
  INTO v_metas
  FROM planning_metas_compra pm
  WHERE pm.company_id = p_company_id
    AND pm.year = p_year AND pm.month = p_month AND pm.ativo = true;

  -- Realizado por categoria (TENANT SCOPED via purchase_orders.company_id)
  WITH received_items AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS item_value,
      (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date AS received_date
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE po.company_id = p_company_id
      AND (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
  ),
  cat_totals AS (
    SELECT cat, ROUND(SUM(item_value)::numeric, 2) AS spent_value
    FROM received_items
    GROUP BY cat
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'spent_value', spent_value)), '[]'::jsonb),
    COALESCE(SUM(spent_value), 0)
  INTO v_realizado, v_realizado_total
  FROM cat_totals
  WHERE (p_categoria IS NULL OR cat = p_categoria);

  -- Weekly breakdown W1-W5 (TENANT SCOPED + TZ corrected)
  WITH received_items AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS item_value,
      EXTRACT(DAY FROM (poi.received_at AT TIME ZONE 'America/Sao_Paulo'))::int AS day_num
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE po.company_id = p_company_id
      AND (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
      AND (p_categoria IS NULL OR COALESCE(prod.categoria, 'Sem Categoria') = p_categoria)
  ),
  weekly AS (
    SELECT
      CASE
        WHEN day_num <= 7 THEN 'W1'
        WHEN day_num <= 14 THEN 'W2'
        WHEN day_num <= 21 THEN 'W3'
        WHEN day_num <= 28 THEN 'W4'
        ELSE 'W5'
      END AS week_label,
      ROUND(SUM(item_value)::numeric, 2) AS total
    FROM received_items
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_object_agg(week_label, total), '{}'::jsonb)
  INTO v_weekly
  FROM weekly;

  -- Comparativo metas vs realizado (TENANT SCOPED)
  WITH all_cats AS (
    SELECT categoria AS cat, target_value, alerta_amarelo_percent, alerta_vermelho_percent
    FROM planning_metas_compra
    WHERE company_id = p_company_id
      AND year = p_year AND month = p_month AND ativo = true
  ),
  cat_spent AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      ROUND(SUM(poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value))::numeric, 2) AS spent
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE po.company_id = p_company_id
      AND (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0 AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'categoria', COALESCE(ac.cat, cs.cat),
    'target_value', COALESCE(ac.target_value, 0),
    'spent_value', COALESCE(cs.spent, 0),
    'delta_value', COALESCE(ac.target_value, 0) - COALESCE(cs.spent, 0),
    'percent_of_target', CASE
      WHEN COALESCE(ac.target_value, 0) > 0
      THEN ROUND((COALESCE(cs.spent, 0) / ac.target_value * 100)::numeric, 2)
      ELSE 0 END
  )), '[]'::jsonb)
  INTO v_comparativo
  FROM all_cats ac
  FULL OUTER JOIN cat_spent cs ON ac.cat = cs.cat
  WHERE (p_categoria IS NULL OR COALESCE(ac.cat, cs.cat) = p_categoria);

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', p_year, 'month', p_month, 'start_date', v_start_date, 'end_date', v_end_date),
    'metas', v_metas,
    'realizado_por_categoria', v_realizado,
    'realizado_total', COALESCE(v_realizado_total, 0),
    'weekly_breakdown', v_weekly,
    'comparativo', v_comparativo,
    'computed_at', now()
  );
END;
$function$

-- ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_checkup_suite()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_company uuid;
  v_sections jsonb := '{}'::jsonb;
  v_status text;
  v_details jsonb;
  v_profile_company uuid;
  v_current_company uuid;
  v_tables text[] := ARRAY['produtos','suppliers','movimentacoes_estoque','purchase_orders','purchase_order_items','salmon_entries','fin_lancamentos'];
  v_tbl text;
  v_rls_items jsonb := '[]'::jsonb;
  v_rls_ok boolean := true;
  v_rel_row boolean;
  v_rel_force boolean;
  v_pol_items jsonb := '[]'::jsonb;
  v_pol_ok boolean := true;
  v_mov_count bigint;
  v_start date := current_date - 7;
  v_end date := current_date;
  v_rpc_items jsonb := '[]'::jsonb;
  v_rpc_ok boolean := true;
  v_dummy record;
BEGIN
  v_actor := auth.uid();
  IF NOT public.has_permission(v_actor, 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  v_company := public.assert_tenant();

  -- A) tenant_identity
  SELECT company_id INTO v_profile_company FROM public.profiles WHERE id = v_actor;
  BEGIN
    SELECT public.get_current_company_id() INTO v_current_company;
  EXCEPTION WHEN OTHERS THEN
    v_current_company := NULL;
  END;
  IF v_profile_company IS NULL OR v_current_company IS NULL OR v_profile_company <> v_current_company THEN
    v_status := 'FAIL';
  ELSE
    v_status := 'PASS';
  END IF;
  v_sections := v_sections || jsonb_build_object('tenant_identity', jsonb_build_object(
    'status', v_status,
    'details', jsonb_build_object('profile_company_id', v_profile_company, 'get_current_company_id', v_current_company)
  ));

  -- B) company_id_integrity
  DECLARE v_comp_exists boolean;
  BEGIN
    SELECT EXISTS(SELECT 1 FROM public.companies WHERE id = v_company) INTO v_comp_exists;
    v_status := CASE WHEN v_comp_exists THEN 'PASS' ELSE 'FAIL' END;
    v_details := jsonb_build_object('note', 'enforced by FK + trg_block_placeholder_company', 'company_exists', v_comp_exists);
    v_sections := v_sections || jsonb_build_object('company_id_integrity', jsonb_build_object('status', v_status, 'details', v_details));
  END;

  -- C) rls_force_rls
  FOR v_tbl IN SELECT unnest(v_tables) LOOP
    BEGIN
      SELECT relrowsecurity, relforcerowsecurity INTO v_rel_row, v_rel_force
      FROM pg_class WHERE relname = v_tbl AND relnamespace = 'public'::regnamespace;
      IF NOT FOUND THEN
        v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'SKIP', 'note', 'table not found');
      ELSIF NOT v_rel_row OR NOT v_rel_force THEN
        v_rls_ok := false;
        v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'FAIL', 'rls_enabled', v_rel_row, 'force_rls', v_rel_force);
      ELSE
        v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'PASS');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'FAIL', 'error', SQLERRM);
      v_rls_ok := false;
    END;
  END LOOP;
  v_sections := v_sections || jsonb_build_object('rls_force_rls', jsonb_build_object(
    'status', CASE WHEN v_rls_ok THEN 'PASS' ELSE 'FAIL' END, 'details', jsonb_build_object('tables', v_rls_items)
  ));

  -- D) policy_safety_scan
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'qual_preview', LEFT(qual::text, 120)))
    INTO v_details FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(v_tables) AND cmd = 'SELECT'
      AND (qual::text = 'true' OR qual::text NOT ILIKE '%company_id%');
    IF v_details IS NOT NULL AND jsonb_array_length(v_details) > 0 THEN
      v_pol_ok := false; v_pol_items := v_details;
    ELSE
      v_pol_items := '[]'::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pol_ok := false; v_pol_items := jsonb_build_object('error', SQLERRM);
  END;
  v_sections := v_sections || jsonb_build_object('policy_safety_scan', jsonb_build_object(
    'status', CASE WHEN v_pol_ok THEN 'PASS' ELSE 'FAIL' END, 'details', jsonb_build_object('suspicious_policies', v_pol_items)
  ));

  -- E) estoque_sanity
  BEGIN
    SELECT count(*) INTO v_mov_count FROM public.movimentacoes_estoque WHERE company_id = v_company;
    v_details := jsonb_build_object('movimentacoes_count', v_mov_count);
    v_status := 'PASS';
  EXCEPTION WHEN OTHERS THEN
    v_details := jsonb_build_object('error', SQLERRM); v_status := 'FAIL';
  END;
  v_sections := v_sections || jsonb_build_object('estoque_sanity', jsonb_build_object('status', v_status, 'details', v_details));

  -- F) relatorios_sanity — static PERFORM, no EXECUTE
  BEGIN
    PERFORM public.get_relatorios_kpis(v_start, v_end);
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_kpis', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_rpc_ok := false;
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_kpis', 'status', 'FAIL', 'error', SQLERRM);
  END;

  BEGIN
    PERFORM public.get_relatorios_score(v_start, v_end);
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_score', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_rpc_ok := false;
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_score', 'status', 'FAIL', 'error', SQLERRM);
  END;

  BEGIN
    PERFORM public.get_relatorios_tendencia(v_start, v_end);
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_tendencia', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_rpc_ok := false;
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_tendencia', 'status', 'FAIL', 'error', SQLERRM);
  END;

  BEGIN
    PERFORM public.get_relatorios_compras(v_start, v_end);
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_compras', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_rpc_ok := false;
    v_rpc_items := v_rpc_items || jsonb_build_object('rpc', 'get_relatorios_compras', 'status', 'FAIL', 'error', SQLERRM);
  END;

  v_sections := v_sections || jsonb_build_object('relatorios_sanity', jsonb_build_object(
    'status', CASE WHEN v_rpc_ok THEN 'PASS' ELSE 'FAIL' END, 'details', jsonb_build_object('rpcs', v_rpc_items)
  ));

  -- G) rbac_sql_lint
  v_sections := v_sections || jsonb_build_object('rbac_sql_lint', jsonb_build_object(
    'status', 'SKIPPED', 'details', jsonb_build_object('reason', 'run via Edge/CI when configured')
  ));

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('ran_at', now(), 'company_id', v_company, 'actor_user_id', v_actor),
    'sections', v_sections
  );
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_health_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_result jsonb;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'company_id', v_company,
    'produtos', (SELECT count(*) FROM public.produtos WHERE company_id = v_company),
    'suppliers', (SELECT count(*) FROM public.suppliers WHERE company_id = v_company),
    'movimentacoes_estoque', (SELECT count(*) FROM public.movimentacoes_estoque WHERE company_id = v_company),
    'purchase_orders', (SELECT count(*) FROM public.purchase_orders WHERE company_id = v_company),
    'purchase_order_items', (SELECT count(*) FROM public.purchase_order_items WHERE company_id = v_company),
    'salmon_entries', (SELECT count(*) FROM public.salmon_entries WHERE company_id = v_company),
    'salmon_manipulations', (SELECT count(*) FROM public.salmon_manipulations WHERE company_id = v_company),
    'fin_lancamentos', (SELECT count(*) FROM public.fin_lancamentos WHERE company_id = v_company),
    'inventarios', (SELECT count(*) FROM public.inventarios WHERE company_id = v_company),
    'solic_compra_mercado', (SELECT count(*) FROM public.solic_compra_mercado WHERE company_id = v_company),
    'recebimentos', (SELECT count(*) FROM public.recebimentos WHERE company_id = v_company),
    'financeiro_fechamento_caixa', (SELECT count(*) FROM public.financeiro_fechamento_caixa WHERE company_id = v_company)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.assert_requisicao_estoque_movement_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  req_item record;
  prod record;
  expected_qty numeric;
  v_item_id uuid;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'REQUISICAO_ESTOQUE' OR NEW.status IS DISTINCT FROM 'ATIVO' THEN
    RETURN NEW;
  END IF;

  IF NEW.produto_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação de requisição sem produto_id';
  END IF;

  IF COALESCE(NEW.reference_type, '') = 'REQUISICAO_ITEM' THEN
    IF NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'Movimentação de requisição por item sem reference_id';
    END IF;

    BEGIN
      v_item_id := NEW.reference_id::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'reference_id da movimentação de requisição é inválido: %', NEW.reference_id;
    END;

    SELECT rei.id,
           rei.requisicao_id,
           rei.quantidade_solicitada,
           rei.quantidade_atendida,
           r.company_id
      INTO req_item
    FROM public.requisicao_estoque_itens rei
    JOIN public.requisicoes_estoque r ON r.id = rei.requisicao_id
    WHERE rei.id = v_item_id
      AND rei.produto_id = NEW.produto_id
      AND r.company_id = NEW.company_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Movimentação não corresponde ao item da requisição';
    END IF;

    IF NEW.referencia_id IS NOT NULL AND NEW.referencia_id <> req_item.requisicao_id::text THEN
      RAISE EXCEPTION 'referencia_id divergente para baixa do item da requisição';
    END IF;
  ELSE
    IF NEW.referencia_id IS NULL THEN
      RAISE EXCEPTION 'Movimentação de requisição sem referencia_id';
    END IF;

    SELECT rei.id,
           rei.requisicao_id,
           rei.quantidade_solicitada,
           rei.quantidade_atendida,
           r.company_id
      INTO req_item
    FROM public.requisicao_estoque_itens rei
    JOIN public.requisicoes_estoque r ON r.id = rei.requisicao_id
    WHERE rei.requisicao_id = NEW.referencia_id::uuid
      AND rei.produto_id = NEW.produto_id
      AND r.company_id = NEW.company_id
    ORDER BY rei.created_at DESC, rei.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Movimentação não corresponde a item da requisição';
    END IF;
  END IF;

  SELECT p.fator_conversao_padrao
    INTO prod
  FROM public.produtos p
  WHERE p.id = NEW.produto_id
    AND p.company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto da movimentação de requisição não encontrado';
  END IF;

  expected_qty := ROUND((
    COALESCE(NULLIF(req_item.quantidade_atendida, 0), req_item.quantidade_solicitada)
    * COALESCE(NULLIF(prod.fator_conversao_padrao, 0), 1)
  )::numeric, 3);

  IF NEW.direction IS DISTINCT FROM 'OUT' THEN
    RAISE EXCEPTION 'Baixa de requisição deve ter direction OUT';
  END IF;

  IF NEW.tipo IS DISTINCT FROM 'SAIDA' THEN
    RAISE EXCEPTION 'Baixa de requisição deve ter tipo SAIDA';
  END IF;

  IF ROUND(COALESCE(NEW.quantidade, 0)::numeric, 3) <> expected_qty THEN
    RAISE EXCEPTION 'Quantidade inconsistente para baixa de requisição. Esperado: %, recebido: %', expected_qty, NEW.quantidade;
  END IF;

  RETURN NEW;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.assert_tenant()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid := public.get_current_company_id();
BEGIN
 IF v_company IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END IF;
 RETURN v_company;
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE before_row jsonb; after_row jsonb; company uuid; resource_id uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
 company:=(COALESCE(after_row,before_row)->>'company_id')::uuid;
 resource_id:=(COALESCE(after_row,before_row)->>'id')::uuid;
 IF TG_OP='UPDATE' AND (before_row->>'company_id') IS DISTINCT FROM (after_row->>'company_id') THEN RAISE EXCEPTION 'LOG_RESOURCE_COMPANY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(company_id,actor_user_id,source,module,entity,entity_id,action,before,after,scope_reason)
 VALUES(company,auth.uid(),'db',TG_ARGV[0],TG_TABLE_NAME,resource_id,CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END,
 before_row-ARRAY['cpf','senha','password','token','card_number','secret'],after_row-ARRAY['cpf','senha','password','token','card_number','secret'],'db_trigger');
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $function$

-- ACL: {postgres=X/postgres}
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

  SELECT * INTO v_entry FROM salmon_entries
  WHERE id = p_entry_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;
  IF v_entry.status = 'CANCELLED' THEN RAISE EXCEPTION 'Entrada já cancelada.'; END IF;

  IF EXISTS (SELECT 1 FROM salmon_manipulations
             WHERE entry_id = p_entry_id AND status = 'ACTIVE' AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Existem manipulações ativas vinculadas. Cancele-as primeiro.';
  END IF;

  UPDATE salmon_entries SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_entry_id AND company_id = v_company_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = p_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    IF v_mov.source_module IS DISTINCT FROM 'salmon' OR NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id=v_mov.produto_id AND p.company_id=v_company_id
    ) THEN
      RAISE EXCEPTION 'SALMON_MOVEMENT_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    -- Insere o estorno ANTES de cancelar o original (trg_validate_estorno recusa
    -- estorno_de_id que já esteja CANCELADO).
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

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', p_entry_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_kg', v_entry.gross_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'entry_id', p_entry_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$

-- ACL: {postgres=X/postgres}
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
    IF v_mov.source_module IS DISTINCT FROM 'salmon' OR NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id=v_mov.produto_id AND p.company_id=v_company_id
    ) THEN
      RAISE EXCEPTION 'SALMON_MOVEMENT_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    -- Insere o estorno ANTES de cancelar o original (trg_validate_estorno recusa
    -- estorno_de_id que já esteja CANCELADO).
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

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', p_manip_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_out_kg', v_manip.gross_out_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'manipulation_id', p_manip_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$

-- ACL: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.create_inventory_atomic(p_tipo text, p_data date, p_hora text, p_turno_id uuid, p_categorias text[] DEFAULT '{}'::text[], p_observacao text DEFAULT ''::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv_id uuid;
  v_itens_count int := 0;
BEGIN
  BEGIN
    v_tenant := assert_tenant();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro de Tenant: %', SQLERRM;
  END;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT has_any_permission(v_user_id, ARRAY['inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permissão negada: inventario:criar:create necessário';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_inv_id FROM inventarios WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_inv_id; END IF;
  END IF;

  INSERT INTO inventarios (
    company_id, tipo, data, hora, turno_id, categorias,
    responsavel_user_id, observacao, status, idempotency_key
  ) VALUES (
    v_tenant, p_tipo, p_data, p_hora::time, p_turno_id, COALESCE(p_categorias, '{}'),
    v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', p_idempotency_key
  ) RETURNING id INTO v_inv_id;

  IF p_tipo = 'completo' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(p.saldo_atual, 0)),
      -- Use default_cost_base_unit (per base unit) as primary.
      -- Fallback divides custo_padrao (per purchase unit) by fator to get per-base-unit cost.
      COALESCE(
        NULLIF(p.default_cost_base_unit, 0),
        CASE
          WHEN COALESCE(p.fator_conversao_padrao, 0) > 0
            THEN p.custo_padrao / p.fator_conversao_padrao
          ELSE p.custo_padrao
        END,
        0
      )
    FROM produtos p
    WHERE p.ativo = true AND p.company_id = v_tenant;

    GET DIAGNOSTICS v_itens_count = ROW_COUNT;
  END IF;

  INSERT INTO audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, depois)
  VALUES (
    v_tenant, v_inv_id, v_user_id,
    COALESCE((SELECT string_agg(role::text, ',') FROM user_roles WHERE user_id = v_user_id AND company_id = public.assert_tenant()), 'unknown'),
    'CRIACAO',
    jsonb_build_object('tipo', p_tipo, 'turno_id', p_turno_id, 'itens_count', v_itens_count)
  );

  RETURN v_inv_id;
END;
$function$

-- ACL: null
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
        'QUICK_INVENTORY', 'inventarios', v_inv_id,
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

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_salmon_entry_atomic(p_entry_date date, p_lot text, p_sif text, p_supplier_name text, p_boxes integer, p_units integer, p_gross_kg numeric, p_total_value numeric, p_notes text DEFAULT ''::text, p_expiration_date date DEFAULT NULL::date)
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
  IF p_expiration_date IS NOT NULL AND p_expiration_date < p_entry_date THEN
    RAISE EXCEPTION 'Validade (%) não pode ser anterior à data de entrada (%).', p_expiration_date, p_entry_date;
  END IF;

  v_cost_per_kg := CASE WHEN p_gross_kg > 0 THEN ROUND(p_total_value / p_gross_kg, 4) ELSE 0 END;

  -- 1. Insert salmon_entries
  INSERT INTO salmon_entries (
    entry_date, lot, sif, supplier_name, boxes, units, gross_kg, total_value, notes, created_by, company_id,
    expiration_date
  ) VALUES (
    p_entry_date, COALESCE(p_lot,''), COALESCE(p_sif,''), COALESCE(p_supplier_name,''),
    COALESCE(p_boxes,0), COALESCE(p_units,0), p_gross_kg, p_total_value,
    COALESCE(p_notes,''), v_caller, v_company_id,
    p_expiration_date
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
      observacao = 'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,'')
        || CASE WHEN p_expiration_date IS NULL THEN '' ELSE ' — Val: ' || to_char(p_expiration_date, 'DD/MM/YYYY') END,
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
      'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,'')
        || CASE WHEN p_expiration_date IS NULL THEN '' ELSE ' — Val: ' || to_char(p_expiration_date, 'DD/MM/YYYY') END,
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
    WHERE id = v_produto_id AND company_id = v_company_id;
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
    jsonb_build_object('gross_kg', p_gross_kg, 'total_value', p_total_value, 'lot', p_lot,
      'supplier', p_supplier_name, 'mov_id', v_mov_id, 'expiration_date', p_expiration_date));

  RETURN jsonb_build_object('entry_id', v_entry_id, 'movement_id', v_mov_id, 'unit_cost', v_cost_per_kg,
    'expiration_date', p_expiration_date, 'company_id', v_company_id);
END;
$function$

-- ACL: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.debug_company_inventory()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_current_company_id UUID := public.get_current_company_id();
  v_inventory_counts JSONB;
BEGIN
  IF NOT public.has_permission(v_auth_uid, 'system:global:manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  SELECT jsonb_object_agg(table_name, rows)
  INTO v_inventory_counts
  FROM (
    SELECT t.table_name, jsonb_agg(jsonb_build_object('company_id', t.company_id, 'count', t.cnt)) AS rows
    FROM (
      SELECT 'produtos' AS table_name, company_id, COUNT(*) AS cnt FROM public.produtos GROUP BY company_id
      UNION ALL
      SELECT 'movimentacoes_estoque', company_id, COUNT(*) FROM public.movimentacoes_estoque GROUP BY company_id
      UNION ALL
      SELECT 'suppliers', company_id, COUNT(*) FROM public.suppliers GROUP BY company_id
      UNION ALL
      SELECT 'purchase_orders', company_id, COUNT(*) FROM public.purchase_orders GROUP BY company_id
      UNION ALL
      SELECT 'purchase_order_items', company_id, COUNT(*) FROM public.purchase_order_items GROUP BY company_id
      UNION ALL
      SELECT 'salmon_entries', company_id, COUNT(*) FROM public.salmon_entries GROUP BY company_id
      UNION ALL
      SELECT 'salmon_manipulations', company_id, COUNT(*) FROM public.salmon_manipulations GROUP BY company_id
      UNION ALL
      SELECT 'salmon_daily_records', company_id, COUNT(*) FROM public.salmon_daily_records GROUP BY company_id
    ) t
    GROUP BY t.table_name
  ) agg;

  RETURN jsonb_build_object(
    'auth_uid', v_auth_uid,
    'current_company_id', v_current_company_id,
    'by_table', COALESCE(v_inventory_counts, '{}'::jsonb)
  );
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.debug_stock_last_movements(p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_result jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_company := public.assert_tenant();

  SELECT jsonb_agg(row_to_json(t)::jsonb)
  INTO v_result
  FROM (
    SELECT
      m.id,
      m.created_at,
      m.company_id,
      m.produto_id,
      p.nome_produto AS produto_nome,
      m.quantidade AS qty,
      m.direction,
      m.tipo,
      m.status,
      m.created_by
    FROM public.movimentacoes_estoque m
    LEFT JOIN public.produtos p ON p.id = m.produto_id
    WHERE m.company_id = v_company
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

  -- Serializa a primeira criação por empresa; o índice cobre outros writers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('salmon_raw:' || v_company_id::text, 0));

  -- 1. Look for existing linked product within company context
  SELECT id INTO v_id FROM produtos
  WHERE is_salmon_raw_linked = true
    AND ativo = true
    AND company_id = v_company_id
  LIMIT 1 FOR UPDATE;

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

-- ACL: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.fn_recompute_product_saldo(p_id uuid, p_company uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_company = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN;
  END IF;
  UPDATE public.produtos
  SET saldo_atual = (
    SELECT ROUND(COALESCE(SUM(
      CASE
        WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN m.direction = 'IN' THEN m.quantidade
        ELSE -m.quantidade
      END
    ), 0), 4)
    FROM public.movimentacoes_estoque m
    WHERE m.produto_id = p_id AND m.status = 'ATIVO' AND m.company_id = p_company
  )
  WHERE id = p_id AND company_id = p_company;
END;
$function$

-- ACL: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_next_sku(p_prefix text DEFAULT 'MP'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_next bigint;
  v_pad integer;
  v_candidate text;
  v_attempts integer := 0;
  v_max_attempts integer := 1000;
BEGIN
  v_company_id := public.get_current_company_id();

  INSERT INTO public.stock_sku_counter (company_id, prefix, next_value, pad_length, updated_at)
  VALUES (v_company_id, p_prefix, 0, 4, now())
  ON CONFLICT (company_id, prefix) DO NOTHING;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > v_max_attempts THEN
      RAISE EXCEPTION
        'generate_next_sku: nao foi possivel gerar SKU unico apos % tentativas (company=%, prefix=%)',
        v_max_attempts, v_company_id, p_prefix;
    END IF;

    UPDATE public.stock_sku_counter
       SET next_value = next_value + 1,
           updated_at = now()
     WHERE company_id = v_company_id
       AND prefix = p_prefix
    RETURNING next_value, pad_length INTO v_next, v_pad;

    v_candidate := p_prefix || '-' || lpad(v_next::text, GREATEST(COALESCE(v_pad, 4), 1), '0');

    IF NOT EXISTS (
      SELECT 1
      FROM public.produtos
      WHERE company_id = v_company_id
        AND sku = v_candidate
    ) THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_catalog_counts()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_total int;
  v_active int;
  v_inactive int;
BEGIN
  -- Obter a empresa do contexto do usuário atual com segurança
  v_company_id := public.assert_tenant();

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
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid := auth.uid(); v_company uuid; v_requested text;
BEGIN
 IF v_user IS NULL THEN RETURN NULL; END IF;
 v_requested := NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-company-id';
 IF v_requested IS NOT NULL THEN
   BEGIN v_company := v_requested::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END;
 ELSE
   SELECT company_id INTO v_company FROM public.profiles WHERE id=v_user;
 END IF;
 IF NOT public.is_company_member(v_user,v_company) THEN
   IF v_requested IS NULL THEN RETURN NULL; END IF;
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED';
 END IF;
 RETURN v_company;
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_current_company_id_strict()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT public.assert_tenant(); $function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid; v_requested text;
BEGIN
 IF auth.uid() IS NOT NULL THEN v_company:=public.get_current_company_id();
 ELSIF (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role')='service_role' THEN
   v_requested:=NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-company-id';
   IF v_requested IS NOT NULL THEN v_company:=v_requested::uuid;
   ELSE SELECT company_id INTO v_company FROM public.profiles WHERE id=_user_id; END IF;
 ELSE RETURN ARRAY[]::text[];
 END IF;
 RETURN public.get_company_permissions(_user_id,v_company);
END;
$function$

-- ACL: {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
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
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_relatorios_kpis(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result              jsonb;
  v_faturamento         numeric;
  v_custo_total         numeric;
  v_custo_salmon        numeric;
  v_cmv_geral           numeric;
  v_cmv_salmon          numeric;
  v_margem              numeric;
  v_impacto             numeric;
  v_cmv_categorias      jsonb;
  v_tendencia           jsonb;
  v_valor_estoque       numeric;
  v_abaixo_minimo       jsonb;
  v_maiores_perdas      jsonb;
  v_ruptura             numeric;
  v_total_ativos        int;
  v_count_abaixo        int;
  v_giro                numeric;
  v_cobertura           numeric;
  v_consumo_periodo     numeric;
  v_semanas_periodo     numeric;
  v_parado_percent      numeric;
  v_count_parados       int;
  v_company             uuid;
  v_salmon_bruto_kg     numeric;
  v_salmon_limpo_kg     numeric;
  v_salmon_valor_estoque numeric;
  v_salmon_compras_valor numeric;
  v_salmon_compras_kg   numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:cmv:view', 'relatorios:estoque:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:cmv:view ou relatorios:estoque:view).';
  END IF;

  SELECT COALESCE(SUM(faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa
  WHERE company_id = v_company AND data BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_total
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT';

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_salmon
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND m.direction = 'OUT' AND m.source_module = 'salmon';

  v_cmv_geral  := CASE WHEN v_faturamento > 0 THEN ROUND(v_custo_total / v_faturamento * 100, 2) ELSE NULL END;
  v_cmv_salmon := CASE WHEN v_faturamento > 0 THEN ROUND(v_custo_salmon / v_faturamento * 100, 2) ELSE NULL END;
  v_margem     := CASE WHEN v_cmv_geral IS NOT NULL THEN ROUND(100 - v_cmv_geral, 2) ELSE NULL END;
  v_impacto    := CASE WHEN v_custo_total > 0 THEN ROUND(v_custo_salmon / v_custo_total * 100, 2) ELSE NULL END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.custo_consumido DESC), '[]'::jsonb)
  INTO v_cmv_categorias
  FROM (
    SELECT COALESCE(p.categoria, 'Outros') AS categoria,
      ROUND(SUM(m.custo_total)::numeric, 2) AS custo_consumido,
      CASE WHEN v_custo_total > 0 THEN ROUND(SUM(m.custo_total) / v_custo_total * 100, 2) ELSE 0 END AS percent_do_total
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
    WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT'
    GROUP BY p.categoria HAVING SUM(m.custo_total) > 0
  ) sub;

  WITH monthly_cost AS (
    SELECT EXTRACT(YEAR FROM m.data)::int AS ano, EXTRACT(MONTH FROM m.data)::int AS mes,
      ROUND(SUM(m.custo_total)::numeric, 2) AS custo
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
    WHERE m.company_id = v_company AND m.data BETWEEN (p_start - INTERVAL '3 months') AND p_end
      AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT'
    GROUP BY 1, 2
  ),
  monthly_revenue AS (
    SELECT EXTRACT(YEAR FROM f.data)::int AS ano, EXTRACT(MONTH FROM f.data)::int AS mes,
      ROUND(SUM(f.faturamento_bruto)::numeric, 2) AS faturamento
    FROM financeiro_fechamento_caixa f
    WHERE f.company_id = v_company AND f.data BETWEEN (p_start - INTERVAL '3 months') AND p_end
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.ano, sub.mes), '[]'::jsonb)
  INTO v_tendencia
  FROM (
    SELECT mc.ano, mc.mes, COALESCE(mr.faturamento, 0) AS faturamento, mc.custo,
      CASE WHEN COALESCE(mr.faturamento, 0) > 0 THEN ROUND(mc.custo / mr.faturamento * 100, 2) ELSE NULL END AS cmv_percent
    FROM monthly_cost mc LEFT JOIN monthly_revenue mr ON mr.ano = mc.ano AND mr.mes = mc.mes
  ) sub;

  -- ===== CACHE: saldo_atual x custo_efetivo, mesma base que get_stock_dashboard =====
  SELECT COALESCE(SUM(
    COALESCE(p.saldo_atual, 0) * COALESCE(
      NULLIF(p.avg30_cost_base_unit, 0),
      NULLIF(p.last_cost_base_unit, 0),
      NULLIF(p.default_cost_base_unit, 0),
      0
    )
  ), 0) INTO v_valor_estoque
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true;

  SELECT COUNT(*) INTO v_total_ativos FROM produtos p WHERE p.company_id = v_company AND p.ativo = true;

  SELECT COUNT(*) INTO v_count_abaixo
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true
    AND COALESCE(p.estoque_minimo, 0) > 0
    AND COALESCE(p.saldo_atual, 0) < p.estoque_minimo;

  v_ruptura := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_abaixo::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.diff DESC), '[]'::jsonb)
  INTO v_abaixo_minimo
  FROM (
    SELECT p.id AS produto_id,
           p.nome_produto AS nome,
           COALESCE(p.saldo_atual, 0) AS saldo,
           p.estoque_minimo AS minimo,
           (p.estoque_minimo - COALESCE(p.saldo_atual, 0)) AS diff
    FROM produtos p
    WHERE p.company_id = v_company
      AND p.ativo = true
      AND COALESCE(p.estoque_minimo, 0) > 0
      AND COALESCE(p.saldo_atual, 0) < p.estoque_minimo
    ORDER BY (p.estoque_minimo - COALESCE(p.saldo_atual, 0)) DESC
    LIMIT 5
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.perda_valor DESC), '[]'::jsonb)
  INTO v_maiores_perdas
  FROM (
    SELECT m.produto_id, p.nome_produto AS nome,
      ROUND(SUM(m.quantidade)::numeric, 3) AS perda_kg,
      ROUND(SUM(m.custo_total)::numeric, 2) AS perda_valor
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company
    WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')
    GROUP BY m.produto_id, p.nome_produto ORDER BY perda_valor DESC LIMIT 5
  ) sub;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_consumo_periodo
  FROM movimentacoes_estoque m
  WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT';

  v_semanas_periodo := GREATEST((p_end - p_start)::numeric / 7.0, 1);
  v_giro     := CASE WHEN v_valor_estoque > 0 THEN ROUND(v_consumo_periodo / v_valor_estoque, 2) ELSE 0 END;
  v_cobertura := CASE WHEN v_consumo_periodo > 0 THEN ROUND(v_valor_estoque / (v_consumo_periodo / v_semanas_periodo), 1) ELSE 0 END;

  SELECT COUNT(*) INTO v_count_parados
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true
    AND COALESCE(p.saldo_atual, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM movimentacoes_estoque m
      WHERE m.company_id = v_company
        AND m.produto_id = p.id
        AND m.status = 'ATIVO'
        AND m.created_at >= (CURRENT_DATE - 28)
    );

  v_parado_percent := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_parados::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(SUM(se.gross_kg - COALESCE((
    SELECT SUM(sm.gross_out_kg) FROM salmon_manipulations sm
    WHERE sm.entry_id = se.id AND sm.company_id = v_company AND sm.status = 'ACTIVE'), 0)), 0)
  INTO v_salmon_bruto_kg
  FROM salmon_entries se WHERE se.company_id = v_company AND se.status = 'ACTIVE';

  SELECT COALESCE(SUM(sm.clean_in_kg), 0) INTO v_salmon_limpo_kg
  FROM salmon_manipulations sm
  WHERE sm.company_id = v_company AND sm.status = 'ACTIVE';

  SELECT COALESCE(SUM(se.total_value), 0), COALESCE(SUM(se.gross_kg), 0)
  INTO v_salmon_compras_valor, v_salmon_compras_kg
  FROM salmon_entries se
  WHERE se.company_id = v_company AND se.status = 'ACTIVE' AND se.entry_date BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(sub.balance_kg * sub.cost_per_kg), 0) INTO v_salmon_valor_estoque
  FROM (
    SELECT se.id,
      se.gross_kg - COALESCE((SELECT SUM(sm.gross_out_kg) FROM salmon_manipulations sm
        WHERE sm.entry_id = se.id AND sm.company_id = v_company AND sm.status = 'ACTIVE'), 0) AS balance_kg,
      CASE WHEN se.gross_kg > 0 THEN se.total_value / se.gross_kg ELSE 0 END AS cost_per_kg
    FROM salmon_entries se WHERE se.company_id = v_company AND se.status = 'ACTIVE'
  ) sub WHERE sub.balance_kg > 0.01;

  v_result := jsonb_build_object(
    'faturamento_total',    ROUND(v_faturamento::numeric, 2),
    'faturamento_source',   'financeiro_fechamento_caixa',
    'custo_consumido_total', ROUND(v_custo_total::numeric, 2),
    'custo_salmon',         ROUND(v_custo_salmon::numeric, 2),
    'cmv_geral_percent',    v_cmv_geral,
    'cmv_salmon_percent',   v_cmv_salmon,
    'margem_bruta_percent', v_margem,
    'impacto_salmon_percent', v_impacto,
    'meta_cmv',             COALESCE((SELECT (value::numeric) FROM app_config WHERE key = 'meta_cmv'), 35),
    'cmv_por_categoria',    v_cmv_categorias,
    'tendencia_cmv_3_meses', v_tendencia,
    'valor_total_estoque',  ROUND(v_valor_estoque::numeric, 2),
    'itens_abaixo_minimo_count', v_count_abaixo,
    'itens_abaixo_minimo_top5',  v_abaixo_minimo,
    'maiores_perdas_top5',  v_maiores_perdas,
    'ruptura_percent',      v_ruptura,
    'giro_estoque',         v_giro,
    'cobertura_semanas',    v_cobertura,
    'parado_percent',       v_parado_percent,
    'parado_count',         v_count_parados,
    'total_ativos',         v_total_ativos,
    'perdas_kg',            COALESCE((SELECT ROUND(SUM(m.quantidade)::numeric, 3) FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')), 0),
    'perdas_valor',         COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')), 0),
    'salmon_bruto_kg',      ROUND(v_salmon_bruto_kg::numeric, 3),
    'salmon_limpo_kg',      ROUND(v_salmon_limpo_kg::numeric, 3),
    'salmon_valor_estoque', ROUND(v_salmon_valor_estoque::numeric, 2),
    'salmon_compras_valor', ROUND(v_salmon_compras_valor::numeric, 2),
    'salmon_compras_kg',    ROUND(v_salmon_compras_kg::numeric, 3)
  );
  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_relatorios_score(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_period_days int;
  v_weeks numeric;
  v_custo_consumido numeric;
  v_faturamento numeric;
  v_meta_cmv numeric;
  v_avg_weekly_cost numeric;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:score:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:score:view).';
  END IF;

  v_period_days := GREATEST((p_end - p_start) + 1, 1);
  v_weeks := GREATEST(v_period_days / 7.0, 1);

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_consumido
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;

  SELECT COALESCE(SUM(fc.faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa fc
  WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end;

  v_meta_cmv := 35;

  SELECT COALESCE(AVG(sub.weekly_cost), 0) INTO v_avg_weekly_cost
  FROM (
    SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
      SUM(m.custo_total) AS weekly_cost
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
      AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
    GROUP BY 1 HAVING SUM(m.custo_total) > 0
  ) sub;

  IF v_avg_weekly_cost = 0 THEN
    SELECT COALESCE(SUM(m.custo_total) / GREATEST(COUNT(DISTINCT EXTRACT(WEEK FROM m.data)), 1), 0)
    INTO v_avg_weekly_cost
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO' AND m.data >= CURRENT_DATE - 28
      AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;
  END IF;

  SELECT jsonb_build_object(
    'suppliers', '[]'::jsonb,
    'projecao_4_semanas', (
      SELECT jsonb_agg(jsonb_build_object(
        'week_number', w,
        'week_start', (CURRENT_DATE + ((w - 1) * 7))::text,
        'projected_cost', ROUND(v_avg_weekly_cost::numeric, 2),
        'projected_cmv_percent', CASE WHEN v_faturamento > 0 AND v_weeks > 0
          THEN ROUND(((v_avg_weekly_cost) / (v_faturamento / v_weeks) * 100)::numeric, 2) ELSE NULL END,
        'scenario', 'base'
      ))
      FROM generate_series(1, 4) AS w
    ),
    'custo_consumido', v_custo_consumido,
    'faturamento', v_faturamento,
    'meta_cmv', v_meta_cmv,
    'avg_weekly_cost', ROUND(v_avg_weekly_cost::numeric, 2),
    'perdas_valor', COALESCE((
      SELECT ROUND(SUM(m.custo_total)::numeric, 2)
      FROM movimentacoes_estoque m
      JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
      WHERE m.company_id = v_company
        AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
        AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_relatorios_tendencia(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_prev_start date;
  v_prev_end date;
  v_period_days int;
  v_company uuid;
  v_compras_current numeric;
  v_compras_previous numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:tendencia:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:tendencia:view).';
  END IF;

  v_period_days := (p_end - p_start) + 1;
  v_prev_end := p_start - 1;
  v_prev_start := v_prev_end - v_period_days + 1;

  -- Compras current: movimentacoes IN + salmon_entries not already in movimentacoes
  SELECT COALESCE(SUM(val), 0) INTO v_compras_current
  FROM (
    SELECT ROUND(SUM(m.custo_total)::numeric, 2) AS val FROM movimentacoes_estoque m
      JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
      WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end AND m.direction = 'IN'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    UNION ALL
    SELECT ROUND(SUM(se.total_value)::numeric, 2) AS val FROM salmon_entries se
      WHERE se.company_id = v_company AND se.status = 'ACTIVE' AND se.entry_date BETWEEN p_start AND p_end
      AND NOT EXISTS (
        SELECT 1 FROM movimentacoes_estoque mx
        WHERE mx.company_id = v_company AND mx.source_module = 'salmon'
          AND mx.referencia_id = se.id::text AND mx.status = 'ATIVO' AND mx.direction = 'IN'
      )
  ) t;

  -- Compras previous
  SELECT COALESCE(SUM(val), 0) INTO v_compras_previous
  FROM (
    SELECT ROUND(SUM(m.custo_total)::numeric, 2) AS val FROM movimentacoes_estoque m
      JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
      WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN v_prev_start AND v_prev_end AND m.direction = 'IN'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    UNION ALL
    SELECT ROUND(SUM(se.total_value)::numeric, 2) AS val FROM salmon_entries se
      WHERE se.company_id = v_company AND se.status = 'ACTIVE' AND se.entry_date BETWEEN v_prev_start AND v_prev_end
      AND NOT EXISTS (
        SELECT 1 FROM movimentacoes_estoque mx
        WHERE mx.company_id = v_company AND mx.source_module = 'salmon'
          AND mx.referencia_id = se.id::text AND mx.status = 'ATIVO' AND mx.direction = 'IN'
      )
  ) t;

  SELECT jsonb_build_object(
    'custo_por_semana', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label', sub.label, 'custo', sub.custo_total) ORDER BY sub.wk)
      FROM (
        SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
          'W' || CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS label,
          ROUND(SUM(m.custo_total)::numeric, 2) AS custo_total
        FROM movimentacoes_estoque m
        JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
        GROUP BY 1
      ) sub
    ), '[]'::jsonb),

    'cmv_por_semana', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', sub.label, 'faturamento', sub.faturamento, 'custo', sub.custo,
        'cmv', CASE WHEN sub.faturamento > 0 THEN ROUND((sub.custo / sub.faturamento * 100)::numeric, 2) ELSE NULL END
      ) ORDER BY sub.wk)
      FROM (
        SELECT wk, 'W' || wk AS label, COALESCE(c.custo, 0) AS custo, COALESCE(r.faturamento, 0) AS faturamento
        FROM (
          SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
            ROUND(SUM(m.custo_total)::numeric, 2) AS custo
          FROM movimentacoes_estoque m
          JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
          WHERE m.company_id = v_company
            AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
            AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
          GROUP BY 1
        ) c
        FULL OUTER JOIN (
          SELECT CEIL(EXTRACT(DAY FROM fc.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
            ROUND(SUM(fc.faturamento_bruto)::numeric, 2) AS faturamento
          FROM financeiro_fechamento_caixa fc
          WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end
          GROUP BY 1
        ) r USING (wk)
      ) sub
    ), '[]'::jsonb),

    'comparativo_mes', jsonb_build_object(
      'current', jsonb_build_object(
        'compras_valor', v_compras_current,
        'consumo_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO', 'BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
          AND m.internal_transfer = false), 0),
        'faturamento', COALESCE((SELECT ROUND(SUM(fc.faturamento_bruto)::numeric, 2) FROM financeiro_fechamento_caixa fc
          WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end), 0),
        'perdas_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')), 0)
      ),
      'previous', jsonb_build_object(
        'compras_valor', v_compras_previous,
        'consumo_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN v_prev_start AND v_prev_end AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO', 'BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
          AND m.internal_transfer = false), 0),
        'faturamento', COALESCE((SELECT ROUND(SUM(fc.faturamento_bruto)::numeric, 2) FROM financeiro_fechamento_caixa fc
          WHERE fc.company_id = v_company AND fc.data BETWEEN v_prev_start AND v_prev_end), 0),
        'perdas_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN v_prev_start AND v_prev_end
          AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')), 0)
      )
    ),

    'volatilidade', jsonb_build_object(
      'stddev_salmon', COALESCE((SELECT ROUND(STDDEV(m.custo_unitario)::numeric, 4)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND m.source_module = 'salmon' AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.custo_unitario > 0), 0),
      'stddev_geral', COALESCE((SELECT ROUND(STDDEV(m.custo_unitario)::numeric, 4)
        FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
        AND m.direction = 'IN' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.custo_unitario > 0), 0)
    ),

    'heatmap_dia_semana', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dow', sub.dow, 'label', sub.label,
        'custo_total', sub.custo_total, 'consumo_qtd', sub.consumo_qtd, 'perdas_valor', sub.perdas_valor) ORDER BY sub.dow)
      FROM (
        SELECT d.dow,
          CASE d.dow WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
            WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sáb' END AS label,
          COALESCE(SUM(m.custo_total) FILTER (WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') AND m.internal_transfer = false), 0) AS custo_total,
          COALESCE(SUM(m.quantidade) FILTER (WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') AND m.internal_transfer = false), 0) AS consumo_qtd,
          COALESCE(SUM(m.custo_total) FILTER (WHERE m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')), 0) AS perdas_valor
        FROM generate_series(0, 6) AS d(dow)
        LEFT JOIN movimentacoes_estoque m ON m.company_id = v_company AND EXTRACT(DOW FROM m.data) = d.dow AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND EXISTS (SELECT 1 FROM produtos p WHERE p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true)
        GROUP BY d.dow
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_report_item_detail(p_produto_id uuid, p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_produto record;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:itens:view).';
  END IF;

  SELECT id, nome_produto, categoria, unidade_medida, is_salmon_raw_linked,
    COALESCE(NULLIF(avg30_cost_base_unit, 0), NULLIF(last_cost_base_unit, 0), NULLIF(default_cost_base_unit, 0), 0) AS custo_base
  INTO v_produto
  FROM public.produtos
  WHERE id = p_produto_id AND company_id = v_company;

  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;

  SELECT jsonb_build_object(
    'produto_id', v_produto.id,
    'nome', v_produto.nome_produto,
    'categoria', v_produto.categoria,
    'unidade', v_produto.unidade_medida,
    'custo_base', v_produto.custo_base,
    'saldo_atual', COALESCE((
      SELECT SUM(CASE
        WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN direction = 'IN' THEN quantidade ELSE -quantidade END)
      FROM public.movimentacoes_estoque
      WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
    ), 0),
    'breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'qtd', qtd, 'custo', custo))
      FROM (
        SELECT tipo, SUM(quantidade) AS qtd, SUM(custo_total) AS custo
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND data BETWEEN p_start AND p_end
        GROUP BY tipo ORDER BY custo DESC
      ) sub
    ), '[]'::jsonb),
    'preco_historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('data', data::text, 'preco', custo_unitario, 'qtd', quantidade))
      FROM (
        SELECT data, custo_unitario, quantidade
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND direction = 'IN'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        ORDER BY data DESC, created_at DESC
        LIMIT 20
      ) sub
    ), '[]'::jsonb),
    'consumo_semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', semana, 'consumo', consumo))
      FROM (
        SELECT
          'W' || CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int AS semana,
          SUM(quantidade) AS consumo
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND direction = 'OUT'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND data BETWEEN p_start AND p_end
        GROUP BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
        ORDER BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
      ) sub
    ), '[]'::jsonb),
    'perdas_semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', semana, 'perda', perda))
      FROM (
        SELECT
          'W' || CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int AS semana,
          SUM(quantidade) AS perda
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND data BETWEEN p_start AND p_end
        GROUP BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
        ORDER BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
      ) sub
    ), '[]'::jsonb),
    'fornecedores', COALESCE((
      SELECT jsonb_agg(DISTINCT origem)
      FROM public.movimentacoes_estoque
      WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
        AND direction = 'IN'
        AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        AND origem IS NOT NULL AND origem != ''
        AND data BETWEEN p_start AND p_end
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_report_items_summary(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:itens:view).';
  END IF;

  WITH item_data AS (
    SELECT
      p.id,
      p.nome_produto,
      p.categoria,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS custo_consumido,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS consumo_qtd,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_qtd,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_valor,
      COALESCE((
        SELECT CASE WHEN prev.cu > 0 THEN ROUND(((last.cu - prev.cu) / prev.cu * 100)::numeric, 1) ELSE 0 END
        FROM (
          SELECT custo_unitario AS cu FROM movimentacoes_estoque
          WHERE company_id = v_company
            AND produto_id = p.id AND status = 'ATIVO' AND direction = 'IN'
            AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          ORDER BY data DESC, created_at DESC LIMIT 1
        ) last,
        (
          SELECT custo_unitario AS cu FROM movimentacoes_estoque
          WHERE company_id = v_company
            AND produto_id = p.id AND status = 'ATIVO' AND direction = 'IN'
            AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          ORDER BY data DESC, created_at DESC LIMIT 1 OFFSET 1
        ) prev
      ), 0) AS variacao_preco,
      COALESCE((
        SELECT SUM(CASE
          WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) AS saldo,
      CASE WHEN COALESCE((
        SELECT SUM(CASE
          WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) > 0 THEN
        ROUND((COALESCE((
          SELECT SUM(m.quantidade)
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.produto_id = p.id AND m.status = 'ATIVO'
            AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
            AND m.data BETWEEN p_start AND p_end
        ), 0) / GREATEST(COALESCE((
          SELECT SUM(CASE
            WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
            WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.produto_id = p.id AND m.status = 'ATIVO'
        ), 0), 0.01))::numeric, 2)
      ELSE 0 END AS giro
    FROM produtos p
    WHERE p.ativo = true
      AND p.company_id = v_company
      AND p.conta_no_cmv = true
  ),
  total AS (SELECT COALESCE(SUM(custo_consumido), 0) AS total_custo FROM item_data),
  ranked AS (
    SELECT d.*,
      CASE WHEN t.total_custo > 0 THEN ROUND((d.custo_consumido / t.total_custo * 100)::numeric, 1) ELSE 0 END AS percent_cmv
    FROM item_data d, total t
    WHERE d.custo_consumido > 0 OR d.perdas_qtd > 0
    ORDER BY d.custo_consumido DESC
  )
  SELECT jsonb_build_object(
    'total_items', (SELECT COUNT(*) FROM item_data),
    'items_com_consumo', (SELECT COUNT(*) FROM item_data WHERE custo_consumido > 0),
    'items_com_perda', (SELECT COUNT(*) FROM item_data WHERE perdas_qtd > 0),
    'total_custo_consumido', (SELECT total_custo FROM total),
    'top_consumo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', r.id, 'nome', r.nome_produto, 'categoria', r.categoria,
        'custo_consumido', ROUND(r.custo_consumido::numeric, 2),
        'consumo_qtd', ROUND(r.consumo_qtd::numeric, 3),
        'perdas_qtd', ROUND(r.perdas_qtd::numeric, 3),
        'perdas_valor', ROUND(r.perdas_valor::numeric, 2),
        'variacao_preco', r.variacao_preco,
        'percent_cmv', r.percent_cmv,
        'saldo', ROUND(r.saldo::numeric, 2),
        'giro', r.giro
      ))
      FROM (SELECT * FROM ranked ORDER BY custo_consumido DESC LIMIT 10) r
    ), '[]'::jsonb),
    'top_perda', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', r.id, 'nome', r.nome_produto,
        'perdas_qtd', ROUND(r.perdas_qtd::numeric, 3),
        'perdas_valor', ROUND(r.perdas_valor::numeric, 2)
      ))
      FROM (SELECT * FROM ranked WHERE perdas_qtd > 0 ORDER BY perdas_valor DESC LIMIT 5) r
    ), '[]'::jsonb),
    'categorias', COALESCE((
      SELECT jsonb_agg(DISTINCT categoria) FROM item_data WHERE custo_consumido > 0
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_saldo_produtos(p_produto_ids uuid[])
 RETURNS TABLE(produto_id uuid, saldo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := assert_tenant();
  RETURN QUERY
  SELECT p.id, p.saldo_atual
  FROM public.produtos p
  WHERE p.id = ANY(p_produto_ids) AND p.company_id = v_company;
END; $function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_salmon_inventory_adjustment_kg()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company       uuid;
  v_produto_id    uuid;
  v_adjustment_kg numeric := 0;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'salmon:estoque:view', 'salmon:dashboard:view', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT id INTO v_produto_id
    FROM public.produtos
   WHERE company_id        = v_company
     AND is_salmon_raw_linked = true
   LIMIT 1;

  IF v_produto_id IS NULL THEN
    RETURN jsonb_build_object('adjustment_kg', 0, 'produto_found', false);
  END IF;

  SELECT COALESCE(SUM(
    CASE tipo
      WHEN 'AJUSTE_INVENTARIO_POSITIVO' THEN  quantidade
      WHEN 'AJUSTE_INVENTARIO_NEGATIVO' THEN -quantidade
      ELSE 0
    END
  ), 0)
    INTO v_adjustment_kg
    FROM public.movimentacoes_estoque
   WHERE company_id = v_company
     AND produto_id = v_produto_id
     AND status     = 'ATIVO'
     AND tipo IN ('AJUSTE_INVENTARIO_POSITIVO', 'AJUSTE_INVENTARIO_NEGATIVO');

  RETURN jsonb_build_object(
    'adjustment_kg',  v_adjustment_kg,
    'produto_found',  true
  );
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_consumption_history(p_start_date date, p_end_date date, p_group_by text DEFAULT 'daily'::text, p_product_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
    v_result jsonb;
BEGIN
    v_company := public.assert_tenant();

    WITH filtered_mov AS (
        SELECT
            m.produto_id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            m.quantidade,
            m.custo_unitario,
            m.created_at::date AS mov_date
        FROM public.movimentacoes_estoque m
        JOIN public.produtos p ON p.id = m.produto_id AND p.company_id = v_company
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
          AND (p_product_id IS NULL OR m.produto_id = p_product_id)
          AND (p_category IS NULL OR p.categoria = p_category)
    ),
    timeline AS (
        SELECT
            CASE p_group_by
                WHEN 'weekly' THEN date_trunc('week', fm.mov_date)::date
                WHEN 'monthly' THEN date_trunc('month', fm.mov_date)::date
                ELSE fm.mov_date
            END AS period,
            ROUND(SUM(fm.quantidade)::numeric, 4) AS total_qty,
            ROUND(SUM(fm.quantidade * fm.custo_unitario)::numeric, 2) AS total_cost
        FROM filtered_mov fm
        GROUP BY 1
        ORDER BY 1
    ),
    timeline_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'period', t.period,
            'total_qty', t.total_qty,
            'total_cost', t.total_cost
        ) ORDER BY t.period), '[]'::jsonb) AS data
        FROM timeline t
    ),
    product_summary AS (
        SELECT
            fm.produto_id,
            fm.nome_produto,
            fm.categoria,
            fm.unidade_medida,
            ROUND(SUM(fm.quantidade)::numeric, 4) AS consumo_total,
            ROUND(SUM(fm.quantidade * fm.custo_unitario)::numeric, 2) AS custo_total,
            COUNT(DISTINCT fm.mov_date) AS dias_com_consumo,
            MIN(fm.mov_date) AS primeiro_consumo,
            MAX(fm.mov_date) AS ultimo_consumo
        FROM filtered_mov fm
        GROUP BY fm.produto_id, fm.nome_produto, fm.categoria, fm.unidade_medida
    ),
    product_enriched AS (
        SELECT
            ps.*,
            ROUND(ps.consumo_total / GREATEST((p_end_date - p_start_date + 1), 1), 4) AS media_diaria,
            ROUND(ps.consumo_total / GREATEST(CEIL((p_end_date - p_start_date + 1)::numeric / 7), 1), 4) AS media_semanal
        FROM product_summary ps
    ),
    products_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', pe.produto_id,
            'nome_produto', pe.nome_produto,
            'categoria', pe.categoria,
            'unidade_medida', pe.unidade_medida,
            'consumo_total', pe.consumo_total,
            'custo_total', pe.custo_total,
            'dias_com_consumo', pe.dias_com_consumo,
            'media_diaria', pe.media_diaria,
            'media_semanal', pe.media_semanal,
            'ultimo_consumo', pe.ultimo_consumo
        ) ORDER BY pe.consumo_total DESC), '[]'::jsonb) AS data
        FROM product_enriched pe
    ),
    top10_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'nome_produto', pe.nome_produto,
            'consumo_total', pe.consumo_total,
            'unidade_medida', pe.unidade_medida,
            'custo_total', pe.custo_total
        ) ORDER BY pe.consumo_total DESC), '[]'::jsonb) AS data
        FROM (SELECT * FROM product_enriched ORDER BY consumo_total DESC LIMIT 10) pe
    ),
    cat_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', sub.categoria,
            'consumo_total', sub.consumo_total,
            'custo_total', sub.custo_total,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.consumo_total DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(pe.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(pe.consumo_total)::numeric, 4) AS consumo_total,
                ROUND(SUM(pe.custo_total)::numeric, 2) AS custo_total,
                COUNT(*)::int AS qtd_itens
            FROM product_enriched pe
            GROUP BY 1
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(fm.quantidade), 0)::numeric, 4) AS consumo_total,
            ROUND(COALESCE(SUM(fm.quantidade * fm.custo_unitario), 0)::numeric, 2) AS custo_total,
            COUNT(DISTINCT fm.produto_id)::int AS itens_distintos,
            COUNT(DISTINCT fm.mov_date)::int AS dias_com_consumo
        FROM filtered_mov fm
    )
    SELECT jsonb_build_object(
        'consumo_total', tt.consumo_total,
        'custo_total', tt.custo_total,
        'itens_distintos', tt.itens_distintos,
        'dias_com_consumo', tt.dias_com_consumo,
        'timeline', tl.data,
        'produtos', pj.data,
        'top10', t10.data,
        'categorias', cj.data
    ) INTO v_result
    FROM totals tt, timeline_json tl, products_json pj, top10_json t10, cat_json cj;

    RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_predictive_analysis(p_category_id text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_base_window_days integer DEFAULT 30, p_target_coverage_days integer DEFAULT 7, p_only_critical boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := public.assert_tenant();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant inválido';
  END IF;
  PERFORM assert_tenant();

  WITH active_products AS (
    SELECT p.id, p.nome_produto, p.categoria, p.unidade_medida,
           p.custo_padrao, p.estoque_minimo, p.ativo,
           COALESCE(p.custo_medio_30d, p.custo_ultima_compra, p.custo_padrao, 0) AS custo_unitario
    FROM produtos p
    WHERE p.company_id = v_company_id
      AND p.ativo = true
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND (p_category_id IS NULL OR p.categoria = p_category_id)
  ),
  saldos AS (
    SELECT m.produto_id,
           SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo_atual
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id
      AND m.status = 'ATIVO'
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  consumo_7d AS (
    SELECT m.produto_id,
           SUM(m.quantidade) AS total_consumo,
           COUNT(DISTINCT m.data) AS dias_com_consumo
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id
      AND m.status = 'ATIVO'
      AND m.direction = 'OUT'
      AND m.tipo IN ('SAIDA', 'BAIXA_PERDA', 'SAIDA_TRANSFERENCIA')
      AND m.data >= (current_date - interval '7 days')
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  consumo_30d AS (
    SELECT m.produto_id,
           SUM(m.quantidade) AS total_consumo,
           COUNT(DISTINCT m.data) AS dias_com_consumo
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id
      AND m.status = 'ATIVO'
      AND m.direction = 'OUT'
      AND m.tipo IN ('SAIDA', 'BAIXA_PERDA', 'SAIDA_TRANSFERENCIA')
      AND m.data >= (current_date - interval '30 days')
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  analise AS (
    SELECT
      ap.id AS produto_id, ap.nome_produto, ap.categoria, ap.unidade_medida, ap.custo_unitario,
      COALESCE(s.saldo_atual, 0) AS saldo_atual,
      COALESCE(c7.total_consumo, 0) AS consumo_total_7d,
      COALESCE(c7.dias_com_consumo, 0) AS dias_consumo_7d,
      COALESCE(c30.total_consumo, 0) AS consumo_total_30d,
      COALESCE(c30.dias_com_consumo, 0) AS dias_consumo_30d,
      CASE WHEN COALESCE(c7.dias_com_consumo, 0) > 0 THEN c7.total_consumo / 7.0 ELSE 0 END AS media_diaria_7d,
      CASE WHEN COALESCE(c30.dias_com_consumo, 0) > 0 THEN c30.total_consumo / 30.0 ELSE 0 END AS media_diaria_30d
    FROM active_products ap
    LEFT JOIN saldos s ON s.produto_id = ap.id
    LEFT JOIN consumo_7d c7 ON c7.produto_id = ap.id
    LEFT JOIN consumo_30d c30 ON c30.produto_id = ap.id
  ),
  resultado AS (
    SELECT a.*,
      CASE
        WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7) + (a.media_diaria_30d * 0.3)
        WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d
        WHEN a.media_diaria_30d > 0 THEN a.media_diaria_30d
        ELSE 0
      END AS consumo_previsto_diario,
      CASE
        WHEN a.media_diaria_7d = 0 AND a.media_diaria_30d = 0 THEN 'sem_dados'
        WHEN a.media_diaria_30d = 0 THEN 'subindo'
        WHEN a.media_diaria_7d > a.media_diaria_30d * 1.15 THEN 'subindo'
        WHEN a.media_diaria_7d < a.media_diaria_30d * 0.85 THEN 'caindo'
        ELSE 'estavel'
      END AS tendencia
    FROM analise a
  ),
  final AS (
    SELECT r.*,
      CASE WHEN r.consumo_previsto_diario > 0 THEN r.saldo_atual / r.consumo_previsto_diario ELSE 999 END AS cobertura_dias,
      CASE
        WHEN r.consumo_previsto_diario = 0 THEN 'sem_consumo'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 1 THEN 'ruptura_iminente'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 3 THEN 'critico'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 7 THEN 'atencao'
        ELSE 'sem_risco'
      END AS status_risco,
      GREATEST(0, (p_target_coverage_days * r.consumo_previsto_diario) - r.saldo_atual) AS sugestao_compra,
      GREATEST(0, (p_target_coverage_days * r.consumo_previsto_diario) - r.saldo_atual) * r.custo_unitario AS custo_estimado_compra
    FROM resultado r
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', f.produto_id, 'nome_produto', f.nome_produto, 'categoria', f.categoria,
        'unidade_medida', f.unidade_medida, 'custo_unitario', ROUND(f.custo_unitario::numeric, 2),
        'saldo_atual', ROUND(f.saldo_atual::numeric, 3), 'media_diaria_7d', ROUND(f.media_diaria_7d::numeric, 3),
        'media_diaria_30d', ROUND(f.media_diaria_30d::numeric, 3),
        'consumo_previsto_diario', ROUND(f.consumo_previsto_diario::numeric, 3),
        'cobertura_dias', ROUND(LEAST(f.cobertura_dias, 999)::numeric, 1),
        'tendencia', f.tendencia, 'status_risco', f.status_risco,
        'sugestao_compra', ROUND(f.sugestao_compra::numeric, 3),
        'custo_estimado_compra', ROUND(f.custo_estimado_compra::numeric, 2)
      ) ORDER BY
        CASE f.status_risco WHEN 'ruptura_iminente' THEN 1 WHEN 'critico' THEN 2 WHEN 'atencao' THEN 3 WHEN 'sem_risco' THEN 4 ELSE 5 END,
        f.cobertura_dias ASC
      )
      FROM final f
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
        'itens_cobertura_abaixo_3d', COUNT(*) FILTER (WHERE f.cobertura_dias < 3 AND f.consumo_previsto_diario > 0)
      )
      FROM final f
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_stock_summary()
 RETURNS TABLE(total_stock_value numeric, items_count integer, missing_cost_items_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
BEGIN
    v_company := public.assert_tenant();

    IF NOT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:dashboard:view', 'estoque:saldo:view', 'stock:read', 'estoque:movimentacoes:view', 'system:global:manage'
    ]) THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;

    RETURN QUERY
    WITH product_data AS (
        SELECT
            COALESCE(p.saldo_atual, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS effective_cost
        FROM public.produtos p
        WHERE p.company_id = v_company
          AND p.ativo = true
    ),
    active_totals AS (
        SELECT
            COALESCE(SUM(pd.saldo * pd.effective_cost), 0)::numeric AS total_val,
            COUNT(*)::integer AS cnt,
            COALESCE(COUNT(*) FILTER (WHERE pd.effective_cost = 0), 0)::integer AS missing_costs
        FROM product_data pd
    )
    SELECT
        ROUND(at.total_val, 2) AS total_stock_value,
        at.cnt AS items_count,
        at.missing_costs AS missing_cost_items_count,
        now() AS updated_at
    FROM active_totals at;
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_supplier_ranking(p_stock_item_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort text DEFAULT 'cheapest'::text)
 RETURNS TABLE(supplier_id text, supplier_uuid uuid, supplier_name text, avg_unit_cost numeric, min_unit_cost numeric, max_unit_cost numeric, last_price numeric, last_updated_at timestamp with time zone, items_count bigint, rank_position bigint, has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit INT := LEAST(COALESCE(p_limit, 50), 200);
  v_company uuid := assert_tenant();
BEGIN
  IF NOT has_any_permission(auth.uid(), ARRAY['compras:ranking:view', 'purchases:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (compras:ranking:view).';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      sip.supplier_id AS sid,
      sip.supplier_uuid AS suuid,
      COALESCE(s.name, sip.supplier_id) AS sname,
      sip.unit_cost,
      sip.last_updated_at AS lua,
      sip.stock_item_id
    FROM supplier_item_prices sip
    LEFT JOIN suppliers s ON s.id = sip.supplier_uuid AND s.company_id = v_company
    WHERE
      sip.company_id = v_company
      AND (p_stock_item_id IS NULL OR sip.stock_item_id = p_stock_item_id)
      AND (p_category IS NULL OR EXISTS (
        SELECT 1 FROM produtos p WHERE p.id = sip.stock_item_id AND p.categoria = p_category AND p.company_id = v_company
      ))
  ),
  agg AS (
    SELECT
      b.sid, b.suuid, b.sname,
      ROUND(AVG(b.unit_cost)::numeric, 4) AS avg_cost,
      ROUND(MIN(b.unit_cost)::numeric, 4) AS min_cost,
      ROUND(MAX(b.unit_cost)::numeric, 4) AS max_cost,
      COUNT(DISTINCT b.stock_item_id) AS cnt,
      MAX(b.lua) AS last_ua
    FROM base b
    GROUP BY b.sid, b.suuid, b.sname
  ),
  ranked AS (
    SELECT a.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_sort = 'cheapest' THEN a.avg_cost END ASC,
          CASE WHEN p_sort = 'expensive' THEN a.avg_cost END DESC,
          a.sname ASC
      ) AS rn
    FROM agg a
  ),
  with_last AS (
    SELECT r.*,
      (SELECT b2.unit_cost FROM base b2 WHERE b2.sid = r.sid ORDER BY b2.lua DESC LIMIT 1) AS lp
    FROM ranked r
    WHERE r.rn > p_offset
    ORDER BY r.rn
    LIMIT v_limit + 1
  )
  SELECT
    wl.sid, wl.suuid, wl.sname,
    wl.avg_cost, wl.min_cost, wl.max_cost, wl.lp, wl.last_ua,
    wl.cnt, wl.rn,
    (ROW_NUMBER() OVER () > v_limit) AS has_more
  FROM with_last wl
  LIMIT v_limit;
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.has_any_permission(_user_id uuid, _permissions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.get_effective_permissions(_user_id)) AS ep(perm)
    WHERE perm = ANY(_permissions)
  );
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.has_permission(_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_permission(auth.uid(), _permission);
$function$

-- ACL: null
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT COALESCE(_permission=ANY(public.get_effective_permissions(_user_id)),false);
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.has_permission_quick(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.has_permission(_user_id,_permission);
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_movimentacoes_cursor(p_direction text DEFAULT NULL::text, p_produto_id uuid DEFAULT NULL::uuid, p_categoria text DEFAULT NULL::text, p_setor text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_show_cancelled boolean DEFAULT false, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, produto_id uuid, data date, tipo text, quantidade numeric, custo_unitario numeric, custo_total numeric, origem text, referencia_id text, observacao text, created_by uuid, created_at timestamp with time zone, status text, estorno_de_id uuid, justificativa_cancelamento text, justificativa_edicao text, setor text, reference_type text, reference_id text, internal_transfer boolean, source_module text, salmon_lot_id text, direction text, has_more boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actual_limit int := LEAST(COALESCE(p_limit, 50), 200);
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'stock:read',
    'stock:movements:read',
    'estoque:movimentacoes:view',
    'cmv:categoria:view',
    'cmv:top-itens:view',
    'cmv:setor:view',
    'cmv:semanal:view',
    'estoque:simulador:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      m.id,
      m.produto_id,
      m.data,
      m.tipo,
      m.quantidade,
      m.custo_unitario,
      m.custo_total,
      m.origem,
      m.referencia_id,
      m.observacao,
      m.created_by,
      m.created_at,
      m.status,
      m.estorno_de_id,
      m.justificativa_cancelamento,
      m.justificativa_edicao,
      m.setor,
      m.reference_type,
      m.reference_id,
      m.internal_transfer,
      m.source_module,
      m.salmon_lot_id,
      m.direction
    FROM public.movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND (p_direction IS NULL OR m.direction = p_direction)
      AND (p_produto_id IS NULL OR m.produto_id = p_produto_id)
      AND (p_categoria IS NULL OR EXISTS (
        SELECT 1
        FROM public.produtos p
        WHERE p.id = m.produto_id
          AND p.company_id = v_company
          AND p.categoria = p_categoria
      ))
      AND (p_setor IS NULL OR m.setor = p_setor)
      AND (p_date_from IS NULL OR m.data >= p_date_from)
      AND (p_date_to IS NULL OR m.data <= p_date_to)
      AND (p_show_cancelled OR m.status = 'ATIVO')
      AND (
        p_cursor_created_at IS NULL
        OR (m.created_at, m.id) < (
          p_cursor_created_at,
          COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_actual_limit + 1
  )
  SELECT
    f.id,
    f.produto_id,
    f.data,
    f.tipo,
    f.quantidade,
    f.custo_unitario,
    f.custo_total,
    f.origem,
    f.referencia_id,
    f.observacao,
    f.created_by,
    f.created_at,
    f.status,
    f.estorno_de_id,
    f.justificativa_cancelamento,
    f.justificativa_edicao,
    f.setor,
    f.reference_type,
    f.reference_id,
    f.internal_transfer,
    f.source_module,
    f.salmon_lot_id,
    f.direction,
    (ROW_NUMBER() OVER () > v_actual_limit) AS has_more
  FROM filtered f
  LIMIT v_actual_limit;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_report_items_cursor(p_start date, p_end date, p_limit integer DEFAULT 20, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text, p_sort_key text DEFAULT 'consumo'::text, p_sort_asc boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actual_limit int := LEAST(COALESCE(p_limit, 20), 100);
  v_result jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:itens:view).';
  END IF;

  WITH item_metrics AS (
    SELECT
      p.id AS produto_id,
      p.nome_produto,
      p.categoria,
      p.unidade_medida,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
            WHEN m.direction = 'IN' THEN m.quantidade
            ELSE -m.quantidade
          END
        )
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) AS saldo_atual,
      COALESCE(NULLIF(p.avg30_cost_base_unit, 0), NULLIF(p.last_cost_base_unit, 0), NULLIF(p.default_cost_base_unit, 0), 0) AS custo_base,
      COALESCE((
        SELECT CASE WHEN SUM(m.quantidade) > 0 THEN SUM(m.custo_total) / SUM(m.quantidade) ELSE NULL END
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), NULLIF(p.last_cost_purchase_unit, 0)) AS custo_medio_periodo,
      COALESCE((
        SELECT m.custo_unitario
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        ORDER BY m.data DESC, m.created_at DESC
        LIMIT 1
      ), NULLIF(p.last_cost_purchase_unit, 0), 0) AS ultimo_preco,
      -- consumo_periodo: all OUT movements (including salmon internal transfers)
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS consumo_periodo,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS custo_consumido,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_qtd,
      COALESCE((
        SELECT MAX(m.created_at)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), p.created_at) AS last_movement_at
    FROM produtos p
    WHERE p.ativo = true
      AND p.company_id = v_company
      AND p.conta_no_cmv = true
      AND (p_search IS NULL OR p.nome_produto ILIKE '%' || p_search || '%')
      AND (p_categoria IS NULL OR p.categoria = p_categoria)
  ),
  enriched AS (
    SELECT
      im.*,
      ROUND((im.saldo_atual * im.custo_base)::numeric, 2) AS valor_estoque,
      CASE WHEN im.custo_medio_periodo IS NOT NULL AND im.custo_medio_periodo > 0
        THEN ROUND(((im.ultimo_preco - im.custo_medio_periodo) / im.custo_medio_periodo * 100)::numeric, 1)
        ELSE 0 END AS variacao_percent,
      CASE WHEN (im.consumo_periodo + im.perdas_qtd) > 0
        THEN ROUND((im.perdas_qtd / (im.consumo_periodo + im.perdas_qtd) * 100)::numeric, 1)
        ELSE 0 END AS desperdicio_percent,
      CASE WHEN im.saldo_atual > 0 AND im.consumo_periodo > 0
        THEN ROUND((im.consumo_periodo / im.saldo_atual)::numeric, 2)
        ELSE 0 END AS giro
    FROM item_metrics im
  ),
  sorted AS (
    SELECT * FROM enriched
    WHERE CASE
      WHEN p_cursor_created_at IS NOT NULL AND p_cursor_id IS NOT NULL THEN
        CASE WHEN p_sort_asc THEN
          (last_movement_at, produto_id) > (p_cursor_created_at, p_cursor_id)
        ELSE
          (last_movement_at, produto_id) < (p_cursor_created_at, p_cursor_id)
        END
      ELSE true
    END
    ORDER BY
      CASE WHEN p_sort_key = 'consumo' AND NOT p_sort_asc THEN custo_consumido END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'consumo' AND p_sort_asc THEN custo_consumido END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND NOT p_sort_asc THEN perdas_qtd END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND p_sort_asc THEN perdas_qtd END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND NOT p_sort_asc THEN giro END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND p_sort_asc THEN giro END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND NOT p_sort_asc THEN variacao_percent END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND p_sort_asc THEN variacao_percent END ASC NULLS LAST,
      last_movement_at DESC, produto_id DESC
    LIMIT v_actual_limit + 1
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'produto_id', s.produto_id,
      'nome', s.nome_produto,
      'categoria', s.categoria,
      'unidade', s.unidade_medida,
      'saldo', ROUND(s.saldo_atual::numeric, 2),
      'custo_base', ROUND(s.custo_base::numeric, 4),
      'custo_medio_periodo', ROUND(COALESCE(s.custo_medio_periodo, 0)::numeric, 4),
      'ultimo_preco', ROUND(s.ultimo_preco::numeric, 4),
      'consumo_periodo', ROUND(s.consumo_periodo::numeric, 3),
      'custo_consumido', ROUND(s.custo_consumido::numeric, 2),
      'perdas_qtd', ROUND(s.perdas_qtd::numeric, 3),
      'valor_estoque', s.valor_estoque,
      'variacao_percent', s.variacao_percent,
      'desperdicio_percent', s.desperdicio_percent,
      'giro', s.giro,
      'cursor_created_at', s.last_movement_at,
      'cursor_id', s.produto_id
    ) ORDER BY
      CASE WHEN p_sort_key = 'consumo' AND NOT p_sort_asc THEN s.custo_consumido END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'consumo' AND p_sort_asc THEN s.custo_consumido END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND NOT p_sort_asc THEN s.perdas_qtd END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND p_sort_asc THEN s.perdas_qtd END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND NOT p_sort_asc THEN s.giro END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND p_sort_asc THEN s.giro END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND NOT p_sort_asc THEN s.variacao_percent END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND p_sort_asc THEN s.variacao_percent END ASC NULLS LAST,
      s.last_movement_at DESC, s.produto_id DESC
    ) FROM (SELECT * FROM sorted LIMIT v_actual_limit) s), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) > v_actual_limit FROM sorted)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_report_items_page(p_start date, p_end date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text, p_sort_key text DEFAULT 'percentCMV'::text, p_sort_asc boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  -- Semanas do período, para "cobertura em semanas" (mín. 1 dia).
  v_weeks numeric := GREATEST((p_end - p_start + 1)::numeric, 1) / 7;
  v_search text := NULLIF(btrim(lower(public.immutable_unaccent(COALESCE(p_search, '')))), '');
  v_sort text := CASE
    WHEN p_sort_key IN ('nome', 'consumo', 'custoMedio', 'variacao', 'giro', 'percentCMV', 'desperdicio', 'cobertura')
      THEN p_sort_key
    ELSE 'percentCMV'
  END;
  v_asc boolean := COALESCE(p_sort_asc, false);
  v_company uuid;
  v_result jsonb;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:itens:view).';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search := replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT
      p.id,
      p.nome_produto,
      p.nome_produto_unaccent,
      p.categoria,
      p.unidade_medida,
      COALESCE(p.saldo_atual, 0) AS saldo_atual,
      COALESCE(NULLIF(p.avg30_cost_base_unit, 0), NULLIF(p.last_cost_base_unit, 0), NULLIF(p.default_cost_base_unit, 0), 0) AS custo_base,
      NULLIF(p.last_cost_purchase_unit, 0) AS last_cost_purchase_unit,
      p.created_at
    FROM produtos p
    WHERE p.company_id = v_company
      AND p.ativo = true
      AND p.conta_no_cmv = true
  ),
  mov AS (
    SELECT
      m.produto_id,
      SUM(m.quantidade) FILTER (
        WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS consumo_periodo,
      SUM(m.custo_total) FILTER (
        WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS custo_consumido,
      SUM(m.quantidade) FILTER (
        WHERE m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ) AS perdas_qtd,
      SUM(m.quantidade) FILTER (
        WHERE m.direction = 'IN' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS qtd_entrada,
      SUM(m.custo_total) FILTER (
        WHERE m.direction = 'IN' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS custo_entrada,
      MAX(m.created_at) AS last_movement_at
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO'
    GROUP BY m.produto_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.produto_id) m.produto_id, m.custo_unitario
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO'
      AND m.direction = 'IN'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    ORDER BY m.produto_id, m.data DESC, m.created_at DESC
  ),
  metrics AS (
    SELECT
      b.*,
      COALESCE(mv.consumo_periodo, 0) AS consumo_periodo,
      COALESCE(mv.custo_consumido, 0) AS custo_consumido,
      COALESCE(mv.perdas_qtd, 0) AS perdas_qtd,
      COALESCE(
        CASE WHEN mv.qtd_entrada > 0 THEN mv.custo_entrada / mv.qtd_entrada END,
        b.last_cost_purchase_unit
      ) AS custo_medio_periodo,
      COALESCE(u.custo_unitario, b.last_cost_purchase_unit, 0) AS ultimo_preco,
      COALESCE(mv.last_movement_at, b.created_at) AS last_movement_at
    FROM base b
    LEFT JOIN mov mv ON mv.produto_id = b.id
    LEFT JOIN ultimo u ON u.produto_id = b.id
  ),
  -- % CMV é a fatia do item no custo consumido de TODOS os itens do CMV,
  -- independente da busca/categoria aplicada na tela.
  total AS (
    SELECT COALESCE(SUM(custo_consumido), 0) AS total_custo FROM metrics
  ),
  enriched AS (
    SELECT
      m.*,
      ROUND((m.saldo_atual * m.custo_base)::numeric, 2) AS valor_estoque,
      CASE WHEN m.custo_medio_periodo > 0
        THEN ROUND(((m.ultimo_preco - m.custo_medio_periodo) / m.custo_medio_periodo * 100)::numeric, 1)
        ELSE 0 END AS variacao_percent,
      CASE WHEN (m.consumo_periodo + m.perdas_qtd) > 0
        THEN ROUND((m.perdas_qtd / (m.consumo_periodo + m.perdas_qtd) * 100)::numeric, 1)
        ELSE 0 END AS desperdicio_percent,
      CASE WHEN m.saldo_atual > 0 AND m.consumo_periodo > 0
        THEN ROUND((m.consumo_periodo / m.saldo_atual)::numeric, 2)
        ELSE 0 END AS giro,
      CASE WHEN m.saldo_atual > 0 AND m.consumo_periodo > 0
        THEN ROUND((m.saldo_atual / (m.consumo_periodo / v_weeks))::numeric, 1)
        ELSE 0 END AS cobertura_semanas,
      CASE WHEN t.total_custo > 0
        THEN (m.custo_consumido / t.total_custo * 100)
        ELSE 0 END AS percent_cmv
    FROM metrics m
    CROSS JOIN total t
    WHERE (v_search IS NULL OR m.nome_produto_unaccent LIKE '%' || v_search || '%')
      AND (p_categoria IS NULL OR m.categoria = p_categoria)
  ),
  ranked AS (
    SELECT
      e.*,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN v_sort = 'nome' AND v_asc THEN e.nome_produto END ASC,
          CASE WHEN v_sort = 'nome' AND NOT v_asc THEN e.nome_produto END DESC,
          CASE WHEN v_asc THEN (CASE v_sort
            WHEN 'consumo' THEN e.consumo_periodo
            WHEN 'custoMedio' THEN e.custo_medio_periodo
            WHEN 'variacao' THEN e.variacao_percent
            WHEN 'giro' THEN e.giro
            WHEN 'percentCMV' THEN e.percent_cmv
            WHEN 'desperdicio' THEN e.desperdicio_percent
            WHEN 'cobertura' THEN e.cobertura_semanas
          END) END ASC NULLS LAST,
          CASE WHEN NOT v_asc THEN (CASE v_sort
            WHEN 'consumo' THEN e.consumo_periodo
            WHEN 'custoMedio' THEN e.custo_medio_periodo
            WHEN 'variacao' THEN e.variacao_percent
            WHEN 'giro' THEN e.giro
            WHEN 'percentCMV' THEN e.percent_cmv
            WHEN 'desperdicio' THEN e.desperdicio_percent
            WHEN 'cobertura' THEN e.cobertura_semanas
          END) END DESC NULLS LAST,
          -- Desempate estável (paginação por OFFSET não pode repetir/pular itens).
          e.nome_produto ASC,
          e.id ASC
      ) AS rn
    FROM enriched e
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', r.id,
        'nome', r.nome_produto,
        'categoria', r.categoria,
        'unidade', r.unidade_medida,
        'saldo', ROUND(r.saldo_atual::numeric, 2),
        'custo_base', ROUND(r.custo_base::numeric, 4),
        'custo_medio_periodo', ROUND(COALESCE(r.custo_medio_periodo, 0)::numeric, 4),
        'ultimo_preco', ROUND(r.ultimo_preco::numeric, 4),
        'consumo_periodo', ROUND(r.consumo_periodo::numeric, 3),
        'custo_consumido', ROUND(r.custo_consumido::numeric, 2),
        'perdas_qtd', ROUND(r.perdas_qtd::numeric, 3),
        'valor_estoque', r.valor_estoque,
        'variacao_percent', r.variacao_percent,
        'desperdicio_percent', r.desperdicio_percent,
        'giro', r.giro,
        'cobertura_semanas', r.cobertura_semanas,
        'percent_cmv', ROUND(r.percent_cmv::numeric, 2),
        'last_movement_at', r.last_movement_at
      ) ORDER BY r.rn)
      FROM ranked r
      WHERE r.rn > v_offset AND r.rn <= v_offset + v_limit
    ), '[]'::jsonb),
    'total_count', COALESCE((SELECT MAX(total_count) FROM ranked), 0),
    'has_more', COALESCE((SELECT MAX(total_count) FROM ranked), 0) > v_offset + v_limit
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_stock_transfers(p_start_date date DEFAULT ((now() - '30 days'::interval))::date, p_end_date date DEFAULT (now())::date, p_product_id uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company_id uuid;
    v_transfers jsonb;
    v_total bigint;
BEGIN
    v_company_id := public.assert_tenant();

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Tenant inválido';
    END IF;

    IF NOT public.has_any_permission(auth.uid(), ARRAY['estoque:transferencias:view', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Permissão negada: estoque:transferencias:view necessário';
    END IF;

    SELECT count(DISTINCT reference_id) INTO v_total
    FROM public.movimentacoes_estoque
    WHERE company_id = v_company_id
      AND reference_type = 'INTERNAL_TRANSFER'
      AND internal_transfer = true
      AND direction = 'OUT'
      AND status = 'ATIVO'
      AND data >= p_start_date
      AND data <= p_end_date
      AND (p_product_id IS NULL OR produto_id = p_product_id)
      AND (p_location IS NULL OR setor ILIKE '%' || p_location || '%');

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_transfers
    FROM (
        SELECT
            m_out.reference_id AS transfer_group_id,
            m_out.produto_id,
            p.nome_produto,
            p.unidade_medida,
            p.categoria,
            m_out.quantidade,
            m_out.custo_unitario,
            m_out.custo_total,
            m_out.setor AS from_location,
            m_in.setor AS to_location,
            m_out.observacao,
            m_out.created_by,
            m_out.created_at,
            m_out.data,
            pr.email AS actor_email
        FROM public.movimentacoes_estoque m_out
        JOIN public.produtos p ON p.id = m_out.produto_id
        LEFT JOIN public.movimentacoes_estoque m_in
            ON m_in.reference_id = m_out.reference_id
            AND m_in.reference_type = 'INTERNAL_TRANSFER'
            AND m_in.direction = 'IN'
            AND m_in.company_id = v_company_id
            AND m_in.status = 'ATIVO'
        LEFT JOIN public.profiles pr ON pr.id = m_out.created_by
        WHERE m_out.company_id = v_company_id
          AND m_out.reference_type = 'INTERNAL_TRANSFER'
          AND m_out.internal_transfer = true
          AND m_out.direction = 'OUT'
          AND m_out.status = 'ATIVO'
          AND m_out.data >= p_start_date
          AND m_out.data <= p_end_date
          AND (p_product_id IS NULL OR m_out.produto_id = p_product_id)
          AND (p_location IS NULL OR m_out.setor ILIKE '%' || p_location || '%' OR m_in.setor ILIKE '%' || p_location || '%')
        ORDER BY m_out.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) t;

    RETURN jsonb_build_object(
        'transfers', v_transfers,
        'total', v_total
    );
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.produtos_force_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.company_id := public.get_current_company_id_strict();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.company_id := OLD.company_id;
  END IF;

  RETURN NEW;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report_quick(p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb := '{}'::jsonb;
  _fails int := 0;
  _section jsonb;
  _critical_tables text[] := ARRAY[
    'produtos','suppliers','movimentacoes_estoque','purchase_orders',
    'purchase_order_items','salmon_entries','fin_lancamentos'
  ];
BEGIN
  IF NOT COALESCE(public.has_permission(p_actor_user_id, 'system:global:manage'), false) THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;

  -- 1) FORCE RLS on critical tables: FAIL only if rls OFF or force_rls OFF
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', c.relname,
    'rls_enabled', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity,
    'status', CASE WHEN c.relrowsecurity AND c.relforcerowsecurity THEN 'PASS' ELSE 'FAIL' END
  ) ORDER BY c.relname), '[]'::jsonb) INTO _section
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname = ANY(_critical_tables);

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = ANY(_critical_tables)
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('force_rls_critical', _section);

  -- 2) Dangerous policies: qual literally = 'true' (wide open)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', p.tablename,
    'policy', p.policyname,
    'cmd', p.cmd,
    'qual_preview', left(p.qual::text, 120)
  ) ORDER BY p.tablename, p.policyname), '[]'::jsonb) INTO _section
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = ANY(_critical_tables)
    AND p.qual::text = 'true';

  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('dangerous_policies', _section);

  -- 3) has_permission single-arg: match literal string arg like has_permission('perm')
  --    NOT auth.uid() which is a valid 2-arg call split across parens
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', p.tablename,
    'policy', p.policyname,
    'fragment', substring(p.qual::text from 'has_permission\(''[^'']+?''\)')
  ) ORDER BY p.tablename), '[]'::jsonb) INTO _section
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = ANY(_critical_tables)
    AND (
      p.qual::text ~ 'has_permission\(''[^'']+?''\)'
      OR COALESCE(p.with_check::text, '') ~ 'has_permission\(''[^'']+?''\)'
    );

  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('has_permission_single_arg', _section);

  -- 4) Extensions in public schema
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'extension', e.extname,
    'status', CASE WHEN e.extname = 'pg_net' THEN 'WARN' ELSE 'OK' END
  )), '[]'::jsonb) INTO _section
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE n.nspname = 'public';

  _result := _result || jsonb_build_object('extensions_in_public', _section);

  _result := jsonb_build_object(
    'status', CASE WHEN _fails = 0 THEN 'PASS' ELSE 'FAIL' END,
    'fail_count', _fails,
    'mode', 'quick'
  ) || _result;

  RETURN _result;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.recalc_product_costs(p_produto_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last RECORD;
  v_avg30 RECORD;
BEGIN
  SELECT m.custo_unitario, m.data,
         CASE
           WHEN m.reference_type = 'SALMON_ENTRY' THEN (SELECT supplier_name FROM salmon_entries WHERE id = m.reference_id::uuid AND status = 'ACTIVE' LIMIT 1)
           WHEN m.reference_type = 'PURCHASE_ORDER_ITEM' THEN (
             SELECT po.supplier_name FROM purchase_orders po
             JOIN purchase_order_items poi ON poi.order_id = po.id
             WHERE 'POI:' || poi.id::text = m.reference_id AND poi.deleted_at IS NULL
             LIMIT 1
           )
           ELSE NULL
         END as supplier_name
  INTO v_last
  FROM movimentacoes_estoque m
  WHERE m.produto_id = p_produto_id
    AND m.status = 'ATIVO'
    AND m.cancelado_em IS NULL
    AND m.direction = 'IN'
    AND m.tipo = 'ENTRADA'
    AND m.custo_unitario > 0
  ORDER BY m.data DESC, m.created_at DESC
  LIMIT 1;

  SELECT
    COALESCE(AVG(m.custo_unitario), 0) as avg_cost,
    COUNT(*) as cnt
  INTO v_avg30
  FROM movimentacoes_estoque m
  WHERE m.produto_id = p_produto_id
    AND m.status = 'ATIVO'
    AND m.cancelado_em IS NULL
    AND m.direction = 'IN'
    AND m.tipo = 'ENTRADA'
    AND m.custo_unitario > 0
    AND m.data >= (CURRENT_DATE - interval '30 days')::date;

  UPDATE produtos SET
    last_cost_base_unit = COALESCE(v_last.custo_unitario, 0),
    last_cost_purchase_unit = COALESCE(v_last.custo_unitario, 0),
    last_purchase_date = CASE WHEN v_last.data IS NOT NULL THEN v_last.data::text ELSE NULL END,
    last_supplier = v_last.supplier_name,
    custo_ultima_compra = COALESCE(v_last.custo_unitario, 0),
    avg30_cost_base_unit = CASE WHEN v_avg30.cnt > 0 THEN ROUND(v_avg30.avg_cost::numeric, 4) ELSE 0 END,
    avg30_cost_purchase_unit = CASE WHEN v_avg30.cnt > 0 THEN ROUND(v_avg30.avg_cost::numeric, 4) ELSE 0 END,
    custo_medio_30d = CASE WHEN v_avg30.cnt > 0 THEN ROUND(v_avg30.avg_cost::numeric, 4) ELSE 0 END,
    avg30_variation_percent = CASE
      WHEN v_avg30.cnt > 0 AND COALESCE(v_last.custo_unitario, 0) > 0
      THEN ROUND(((v_avg30.avg_cost - v_last.custo_unitario) / v_last.custo_unitario * 100)::numeric, 2)
      ELSE 0
    END
  WHERE id = p_produto_id;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(p_order_id uuid, p_items jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
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

  SELECT * INTO v_order FROM purchase_orders WHERE id = p_order_id AND company_id = v_company AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id; END IF;
  IF v_order.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('status','COMPLETED','items_received',0,'items_not_delivered',0,'total_confirmed',0);
  END IF;
  IF v_order.status NOT IN ('IN_RECEIVING', 'OPEN', 'SHOPPING_OK', 'PARTIAL') THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_order.status;
  END IF;

  -- Mesma ordem dos writers de preço/Salmão: produto antes de fornecedor.
  PERFORM p.id FROM public.produtos p
  JOIN public.purchase_order_items oi ON oi.stock_item_id=p.id
  WHERE oi.order_id=p_order_id AND oi.company_id=v_company AND p.company_id=v_company
    AND oi.id IN (SELECT (x->>'order_item_id')::uuid FROM jsonb_array_elements(p_items) x)
  ORDER BY p.id FOR UPDATE OF p;

  IF v_order.supplier_name IS NOT NULL AND v_order.supplier_name != '' THEN
    INSERT INTO suppliers (name, company_id) VALUES (v_order.supplier_name, v_company)
    ON CONFLICT (name, company_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM purchase_order_items
    WHERE id = (v_item->>'order_item_id')::uuid AND order_id = p_order_id AND company_id = v_company AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % não pertence ao pedido %', v_item->>'order_item_id', p_order_id;
    END IF;

    IF v_oi.stock_item_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.movimentacoes_estoque WHERE reference_type='PURCHASE_ORDER_ITEM'
      AND reference_id='POI:'||v_oi.id::text AND company_id=v_company AND status='ATIVO'
    ) THEN CONTINUE; END IF; -- Cliente já marca RECEIVED antes da confirmação; o espelho confirma a baixa.
    IF v_oi.stock_item_id IS NOT NULL THEN
      PERFORM 1 FROM public.produtos WHERE id=v_oi.stock_item_id AND company_id=v_company FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
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
          purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot, company_id
        ) VALUES (
          p_order_id, v_oi.stock_item_id, v_oi.name_snapshot, v_oi.unit_snapshot,
          v_oi.estimated_unit_value, v_qty_shortfall, 0,
          'NOT_DELIVERED',
          'Item marcado como comprado no Checklist, porém no recebimento foi informada quantidade inferior à prevista. Previsto: ' || v_oi.qty_requested || ' ' || v_oi.unit_snapshot || ', Recebido: ' || v_qty_received || ' ' || v_oi.unit_snapshot || '.',
          now(), v_caller,
          v_oi.shopping_status, v_oi.shopping_note,
          v_oi.purchase_unit_snapshot, v_oi.purchase_unit_cost_snapshot, v_oi.conversion_factor_snapshot, v_company
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
          WHERE reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id = v_ref_id AND status = 'ATIVO' AND company_id = v_company
        ) THEN
          INSERT INTO movimentacoes_estoque (
            produto_id, data, tipo, quantidade, custo_unitario, custo_total,
            origem, observacao, created_by, status,
            reference_type, reference_id, internal_transfer, source_module, company_id
          ) VALUES (
            v_oi.stock_item_id,
            COALESCE((v_item->>'movement_date')::date, CURRENT_DATE),
            'ENTRADA', v_qty_base, ROUND(v_cost_base::numeric, 4),
            ROUND((v_qty_base * v_cost_base)::numeric, 2),
            'Recebimento Pedido/Compra',
            'Recebimento atômico — Pedido ' || p_order_id::text || ' Item ' || v_oi.name_snapshot,
            v_caller, 'ATIVO', 'PURCHASE_ORDER_ITEM', v_ref_id, false, 'purchases', v_company
          ) RETURNING id INTO v_mov_id;

          UPDATE produtos SET
            last_cost_purchase_unit = COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
            last_cost_base_unit = ROUND(v_cost_base::numeric, 4),
            last_purchase_date = CURRENT_DATE::text,
            last_supplier = v_order.supplier_name
          WHERE id = v_oi.stock_item_id AND company_id = v_company;

          IF v_supplier_uuid IS NOT NULL AND v_oi.stock_item_id IS NOT NULL THEN
            INSERT INTO public.supplier_item_prices
              (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, company_id, source, last_updated_at)
            VALUES (v_order.supplier_name, v_supplier_uuid, v_oi.stock_item_id,
              COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
              COALESCE(v_oi.purchase_unit_snapshot, v_oi.unit_snapshot), v_company, 'purchases', now())
            ON CONFLICT (supplier_id, stock_item_id, company_id) DO UPDATE SET
              supplier_uuid=EXCLUDED.supplier_uuid, unit_cost=EXCLUDED.unit_cost,
              purchase_unit=EXCLUDED.purchase_unit, source=EXCLUDED.source,
              last_updated_at=EXCLUDED.last_updated_at;
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

  PERFORM public.log_audit('rpc', 'purchases', 'purchase_orders', p_order_id,
    'RECEBIMENTO_ATOMICO', NULL,
    jsonb_build_object('status',v_new_status,'received',v_items_received,'not_delivered',v_items_not_delivered));

  RETURN jsonb_build_object(
    'status', v_new_status,
    'items_received', v_items_received,
    'items_not_delivered', v_items_not_delivered,
    'total_confirmed', v_total_confirmed
  );
END;
$function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.simulate_relatorios_score(p_start date, p_end date, p_params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_custo_consumido numeric;
  v_faturamento numeric;
  v_perdas_valor numeric;
  v_meta_cmv numeric;
  v_period_days int;
  v_weeks numeric;
  v_reduzir_desperdicio numeric;
  v_reduzir_consumo numeric;
  v_target_cmv numeric;
  v_novo_perdas numeric;
  v_novo_custo numeric;
  v_novo_cmv numeric;
  v_nova_margem numeric;
  v_economia numeric;
  v_avg_weekly_cost numeric;
  v_explain jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:score:simulate', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:score:simulate).';
  END IF;

  v_reduzir_desperdicio := COALESCE((p_params->>'reduzir_perdas_percent')::numeric, 0);
  v_reduzir_consumo := COALESCE((p_params->>'reduzir_consumo_percent')::numeric, 0);
  v_target_cmv := COALESCE((p_params->>'target_cmv_percent')::numeric, 0);
  v_period_days := GREATEST((p_end - p_start) + 1, 1);
  v_weeks := GREATEST(v_period_days / 7.0, 1);

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_consumido
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;

  SELECT COALESCE(SUM(fc.faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa fc WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_perdas_valor
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO');

  SELECT COALESCE(mc.meta_cmv_total, 35) INTO v_meta_cmv FROM metas_cmv mc WHERE mc.company_id = v_company ORDER BY mc.mes_ano DESC LIMIT 1;
  IF v_meta_cmv IS NULL THEN v_meta_cmv := 35; END IF;

  v_novo_perdas := v_perdas_valor * (1 - v_reduzir_desperdicio / 100.0);
  v_novo_custo := v_custo_consumido - (v_perdas_valor - v_novo_perdas);
  v_novo_custo := v_novo_custo * (1 - v_reduzir_consumo / 100.0);
  v_novo_cmv := CASE WHEN v_faturamento > 0 THEN ROUND((v_novo_custo / v_faturamento * 100)::numeric, 2) ELSE NULL END;
  v_nova_margem := CASE WHEN v_faturamento > 0 THEN ROUND(((v_faturamento - v_novo_custo) / v_faturamento * 100)::numeric, 2) ELSE NULL END;
  v_economia := v_custo_consumido - v_novo_custo;
  v_avg_weekly_cost := v_novo_custo / v_weeks;

  v_explain := '[]'::jsonb;
  IF v_reduzir_desperdicio > 0 THEN
    v_explain := v_explain || jsonb_build_array(jsonb_build_object(
      'variavel', 'Redução desperdício', 'de', ROUND(v_perdas_valor::numeric, 2),
      'para', ROUND(v_novo_perdas::numeric, 2), 'impacto_r$', ROUND((v_perdas_valor - v_novo_perdas)::numeric, 2)));
  END IF;
  IF v_reduzir_consumo > 0 THEN
    v_explain := v_explain || jsonb_build_array(jsonb_build_object(
      'variavel', 'Redução consumo', 'percent', v_reduzir_consumo,
      'impacto_r$', ROUND((v_custo_consumido * v_reduzir_consumo / 100.0)::numeric, 2)));
  END IF;

  RETURN jsonb_build_object(
    'novo_cmv_percent', v_novo_cmv, 'nova_margem_percent', v_nova_margem,
    'economia_mensal_estimativa', ROUND(v_economia::numeric, 2),
    'novo_custo_consumido', ROUND(v_novo_custo::numeric, 2),
    'nova_margem_abs', CASE WHEN v_faturamento > 0 THEN ROUND((v_faturamento - v_novo_custo)::numeric, 2) ELSE NULL END,
    'faturamento', ROUND(v_faturamento::numeric, 2), 'meta_cmv', v_meta_cmv,
    'projecao_4_semanas', (
      SELECT jsonb_agg(jsonb_build_object('week_number', w, 'week_start', (CURRENT_DATE + ((w - 1) * 7))::text,
        'projected_cost', ROUND(v_avg_weekly_cost::numeric, 2),
        'projected_cmv_percent', CASE WHEN v_faturamento > 0 AND v_weeks > 0
          THEN ROUND((v_avg_weekly_cost / (v_faturamento / v_weeks) * 100)::numeric, 2) ELSE NULL END,
        'scenario', 'simulated'))
      FROM generate_series(1, 4) AS w
    ),
    'explain', v_explain
  );
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
        'STOCK_TRANSFER', 'movimentacoes_estoque', v_transfer_group,
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

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_produto_last_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'ATIVO' AND NEW.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN
    UPDATE produtos SET last_movement_at = NEW.created_at
    WHERE id = NEW.produto_id
      AND (last_movement_at IS NULL OR last_movement_at < NEW.created_at);
  END IF;
  RETURN NEW;
END;
$function$

-- ACL: {postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.upsert_supplier_price(p_name text, p_stock_item_id uuid, p_unit_cost numeric, p_purchase_unit text DEFAULT 'UN'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid := public.assert_tenant(); v_supplier uuid; v_price uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
  'compras:fornecedores:edit','suppliers:edit','system:global:manage'
 ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: fornecedores:edit' USING ERRCODE='42501'; END IF;
 IF p_unit_cost IS NULL OR p_unit_cost<=0 OR p_unit_cost='NaN'::numeric OR p_purchase_unit IS NULL OR btrim(p_purchase_unit)='' THEN
  RAISE EXCEPTION 'Preço/unidade inválidos' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.produtos WHERE id=p_stock_item_id AND company_id=v_company FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
 v_supplier := public.upsert_supplier(p_name);
 INSERT INTO public.supplier_item_prices(supplier_id,supplier_uuid,stock_item_id,unit_cost,purchase_unit,company_id,source,last_updated_at)
 VALUES(btrim(p_name),v_supplier,p_stock_item_id,p_unit_cost,p_purchase_unit,v_company,'manual',now())
 ON CONFLICT(supplier_id,stock_item_id,company_id) DO UPDATE SET
  supplier_uuid=EXCLUDED.supplier_uuid,unit_cost=EXCLUDED.unit_cost,purchase_unit=EXCLUDED.purchase_unit,
  source=EXCLUDED.source,last_updated_at=EXCLUDED.last_updated_at RETURNING id INTO v_price;
 -- Recurso de auditoria é o fornecedor validado; ator/origem nunca vêm do formulário.
 PERFORM public.log_audit('rpc','purchases','suppliers',v_supplier,'PRICE_UPSERT',NULL,
  jsonb_build_object('price_id',v_price,'stock_item_id',p_stock_item_id,'unit_cost',p_unit_cost,'purchase_unit',p_purchase_unit));
 RETURN v_price;
END $function$

-- ACL: {postgres=X/postgres,authenticated=X/postgres}