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
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_in7 := v_today + 7;
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::date;

  SELECT json_build_object(
    -- 1) CP vencidas
    'cp_vencidas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento < v_today
      LIMIT 200
    ),
    -- 2) CP vencendo em 7 dias
    'cp_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
      LIMIT 200
    ),
    -- 3) CR atrasadas
    'cr_atrasadas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento < v_today
      LIMIT 200
    ),
    -- 4) CR vencendo em 7 dias
    'cr_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
      LIMIT 200
    ),
    -- 5) Contas com saldo negativo
    'contas_saldo_negativo', (
      SELECT COALESCE(json_agg(json_build_object('nome', c.nome, 'saldo', s.saldo)), '[]'::json)
      FROM fin_contas c
      CROSS JOIN LATERAL (
        SELECT c.saldo_inicial + COALESCE((
          SELECT SUM(CASE
            WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
            WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
            WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
            WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
            ELSE 0 END)
          FROM fin_lancamentos l
          WHERE l.status = 'REALIZADO' AND l.company_id = v_company
            AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
        ), 0) AS saldo
      ) s
      WHERE c.company_id = v_company AND c.ativo = true AND s.saldo < 0
    ),
    -- 6) Lançamentos sem categoria (count)
    'lancamentos_sem_categoria', (
      SELECT COUNT(*)::int
      FROM fin_lancamentos
      WHERE company_id = v_company AND status = 'REALIZADO' AND categoria_id IS NULL
    ),
    -- 7) Lançamentos sem conta (count)
    'lancamentos_sem_conta', (
      SELECT COUNT(*)::int
      FROM fin_lancamentos
      WHERE company_id = v_company AND status = 'REALIZADO' AND conta_id IS NULL AND tipo != 'TRANSFERENCIA'
    ),
    -- 8) Recorrências pendentes no mês (fin_lancamentos parents sem child este mês)
    'recorrencias_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'livro_razao'
      )), '[]'::json)
      FROM fin_lancamentos p
      WHERE p.company_id = v_company
        AND p.recorrente = true
        AND p.lancamento_pai_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_lancamentos ch
          WHERE ch.lancamento_pai_id = p.id
            AND ch.data_competencia >= v_month_start
            AND ch.data_competencia < v_month_end
        )
    ),
    'recorrencias_cp_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_pagar'
      )), '[]'::json)
      FROM fin_contas_pagar p
      WHERE p.company_id = v_company
        AND p.recorrente = true
        AND p.lancamento_pai_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_contas_pagar ch
          WHERE ch.lancamento_pai_id = p.id
            AND ch.data_vencimento >= v_month_start
            AND ch.data_vencimento < v_month_end
        )
    ),
    'recorrencias_cr_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_receber'
      )), '[]'::json)
      FROM fin_contas_receber p
      WHERE p.company_id = v_company
        AND p.recorrente = true
        AND p.lancamento_pai_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_contas_receber ch
          WHERE ch.lancamento_pai_id = p.id
            AND ch.data_vencimento >= v_month_start
            AND ch.data_vencimento < v_month_end
        )
    )
  ) INTO _result;

  RETURN _result;
END;
$$;