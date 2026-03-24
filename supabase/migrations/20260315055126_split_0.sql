CREATE OR REPLACE FUNCTION public.rpc_upsert_fechamento_caixa(
  p_data date,
  p_faturamento_bruto numeric,
  p_taxas numeric DEFAULT 0,
  p_descontos numeric DEFAULT 0,
  p_observacao text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
  v_action text;
  v_company_id uuid;
  v_existing record;
BEGIN
  v_company_id := assert_tenant();

  -- Validate inputs
  IF p_faturamento_bruto < 0 THEN
    RAISE EXCEPTION 'Faturamento bruto não pode ser negativo.';
  END IF;
  IF COALESCE(p_taxas, 0) < 0 THEN
    RAISE EXCEPTION 'Taxas não podem ser negativas.';
  END IF;
  IF COALESCE(p_descontos, 0) < 0 THEN
    RAISE EXCEPTION 'Descontos não podem ser negativos.';
  END IF;
  IF COALESCE(p_descontos, 0) > p_faturamento_bruto THEN
    RAISE EXCEPTION 'Descontos não podem ser maiores que o faturamento bruto.';
  END IF;

  -- Check if record exists
  SELECT id, updated_at INTO v_existing
  FROM financeiro_fechamento_caixa
  WHERE data = p_data AND company_id = v_company_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    -- UPDATE path
    IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fechamento:edit', 'system:global:manage']) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Optimistic locking
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at != p_expected_updated_at THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
    END IF;

    v_action := 'update';
    UPDATE financeiro_fechamento_caixa SET
      faturamento_bruto = p_faturamento_bruto,
      taxas = COALESCE(p_taxas, 0),
      descontos = COALESCE(p_descontos, 0),
      observacao = p_observacao,
      updated_at = now()
    WHERE id = v_existing.id;
    v_id := v_existing.id;
  ELSE
    -- CREATE path
    IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fechamento:create', 'system:global:manage']) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    v_action := 'create';
    INSERT INTO financeiro_fechamento_caixa (data, faturamento_bruto, taxas, descontos, observacao, created_by, company_id)
    VALUES (p_data, p_faturamento_bruto, COALESCE(p_taxas, 0), COALESCE(p_descontos, 0), p_observacao, auth.uid(), v_company_id)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id::text, 'action', v_action);
END;
$$;