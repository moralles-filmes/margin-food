CREATE OR REPLACE FUNCTION public.reconcile_batch_lancamentos(
  p_lancamento_ids uuid[],
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.has_permission(p_user_id, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  UPDATE public.fin_lancamentos
  SET conciliado = true,
      conciliado_em = now(),
      conciliado_por = p_user_id
  WHERE id = ANY(p_lancamento_ids)
    AND (conciliado IS NULL OR conciliado = false);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.fin_audit_logs (entidade, acao, user_id, depois)
  VALUES (
    'lancamentos', 'reconcile_batch', p_user_id,
    jsonb_build_object('count', v_count, 'ids', p_lancamento_ids)
  );

  RETURN jsonb_build_object('status', 'ok', 'reconciled_count', v_count);
END;
$$;