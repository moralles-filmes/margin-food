CREATE OR REPLACE FUNCTION public.upsert_supplier(p_name text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT has_permission(auth.uid(), 'purchases:edit') AND NOT has_permission(auth.uid(), 'suppliers:edit') THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar fornecedores.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nome do fornecedor não pode ser vazio.';
  END IF;

  INSERT INTO suppliers (name)
  VALUES (trim(p_name))
  ON CONFLICT (name) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  PERFORM log_audit(
    'rpc', 'purchases', 'suppliers', v_id,
    'UPSERT', NULL,
    jsonb_build_object('name', trim(p_name))
  );

  RETURN v_id;
END;
$$;