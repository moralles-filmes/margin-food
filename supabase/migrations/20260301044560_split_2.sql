CREATE OR REPLACE FUNCTION public._planning_delete_meta_guarded(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT has_permission(v_uid, 'planning:meta-compras:edit') THEN
    RAISE EXCEPTION 'Sem permissão para remover metas de compras';
  END IF;

  UPDATE planning_metas_compra SET ativo = false, updated_at = now() WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;