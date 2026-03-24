CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date, p_descricao text, p_valor numeric, p_tipo text,
  p_conta_id uuid, p_user_id uuid, p_rateio_linhas jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_lancamento_id uuid;
  v_cat_id uuid;
  v_cc_id uuid;
  v_rateio record;
BEGIN
  IF NOT public.has_permission(p_user_id, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := (p_rateio_linhas->0->>'categoria_id')::uuid;
    v_cc_id := (p_rateio_linhas->0->>'centro_custo_id')::uuid;
  END IF;

  INSERT INTO public.fin_lancamentos (
    data_competencia, descricao, valor, tipo, conta_id,
    status, conciliado, conciliado_em, conciliado_por,
    created_by, categoria_id, centro_custo_id
  ) VALUES (
    p_data, p_descricao, p_valor, p_tipo, p_conta_id,
    'REALIZADO', true, now(), p_user_id,
    p_user_id, v_cat_id, v_cc_id
  ) RETURNING id INTO v_lancamento_id;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 1 THEN
    FOR v_rateio IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) AS r
    LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao
      ) VALUES (
        v_lancamento_id,
        (v_rateio.r->>'categoria_id')::uuid,
        NULLIF((v_rateio.r->>'centro_custo_id')::uuid, NULL),
        COALESCE((v_rateio.r->>'valor')::numeric, 0),
        (v_rateio.r->>'percentual')::numeric,
        v_rateio.r->>'observacao'
      );
    END LOOP;
  END IF;

  -- AUDIT LOG
  INSERT INTO public.audit_logs (
    actor_user_id, source, module, entity, entity_id, action, metadata, success
  ) VALUES (
    p_user_id, 'rpc', 'finance', 'lancamento', v_lancamento_id,
    'reconcile_import',
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'conta_id', p_conta_id,
      'rateio_count', COALESCE(jsonb_array_length(p_rateio_linhas), 0)),
    true
  );

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.audit_logs (
    actor_user_id, source, module, entity, entity_id, action, metadata, success
  ) VALUES (
    p_user_id, 'rpc', 'finance', 'lancamento', NULL,
    'reconcile_import',
    jsonb_build_object('error', SQLERRM, 'valor', p_valor, 'tipo', p_tipo),
    false
  );
  RAISE;
END;
$function$;

-- 1b) update_transfer: add audit logging