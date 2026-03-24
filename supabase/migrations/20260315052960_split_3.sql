CREATE OR REPLACE FUNCTION public.get_fin_alertas()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_today date;
  v_in7 date;
  v_month_start date;
  v_month_end date;
  _result json;
BEGIN
  v_company := public.assert_tenant();

  -- RBAC check
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:alertas:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_in7 := v_today + 7;
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::date;

  SELECT json_build_object(
    'cp_vencidas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento
        FROM fin_contas_pagar
        WHERE company_id = v_company
          AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
          AND data_vencimento < v_today
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cp_vencidas_total', (
      SELECT COUNT(*)::int FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento < v_today
    ),
    'cp_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento
        FROM fin_contas_pagar
        WHERE company_id = v_company
          AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
          AND data_vencimento >= v_today
          AND data_vencimento <= v_in7
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cp_vencer_total', (
      SELECT COUNT(*)::int FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
    ),
    'cr_atrasadas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento, cliente
        FROM fin_contas_receber
        WHERE company_id = v_company
          AND status = 'A_RECEBER'
          AND data_vencimento < v_today
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cr_atrasadas_total', (
      SELECT COUNT(*)::int FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento < v_today
    ),
    'cr_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento, cliente
        FROM fin_contas_receber
        WHERE company_id = v_company
          AND status = 'A_RECEBER'
          AND data_vencimento >= v_today
          AND data_vencimento <= v_in7
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cr_vencer_total', (
      SELECT COUNT(*)::int FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
    ),
    'contas_saldo_negativo', (
      SELECT COALESCE(json_agg(json_build_object('nome', c.nome, 'saldo', sc.saldo)), '[]'::json)
      FROM fin_contas c
      JOIN fin_contas_saldo_cache sc ON sc.conta_id = c.id
      WHERE c.company_id = v_company AND c.ativo = true AND sc.saldo < 0
    ),
    'lancamentos_sem_categoria', (
      SELECT COUNT(*)::int FROM fin_lancamentos
      WHERE company_id = v_company AND status IN ('REALIZADO','CONCILIADO') AND categoria_id IS NULL
    ),
    'lancamentos_sem_conta', (
      SELECT COUNT(*)::int FROM fin_lancamentos
      WHERE company_id = v_company AND status IN ('REALIZADO','CONCILIADO') AND conta_id IS NULL AND tipo != 'TRANSFERENCIA'
    ),
    'recorrencias_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'livro_razao'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_lancamentos p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_lancamentos ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_competencia >= v_month_start AND ch.data_competencia < v_month_end
          )
        LIMIT 200
      ) p
    ),
    'recorrencias_cp_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_pagar'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_contas_pagar p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_contas_pagar ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_vencimento >= v_month_start AND ch.data_vencimento < v_month_end
          )
        LIMIT 200
      ) p
    ),
    'recorrencias_cr_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_receber'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_contas_receber p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_contas_receber ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_vencimento >= v_month_start AND ch.data_vencimento < v_month_end
          )
        LIMIT 200
      ) p
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_alertas() TO authenticated;