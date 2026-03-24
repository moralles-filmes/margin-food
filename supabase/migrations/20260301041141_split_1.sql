CREATE OR REPLACE FUNCTION public.rpc_confirmacoes_approve(
  p_confirmacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conf confirmacoes_recebimento%ROWTYPE;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Permission guard
  IF NOT has_permission(v_user_id, 'compras:confirmacoes:approve') THEN
    RAISE EXCEPTION 'Sem permissão (compras:confirmacoes:approve)';
  END IF;

  -- Get confirmation
  SELECT * INTO v_conf FROM confirmacoes_recebimento WHERE id = p_confirmacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirmação não encontrada';
  END IF;

  -- Mark as seen/approved by this user (add to visto_por array if not already there)
  UPDATE confirmacoes_recebimento SET
    visto_por = array_append(
      COALESCE(visto_por, ARRAY[]::uuid[]),
      v_user_id
    )
  WHERE id = p_confirmacao_id
    AND NOT (COALESCE(visto_por, ARRAY[]::uuid[]) @> ARRAY[v_user_id]);

  RETURN jsonb_build_object(
    'success', true,
    'confirmacao_id', p_confirmacao_id
  );
END;
$$;