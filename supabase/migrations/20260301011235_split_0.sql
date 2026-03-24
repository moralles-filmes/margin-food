CREATE OR REPLACE FUNCTION public.rpc_upsert_fechamento_caixa(
  p_data date,
  p_faturamento_bruto numeric,
  p_taxas numeric DEFAULT 0,
  p_descontos numeric DEFAULT 0,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_action text;
BEGIN
  IF NOT has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão (finance:manage).';
  END IF;

  IF p_faturamento_bruto < 0 THEN
    RAISE EXCEPTION 'Faturamento bruto não pode ser negativo.';
  END IF;

  SELECT id INTO v_id FROM financeiro_fechamento_caixa WHERE data = p_data;

  IF v_id IS NOT NULL THEN
    v_action := 'update';
    UPDATE financeiro_fechamento_caixa SET
      faturamento_bruto = p_faturamento_bruto,
      taxas = COALESCE(p_taxas, 0),
      descontos = COALESCE(p_descontos, 0),
      observacao = p_observacao,
      updated_at = now()
    WHERE id = v_id;
  ELSE
    v_action := 'create';
    INSERT INTO financeiro_fechamento_caixa (data, faturamento_bruto, taxas, descontos, observacao, created_by)
    VALUES (p_data, p_faturamento_bruto, COALESCE(p_taxas, 0), COALESCE(p_descontos, 0), p_observacao, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'action', v_action);
END;
$$;

-- 4b) Delete