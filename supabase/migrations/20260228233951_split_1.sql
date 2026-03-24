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
SET search_path = ''
AS $$
DECLARE
  v_lancamento_id uuid;
  v_cat_id uuid;
  v_cc_id uuid;
  v_rateio record;
BEGIN
  IF NOT public.has_permission(p_user_id, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  -- Extract single-line category if rateio has exactly 1 entry
  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := (p_rateio_linhas->0->>'categoria_id')::uuid;
    v_cc_id := (p_rateio_linhas->0->>'centro_custo_id')::uuid;
  END IF;

  -- Insert lancamento
  INSERT INTO public.fin_lancamentos (
    data_competencia, descricao, valor, tipo, conta_id,
    status, conciliado, conciliado_em, conciliado_por,
    created_by, categoria_id, centro_custo_id
  )
  VALUES (
    p_data, p_descricao, p_valor, p_tipo, p_conta_id,
    'REALIZADO', true, now(), p_user_id,
    p_user_id, v_cat_id, v_cc_id
  )
  RETURNING id INTO v_lancamento_id;

  -- Insert multi-line rateio if more than 1 line
  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 1 THEN
    FOR v_rateio IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) AS r
    LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id,
        valor, percentual, observacao
      )
      VALUES (
        v_lancamento_id,
        (v_rateio.r->>'categoria_id')::uuid,
        NULLIF((v_rateio.r->>'centro_custo_id')::uuid, NULL),
        COALESCE((v_rateio.r->>'valor')::numeric, 0),
        (v_rateio.r->>'percentual')::numeric,
        v_rateio.r->>'observacao'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;

-- 3) RPC: Atomic transfer creation from OFX (both sides in one tx)