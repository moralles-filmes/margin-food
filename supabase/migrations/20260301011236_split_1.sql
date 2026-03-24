CREATE OR REPLACE FUNCTION public.rpc_delete_fechamento_caixa(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão (finance:manage).';
  END IF;

  DELETE FROM financeiro_fechamento_caixa WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado.';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5) Update ALL RPCs to use financeiro_fechamento_caixa as faturamento source

-- 5a) get_relatorios_kpis: replace salmon_daily_records with fechamento_caixa