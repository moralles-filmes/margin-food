CREATE OR REPLACE FUNCTION public.copiar_orcamento_mes(
  p_origem text,
  p_destino text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inserted integer;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:orcamento:edit',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  INSERT INTO fin_orcamentos (company_id, categoria_id, mes_ano, valor_orcado)
  SELECT v_company_id, categoria_id, p_destino, valor_orcado
  FROM fin_orcamentos
  WHERE mes_ano = p_origem AND company_id = v_company_id
  ON CONFLICT (company_id, mes_ano, categoria_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO fin_audit_logs (acao, entidade, user_id, company_id, depois)
  VALUES (
    'COPY_ORCAMENTO', 'fin_orcamentos', auth.uid(), v_company_id,
    jsonb_build_object('origem', p_origem, 'destino', p_destino, 'linhas_copiadas', v_inserted)
  );

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.copiar_orcamento_mes(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copiar_orcamento_mes(text, text) TO authenticated;