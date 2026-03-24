CREATE OR REPLACE FUNCTION public._guarded_upsert_orcamento(
  p_categoria_id uuid,
  p_mes_ano text,
  p_valor numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_id uuid;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:orcamento:edit',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  INSERT INTO fin_orcamentos (categoria_id, mes_ano, valor_orcado, company_id)
  VALUES (p_categoria_id, p_mes_ano, p_valor, v_company_id)
  ON CONFLICT (company_id, mes_ano, categoria_id)
  DO UPDATE SET valor_orcado = EXCLUDED.valor_orcado, updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO fin_audit_logs (acao, entidade, entidade_id, user_id, company_id, depois)
  VALUES (
    'UPSERT', 'fin_orcamentos', v_id::text, auth.uid(), v_company_id,
    jsonb_build_object('mes', p_mes_ano, 'valor', p_valor, 'categoria_id', p_categoria_id)
  );

  RETURN jsonb_build_object('id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_upsert_orcamento(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_upsert_orcamento(uuid, text, numeric) TO authenticated;

-- 3. Guarded delete