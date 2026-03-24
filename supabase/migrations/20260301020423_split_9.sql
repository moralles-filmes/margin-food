CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date,
  p_descricao text,
  p_valor numeric,
  p_tipo text,
  p_conta_id uuid,
  p_user_id uuid,
  p_rateio_linhas jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lancamento_id uuid;
  v_cat_id uuid;
  v_cc_id uuid;
  v_rateio record;
  v_uid uuid;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Invalid user_id';
  END IF;

  IF NOT public.has_permission(v_uid, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Conta inválida';
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF((p_rateio_linhas->0->>'categoria_id')::uuid, NULL);
    v_cc_id := NULLIF((p_rateio_linhas->0->>'centro_custo_id')::uuid, NULL);
    IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE id = v_cat_id AND company_id = v_company) THEN
      RAISE EXCEPTION 'Categoria inválida';
    END IF;
    IF v_cc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_centros_custo WHERE id = v_cc_id AND company_id = v_company) THEN
      RAISE EXCEPTION 'Centro de custo inválido';
    END IF;
  END IF;

  INSERT INTO public.fin_lancamentos (
    data_competencia, descricao, valor, tipo, conta_id,
    status, conciliado, conciliado_em, conciliado_por,
    created_by, categoria_id, centro_custo_id, company_id
  ) VALUES (
    p_data, p_descricao, p_valor, p_tipo, p_conta_id,
    'REALIZADO', true, now(), v_uid,
    v_uid, v_cat_id, v_cc_id, v_company
  ) RETURNING id INTO v_lancamento_id;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 1 THEN
    FOR v_rateio IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) AS r
    LOOP
      IF (v_rateio.r->>'categoria_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.fin_categorias WHERE id = (v_rateio.r->>'categoria_id')::uuid AND company_id = v_company
      ) THEN
        RAISE EXCEPTION 'Categoria inválida no rateio';
      END IF;
      IF (v_rateio.r->>'centro_custo_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.fin_centros_custo WHERE id = (v_rateio.r->>'centro_custo_id')::uuid AND company_id = v_company
      ) THEN
        RAISE EXCEPTION 'Centro de custo inválido no rateio';
      END IF;
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      ) VALUES (
        v_lancamento_id,
        (v_rateio.r->>'categoria_id')::uuid,
        NULLIF((v_rateio.r->>'centro_custo_id')::uuid, NULL),
        COALESCE((v_rateio.r->>'valor')::numeric, 0),
        (v_rateio.r->>'percentual')::numeric,
        v_rateio.r->>'observacao',
        v_company
      );
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id, source, module, entity, entity_id, action, metadata, success
  ) VALUES (
    v_uid, 'rpc', 'finance', 'lancamento', v_lancamento_id,
    'reconcile_import',
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'conta_id', p_conta_id,
      'rateio_count', COALESCE(jsonb_array_length(p_rateio_linhas), 0), 'company_id', v_company),
    true
  );

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.audit_logs (
    actor_user_id, source, module, entity, entity_id, action, metadata, success
  ) VALUES (
    COALESCE(auth.uid(), p_user_id), 'rpc', 'finance', 'lancamento', NULL,
    'reconcile_import',
    jsonb_build_object('error', SQLERRM, 'valor', p_valor, 'tipo', p_tipo),
    false
  );
  RAISE;
END;
$$;