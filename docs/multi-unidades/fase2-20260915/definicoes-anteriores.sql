-- EVIDÊNCIA SOMENTE. Não reaplicar: estas definições reabrem C01/C02.
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

CREATE OR REPLACE FUNCTION public.list_companies()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_result jsonb;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão';
  END IF;

  SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at)
  INTO v_result
  FROM (
    SELECT
      c.id,
      c.nome,
      c.cnpj,
      c.ativo,
      c.created_at,
      c.updated_at,
      (SELECT count(*) FROM public.company_memberships p WHERE p.company_id = c.id AND p.status='active') AS total_usuarios
    FROM companies c
    WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ORDER BY c.created_at
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$

CREATE OR REPLACE FUNCTION public.list_my_companies()
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT c.id,c.nome FROM public.company_memberships m JOIN public.companies c ON c.id=m.company_id
 WHERE m.user_id=auth.uid() AND m.status='active' AND c.ativo ORDER BY c.nome,c.id;
$function$

CREATE OR REPLACE FUNCTION public.onboard_new_company(p_company_name text, p_cnpj text DEFAULT NULL::text, p_admin_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_new_company_id uuid;
  v_result jsonb;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão (system:global:manage)';
  END IF;

  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION '400: Nome da empresa é obrigatório';
  END IF;

  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj)) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
  END IF;

  INSERT INTO companies (nome, cnpj, ativo)
  VALUES (trim(p_company_name), NULLIF(trim(p_cnpj), ''), true)
  RETURNING id INTO v_new_company_id;

  INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
  VALUES
    (v_new_company_id, 'Manhã', '07:00:00'::time, '15:00:00'::time, true),
    (v_new_company_id, 'Tarde', '15:00:00'::time, '23:00:00'::time, true),
    (v_new_company_id, 'Noite', '23:00:00'::time, '07:00:00'::time, true),
    (v_new_company_id, 'Geral', '00:00:00'::time, '23:59:59'::time, true);

  -- Plano de contas fixo: raízes NÃO OPERACIONAIS sempre presentes, mesmo
  -- padrão de Ren Sushi/Moralles, desde a criação da empresa.
  PERFORM public.fin_get_categoria_desconto_baixa(v_new_company_id);
  PERFORM public.fin_get_categoria_desconto_concedido(v_new_company_id);

  INSERT INTO public.company_memberships(user_id, company_id) VALUES(v_caller_uid, v_new_company_id)
    ON CONFLICT(user_id, company_id) DO UPDATE SET status='active', updated_at=now();

  INSERT INTO user_roles (user_id, company_id, role)
  VALUES (v_caller_uid, v_new_company_id, 'admin')
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

  IF p_admin_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION '404: Usuário admin não encontrado';
    END IF;

    INSERT INTO public.company_memberships(user_id,company_id) VALUES(p_admin_user_id,v_new_company_id) ON CONFLICT(user_id,company_id) DO UPDATE SET status='active',updated_at=now();

    INSERT INTO user_roles (user_id, company_id, role)
    VALUES (p_admin_user_id, v_new_company_id, 'admin')
    ON CONFLICT (user_id, company_id, role) DO NOTHING;
  END IF;

  INSERT INTO job_roles (company_id, nome, descricao)
  VALUES
    (v_new_company_id, 'Gerente Geral', 'Responsável geral pela operação'),
    (v_new_company_id, 'Chef de Cozinha', 'Responsável pela cozinha e fichas técnicas'),
    (v_new_company_id, 'Estoquista', 'Responsável pelo controle de estoque'),
    (v_new_company_id, 'Comprador', 'Responsável pelas compras e fornecedores'),
    (v_new_company_id, 'Financeiro', 'Responsável pelo módulo financeiro'),
    (v_new_company_id, 'Operador', 'Operação geral do dia a dia')
  ON CONFLICT (company_id, nome) DO NOTHING;

  INSERT INTO admin_actions_log (actor_user_id, company_id, action, details)
  VALUES (
    v_caller_uid,
    v_new_company_id,
    'COMPANY_CREATED',
    jsonb_build_object(
      'company_name', trim(p_company_name),
      'cnpj', p_cnpj,
      'admin_user_id', p_admin_user_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'company_name', trim(p_company_name)
  );

  RETURN v_result;
END;
$function$

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

CREATE OR REPLACE FUNCTION public.rpc_set_user_company(p_user_id uuid, p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.assert_tenant();
 IF NOT public.has_permission(auth.uid(),'system:global:manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED'; END IF;
 RETURN public.admin_upsert_company_membership(auth.uid(),p_company_id,p_user_id,'operador',NULL,'active',NULL,NULL,true);
END;
$function$

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
