CREATE OR REPLACE FUNCTION public.get_beneficios_masked(p_colaborador_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, colaborador_id uuid, tipo text, nome text, descricao text,
  valor_empresa numeric, valor_colaborador numeric, percentual_desconto numeric,
  elegivel boolean, data_inicio date, data_fim date, status text,
  operadora text, numero_cartao text, numero_cartao_last4 text,
  observacoes text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF NOT has_permission(auth.uid(), 'rh:read') THEN
    RAISE EXCEPTION 'Permissão negada: rh:read';
  END IF;

  v_is_admin := has_permission(auth.uid(), 'system:admin');

  RETURN QUERY
    SELECT b.id, b.colaborador_id, b.tipo, b.nome, b.descricao,
      b.valor_empresa, b.valor_colaborador, b.percentual_desconto,
      b.elegivel, b.data_inicio, b.data_fim, b.status,
      b.operadora,
      CASE WHEN v_is_admin THEN b.numero_cartao ELSE '****' || COALESCE(b.numero_cartao_last4, '') END AS numero_cartao,
      b.numero_cartao_last4,
      b.observacoes, b.created_at
    FROM rh_beneficios b
    WHERE (p_colaborador_id IS NULL OR b.colaborador_id = p_colaborador_id)
    ORDER BY b.created_at DESC;
END;
$$;

-- ============ 4) AI LOGS: restrict contexto_enviado ============

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own ai_logs" ON public.ai_logs;

-- Own logs (user sees own, but contexto masked via RPC if needed)
CREATE POLICY "Users can read own ai_logs"
  ON public.ai_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Analytics/system users can read all
CREATE POLICY "Analytics can read all ai_logs"
  ON public.ai_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'analytics:read')
      OR public.has_permission(auth.uid(), 'system:admin'));